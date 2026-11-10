"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/Toast";
import { prepareFileForUpload, formatBytes } from "@/utils/compressImage";
import { normalizeFileUrl } from "@/utils/fileUrl";

export default function ReceiptUpload({ receipts = [], onChange, section, patientId }) {
  const { data: authSession } = useSession();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const rawFile of Array.from(files)) {
        const isPDF = rawFile.name.toLowerCase().endsWith(".pdf");
        const { file, wasCompressed, originalSize, compressedSize, warning } =
          await prepareFileForUpload(rawFile);
        if (warning) toast.error(warning);
        if (wasCompressed) {
          toast.success(`${rawFile.name}: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)}`);
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("section", section || "receipts");
        if (patientId) formData.append("patientId", patientId);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || `Failed to upload ${rawFile.name}`);
        }

        uploaded.push({
          url: data.filePath,
          publicId: data.publicId,
          fileName: rawFile.name,
          fileType: isPDF ? "pdf" : "image",
          uploadedBy: {
            name: authSession?.user?.name || "",
            email: authSession?.user?.email || "",
          },
          uploadedAt: new Date().toISOString(),
        });
      }
      onChange([...receipts, ...uploaded]);
      toast.success("Receipt uploaded");
    } catch (error) {
      toast.error(error.message || "Failed to upload receipt");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (receipt) => {
    setDeletingId(receipt.publicId);
    try {
      const res = await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: receipt.publicId,
          resourceType: receipt.fileType === "pdf" ? "raw" : "image",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to delete receipt");
      }
      onChange(receipts.filter((r) => r.publicId !== receipt.publicId));
      toast.success("Receipt removed");
    } catch (error) {
      toast.error(error.message || "Failed to delete receipt");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Receipts (optional)</label>

      <div className="flex flex-wrap gap-3 mb-3">
        {receipts.map((receipt) => (
          <div
            key={receipt.publicId}
            className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-gray-50"
          >
            {receipt.fileType === "pdf" ? (
              <FileText className="w-4 h-4 text-red-500 shrink-0" />
            ) : (
              <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
            )}
            <a
              href={normalizeFileUrl(receipt.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-600 hover:underline max-w-[160px] truncate"
              title={receipt.fileName}
            >
              {receipt.fileName || "Receipt"}
            </a>
            <button
              type="button"
              onClick={() => handleDelete(receipt)}
              disabled={deletingId === receipt.publicId}
              className="text-gray-400 hover:text-red-500 disabled:opacity-50"
            >
              {deletingId === receipt.publicId ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
      </div>

      <label className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer w-fit">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Uploading..." : "Upload receipt (image or PDF)"}
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
