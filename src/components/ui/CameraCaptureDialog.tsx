import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, XCircle } from "lucide-react";
import { openCameraStreamForStillPhoto } from "@/lib/imageUpload";

interface CameraCaptureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageFile: File) => Promise<void> | void;
  onError?: (message: string) => void;
  title?: string;
  description?: string;
  disabled?: boolean;
}

function stopStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
}

export function CameraCaptureDialog({
  isOpen,
  onClose,
  onCapture,
  onError,
  title = "Use Device Camera",
  description = "Frame the item clearly, then capture.",
  disabled = false,
}: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraError(null);
      setIsStarting(false);
      setIsCapturing(false);
      return;
    }

    let isCancelled = false;

    const startCamera = async () => {
      setIsStarting(true);
      setCameraError(null);

      try {
        const stream = await openCameraStreamForStillPhoto();

        if (isCancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        const videoElement = videoRef.current;

        if (videoElement) {
          videoElement.srcObject = stream;
          await videoElement.play().catch(() => {
            return;
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to access camera on this device. Use photo upload instead.";

        if (!isCancelled) {
          setCameraError(message);
          onError?.(message);
        }
      } finally {
        if (!isCancelled) {
          setIsStarting(false);
        }
      }
    };

    void startCamera();

    return () => {
      isCancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [isOpen, onError]);

  if (!isOpen) {
    return null;
  }

  const closeDialog = () => {
    if (disabled || isCapturing) {
      return;
    }

    stopStream(streamRef.current);
    streamRef.current = null;
    onClose();
  };

  const capturePhoto = async () => {
    if (disabled || isStarting || isCapturing || cameraError) {
      return;
    }

    const videoElement = videoRef.current;

    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      const message = "Camera is still initializing. Please wait a moment and try again.";
      setCameraError(message);
      onError?.(message);
      return;
    }

    setIsCapturing(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const context = canvas.getContext("2d", {
        alpha: false,
      });

      if (!context) {
        throw new Error("Unable to capture photo from the camera preview.");
      }

      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const imageBlob = await canvasToJpegBlob(canvas);

      if (!imageBlob) {
        throw new Error("Unable to capture photo from the camera preview.");
      }

      const imageFile = new File([imageBlob], `camera-capture-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      await onCapture(imageFile);
      stopStream(streamRef.current);
      streamRef.current = null;
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to capture photo.";
      setCameraError(message);
      onError?.(message);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-card border border-gray-100 dark:border-border shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-foreground">{title}</h3>
            <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            className="p-1.5 rounded-lg bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground disabled:opacity-50"
            disabled={disabled || isCapturing}
          >
            <XCircle size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-xl border border-gray-200 dark:border-border bg-black relative overflow-hidden min-h-[280px] flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full max-h-[65vh] object-cover"
            />

            {isStarting ? (
              <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <LoaderCircle className="animate-spin" size={16} />
                  Starting camera...
                </span>
              </div>
            ) : null}
          </div>

          {cameraError ? (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {cameraError}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-muted text-gray-700 dark:text-muted-foreground text-sm font-semibold disabled:opacity-50"
              disabled={disabled || isCapturing}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void capturePhoto();
              }}
              className="px-3 py-2 rounded-lg bg-[#3E2723] text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
              disabled={disabled || isStarting || isCapturing || cameraError !== null}
            >
              {isCapturing ? <LoaderCircle className="animate-spin" size={14} /> : <Camera size={14} />}
              {isCapturing ? "Capturing..." : "Capture Photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
