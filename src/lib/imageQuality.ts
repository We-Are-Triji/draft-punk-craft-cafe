export interface ImageQualityReport {
  brightness: number;
  contrast: number;
  sharpness: number;
  width: number;
  height: number;
}

interface ImageQualityThresholds {
  minBrightness: number;
  minContrast: number;
  minSharpness: number;
  minWidth: number;
  minHeight: number;
}

export interface ImageQualityGateAssessment {
  report: ImageQualityReport;
  checks: Array<{
    key: "size" | "brightness" | "contrast" | "sharpness";
    label: string;
    passed: boolean;
    value: string;
  }>;
  failureMessage: string | null;
}

const DEFAULT_THRESHOLDS: ImageQualityThresholds = {
  minBrightness: 28,
  minContrast: 18,
  minSharpness: 20,
  minWidth: 220,
  minHeight: 220,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toGrayScale(red: number, green: number, blue: number): number {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

async function decodeImageElement(file: File): Promise<HTMLImageElement> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to decode image."));
      image.src = imageUrl;
    });

    return imageElement;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function analyzeImageQuality(file: File): Promise<ImageQualityReport> {
  const image = await decodeImageElement(file);
  const maxDimension = 320;
  const drawWidth = clamp(image.naturalWidth, 1, maxDimension);
  const drawHeight = clamp(image.naturalHeight, 1, maxDimension);

  const canvas = document.createElement("canvas");
  canvas.width = drawWidth;
  canvas.height = drawHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Unable to inspect image quality.");
  }

  context.drawImage(image, 0, 0, drawWidth, drawHeight);
  const imageData = context.getImageData(0, 0, drawWidth, drawHeight);
  const pixelCount = drawWidth * drawHeight;
  const grayValues = new Float32Array(pixelCount);

  let brightnessSum = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const gray = toGrayScale(
      imageData.data[offset],
      imageData.data[offset + 1],
      imageData.data[offset + 2]
    );

    grayValues[index] = gray;
    brightnessSum += gray;
  }

  const brightness = brightnessSum / pixelCount;

  let varianceSum = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const delta = grayValues[index] - brightness;
    varianceSum += delta * delta;
  }

  const contrast = Math.sqrt(varianceSum / pixelCount);

  let laplacianVarianceSum = 0;
  let laplacianSamples = 0;

  for (let y = 1; y < drawHeight - 1; y += 1) {
    for (let x = 1; x < drawWidth - 1; x += 1) {
      const centerIndex = y * drawWidth + x;
      const laplacian =
        4 * grayValues[centerIndex] -
        grayValues[centerIndex - 1] -
        grayValues[centerIndex + 1] -
        grayValues[centerIndex - drawWidth] -
        grayValues[centerIndex + drawWidth];

      laplacianVarianceSum += laplacian * laplacian;
      laplacianSamples += 1;
    }
  }

  const sharpness =
    laplacianSamples === 0 ? 0 : Math.sqrt(laplacianVarianceSum / laplacianSamples);

  return {
    brightness: Number(brightness.toFixed(2)),
    contrast: Number(contrast.toFixed(2)),
    sharpness: Number(sharpness.toFixed(2)),
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

function getImageQualityFailureMessage(
  report: ImageQualityReport,
  thresholds: ImageQualityThresholds
): string | null {
  if (report.width < thresholds.minWidth || report.height < thresholds.minHeight) {
    return `Image is too small for reliable scanning (${report.width}x${report.height}). Use a clearer image.`;
  }

  if (report.brightness < thresholds.minBrightness) {
    return "Image is too dark. Increase lighting and try again.";
  }

  if (report.contrast < thresholds.minContrast) {
    return "Image contrast is too low. Ensure labels and product edges are visible.";
  }

  if (report.sharpness < thresholds.minSharpness) {
    return "Image appears blurry. Hold steady and retake the photo.";
  }

  return null;
}

export async function evaluateImageQualityForAi(
  file: File,
  thresholds: Partial<ImageQualityThresholds> = {}
): Promise<ImageQualityGateAssessment> {
  const resolvedThresholds: ImageQualityThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
  };

  const report = await analyzeImageQuality(file);
  const checks: ImageQualityGateAssessment["checks"] = [
    {
      key: "size",
      label: "Dimensions",
      passed:
        report.width >= resolvedThresholds.minWidth &&
        report.height >= resolvedThresholds.minHeight,
      value: `${report.width}x${report.height}`,
    },
    {
      key: "brightness",
      label: "Brightness",
      passed: report.brightness >= resolvedThresholds.minBrightness,
      value: `${report.brightness}`,
    },
    {
      key: "contrast",
      label: "Contrast",
      passed: report.contrast >= resolvedThresholds.minContrast,
      value: `${report.contrast}`,
    },
    {
      key: "sharpness",
      label: "Sharpness",
      passed: report.sharpness >= resolvedThresholds.minSharpness,
      value: `${report.sharpness}`,
    },
  ];

  return {
    report,
    checks,
    failureMessage: getImageQualityFailureMessage(report, resolvedThresholds),
  };
}

export async function assertImageQualityForAi(
  file: File,
  thresholds: Partial<ImageQualityThresholds> = {}
): Promise<void> {
  const assessment = await evaluateImageQualityForAi(file, thresholds);

  if (assessment.failureMessage) {
    throw new Error(assessment.failureMessage);
  }
}
