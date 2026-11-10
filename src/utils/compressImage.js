import imageCompression from "browser-image-compression";

const TARGET_BYTES = 1024 * 1024;
const MAX_DIMENSION = 1920;
const START_QUALITY = 0.8;
const MIN_QUALITY = 0.5;
const QUALITY_STEP = 0.1;
const OUTPUT_TYPE = "image/webp";
const OUTPUT_EXT = ".webp";

export function withExtension(name = "file", ext = OUTPUT_EXT) {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${base || "file"}${ext}`;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function compressImage(file) {
  const originalSize = file.size;

  if (!file.type?.startsWith("image/")) {
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize };
  }

  // Canvas re-encoding keeps only the first frame of an animated GIF.
  if (file.type === "image/gif") {
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize };
  }

  if (originalSize <= TARGET_BYTES) {
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize };
  }

  let quality = START_QUALITY;
  let result = file;
  try {
    while (true) {
      result = await imageCompression(file, {
        maxWidthOrHeight: MAX_DIMENSION,
        initialQuality: quality,
        // WebP is ~25-35% smaller than JPEG at the same visual quality, and
        // re-encoding is already happening here, so it costs nothing extra.
        fileType: OUTPUT_TYPE,
        useWebWorker: true,
      });
      if (result.size <= TARGET_BYTES || quality <= MIN_QUALITY) break;
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
    }
  } catch (error) {
    console.error("Image compression failed, uploading original:", error);
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize, error: true };
  }

  // A JPEG re-encoded as WebP must stop claiming to be a .jpg: the upload route
  // validates the extension and the stored Cloudinary URL is shown to staff.
  if (result.size >= originalSize) {
    // Already well-compressed (common for PNG line art): keep the original.
    return { file, wasCompressed: false, originalSize, compressedSize: originalSize };
  }

  return {
    file: new File([result], withExtension(file.name, OUTPUT_EXT), {
      type: OUTPUT_TYPE,
      lastModified: Date.now(),
    }),
    wasCompressed: true,
    originalSize,
    compressedSize: result.size,
  };
}

export async function prepareFileForUpload(file) {
  if (!file) {
    return { file, wasCompressed: false, warning: null, originalSize: 0, compressedSize: 0 };
  }

  if (file.type === "application/pdf") {
    const oversized = file.size > TARGET_BYTES;
    return {
      file,
      wasCompressed: false,
      warning: oversized
        ? `This PDF is ${formatBytes(file.size)} — larger than ideal, but it will still upload.`
        : null,
      originalSize: file.size,
      compressedSize: file.size,
    };
  }

  if (file.type?.startsWith("image/")) {
    const result = await compressImage(file);
    return { ...result, warning: null };
  }

  return { file, wasCompressed: false, warning: null, originalSize: file.size, compressedSize: file.size };
}
