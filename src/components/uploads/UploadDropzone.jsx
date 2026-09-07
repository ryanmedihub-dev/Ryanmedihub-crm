"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet } from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".xlsx,.xls,.csv";

export default function UploadDropzone({ onFile, fileName, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const take = (file) => {
    setError("");
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("Upload an .xlsx, .xls or .csv file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File is larger than 5 MB. Split it into smaller uploads.");
      return;
    }
    onFile(file);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) take(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
            : dragging
              ? "border-indigo-400 bg-indigo-50"
              : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50 cursor-pointer"
        }`}
      >
        {fileName ? (
          <>
            <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-800">{fileName}</p>
            <p className="text-xs text-slate-500">Click to choose a different file</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Drop your filled template here</p>
            <p className="text-xs text-slate-500">or click to browse — .xlsx, .xls, .csv up to 5 MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => take(e.target.files?.[0])}
        />
      </div>
      {error && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}
