import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  LoaderCircle,
  PlusCircle,
  Search,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { useProducts } from "@/hooks/useProducts";
import {
  cacheStockInScanCorrection,
  confirmScanDeduction,
  recordManualStockIn,
  scanImageForStockInCatalog,
  upsertInventoryItemPricing,
  type AiScanProgressUpdate,
} from "@/lib/inventoryService";
import {
  isHeicOrHeifFile,
  normalizeImageForAiScan,
  requestCameraPermissionForStillPhoto,
  waitForNextPaint,
} from "@/lib/imageUpload";
import { evaluateImageQualityForAi } from "@/lib/imageQuality";
import type {
  ConfirmDeductionLine,
  IngredientDeduction,
  InventoryItemRow,
  ScanDetectionResult,
} from "@/types/inventory";
import type { ProductWithIngredients } from "@/types/recipes";

const PAGE_SIZE = 10;

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

const SUPPORTED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
];

type InventoryFilter =
  | "all"
  | "healthy"
  | "low"
  | "critical"
  | "stock-asc"
  | "stock-desc";

type StockInMode = "selector" | "manual" | "ai";
type AiImageInputChoice = "none" | "upload" | "camera";

interface RecipeIngredientCatalogItem {
  key: string;
  name: string;
  unit: string;
  category: string;
  linked_products: string[];
}

interface InventoryCatalogRow extends RecipeIngredientCatalogItem {
  inventory_id: string | null;
  current_stock: number;
  reorder_threshold: number;
  price_amount: number;
  price_basis_quantity: number;
  price_basis_unit: string;
}

interface AiLineDraft {
  id: string;
  detected_name: string;
  detected_unit: string;
  selected_key: string;
  quantity: string;
}

interface AiScanProgressState extends AiScanProgressUpdate {
  started_at: number;
}

interface AiImagePreparationState {
  percent: number;
  message: string;
  detail?: string;
}

interface InventoryScreenProps {
  autoOpenStockInAiRequestId?: string | null;
  onAutoOpenStockInAiHandled?: () => void;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function toIngredientKey(name: string, unit: string): string {
  return `${normalizeValue(name)}|${normalizeValue(unit)}`;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(3)));
}

function formatStockInAppliedLine(line: ConfirmDeductionLine): string {
  return `${line.item_name}: +${formatNumber(line.quantity)} ${line.unit}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);
}

function mergeAiScanProgress(
  previous: AiScanProgressState | null,
  incoming: AiScanProgressUpdate
): AiScanProgressState {
  const startedAt = previous?.started_at ?? Date.now();

  return {
    percent: Math.max(previous?.percent ?? 0, incoming.percent),
    message: incoming.message,
    started_at: startedAt,
  };
}

function formatElapsedMs(milliseconds: number): string {
  const totalSeconds = Math.max(0, milliseconds / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = Math.floor(totalSeconds % 60);

  return `${minutes}m ${remainingSeconds}s`;
}

function parsePositiveNumber(value: string, fieldLabel: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldLabel} must be greater than zero.`);
  }

  return parsed;
}

function getStatus(item: { current_stock: number; reorder_threshold: number }): {
  level: "healthy" | "low" | "critical";
  label: string;
  color: string;
} {
  const safeThreshold = Math.max(0, item.reorder_threshold);
  const criticalThreshold =
    safeThreshold === 0 ? 0 : Number((safeThreshold * 0.5).toFixed(3));

  if (item.current_stock <= criticalThreshold) {
    return {
      level: "critical",
      label: "CRITICAL",
      color: "bg-orange-100 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400",
    };
  }

  if (item.current_stock <= safeThreshold) {
    return {
      level: "low",
      label: "LOW STOCK",
      color: "bg-[#FFF5F0] dark:bg-amber-950/30 text-orange-400",
    };
  }

  return {
    level: "healthy",
    label: "HEALTHY",
    color: "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
  };
}

function buildRecipeIngredientCatalog(
  products: ProductWithIngredients[]
): RecipeIngredientCatalogItem[] {
  const ingredientMap = new Map<string, RecipeIngredientCatalogItem>();

  for (const product of products) {
    for (const ingredient of product.ingredients) {
      const trimmedName = ingredient.name.trim();

      if (!trimmedName) {
        continue;
      }

      const trimmedUnit = ingredient.unit.trim() || "pcs";
      const key = toIngredientKey(trimmedName, trimmedUnit);
      const existing = ingredientMap.get(key);

      if (existing) {
        if (!existing.linked_products.includes(product.name)) {
          existing.linked_products.push(product.name);
          existing.linked_products.sort((left, right) =>
            left.localeCompare(right)
          );
        }

        continue;
      }

      ingredientMap.set(key, {
        key,
        name: trimmedName,
        unit: trimmedUnit,
        category: product.category.trim() || "Recipe",
        linked_products: [product.name],
      });
    }
  }

  return [...ingredientMap.values()].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);

    if (byName !== 0) {
      return byName;
    }

    return left.unit.localeCompare(right.unit);
  });
}

function findCatalogMatch(
  ingredient: IngredientDeduction,
  catalog: RecipeIngredientCatalogItem[]
): RecipeIngredientCatalogItem | null {
  const ingredientName = normalizeValue(ingredient.item_name);
  const ingredientUnit = normalizeValue(ingredient.unit);

  const exactMatch =
    catalog.find(
      (entry) =>
        normalizeValue(entry.name) === ingredientName &&
        normalizeValue(entry.unit) === ingredientUnit
    ) ?? null;

  if (exactMatch) {
    return exactMatch;
  }

  return (
    catalog.find((entry) => normalizeValue(entry.name) === ingredientName) ?? null
  );
}

function toAiLineDrafts(
  ingredients: IngredientDeduction[],
  catalog: RecipeIngredientCatalogItem[]
): AiLineDraft[] {
  return ingredients.map((ingredient, index) => {
    const matched = findCatalogMatch(ingredient, catalog);

    return {
      id: `line-${Date.now()}-${index}`,
      detected_name: ingredient.item_name,
      detected_unit: ingredient.unit,
      selected_key: matched?.key ?? "",
      quantity:
        ingredient.quantity > 0 ? formatNumber(ingredient.quantity) : "",
    };
  });
}

function isSupportedImageFile(imageFile: File): boolean {
  if (SUPPORTED_MIME_TYPES.includes(imageFile.type)) {
    return true;
  }

  const normalizedName = imageFile.name.toLowerCase();

  return SUPPORTED_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension)
  );
}

export function InventoryScreen({
  autoOpenStockInAiRequestId,
  onAutoOpenStockInAiHandled,
}: InventoryScreenProps) {
  const {
    items,
    loading: inventoryLoading,
    error: inventoryError,
    refresh,
  } = useInventory();
  const {
    products,
    loading: productsLoading,
    error: productsError,
  } = useProducts();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<InventoryFilter>("all");
  const [page, setPage] = useState(1);
  const [stockInMode, setStockInMode] = useState<StockInMode | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionSuccessLines, setActionSuccessLines] = useState<string[]>([]);

  const [manualIngredientKey, setManualIngredientKey] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualNotes, setManualNotes] = useState("");
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const [pricingEditorKey, setPricingEditorKey] = useState<string | null>(null);
  const [priceAmountInput, setPriceAmountInput] = useState("0");
  const [priceBasisQuantityInput, setPriceBasisQuantityInput] = useState("1");
  const [priceBasisUnitInput, setPriceBasisUnitInput] = useState("");
  const [isPricingSaving, setIsPricingSaving] = useState(false);

  const aiUploadInputRef = useRef<HTMLInputElement | null>(null);
  const aiCameraInputRef = useRef<HTMLInputElement | null>(null);
  const aiImagePreparingRef = useRef(false);
  const aiProgressClearTimeoutRef = useRef<number | null>(null);
  const aiImagePreparationClearTimeoutRef = useRef<number | null>(null);
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const [aiImagePreparation, setAiImagePreparation] =
    useState<AiImagePreparationState | null>(null);
  const [aiImageInputChoice, setAiImageInputChoice] =
    useState<AiImageInputChoice>("none");
  const [isAiDragging, setIsAiDragging] = useState(false);
  const [aiScanResult, setAiScanResult] = useState<ScanDetectionResult | null>(null);
  const [aiLines, setAiLines] = useState<AiLineDraft[]>([]);
  const [aiScanProgress, setAiScanProgress] = useState<AiScanProgressState | null>(null);
  const aiScanStartedAtRef = useRef<number | null>(null);
  const [aiScanElapsedMs, setAiScanElapsedMs] = useState(0);
  const [isAiImagePreparing, setIsAiImagePreparing] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [isAiDisputing, setIsAiDisputing] = useState(false);
  const [isAiConfirming, setIsAiConfirming] = useState(false);

  const loading = inventoryLoading || productsLoading;

  const recipeIngredientCatalog = useMemo(
    () => buildRecipeIngredientCatalog(products),
    [products]
  );

  const catalogByKey = useMemo(() => {
    return new Map(
      recipeIngredientCatalog.map((item) => [item.key, item] as const)
    );
  }, [recipeIngredientCatalog]);

  const mergedIngredients = useMemo<InventoryCatalogRow[]>(() => {
    const inventoryByExact = new Map<string, InventoryItemRow>();
    const inventoryByName = new Map<string, InventoryItemRow>();

    for (const inventoryItem of items) {
      const exactKey = toIngredientKey(inventoryItem.name, inventoryItem.unit);
      const nameKey = normalizeValue(inventoryItem.name);

      if (!inventoryByExact.has(exactKey)) {
        inventoryByExact.set(exactKey, inventoryItem);
      }

      if (!inventoryByName.has(nameKey)) {
        inventoryByName.set(nameKey, inventoryItem);
      }
    }

    return recipeIngredientCatalog.map((recipeIngredient) => {
      const matchedInventoryItem =
        inventoryByExact.get(recipeIngredient.key) ??
        inventoryByName.get(normalizeValue(recipeIngredient.name)) ??
        null;

      return {
        ...recipeIngredient,
        inventory_id: matchedInventoryItem?.id ?? null,
        current_stock: matchedInventoryItem?.current_stock ?? 0,
        reorder_threshold: matchedInventoryItem?.reorder_threshold ?? 10,
        price_amount: matchedInventoryItem?.price_amount ?? 0,
        price_basis_quantity: matchedInventoryItem?.price_basis_quantity ?? 1,
        price_basis_unit:
          matchedInventoryItem?.price_basis_unit?.trim() || recipeIngredient.unit,
      };
    });
  }, [items, recipeIngredientCatalog]);

  const filteredIngredients = useMemo(() => {
    const normalizedSearch = normalizeValue(searchTerm);

    let list = mergedIngredients.filter((ingredient) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        normalizeValue(ingredient.name).includes(normalizedSearch) ||
        normalizeValue(ingredient.category).includes(normalizedSearch) ||
        normalizeValue(ingredient.unit).includes(normalizedSearch) ||
        ingredient.linked_products.some((productName) =>
          normalizeValue(productName).includes(normalizedSearch)
        )
      );
    });

    if (filterType === "healthy") {
      list = list.filter((item) => getStatus(item).level === "healthy");
    }

    if (filterType === "low") {
      list = list.filter((item) => getStatus(item).level === "low");
    }

    if (filterType === "critical") {
      list = list.filter((item) => getStatus(item).level === "critical");
    }

    if (filterType === "stock-asc") {
      list = [...list].sort((left, right) => left.current_stock - right.current_stock);
    } else if (filterType === "stock-desc") {
      list = [...list].sort((left, right) => right.current_stock - left.current_stock);
    }

    return list;
  }, [filterType, mergedIngredients, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredIngredients.length / PAGE_SIZE));

  useEffect(() => {
    setPage((previousPage) => Math.min(previousPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    return () => {
      if (aiPreviewUrl) {
        URL.revokeObjectURL(aiPreviewUrl);
      }

      if (aiProgressClearTimeoutRef.current !== null) {
        window.clearTimeout(aiProgressClearTimeoutRef.current);
      }

      if (aiImagePreparationClearTimeoutRef.current !== null) {
        window.clearTimeout(aiImagePreparationClearTimeoutRef.current);
      }
    };
  }, [aiPreviewUrl]);

  useEffect(() => {
    if (!isAiScanning) {
      return;
    }

    if (aiScanStartedAtRef.current === null) {
      aiScanStartedAtRef.current = performance.now();
    }

    const intervalId = window.setInterval(() => {
      const startedAt = aiScanStartedAtRef.current;

      if (startedAt === null) {
        return;
      }

      setAiScanElapsedMs(Math.max(0, performance.now() - startedAt));
    }, 200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAiScanning]);

  const paginatedIngredients = useMemo(
    () =>
      filteredIngredients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredIngredients, page]
  );

  const lowStockItems = useMemo(
    () =>
      [...mergedIngredients]
        .filter((item) => getStatus(item).level !== "healthy")
        .sort((left, right) => left.current_stock - right.current_stock)
        .slice(0, 5),
    [mergedIngredients]
  );

  const selectedManualIngredient =
    catalogByKey.get(manualIngredientKey) ?? null;

  const combinedError =
    inventoryError ?? productsError ?? (stockInMode === null ? actionError : null);

  const resetAiState = () => {
    aiImagePreparingRef.current = false;
    aiScanStartedAtRef.current = null;
    setIsAiImagePreparing(false);
    setIsAiDisputing(false);
    setAiScanElapsedMs(0);
    setAiImagePreparation(null);
    setAiImageInputChoice("none");
    setAiScanProgress(null);
    setAiImage(null);
    setAiScanResult(null);
    setAiLines([]);
    setIsAiDragging(false);
    setAiPreviewUrl((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview);
      }

      return null;
    });

    if (aiProgressClearTimeoutRef.current !== null) {
      window.clearTimeout(aiProgressClearTimeoutRef.current);
      aiProgressClearTimeoutRef.current = null;
    }

    if (aiImagePreparationClearTimeoutRef.current !== null) {
      window.clearTimeout(aiImagePreparationClearTimeoutRef.current);
      aiImagePreparationClearTimeoutRef.current = null;
    }
  };

  const openStockInSelector = () => {
    setStockInMode("selector");
    setActionError(null);
  };

  const openManualStockIn = (ingredientKey?: string) => {
    setStockInMode("manual");
    setActionError(null);
    setManualQuantity("1");
    setManualNotes("");

    if (ingredientKey) {
      setManualIngredientKey(ingredientKey);
      return;
    }

    setManualIngredientKey(recipeIngredientCatalog[0]?.key ?? "");
  };

  const openAiStockIn = () => {
    setStockInMode("ai");
    setActionError(null);
    resetAiState();
  };

  const openAiUploadPicker = () => {
    if (isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming) {
      return;
    }

    setActionError(null);
    setAiImageInputChoice("upload");
    aiUploadInputRef.current?.click();
  };

  const openAiCameraCapture = async () => {
    if (isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming) {
      return;
    }

    setActionError(null);

    try {
      await requestCameraPermissionForStillPhoto();
      setAiImageInputChoice("camera");
      aiCameraInputRef.current?.click();
    } catch (cameraError) {
      setActionError(
        cameraError instanceof Error
          ? cameraError.message
          : "Camera permission is required to take a photo."
      );
    }
  };

  const openPricingEditor = (item: InventoryCatalogRow) => {
    if (isPricingSaving) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setActionSuccessLines([]);
    setPricingEditorKey(item.key);
    setPriceAmountInput(formatNumber(item.price_amount));
    setPriceBasisQuantityInput(formatNumber(item.price_basis_quantity));
    setPriceBasisUnitInput(item.price_basis_unit || item.unit);
  };

  const closePricingEditor = () => {
    if (isPricingSaving) {
      return;
    }

    setPricingEditorKey(null);
  };

  const saveIngredientPricing = async (item: InventoryCatalogRow) => {
    if (isPricingSaving) {
      return;
    }

    const parsedPriceAmount = Number(priceAmountInput);
    const parsedBasisQuantity = Number(priceBasisQuantityInput);
    const normalizedBasisUnit = priceBasisUnitInput.trim() || item.unit;

    if (!Number.isFinite(parsedPriceAmount) || parsedPriceAmount < 0) {
      setActionError("Price amount must be a non-negative number.");
      return;
    }

    if (!Number.isFinite(parsedBasisQuantity) || parsedBasisQuantity <= 0) {
      setActionError("Price basis quantity must be greater than zero.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setActionSuccessLines([]);
    setIsPricingSaving(true);

    const normalizedAmount = Number(parsedPriceAmount.toFixed(2));
    const normalizedBasisQuantity = Number(parsedBasisQuantity.toFixed(3));

    try {
      await upsertInventoryItemPricing({
        item_name: item.name,
        category: item.category,
        unit: item.unit,
        price_amount: normalizedAmount,
        price_basis_quantity: normalizedBasisQuantity,
        price_basis_unit: normalizedBasisUnit,
      });

      await refresh();
      setPricingEditorKey(null);
      setActionSuccess(`Pricing updated for ${item.name}.`);
      setActionSuccessLines([
        `${item.name}: ${formatCurrency(normalizedAmount)} per ${formatNumber(normalizedBasisQuantity)} ${normalizedBasisUnit}`,
      ]);
    } catch (pricingError) {
      setActionError(
        pricingError instanceof Error
          ? pricingError.message
          : "Unable to save ingredient pricing."
      );
    } finally {
      setIsPricingSaving(false);
    }
  };

  const resetIngredientPricing = async (item: InventoryCatalogRow) => {
    if (isPricingSaving) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setActionSuccessLines([]);
    setIsPricingSaving(true);

    try {
      await upsertInventoryItemPricing({
        item_name: item.name,
        category: item.category,
        unit: item.unit,
        price_amount: 0,
        price_basis_quantity: 1,
        price_basis_unit: item.unit,
      });

      await refresh();
      setPricingEditorKey(null);
      setActionSuccess(`Pricing reset for ${item.name}.`);
      setActionSuccessLines([
        `${item.name}: ${formatCurrency(0)} per 1 ${item.unit}`,
      ]);
    } catch (pricingError) {
      setActionError(
        pricingError instanceof Error
          ? pricingError.message
          : "Unable to reset ingredient pricing."
      );
    } finally {
      setIsPricingSaving(false);
    }
  };

  useEffect(() => {
    if (!autoOpenStockInAiRequestId) {
      return;
    }

    openAiStockIn();
    onAutoOpenStockInAiHandled?.();
  }, [autoOpenStockInAiRequestId, onAutoOpenStockInAiHandled]);

  const closeStockInModal = () => {
    if (
      isManualSubmitting ||
      isAiImagePreparing ||
      isAiScanning ||
      isAiDisputing ||
      isAiConfirming
    ) {
      return;
    }

    setActionError(null);
    setStockInMode(null);

    if (stockInMode === "ai") {
      resetAiState();
    }
  };

  const setAiImageFile = async (imageFile: File) => {
    if (aiImagePreparingRef.current || isAiScanning || isAiDisputing || isAiConfirming) {
      return;
    }

    if (!isSupportedImageFile(imageFile)) {
      setActionError(
        "Please upload a valid image file (jpg, png, gif, webp, heic, heif)."
      );
      return;
    }

    aiImagePreparingRef.current = true;
    setIsAiImagePreparing(true);
    const inputWasHeic = isHeicOrHeifFile(imageFile);

    if (aiImagePreparationClearTimeoutRef.current !== null) {
      window.clearTimeout(aiImagePreparationClearTimeoutRef.current);
      aiImagePreparationClearTimeoutRef.current = null;
    }

    setAiImagePreparation({
      percent: 8,
      message: "Preparing photo...",
      detail: "Validating file before scan.",
    });

    setAiImage(null);
    setAiScanResult(null);
    setAiLines([]);
    setAiPreviewUrl((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview);
      }

      return null;
    });

    try {
      await waitForNextPaint();
      setAiImagePreparation({
        percent: inputWasHeic ? 28 : 22,
        message: inputWasHeic
          ? "Converting HEIC/HEIF to JPEG..."
          : "Optimizing image for faster scan...",
        detail: inputWasHeic
          ? "Large HEIC files can take a few seconds to convert."
          : "Compressing and resizing while preserving label details.",
      });

      const normalizedImageFile = await normalizeImageForAiScan(imageFile);

      setActionError(null);
      setAiImage(normalizedImageFile);
      setAiPreviewUrl((currentPreview) => {
        if (currentPreview) {
          URL.revokeObjectURL(currentPreview);
        }

        return URL.createObjectURL(normalizedImageFile);
      });

      setAiImagePreparation({
        percent: 74,
        message: "Quality gate: checking dimensions, brightness, contrast, and sharpness...",
        detail: "Verifying the image is readable for AI detection.",
      });

      const qualityAssessment = await evaluateImageQualityForAi(normalizedImageFile);

      if (qualityAssessment.failureMessage) {
        throw new Error(qualityAssessment.failureMessage);
      }

      setAiImagePreparation({
        percent: 100,
        message: "Photo is ready for AI scan.",
        detail: qualityAssessment.checks
          .map((check) => `${check.label}: ${check.value}`)
          .join(" • "),
      });

      aiImagePreparationClearTimeoutRef.current = window.setTimeout(() => {
        setAiImagePreparation(null);
        aiImagePreparationClearTimeoutRef.current = null;
      }, 1000);
    } catch (imageError) {
      setAiImage(null);
      setAiScanResult(null);
      setAiLines([]);
      setAiPreviewUrl((currentPreview) => {
        if (currentPreview) {
          URL.revokeObjectURL(currentPreview);
        }

        return null;
      });
      setAiImagePreparation(null);
      setActionError(
        imageError instanceof Error
          ? imageError.message
          : "Unable to process this image file."
      );
    } finally {
      aiImagePreparingRef.current = false;
      setIsAiImagePreparing(false);
    }
  };

  const handleAiDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming) {
      return;
    }

    if (aiImageInputChoice !== "upload") {
      setActionError("Choose Upload Photo first, then drag and drop your image.");
      return;
    }

    setIsAiDragging(false);

    const droppedFile = event.dataTransfer.files?.[0];

    if (droppedFile) {
      void setAiImageFile(droppedFile);
    }
  };

  const handleAiScan = async () => {
    if (isAiImagePreparing || isAiScanning || isAiDisputing) {
      return;
    }

    if (!aiImage) {
      setActionError("Choose camera or upload a photo before scanning.");
      return;
    }

    if (recipeIngredientCatalog.length === 0) {
      setActionError(
        "No recipe ingredients are available. Configure recipe ingredients first."
      );
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setActionSuccessLines([]);
    if (aiProgressClearTimeoutRef.current !== null) {
      window.clearTimeout(aiProgressClearTimeoutRef.current);
      aiProgressClearTimeoutRef.current = null;
    }
    setAiScanProgress({
      percent: 8,
      message: "Preparing scan...",
      started_at: Date.now(),
    });
    aiScanStartedAtRef.current = performance.now();
    setAiScanElapsedMs(0);
    setIsAiDisputing(false);
    setIsAiScanning(true);

    try {
      const detectedResult = await scanImageForStockInCatalog(
        aiImage,
        recipeIngredientCatalog,
        (progress) => {
          setAiScanProgress((previous) => mergeAiScanProgress(previous, progress));
        }
      );
      setAiScanProgress((previous) =>
        mergeAiScanProgress(previous, {
          percent: 100,
          message: "Scan complete.",
        })
      );
      setAiScanResult(detectedResult);
      setAiLines(
        toAiLineDrafts(detectedResult.ingredients_to_deduct, recipeIngredientCatalog)
      );
    } catch (scanError) {
      setAiScanProgress(null);
      setActionError(
        scanError instanceof Error
          ? scanError.message
          : "AI scan failed. Please try again."
      );
    } finally {
      setIsAiScanning(false);
      aiProgressClearTimeoutRef.current = window.setTimeout(() => {
        setAiScanProgress(null);
        aiScanStartedAtRef.current = null;
        setAiScanElapsedMs(0);
        aiProgressClearTimeoutRef.current = null;
      }, 1200);
    }
  };

  const handleAiDisputeAndRescan = async () => {
    if (isAiImagePreparing || isAiScanning || isAiDisputing) {
      return;
    }

    if (!aiImage) {
      setActionError("Choose camera or upload a photo before scanning.");
      return;
    }

    if (recipeIngredientCatalog.length === 0) {
      setActionError(
        "No recipe ingredients are available. Configure recipe ingredients first."
      );
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setActionSuccessLines([]);
    if (aiProgressClearTimeoutRef.current !== null) {
      window.clearTimeout(aiProgressClearTimeoutRef.current);
      aiProgressClearTimeoutRef.current = null;
    }
    setAiScanProgress({
      percent: 10,
      message: "Dispute submitted. Clearing cache and re-scanning...",
      started_at: Date.now(),
    });
    aiScanStartedAtRef.current = performance.now();
    setAiScanElapsedMs(0);
    setIsAiDisputing(true);
    setIsAiScanning(true);

    try {
      const detectedResult = await scanImageForStockInCatalog(
        aiImage,
        recipeIngredientCatalog,
        (progress) => {
          setAiScanProgress((previous) => mergeAiScanProgress(previous, progress));
        },
        {
          forceFresh: true,
          invalidateExistingCache: true,
        }
      );

      setAiScanProgress((previous) =>
        mergeAiScanProgress(previous, {
          percent: 100,
          message: "Fresh scan complete.",
        })
      );
      setAiScanResult(detectedResult);
      setAiLines(
        toAiLineDrafts(detectedResult.ingredients_to_deduct, recipeIngredientCatalog)
      );
    } catch (scanError) {
      setAiScanProgress(null);
      setActionError(
        scanError instanceof Error
          ? scanError.message
          : "Fresh AI scan failed. Please try again."
      );
    } finally {
      setIsAiDisputing(false);
      setIsAiScanning(false);
      aiProgressClearTimeoutRef.current = window.setTimeout(() => {
        setAiScanProgress(null);
        aiScanStartedAtRef.current = null;
        setAiScanElapsedMs(0);
        aiProgressClearTimeoutRef.current = null;
      }, 1200);
    }
  };

  const aiLinesMissingQuantityCount = useMemo(
    () => aiLines.filter((line) => line.quantity.trim().length === 0).length,
    [aiLines]
  );

  const updateAiLine = (lineId: string, field: "selected_key" | "quantity", value: string) => {
    setAiLines((previousLines) =>
      previousLines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              [field]: value,
            }
          : line
      )
    );
  };

  const removeAiLine = (lineId: string) => {
    setAiLines((previousLines) =>
      previousLines.filter((line) => line.id !== lineId)
    );
  };

  const addAiLine = () => {
    setAiLines((previousLines) => [
      ...previousLines,
      {
        id: `line-${Date.now()}-${previousLines.length}`,
        detected_name: "Manual line",
        detected_unit: "",
        selected_key: recipeIngredientCatalog[0]?.key ?? "",
        quantity: "1",
      },
    ]);
  };

  const confirmAiStockIn = async () => {
    if (!aiScanResult) {
      setActionError("No AI scan result to confirm.");
      return;
    }

    if (aiLines.length === 0) {
      setActionError("No stock-in lines available. Add or scan ingredient lines first.");
      return;
    }

    const mergedByIngredientKey = new Map<string, IngredientDeduction>();

    try {
      for (const line of aiLines) {
        if (!line.selected_key) {
          throw new Error(
            "Match each detected line to a recipe ingredient before confirming."
          );
        }

        const selectedIngredient = catalogByKey.get(line.selected_key);

        if (!selectedIngredient) {
          throw new Error("One or more selected ingredients are invalid.");
        }

        const quantity = parsePositiveNumber(line.quantity, "Quantity");
        const existing = mergedByIngredientKey.get(selectedIngredient.key);

        if (existing) {
          existing.quantity = Number((existing.quantity + quantity).toFixed(3));
          continue;
        }

        mergedByIngredientKey.set(selectedIngredient.key, {
          item_name: selectedIngredient.name,
          category: selectedIngredient.category,
          unit: selectedIngredient.unit,
          quantity,
        });
      }
    } catch (lineError) {
      setActionError(
        lineError instanceof Error
          ? lineError.message
          : "Please fix AI stock-in lines before confirming."
      );
      return;
    }

    const ingredientsToAdd = [...mergedByIngredientKey.values()];

    if (ingredientsToAdd.length === 0) {
      setActionError("At least one valid ingredient line is required.");
      return;
    }

    const confirmationPayload: ScanDetectionResult = {
      ...aiScanResult,
      ingredients_to_deduct: ingredientsToAdd,
    };

    setActionError(null);
    setActionSuccess(null);
    setActionSuccessLines([]);
    setIsAiConfirming(true);

    try {
      const response = await confirmScanDeduction({
        detection: confirmationPayload,
        imageFile: aiImage,
        transactionType: "stock_in",
        notes: `Stock-in AI confirmation for ${aiScanResult.item_name}`,
      });

      if (aiImage) {
        void cacheStockInScanCorrection({
          file: aiImage,
          catalog: recipeIngredientCatalog,
          correction: {
            item_name: confirmationPayload.item_name,
            category: confirmationPayload.category,
            quantity_estimate: confirmationPayload.quantity_estimate,
            unit: confirmationPayload.unit,
            ingredients_to_deduct: confirmationPayload.ingredients_to_deduct,
          },
        });
      }

      await refresh();
      setActionSuccess(
        `Stock-in confirmed. ${response.deductionsApplied} ingredient line(s) were updated.`
      );
      setActionSuccessLines(
        response.appliedLines.map((line) => formatStockInAppliedLine(line))
      );
      setStockInMode(null);
      resetAiState();
    } catch (confirmError) {
      setActionError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to confirm AI stock-in."
      );
    } finally {
      setIsAiConfirming(false);
    }
  };

  const submitManualStockIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!manualIngredientKey) {
      setActionError("Select an ingredient before confirming manual stock-in.");
      return;
    }

    const selectedIngredient = catalogByKey.get(manualIngredientKey);

    if (!selectedIngredient) {
      setActionError("Selected ingredient is invalid.");
      return;
    }

    let quantity = 0;

    try {
      quantity = parsePositiveNumber(manualQuantity, "Quantity");
    } catch (validationError) {
      setActionError(
        validationError instanceof Error
          ? validationError.message
          : "Quantity must be greater than zero."
      );
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setActionSuccessLines([]);
    setIsManualSubmitting(true);

    try {
      const response = await recordManualStockIn({
        entries: [
          {
            item_name: selectedIngredient.name,
            category: selectedIngredient.category,
            unit: selectedIngredient.unit,
            quantity,
          },
        ],
        notes: manualNotes,
      });

      await refresh();
      setActionSuccess(
        `Manual stock-in saved. ${response.deductionsApplied} ingredient line(s) were updated.`
      );
      setActionSuccessLines(
        response.appliedLines.map((line) => formatStockInAppliedLine(line))
      );
      setStockInMode(null);
    } catch (manualError) {
      setActionError(
        manualError instanceof Error
          ? manualError.message
          : "Unable to record manual stock-in."
      );
    } finally {
      setIsManualSubmitting(false);
    }
  };

  const pageStart =
    filteredIngredients.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, filteredIngredients.length);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-2">
      {stockInMode === "selector" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-foreground">Choose Stock-In Method</h3>
                <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                  Ingredients are recipe-driven. Pick AI scan or manual ingredient addition.
                </p>
              </div>
              <button
                type="button"
                onClick={closeStockInModal}
                className="p-1.5 rounded-lg bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={openAiStockIn}
                className="w-full text-left p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
              >
                <p className="font-bold text-gray-800 dark:text-foreground">AI Scan Stock In</p>
                <p className="text-xs text-gray-600 dark:text-muted-foreground mt-1">
                  Scan image, review findings, edit values, then confirm.
                </p>
              </button>

              <button
                type="button"
                onClick={() => openManualStockIn()}
                className="w-full text-left p-4 rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 hover:bg-gray-100 dark:hover:bg-muted transition-colors"
              >
                <p className="font-bold text-gray-800 dark:text-foreground">Manual Ingredient Addition</p>
                <p className="text-xs text-gray-600 dark:text-muted-foreground mt-1">
                  Select a recipe ingredient and add stock manually.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {stockInMode === "manual" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-foreground">Manual Stock In</h3>
                <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                  Add stock to an ingredient sourced from Recipes.
                </p>
              </div>
              <button
                type="button"
                onClick={closeStockInModal}
                className="p-1.5 rounded-lg bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:text-foreground"
                disabled={isManualSubmitting}
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={submitManualStockIn} className="space-y-4">
              {actionError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              <div>
                <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                  Ingredient
                </label>
                <select
                  value={manualIngredientKey}
                  onChange={(event) => setManualIngredientKey(event.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                  required
                >
                  <option value="" disabled>
                    Select ingredient
                  </option>
                  {recipeIngredientCatalog.map((ingredient) => (
                    <option key={ingredient.key} value={ingredient.key}>
                      {ingredient.name} ({ingredient.unit})
                    </option>
                  ))}
                </select>
              </div>

              {selectedManualIngredient ? (
                <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 px-3 py-2 text-sm text-gray-600 dark:text-muted-foreground">
                  Unit: <span className="font-semibold">{selectedManualIngredient.unit}</span>
                </div>
              ) : null}

              <div>
                <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                  Quantity To Add
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualQuantity}
                  onChange={(event) => setManualQuantity(event.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={manualNotes}
                  onChange={(event) => setManualNotes(event.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none resize-none"
                  placeholder="Supplier, batch, or delivery note"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeStockInModal}
                  className="flex-1 bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground py-2.5 rounded-xl font-bold"
                  disabled={isManualSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#3E2723] text-white py-2.5 rounded-xl font-bold disabled:opacity-70"
                  disabled={isManualSubmitting}
                >
                  {isManualSubmitting ? "Saving..." : "Confirm Stock In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stockInMode === "ai" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl w-full max-w-5xl shadow-xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-800 dark:text-foreground">AI Stock In</h3>
                <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                  Human in the loop: scan, review, edit, and confirm.
                </p>
              </div>
              <button
                type="button"
                onClick={closeStockInModal}
                className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-700"
                disabled={isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming}
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="p-5 overflow-auto space-y-4">
              {actionError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              {actionError && aiImage && !isAiImagePreparing && !isAiScanning && !isAiDisputing && !isAiConfirming ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAiScan}
                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-700 text-xs font-bold disabled:opacity-60"
                    disabled={isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming}
                  >
                    Retry Scan
                  </button>
                </div>
              ) : null}

              {recipeIngredientCatalog.length === 0 ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                  No recipe ingredients are configured yet. Add ingredients on Recipes first.
                </div>
              ) : (
                <>
                  <div
                    onDrop={handleAiDrop}
                    onDragOver={(event) => {
                      event.preventDefault();

                      if (
                        isAiImagePreparing ||
                        isAiScanning ||
                        isAiDisputing ||
                        isAiConfirming ||
                        aiImageInputChoice !== "upload"
                      ) {
                        return;
                      }

                      setIsAiDragging(true);
                    }}
                    onDragLeave={() => {
                      if (isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming) {
                        return;
                      }

                      setIsAiDragging(false);
                    }}
                    className={`relative flex min-h-48 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                      aiImageInputChoice === "upload" && isAiDragging
                        ? "border-amber-600 bg-amber-50"
                        : "border-gray-200"
                    }`}
                  >
                    <input
                      ref={aiUploadInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif"
                      className="hidden"
                      disabled={isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming}
                      onChange={(event) => {
                        const nextFile = event.currentTarget.files?.[0];

                        if (nextFile) {
                          void setAiImageFile(nextFile);
                        }

                        event.currentTarget.value = "";
                      }}
                    />

                    <input
                      ref={aiCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming}
                      onChange={(event) => {
                        const nextFile = event.currentTarget.files?.[0];

                        if (nextFile) {
                          void setAiImageFile(nextFile);
                        }

                        event.currentTarget.value = "";
                      }}
                    />

                    {isAiImagePreparing && aiImagePreparation ? (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-muted-foreground">
                          Preparing Photo
                        </p>
                        <p className="text-sm font-semibold text-center max-w-lg text-gray-700 dark:text-foreground">
                          {aiImagePreparation.message}
                        </p>
                        <div className="w-full max-w-md h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#3E2723] transition-[width] duration-300"
                            style={{
                              width: `${Math.max(8, Math.round(aiImagePreparation.percent))}%`,
                            }}
                          />
                        </div>
                        <p className="text-[11px] font-semibold text-gray-500 dark:text-muted-foreground">
                          {Math.round(aiImagePreparation.percent)}%
                        </p>
                        {aiImagePreparation.detail ? (
                          <p className="text-[11px] text-gray-500 dark:text-muted-foreground text-center max-w-2xl">
                            {aiImagePreparation.detail}
                          </p>
                        ) : null}
                      </>
                    ) : aiPreviewUrl ? (
                      <img
                        src={aiPreviewUrl}
                        alt="AI stock-in preview"
                        className="max-h-56 w-full max-w-md rounded-lg border border-gray-200 dark:border-border object-contain"
                      />
                    ) : aiImageInputChoice === "upload" ? (
                      <>
                        <UploadCloud className="h-10 w-10 text-gray-400 dark:text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="font-medium text-gray-700 dark:text-foreground">Drop image here</p>
                          <p className="text-sm text-gray-500 dark:text-muted-foreground">
                            Or tap Upload Photo again to browse files.
                          </p>
                        </div>
                      </>
                    ) : aiImageInputChoice === "camera" ? (
                      <>
                        <UploadCloud className="h-10 w-10 text-gray-400 dark:text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="font-medium text-gray-700 dark:text-foreground">
                            Camera mode selected
                          </p>
                          <p className="text-sm text-gray-500 dark:text-muted-foreground">
                            Tap Use Device Camera to take a photo.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-gray-400 dark:text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="font-medium text-gray-700 dark:text-foreground">
                            Choose photo source first
                          </p>
                          <p className="text-sm text-gray-500 dark:text-muted-foreground">
                            Select Use Device Camera or Upload Photo below.
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/40 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-muted-foreground">
                      Photo tips for better results
                    </p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-muted-foreground">
                      Use one product per photo, keep labels fully visible, avoid glare and heavy shadows, and hold steady in bright light.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void openAiCameraCapture();
                      }}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={
                        isAiImagePreparing ||
                        isAiScanning ||
                        isAiDisputing ||
                        isAiConfirming
                      }
                    >
                      Use Device Camera
                    </button>
                    <button
                      type="button"
                      onClick={openAiUploadPicker}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={
                        isAiImagePreparing ||
                        isAiScanning ||
                        isAiDisputing ||
                        isAiConfirming
                      }
                    >
                      Upload Photo
                    </button>
                    <button
                      type="button"
                      onClick={handleAiScan}
                      className="px-3 py-2 rounded-xl bg-[#3E2723] text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={
                        !aiImage ||
                        isAiImagePreparing ||
                        isAiScanning ||
                        isAiDisputing ||
                        isAiConfirming
                      }
                    >
                      {isAiScanning ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="animate-spin" size={14} />
                          {isAiDisputing ? "Refreshing..." : "Scanning..."}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Sparkles size={14} /> Scan With AI
                        </span>
                      )}
                    </button>
                    {aiImage ? (
                      <span className="text-xs text-gray-500 dark:text-muted-foreground">{aiImage.name}</span>
                    ) : null}
                  </div>

                  {isAiScanning && aiScanProgress ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-700">
                          {aiScanProgress.message}
                        </p>
                        <p className="text-xs font-bold text-gray-500">
                          {Math.round(aiScanProgress.percent)}%
                        </p>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full bg-[#3E2723] transition-[width] duration-500"
                          style={{
                            width: `${Math.max(6, Math.round(aiScanProgress.percent))}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Elapsed {formatElapsedMs(aiScanElapsedMs)}
                      </p>
                    </div>
                  ) : null}

                  {aiScanResult ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-amber-800">
                          Looks wrong? Dispute this result to clear its cache and force a fresh AI evaluation.
                        </p>
                        <button
                          type="button"
                          onClick={handleAiDisputeAndRescan}
                          className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isAiImagePreparing || isAiScanning || isAiDisputing || isAiConfirming}
                        >
                          {isAiDisputing ? (
                            <span className="inline-flex items-center gap-2">
                              <LoaderCircle className="animate-spin" size={13} /> Re-scanning...
                            </span>
                          ) : (
                            "Dispute & Re-scan Fresh"
                          )}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
                            Detected Item
                          </p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-foreground mt-1">
                            {aiScanResult.item_name}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
                            Confidence
                          </p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-foreground mt-1 capitalize">
                            {aiScanResult.confidence}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
                            Quantity Estimate
                          </p>
                          <p className="text-sm font-semibold text-gray-800 mt-1">
                            {aiScanResult.quantity_estimate > 0
                              ? `${formatNumber(aiScanResult.quantity_estimate)} ${aiScanResult.unit}`
                              : "N/A (set manually)"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-100 dark:border-border overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 flex items-center justify-between">
                          <p className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-widest">
                            Review And Edit Findings
                          </p>
                          <button
                            type="button"
                            onClick={addAiLine}
                            className="text-xs font-bold text-[#3E2723]"
                          >
                            + Add Line
                          </button>
                        </div>

                        {aiLinesMissingQuantityCount > 0 ? (
                          <div className="px-4 py-2 border-b border-amber-100 bg-amber-50 text-xs text-amber-700 font-semibold">
                            {aiLinesMissingQuantityCount} line(s) have unknown quantity. Review and enter quantity before confirming.
                          </div>
                        ) : null}

                        <div className="overflow-auto">
                          <table className="w-full text-left">
                            <thead className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-muted-foreground border-b border-gray-100 dark:border-border">
                              <tr>
                                <th className="px-3 py-2">Detected</th>
                                <th className="px-3 py-2">Match To Recipe Ingredient</th>
                                <th className="px-3 py-2">Quantity</th>
                                <th className="px-3 py-2">Unit</th>
                                <th className="px-3 py-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-border/50">
                              {aiLines.map((line) => {
                                const selectedIngredient =
                                  catalogByKey.get(line.selected_key) ?? null;

                                return (
                                  <tr key={line.id}>
                                    <td className="px-3 py-3 text-sm text-gray-700 dark:text-foreground font-semibold">
                                      {line.detected_name}
                                    </td>
                                    <td className="px-3 py-3">
                                      <select
                                        value={line.selected_key}
                                        onChange={(event) =>
                                          updateAiLine(
                                            line.id,
                                            "selected_key",
                                            event.target.value
                                          )
                                        }
                                        className="w-full px-2 py-2 border border-gray-200 dark:border-border rounded-lg text-xs outline-none"
                                      >
                                        <option value="">Select ingredient</option>
                                        {recipeIngredientCatalog.map((ingredient) => (
                                          <option key={ingredient.key} value={ingredient.key}>
                                            {ingredient.name} ({ingredient.unit})
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-3">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={line.quantity}
                                        placeholder="N/A - set qty"
                                        onChange={(event) =>
                                          updateAiLine(
                                            line.id,
                                            "quantity",
                                            event.target.value
                                          )
                                        }
                                        className="w-28 px-2 py-2 border border-gray-200 dark:border-border rounded-lg text-xs outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-3 text-xs text-gray-600 dark:text-muted-foreground font-semibold uppercase">
                                      {selectedIngredient?.unit || line.detected_unit || "-"}
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      <button
                                        type="button"
                                        onClick={() => removeAiLine(line.id)}
                                        className="text-xs font-bold text-red-500 disabled:opacity-40"
                                        disabled={aiLines.length <= 1 || isAiConfirming}
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeStockInModal}
                          className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground font-semibold"
                          disabled={isAiConfirming}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmAiStockIn}
                          className="px-4 py-2.5 rounded-xl bg-[#3E2723] text-white font-semibold disabled:opacity-70"
                          disabled={isAiConfirming}
                        >
                          {isAiConfirming ? (
                            <span className="inline-flex items-center gap-2">
                              <LoaderCircle className="animate-spin" size={14} /> Confirming...
                            </span>
                          ) : (
                            "Confirm Stock In"
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {combinedError && (
        <div className="rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {combinedError}
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <p>{actionSuccess}</p>
          {actionSuccessLines.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">
              {actionSuccessLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white dark:bg-card p-6 rounded-2xl border border-gray-100 dark:border-border shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="text-red-500" size={18} />
            <h3 className="font-bold text-gray-800 dark:text-foreground">Low Stock Alerts</h3>
          </div>

          <div className="space-y-2">
            {loading && (
              <p className="text-sm text-gray-500 dark:text-muted-foreground">Loading inventory alerts...</p>
            )}

            {!loading && recipeIngredientCatalog.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-muted-foreground">
                No recipe ingredients found. Add ingredients in Recipes first.
              </p>
            )}

            {!loading && recipeIngredientCatalog.length > 0 && lowStockItems.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-muted-foreground">All recipe ingredients are healthy.</p>
            )}

            {!loading &&
              lowStockItems.map((item) => (
                <div
                  key={item.key}
                  className="flex justify-between items-center bg-red-50 dark:bg-red-950/20 p-4 rounded-2xl border border-red-100/50 dark:border-red-900/40"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-700 dark:text-foreground">{item.name}</span>
                    <span className="text-xs text-gray-500 dark:text-muted-foreground">{item.category}</span>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="text-lg font-black text-red-600 dark:text-red-400">
                      {formatNumber(item.current_stock)}
                    </span>
                    <span className="text-[#3E2723] dark:text-amber-400 font-black uppercase text-[10px] tracking-widest">
                      {item.unit}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-[#3E2723] rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
          <h3 className="text-white font-bold text-xl mb-2">Inventory Stock In</h3>
          <p className="text-white/80 text-sm mb-6 max-w-xs">
            Ingredients are synced from Recipes. No direct ingredient creation is allowed.
          </p>
          <button
            onClick={openStockInSelector}
            className="bg-white dark:bg-foreground text-[#3E2723] px-8 py-3 rounded-2xl font-bold flex items-center gap-2 active:scale-95 transition-all disabled:opacity-70"
            disabled={loading || recipeIngredientCatalog.length === 0}
          >
            <PlusCircle size={20} /> New Ingredient
          </button>
        </div>
      </div>

      {!loading && items.length === 0 && recipeIngredientCatalog.length > 0 && (
        <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
          Inventory has no stock records yet. Showing recipe ingredients with zero stock until stock-in is confirmed.
        </div>
      )}

      <div className="bg-white dark:bg-card rounded-3xl shadow-sm border border-gray-100 dark:border-border p-8">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-foreground tracking-tight">Ingredients List</h2>
            <p className="text-xs text-gray-400 dark:text-muted-foreground mt-1 uppercase tracking-widest font-bold">
              Recipe-based, de-duplicated catalog
            </p>
          </div>

          <div className="flex gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 dark:text-muted-foreground"
                size={18}
              />
              <input
                type="text"
                placeholder="Search by ingredient, category, unit, or product"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-2xl text-sm outline-none"
              />
            </div>

            <div className="relative">
              <Filter
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted-foreground"
                size={16}
              />
              <select
                value={filterType}
                onChange={(event) => {
                  setFilterType(event.target.value as InventoryFilter);
                  setPage(1);
                }}
                className="pl-11 pr-8 py-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-2xl text-sm font-semibold text-gray-600 dark:text-muted-foreground appearance-none cursor-pointer outline-none"
              >
                <option value="all">All Status</option>
                <option value="healthy">Healthy Only</option>
                <option value="low">Low Stock Only</option>
                <option value="critical">Critical Only</option>
                <option value="stock-asc">Stock: Low to High</option>
                <option value="stock-desc">Stock: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        <table className="w-full text-left">
          <thead className="text-gray-400 dark:text-muted-foreground text-[10px] uppercase font-bold tracking-widest border-b border-gray-50 dark:border-border/50">
            <tr>
              <th className="pb-4 px-2">Name</th>
              <th className="pb-4 px-2">Category</th>
              <th className="pb-4 px-2">Linked Products</th>
              <th className="pb-4 px-2">Current Stock</th>
              <th className="pb-4 px-2">Reorder At</th>
              <th className="pb-4 px-2">Price</th>
              <th className="pb-4 px-2">Price Basis</th>
              <th className="pb-4 px-2">Status</th>
              <th className="pb-4 px-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-border/50">
            {loading && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-gray-500 dark:text-muted-foreground">
                  Loading inventory...
                </td>
              </tr>
            )}

            {!loading && recipeIngredientCatalog.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-gray-500 dark:text-muted-foreground">
                  No recipe ingredients found. Add ingredients in Recipes tab first.
                </td>
              </tr>
            )}

            {!loading && recipeIngredientCatalog.length > 0 && filteredIngredients.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-gray-500 dark:text-muted-foreground">
                  No ingredients found.
                </td>
              </tr>
            )}

            {!loading &&
              paginatedIngredients.map((item) => {
                const status = getStatus(item);
                const isPricingEditing = pricingEditorKey === item.key;

                return (
                  <tr key={item.key} className="group hover:bg-gray-50 dark:hover:bg-muted/50">
                    <td className="py-6 px-2 font-bold text-gray-800 dark:text-foreground text-lg tracking-tight">
                      {item.name}
                    </td>
                    <td className="py-6 px-2 text-sm text-gray-600 dark:text-muted-foreground">{item.category}</td>
                    <td className="py-6 px-2 text-xs text-gray-500 dark:text-muted-foreground">
                      {item.linked_products.join(", ")}
                    </td>
                    <td className="py-6 px-2 font-bold text-lg text-gray-700 dark:text-foreground">
                      {formatNumber(item.current_stock)}
                      <span className="text-[#3E2723] dark:text-amber-400 font-black uppercase text-[10px] tracking-widest ml-2">
                        {item.unit}
                      </span>
                    </td>
                    <td className="py-6 px-2 text-sm font-semibold text-gray-600 dark:text-muted-foreground">
                      {formatNumber(item.reorder_threshold)} {item.unit}
                    </td>
                    <td className="py-6 px-2 text-sm font-semibold text-gray-700 dark:text-foreground">
                      {isPricingEditing ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">PHP</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={priceAmountInput}
                            onChange={(event) => setPriceAmountInput(event.target.value)}
                            className="w-24 px-2 py-1.5 border border-gray-200 dark:border-border rounded-lg text-xs outline-none"
                            disabled={isPricingSaving}
                          />
                        </div>
                      ) : (
                        formatCurrency(item.price_amount)
                      )}
                    </td>
                    <td className="py-6 px-2 text-sm text-gray-600 dark:text-muted-foreground">
                      {isPricingEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={priceBasisQuantityInput}
                            onChange={(event) =>
                              setPriceBasisQuantityInput(event.target.value)
                            }
                            className="w-20 px-2 py-1.5 border border-gray-200 dark:border-border rounded-lg text-xs outline-none"
                            disabled={isPricingSaving}
                          />
                          <input
                            type="text"
                            value={priceBasisUnitInput}
                            onChange={(event) =>
                              setPriceBasisUnitInput(event.target.value)
                            }
                            className="w-20 px-2 py-1.5 border border-gray-200 dark:border-border rounded-lg text-xs outline-none"
                            placeholder={item.unit}
                            disabled={isPricingSaving}
                          />
                        </div>
                      ) : (
                        `per ${formatNumber(item.price_basis_quantity)} ${item.price_basis_unit}`
                      )}
                    </td>
                    <td className="py-6 px-2">
                      <span
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="py-6 px-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openManualStockIn(item.key)}
                          className="bg-gray-100 dark:bg-muted hover:bg-[#3E2723] hover:text-white text-gray-600 dark:text-muted-foreground px-3 py-2 rounded-xl text-xs font-bold transition-all"
                          disabled={isPricingSaving}
                        >
                          Add Stock
                        </button>
                        {isPricingEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveIngredientPricing(item)}
                              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                              disabled={isPricingSaving}
                            >
                              {isPricingSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={closePricingEditor}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                              disabled={isPricingSaving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => resetIngredientPricing(item)}
                              className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                              disabled={isPricingSaving}
                            >
                              Reset
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openPricingEditor(item)}
                            className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                          >
                            Edit Price
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {!loading && filteredIngredients.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-border">
            <span className="text-[11px] text-gray-400 dark:text-muted-foreground font-bold">
              Showing {pageStart}-{pageEnd} of {filteredIngredients.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((previousPage) => Math.max(1, previousPage - 1))}
                disabled={page <= 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-muted/50 text-gray-400 dark:text-muted-foreground hover:bg-gray-100 dark:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[11px] text-gray-500 dark:text-muted-foreground font-bold">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((previousPage) => Math.min(totalPages, previousPage + 1))
                }
                disabled={page >= totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-muted/50 text-gray-400 dark:text-muted-foreground hover:bg-gray-100 dark:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {stockInMode === "ai" && aiScanResult && aiLines.length === 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          AI returned no ingredient lines. Add at least one line manually before confirming.
        </div>
      )}
    </div>
  );
}
