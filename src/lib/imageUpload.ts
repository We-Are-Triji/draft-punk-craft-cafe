const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = [".heic", ".heif"];

function hasHeicExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();

  return HEIC_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function isHeicOrHeifFile(file: File): boolean {
  return HEIC_MIME_TYPES.has(file.type) || hasHeicExtension(file.name);
}

export async function normalizeImageForAiScan(file: File): Promise<File> {
  if (!isHeicOrHeifFile(file)) {
    return file;
  }

  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.92,
    });

    const outputBlob = Array.isArray(converted) ? converted[0] : converted;

    if (!(outputBlob instanceof Blob)) {
      throw new Error("Conversion output is invalid.");
    }

    const normalizedName = file.name.replace(/\.(heic|heif)$/i, "") || "image";

    return new File([outputBlob], `${normalizedName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    throw new Error(
      "This HEIC/HEIF image could not be processed in your browser. Convert it to JPG or PNG and try again."
    );
  }
}
