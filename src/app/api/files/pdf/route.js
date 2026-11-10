/**
 * Streams a stored PDF to the browser with usable headers.
 *
 * Why this exists: PDFs live in Cloudinary as `raw` assets, and Cloudinary
 *   - serves every raw asset as `application/octet-stream` with
 *     `Content-Disposition: attachment`, so an <iframe> preview can never
 *     render it (the browser reports a failed download instead), and
 *   - returns 401 for any asset it recognises as a PDF, because this account
 *     restricts PDF/ZIP delivery (Settings -> Security). Signed URLs do not
 *     bypass it.
 * So the bytes are fetched server-side and re-served as `application/pdf`.
 * Bonus: patient documents now require a login instead of being public.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiGuard";
import { parseCloudinaryUrl } from "@/utils/fileUrl";

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "super-admin", "admin", "sales", "reception",
  "surgery", "counsellor", "collab", "owner",
];

/** Header-safe filename, always ending in .pdf. */
function safeName(name) {
  const cleaned = String(name || "document")
    .replace(/[^\w .()-]+/g, "_")
    .slice(0, 100);
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

export async function GET(request) {
  const { error } = await requireSession(VIEW_ROLES);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const src = searchParams.get("url") || "";
  const parsed = parseCloudinaryUrl(src);
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;

  // Only this app's own raw assets, so the route cannot be used as an
  // open proxy for arbitrary URLs.
  if (
    !cloud ||
    !src.startsWith(`https://res.cloudinary.com/${cloud}/`) ||
    parsed?.resourceType !== "raw" ||
    !parsed.publicId.startsWith("ryan-clinic/")
  ) {
    return NextResponse.json(
      { success: false, message: "Unsupported file URL" },
      { status: 400 }
    );
  }

  // Rebuilt from the parsed public_id, which drops both the version segment
  // and the invalid `fl_attachment:false` transformation on legacy uploads.
  const upstream = `https://res.cloudinary.com/${cloud}/raw/upload/${parsed.publicId}`;
  const response = await fetch(upstream, { cache: "no-store" }).catch(() => null);

  if (!response?.ok || !response.body) {
    console.error(
      `PDF proxy: upstream ${response?.status ?? "fetch failed"} for ${parsed.publicId}`
    );
    return NextResponse.json(
      { success: false, message: "File is no longer available" },
      { status: 502 }
    );
  }

  const name = safeName(
    searchParams.get("name") || parsed.publicId.split("/").pop()
  );
  const disposition = searchParams.get("download") ? "attachment" : "inline";
  const length = response.headers.get("content-length");

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${name}"`,
      ...(length ? { "Content-Length": length } : {}),
      "Cache-Control": "private, max-age=300",
    },
  });
}
