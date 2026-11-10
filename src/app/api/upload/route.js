import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { parseCloudinaryUrl } from "@/utils/fileUrl";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// ── Allowlists ─────────────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf",
]);

// Roles that are permitted to upload patient documents / receipts.
const UPLOAD_ROLES = new Set([
  "super-admin", "admin", "sales", "reception",
  "surgery", "counsellor", "collab",
]);
// ──────────────────────────────────────────────────────────────────────────

function ext(filename = "") {
  return filename.slice(filename.lastIndexOf(".")).toLowerCase();
}

export async function POST(request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user || !UPLOAD_ROLES.has(session.user.role)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const section = formData.get("section");
    const patientId = formData.get("patientId");

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file provided" },
        { status: 400 }
      );
    }

    // ── MIME + extension validation ─────────────────────────────────────────
    const fileExt = ext(file.name);
    if (!ALLOWED_MIME_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(fileExt)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "File type not allowed. Only JPEG, PNG, WebP, GIF, and PDF files are accepted.",
        },
        { status: 415 }
      );
    }
    // ───────────────────────────────────────────────────────────────────────

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: `File size exceeds 10MB limit. Current size: ${(
            file.size /
            1024 /
            1024
          ).toFixed(2)}MB`,
        },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const isPDF = fileExt === ".pdf";
    const resourceType = isPDF ? "raw" : "image";

    // Readable public_id so the asset is identifiable in the Cloudinary console
    // (upload_stream has no filename to derive one from). Deliberately WITHOUT
    // a .pdf extension: this account restricts PDF delivery, so Cloudinary
    // answers 401 for any asset it recognises as a PDF - signed URLs included.
    // PDFs are therefore read back through /api/files/pdf, which does not care
    // about the extension. Do not "fix" this by appending .pdf.
    const rawPublicId = isPDF
      ? `${file.name
          .slice(0, file.name.lastIndexOf("."))
          .replace(/[^a-zA-Z0-9_-]+/g, "_")
          .slice(0, 80) || "document"}_${Date.now()}`
      : null;

    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: patientId
            ? `ryan-clinic/${patientId}/${section}`
            : `ryan-clinic/receipts/${section}`,
          resource_type: resourceType,
          timeout: 120000,
          // Incoming transformation: the stored asset is capped and quality-
          // optimized server-side too, so an uncompressed client upload (or a
          // caller that skips prepareFileForUpload) still lands small.
          // `fetch_format` is deliberately absent: f_auto only works at
          // delivery, and a format-switched URL would make the saved file's
          // extension lie about its bytes.
          ...(resourceType === "image" && {
            quality: "auto:good",
            width: 2000,
            crop: "limit",
          }),
          ...(isPDF && { public_id: rawPublicId }),
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary upload error:", error);
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      uploadStream.end(buffer);
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Upload timeout after 2 minutes")),
        120000
      );
    });

    const result = await Promise.race([uploadPromise, timeoutPromise]);

    // No fl_attachment rewrite for PDFs: raw assets accept no transformations,
    // so that URL segment broke delivery. A raw .pdf already serves inline.
    return NextResponse.json({
      success: true,
      filePath: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Upload API error:", error);

    let errorMessage = "Failed to upload file";

    if (error.message?.includes("timeout")) {
      errorMessage =
        "Upload timeout - file may be too large or network is slow";
    } else if (error.http_code === 502) {
      errorMessage =
        "Cloudinary service temporarily unavailable. Please try again.";
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user || !UPLOAD_ROLES.has(session.user.role)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const body = await request.json();
    // Callers send either an explicit publicId or just the stored file URL.
    const parsed = body.publicId ? null : parseCloudinaryUrl(body.filePath);
    const publicId = body.publicId || parsed?.publicId;
    const resourceType = body.resourceType || parsed?.resourceType;

    if (!publicId) {
      return NextResponse.json(
        { success: false, message: "No public ID provided" },
        { status: 400 }
      );
    }

    // Restrict deletion to files inside the ryan-clinic folder only.
    if (!String(publicId).startsWith("ryan-clinic/")) {
      return NextResponse.json(
        { success: false, message: "Forbidden: cannot delete files outside ryan-clinic folder." },
        { status: 403 }
      );
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType || "image",
      timeout: 60000,
      invalidate: true,
    });

    console.log(
      `User ${session.user.email} deleted Cloudinary asset: ${publicId} — result: ${result.result}`
    );

    const isSuccess = result.result === "ok";
    const isNotFound = result.result === "not found";

    if (isSuccess) {
      return NextResponse.json({
        success: true,
        message: "File deleted successfully",
      });
    } else if (isNotFound) {
      return NextResponse.json({
        success: true,
        message: "File not found",
        alreadyDeleted: true,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Unexpected result: ${result.result}`,
      });
    }
  } catch (error) {
    console.error("Delete API error:", error);

    if (error.message && error.message.includes("not found")) {
      return NextResponse.json({
        success: true,
        message: "File not found",
        alreadyDeleted: true,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete file",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
