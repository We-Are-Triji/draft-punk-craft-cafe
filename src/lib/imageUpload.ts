const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = [".heic", ".heif"];
const AI_SCAN_MAX_IMAGE_EDGE = 1280;
const AI_SCAN_MAX_FILE_SIZE_BYTES = 1_200_000;
const AI_SCAN_JPEG_QUALITY = 0.86;

export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

function hasHeicExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();

  return HEIC_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function isHeicOrHeifFile(file: File): boolean {
  return HEIC_MIME_TYPES.has(file.type) || hasHeicExtension(file.name);
}

function toCameraPermissionError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return new Error(
        "Camera permission was denied. Allow camera access or use photo upload instead."
      );
    }

    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return new Error(
        "No usable camera was found on this device. Use photo upload instead."
      );
    }

    if (error.name === "NotReadableError") {
      return new Error(
        "Camera is currently unavailable. Close other camera apps and try again."
      );
    }
  }

  return new Error(
    "Unable to access camera on this device. Use photo upload instead."
  );
}

export async function openCameraStreamForStillPhoto(): Promise<MediaStream> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    throw new Error(
      "This browser does not support camera capture. Use photo upload instead."
    );
  }

  const constraintAttempts: MediaTrackConstraints[] = [
    {
      facingMode: {
        exact: "environment",
      },
    },
    {
      facingMode: {
        ideal: "environment",
      },
    },
    {
      facingMode: "environment",
    },
    {
      width: {
        ideal: 1920,
      },
      height: {
        ideal: 1080,
      },
    },
  ];

  let lastError: unknown = null;

  for (const videoConstraints of constraintAttempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
    } catch (cameraError) {
      lastError = cameraError;

      if (cameraError instanceof DOMException) {
        if (cameraError.name === "NotAllowedError" || cameraError.name === "SecurityError") {
          throw toCameraPermissionError(cameraError);
        }

        if (
          cameraError.name === "NotFoundError" ||
          cameraError.name === "OverconstrainedError"
        ) {
          continue;
        }
      }
    }
  }

  throw toCameraPermissionError(lastError);
}

export async function requestCameraPermissionForStillPhoto(): Promise<void> {
  let stream: MediaStream | null = null;

  try {
    stream = await openCameraStreamForStillPhoto();
  } finally {
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }
}

function getBaseName(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");

  if (dotIndex <= 0) {
    return trimmed || "image";
  }

  return trimmed.slice(0, dotIndex) || "image";
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function optimizeImageForAiScan(file: File): Promise<File> {
  const canAttemptOptimization =
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof createImageBitmap === "function";

  if (!canAttemptOptimization) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = Math.max(bitmap.width, bitmap.height);
    const resizeScale =
      maxEdge > AI_SCAN_MAX_IMAGE_EDGE
        ? AI_SCAN_MAX_IMAGE_EDGE / maxEdge
        : 1;
    const shouldResize = resizeScale < 1;
    const shouldCompress = file.size > AI_SCAN_MAX_FILE_SIZE_BYTES;

    if (!shouldResize && !shouldCompress) {
      bitmap.close();
      return file;
    }

    const targetWidth = Math.max(1, Math.round(bitmap.width * resizeScale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * resizeScale));
    const canvas = document.createElement("canvas");

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const optimizedBlob = await canvasToJpegBlob(canvas, AI_SCAN_JPEG_QUALITY);

    if (!optimizedBlob) {
      return file;
    }

    if (!shouldResize && optimizedBlob.size >= file.size) {
      return file;
    }

    return new File([optimizedBlob], `${getBaseName(file.name)}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export async function normalizeImageForAiScan(file: File): Promise<File> {
  let preparedFile = file;

  if (isHeicOrHeifFile(file)) {
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

      preparedFile = new File([outputBlob], `${getBaseName(file.name)}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    } catch {
      throw new Error(
        "This HEIC/HEIF image could not be processed in your browser. Convert it to JPG or PNG and try again."
      );
    }
  }

  return optimizeImageForAiScan(preparedFile);
}
