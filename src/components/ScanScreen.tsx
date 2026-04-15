import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  CameraIcon,
  CheckCircle2,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { confirmScanDeduction, scanImageForDeduction } from "@/lib/inventoryService";
import { cn } from "@/lib/utils";
import type { ScanDetectionResult } from "@/types/inventory";

const confidenceScores: Record<ScanDetectionResult["confidence"], number> = {
  high: 92,
  medium: 74,
  low: 56,
};

export function ScanScreen() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanDetectionResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const setImageFile = (imageFile: File) => {
    if (!imageFile.type.startsWith("image/")) {
      setErrorMessage("Please upload a valid image file.");
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setScanResult(null);
    setSelectedImage(imageFile);
    setPreviewUrl((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview);
      }

      return URL.createObjectURL(imageFile);
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];

    if (droppedFile) {
      setImageFile(droppedFile);
    }
  };

  const handleScan = async () => {
    if (!selectedImage) {
      setErrorMessage("Choose or drop an image before scanning.");
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const detectedResult = await scanImageForDeduction(selectedImage);
      setScanResult(detectedResult);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Scan failed. Please try again."
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleCancelDeduction = () => {
    setScanResult(null);
    setInfoMessage("Deduction cancelled. No stock movement was recorded.");
  };

  const handleConfirmDeduction = async () => {
    if (!scanResult) {
      return;
    }

    setIsConfirming(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const response = await confirmScanDeduction({
        detection: scanResult,
        imageFile: selectedImage,
        transactionType: "stock_out",
        notes: `Issue #8 confirmation for ${scanResult.item_name}`,
      });

      setScanResult(null);
      setInfoMessage(
        `Deduction confirmed. ${response.deductionsApplied} ingredient transaction(s) logged.`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to confirm deduction. Please retry."
      );
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-6">
      <Card className="ring-1 ring-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-700/10">
              <CameraIcon className="h-4 w-4 text-amber-700" />
            </span>
            Scan Ingredients
          </CardTitle>
          <CardDescription>
            Upload or drop an image, run AI analysis, then confirm deduction manually.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={cn(
              "flex min-h-56 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
              isDragging ? "border-amber-600 bg-amber-50" : "border-border"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.currentTarget.files?.[0];

                if (nextFile) {
                  setImageFile(nextFile);
                }

                event.currentTarget.value = "";
              }}
            />

            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Uploaded ingredient preview"
                className="max-h-60 w-full max-w-md rounded-lg border border-border object-contain"
              />
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Drop image here</p>
                  <p className="text-sm text-muted-foreground">
                    You can also choose a file from your device.
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning || isConfirming}
            >
              Choose Image
            </Button>
            <Button onClick={handleScan} disabled={!selectedImage || isScanning || isConfirming}>
              {isScanning ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Analyzing image...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Scan
                </>
              )}
            </Button>
            {selectedImage ? (
              <span className="text-xs text-muted-foreground">{selectedImage.name}</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {errorMessage ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {infoMessage ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-600/20 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          <span>{infoMessage}</span>
        </div>
      ) : null}

      {scanResult ? (
        <Card className="ring-1 ring-border/70">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Scan Result</CardTitle>
                <CardDescription>
                  Review details before confirming stock deduction.
                </CardDescription>
              </div>
              <Badge variant={scanResult.source === "cache" ? "secondary" : "default"}>
                {scanResult.source === "cache" ? "Cache Hit" : "Gemini"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Dish / Item</p>
                <p className="font-medium text-foreground">{scanResult.item_name}</p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Confidence</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {scanResult.confidence}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">
                    {confidenceScores[scanResult.confidence]}%
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="font-medium text-foreground">{scanResult.category}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Ingredients to Deduct</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanResult.ingredients_to_deduct.map((ingredient, index) => (
                    <TableRow key={`${ingredient.item_name}-${index}`}>
                      <TableCell className="font-medium">{ingredient.item_name}</TableCell>
                      <TableCell>{ingredient.category}</TableCell>
                      <TableCell>{ingredient.quantity}</TableCell>
                      <TableCell>{ingredient.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleCancelDeduction}
              disabled={isConfirming}
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleConfirmDeduction} disabled={isConfirming}>
              {isConfirming ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Applying deduction...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm Deduction
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}