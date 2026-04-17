import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  LoaderCircle,
  PlusCircle,
  Search,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { useProducts } from "@/hooks/useProducts";
import { useTransactionOperations } from "@/hooks/useTransactionOperations";
import {
  confirmScanDeduction,
  scanImageForDeduction,
} from "@/lib/inventoryService";
import { createSaleTransaction } from "@/lib/transactionService";
import type {
  IngredientDeduction,
  InventoryItemRow,
  OperationType,
  ScanDetectionResult,
  TransactionOperationWithLines,
} from "@/types/inventory";
import type { ProductWithIngredients } from "@/types/recipes";

const PAGE_SIZE = 8;

const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

const SUPPORTED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
];

type OperationFilter = "all" | OperationType;

interface SaleRequirement {
  ingredient_name: string;
  ingredient_unit: string;
  required_quantity: number;
  available_quantity: number;
  remaining_quantity: number;
  inventory_item_name: string | null;
  inventory_item_unit: string | null;
  is_available: boolean;
}

interface RecipeIngredientCatalogItem {
  key: string;
  name: string;
  unit: string;
  category: string;
  linked_products: string[];
}

interface StockOutScanLineDraft {
  id: string;
  detected_name: string;
  detected_unit: string;
  selected_key: string;
  quantity: string;
}

interface StockOutRequirement {
  key: string;
  ingredient_name: string;
  ingredient_unit: string;
  required_quantity: number;
  available_quantity: number;
  remaining_quantity: number;
  inventory_item_name: string | null;
  inventory_item_unit: string | null;
  is_available: boolean;
}

function formatDate(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown date";
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown time";
  }

  return parsedDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(3)));
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function getOperationLabel(operationType: OperationType): string {
  if (operationType === "sale") {
    return "Sale";
  }

  if (operationType === "scan") {
    return "Scan";
  }

  if (operationType === "manual_stock_in") {
    return "Manual Stock In";
  }

  if (operationType === "manual_stock_out") {
    return "Manual Stock Out";
  }

  return "Adjustment";
}

function getOperationBadgeClass(operationType: OperationType): string {
  if (operationType === "sale") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (operationType === "scan") {
    return "bg-blue-100 text-blue-700";
  }

  if (operationType === "manual_stock_in") {
    return "bg-cyan-100 text-cyan-700";
  }

  if (operationType === "manual_stock_out") {
    return "bg-orange-100 text-orange-700";
  }

  return "bg-gray-100 text-gray-600";
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function toIngredientKey(name: string, unit: string): string {
  return `${normalizeValue(name)}|${normalizeValue(unit)}`;
}

function parsePositiveNumber(value: string, fieldLabel: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldLabel} must be greater than zero.`);
  }

  return parsed;
}

function isSupportedImageFile(imageFile: File): boolean {
  if (SUPPORTED_IMAGE_MIME_TYPES.includes(imageFile.type)) {
    return true;
  }

  const normalizedName = imageFile.name.toLowerCase();

  return SUPPORTED_IMAGE_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension)
  );
}

function buildRecipeIngredientCatalog(
  products: ProductWithIngredients[]
): RecipeIngredientCatalogItem[] {
  const ingredientMap = new Map<string, RecipeIngredientCatalogItem>();

  for (const product of products) {
    if (!product.is_active) {
      continue;
    }

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

function findInventoryMatch(
  ingredientName: string,
  ingredientUnit: string,
  inventoryItems: InventoryItemRow[]
): InventoryItemRow | null {
  const normalizedIngredientName = ingredientName.trim().toLowerCase();
  const normalizedIngredientUnit = ingredientUnit.trim().toLowerCase();

  const exactMatch = inventoryItems.find(
    (item) =>
      item.name.trim().toLowerCase() === normalizedIngredientName &&
      item.unit.trim().toLowerCase() === normalizedIngredientUnit
  );

  if (exactMatch) {
    return exactMatch;
  }

  return (
    inventoryItems.find(
      (item) => item.name.trim().toLowerCase() === normalizedIngredientName
    ) ?? null
  );
}

function buildSaleRequirements(
  product: ProductWithIngredients,
  quantity: number,
  inventoryItems: InventoryItemRow[]
): SaleRequirement[] {
  if (quantity <= 0) {
    return [];
  }

  return product.ingredients.map((ingredient) => {
    const requiredQuantity = ingredient.quantity * quantity;
    const matchedInventoryItem = findInventoryMatch(
      ingredient.name,
      ingredient.unit,
      inventoryItems
    );
    const availableQuantity = matchedInventoryItem?.current_stock ?? 0;
    const remainingQuantity = availableQuantity - requiredQuantity;

    return {
      ingredient_name: ingredient.name,
      ingredient_unit: ingredient.unit,
      required_quantity: requiredQuantity,
      available_quantity: availableQuantity,
      remaining_quantity: remainingQuantity,
      inventory_item_name: matchedInventoryItem?.name ?? null,
      inventory_item_unit: matchedInventoryItem?.unit ?? null,
      is_available: matchedInventoryItem !== null && remainingQuantity >= 0,
    };
  });
}

function findRecipeCatalogMatch(
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

function toStockOutScanLineDrafts(
  ingredients: IngredientDeduction[],
  catalog: RecipeIngredientCatalogItem[]
): StockOutScanLineDraft[] {
  return ingredients.map((ingredient, index) => {
    const matched = findRecipeCatalogMatch(ingredient, catalog);

    return {
      id: `scan-line-${Date.now()}-${index}`,
      detected_name: ingredient.item_name,
      detected_unit: ingredient.unit,
      selected_key: matched?.key ?? "",
      quantity: formatQuantity(Math.max(0, ingredient.quantity)),
    };
  });
}

export function TransactionsScreen() {
  const {
    operations,
    loading,
    error: operationsError,
    refresh,
  } = useTransactionOperations();
  const {
    products,
    loading: productsLoading,
    error: productsError,
  } = useProducts();
  const {
    items: inventoryItems,
    loading: inventoryLoading,
    error: inventoryError,
    refresh: refreshInventory,
  } = useInventory();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [isCreateOptionsOpen, setIsCreateOptionsOpen] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [quantityInput, setQuantityInput] = useState("1");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const aiFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isStockOutAiModalOpen, setIsStockOutAiModalOpen] = useState(false);
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const [isAiDragging, setIsAiDragging] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [isAiSubmitting, setIsAiSubmitting] = useState(false);
  const [aiScanResult, setAiScanResult] = useState<ScanDetectionResult | null>(null);
  const [aiLines, setAiLines] = useState<StockOutScanLineDraft[]>([]);
  const [aiNotesInput, setAiNotesInput] = useState("");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const quantityNumber = Number(quantityInput);
  const normalizedQuantity = Number.isFinite(quantityNumber) ? quantityNumber : 0;

  const filteredOperations = useMemo(() => {
    return operations.filter((operation) => {
      const normalizedSearch = search.toLowerCase();
      const operationDate = operation.created_at.slice(0, 10);

      const matchesSearch =
        (operation.product_name ?? "").toLowerCase().includes(normalizedSearch) ||
        operation.operation_type.toLowerCase().includes(normalizedSearch) ||
        (operation.notes ?? "").toLowerCase().includes(normalizedSearch);

      const matchesType =
        operationFilter === "all" || operation.operation_type === operationFilter;
      const matchesFrom = !dateFrom || operationDate >= dateFrom;
      const matchesTo = !dateTo || operationDate <= dateTo;

      return matchesSearch && matchesType && matchesFrom && matchesTo;
    });
  }, [dateFrom, dateTo, operationFilter, operations, search]);

  const totalPages = Math.max(1, Math.ceil(filteredOperations.length / PAGE_SIZE));
  const paginatedOperations = filteredOperations.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const selectedOperation = useMemo(
    () => operations.find((operation) => operation.id === selectedId) ?? null,
    [operations, selectedId]
  );

  const productCategories = useMemo(() => {
    const uniqueCategories = new Set<string>();

    for (const product of products) {
      if (product.category.trim()) {
        uniqueCategories.add(product.category.trim());
      }
    }

    return [
      "all",
      ...[...uniqueCategories].sort((left, right) => left.localeCompare(right)),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (!product.is_active) {
        return false;
      }

      const matchesSearch = product.name
        .toLowerCase()
        .includes(productSearch.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, productSearch, products]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const saleRequirements = useMemo(() => {
    if (!selectedProduct) {
      return [];
    }

    return buildSaleRequirements(selectedProduct, normalizedQuantity, inventoryItems);
  }, [inventoryItems, normalizedQuantity, selectedProduct]);

  const insufficientRequirements = useMemo(
    () => saleRequirements.filter((requirement) => !requirement.is_available),
    [saleRequirements]
  );

  const hasRecipeConfigured =
    selectedProduct !== null && selectedProduct.ingredients.length > 0;

  const canConfirmSale =
    selectedProduct !== null &&
    hasRecipeConfigured &&
    normalizedQuantity > 0 &&
    insufficientRequirements.length === 0 &&
    !isSubmitting;

  const recipeIngredientCatalog = useMemo(
    () => buildRecipeIngredientCatalog(products),
    [products]
  );

  const recipeCatalogByKey = useMemo(() => {
    return new Map(
      recipeIngredientCatalog.map((ingredient) => [ingredient.key, ingredient] as const)
    );
  }, [recipeIngredientCatalog]);

  useEffect(() => {
    return () => {
      if (aiPreviewUrl) {
        URL.revokeObjectURL(aiPreviewUrl);
      }
    };
  }, [aiPreviewUrl]);

  const aiAggregatedRequirements = useMemo(() => {
    const requirementMap = new Map<string, StockOutRequirement>();

    for (const line of aiLines) {
      if (!line.selected_key) {
        continue;
      }

      const selectedIngredient = recipeCatalogByKey.get(line.selected_key);

      if (!selectedIngredient) {
        continue;
      }

      const quantity = Number(line.quantity);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }

      const existingRequirement = requirementMap.get(selectedIngredient.key);

      if (existingRequirement) {
        existingRequirement.required_quantity = Number(
          (existingRequirement.required_quantity + quantity).toFixed(3)
        );
        existingRequirement.remaining_quantity = Number(
          (
            existingRequirement.available_quantity -
            existingRequirement.required_quantity
          ).toFixed(3)
        );
        existingRequirement.is_available =
          existingRequirement.inventory_item_name !== null &&
          existingRequirement.remaining_quantity >= 0;

        continue;
      }

      const matchedInventoryItem = findInventoryMatch(
        selectedIngredient.name,
        selectedIngredient.unit,
        inventoryItems
      );
      const availableQuantity = matchedInventoryItem?.current_stock ?? 0;
      const remainingQuantity = availableQuantity - quantity;

      requirementMap.set(selectedIngredient.key, {
        key: selectedIngredient.key,
        ingredient_name: selectedIngredient.name,
        ingredient_unit: selectedIngredient.unit,
        required_quantity: Number(quantity.toFixed(3)),
        available_quantity: availableQuantity,
        remaining_quantity: Number(remainingQuantity.toFixed(3)),
        inventory_item_name: matchedInventoryItem?.name ?? null,
        inventory_item_unit: matchedInventoryItem?.unit ?? null,
        is_available: matchedInventoryItem !== null && remainingQuantity >= 0,
      });
    }

    return [...requirementMap.values()].sort((left, right) =>
      left.ingredient_name.localeCompare(right.ingredient_name)
    );
  }, [aiLines, inventoryItems, recipeCatalogByKey]);

  const insufficientAiRequirements = useMemo(
    () => aiAggregatedRequirements.filter((requirement) => !requirement.is_available),
    [aiAggregatedRequirements]
  );

  const canConfirmAiStockOut =
    aiScanResult !== null &&
    aiLines.length > 0 &&
    aiAggregatedRequirements.length > 0 &&
    insufficientAiRequirements.length === 0 &&
    !isAiScanning &&
    !isAiSubmitting;

  const resetAiForm = () => {
    setAiImage(null);
    setAiScanResult(null);
    setAiLines([]);
    setAiNotesInput("");
    setIsAiDragging(false);
    setAiPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }

      return null;
    });
  };

  const openCreateOptionsModal = () => {
    setActionError(null);
    setIsCreateOptionsOpen(true);
  };

  const closeCreateOptionsModal = () => {
    setIsCreateOptionsOpen(false);
  };

  const openManualCreateModal = () => {
    setIsCreateOptionsOpen(false);
    setIsCreateModalOpen(true);
    setSelectedProductId(null);
    setProductSearch("");
    setCategoryFilter("all");
    setQuantityInput("1");
    setUnitPriceInput("");
    setNotesInput("");
    setActionError(null);
  };

  const openAiStockOutModal = () => {
    setIsCreateOptionsOpen(false);
    setIsStockOutAiModalOpen(true);
    setActionError(null);
    resetAiForm();
  };

  const closeManualCreateModal = () => {
    if (isSubmitting) {
      return;
    }

    setIsCreateModalOpen(false);
  };

  const closeAiStockOutModal = () => {
    if (isAiScanning || isAiSubmitting) {
      return;
    }

    setIsStockOutAiModalOpen(false);
    resetAiForm();
  };

  const setAiImageFile = (imageFile: File) => {
    if (!isSupportedImageFile(imageFile)) {
      setActionError(
        "Please upload a valid image file (jpg, png, gif, webp, heic, heif)."
      );
      return;
    }

    setActionError(null);
    setAiScanResult(null);
    setAiLines([]);
    setAiImage(imageFile);
    setAiPreviewUrl((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview);
      }

      return URL.createObjectURL(imageFile);
    });
  };

  const handleAiDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsAiDragging(false);

    const droppedFile = event.dataTransfer.files?.[0];

    if (droppedFile) {
      setAiImageFile(droppedFile);
    }
  };

  const handleAiScan = async () => {
    if (!aiImage) {
      setActionError("Choose or drop an image before scanning.");
      return;
    }

    if (recipeIngredientCatalog.length === 0) {
      setActionError(
        "No recipe ingredients available. Configure recipe ingredients first."
      );
      return;
    }

    setActionSuccess(null);
    setActionError(null);
    setIsAiScanning(true);

    try {
      const detectedResult = await scanImageForDeduction(aiImage);
      setAiScanResult(detectedResult);
      setAiLines(
        toStockOutScanLineDrafts(
          detectedResult.ingredients_to_deduct,
          recipeIngredientCatalog
        )
      );
      setAiNotesInput(`Stock-out AI confirmation for ${detectedResult.item_name}`);
    } catch (scanError) {
      setActionError(
        scanError instanceof Error
          ? scanError.message
          : "AI scan failed. Please try again."
      );
    } finally {
      setIsAiScanning(false);
    }
  };

  const updateAiLine = (
    lineId: string,
    field: "selected_key" | "quantity",
    value: string
  ) => {
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

  const addAiLine = () => {
    setAiLines((previousLines) => [
      ...previousLines,
      {
        id: `scan-line-${Date.now()}-${previousLines.length}`,
        detected_name: "Manual line",
        detected_unit: "",
        selected_key: recipeIngredientCatalog[0]?.key ?? "",
        quantity: "1",
      },
    ]);
  };

  const removeAiLine = (lineId: string) => {
    setAiLines((previousLines) => previousLines.filter((line) => line.id !== lineId));
  };

  const handleConfirmAiStockOut = async () => {
    if (!aiScanResult) {
      setActionError("No AI stock-out scan result found.");
      return;
    }

    if (aiLines.length === 0) {
      setActionError("No AI ingredient lines available. Add or scan lines first.");
      return;
    }

    const ingredientMap = new Map<string, IngredientDeduction>();

    try {
      for (const line of aiLines) {
        if (!line.selected_key) {
          throw new Error(
            "Match each scanned line to a recipe ingredient before confirming."
          );
        }

        const selectedIngredient = recipeCatalogByKey.get(line.selected_key);

        if (!selectedIngredient) {
          throw new Error("One or more selected ingredients are invalid.");
        }

        const quantity = parsePositiveNumber(line.quantity, "Line quantity");
        const existing = ingredientMap.get(selectedIngredient.key);

        if (existing) {
          existing.quantity = Number((existing.quantity + quantity).toFixed(3));
          continue;
        }

        ingredientMap.set(selectedIngredient.key, {
          item_name: selectedIngredient.name,
          category: selectedIngredient.category,
          unit: selectedIngredient.unit,
          quantity,
        });
      }

      if (ingredientMap.size === 0) {
        throw new Error("At least one valid ingredient line is required.");
      }

      if (insufficientAiRequirements.length > 0) {
        throw new Error(
          "Cannot confirm stock out. One or more ingredient stocks are insufficient."
        );
      }
    } catch (validationError) {
      setActionError(
        validationError instanceof Error
          ? validationError.message
          : "Please review AI stock-out lines before confirming."
      );
      return;
    }

    const detectionPayload: ScanDetectionResult = {
      ...aiScanResult,
      ingredients_to_deduct: [...ingredientMap.values()],
    };

    setActionSuccess(null);
    setActionError(null);
    setIsAiSubmitting(true);

    try {
      const response = await confirmScanDeduction({
        detection: detectionPayload,
        imageFile: aiImage,
        transactionType: "stock_out",
        notes: aiNotesInput,
      });

      await Promise.all([refresh(), refreshInventory()]);
      setPage(1);
      setActionSuccess(
        `AI stock-out confirmed. ${response.deductionsApplied} ingredient transaction(s) logged.`
      );
      setIsStockOutAiModalOpen(false);
      resetAiForm();
    } catch (confirmError) {
      setActionError(
        confirmError instanceof Error
          ? confirmError.message
          : "Failed to confirm AI stock-out transaction."
      );
    } finally {
      setIsAiSubmitting(false);
    }
  };

  const handleCreateSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionSuccess(null);
    setActionError(null);

    if (!selectedProduct) {
      setActionError("Select a product before confirming the transaction.");
      return;
    }

    if (!hasRecipeConfigured) {
      setActionError("Selected product has no recipe ingredients configured.");
      return;
    }

    if (!(normalizedQuantity > 0)) {
      setActionError("Quantity must be greater than zero.");
      return;
    }

    if (insufficientRequirements.length > 0) {
      setActionError(
        "Cannot confirm sale. One or more required ingredients are missing or insufficient."
      );
      return;
    }

    const unitPriceValue = unitPriceInput.trim();
    const parsedUnitPrice =
      unitPriceValue.length === 0 ? null : Number(unitPriceValue);

    if (
      parsedUnitPrice !== null &&
      (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0)
    ) {
      setActionError("Unit price must be empty or a non-negative number.");
      return;
    }

    setIsSubmitting(true);

    try {
      const createdOperationId = await createSaleTransaction({
        product_id: selectedProduct.id,
        quantity: normalizedQuantity,
        unit_price: parsedUnitPrice,
        notes: notesInput,
      });

      await Promise.all([refresh(), refreshInventory()]);
      setSelectedId(createdOperationId);
      setPage(1);
      setActionSuccess(
        `Sale recorded for ${selectedProduct.name} x${formatQuantity(normalizedQuantity)}.`
      );
      setIsCreateModalOpen(false);
    } catch (createError) {
      setActionError(
        createError instanceof Error
          ? createError.message
          : "Failed to record sale transaction."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const combinedError = operationsError ?? productsError ?? inventoryError ?? actionError;

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 p-2 animate-in fade-in duration-500">
      {isCreateOptionsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Create Stock Out Transaction</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Choose manual sale entry or AI image scan with human review.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateOptionsModal}
                className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-700"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={openManualCreateModal}
                className="w-full text-left p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <p className="font-bold text-gray-800">Manual Sale Entry</p>
                <p className="text-xs text-gray-600 mt-1">
                  Pick product, quantity, and optional price. Uses recipe stock checker.
                </p>
              </button>

              <button
                type="button"
                onClick={openAiStockOutModal}
                className="w-full text-left p-4 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <p className="font-bold text-gray-800">AI Scan Stock Out</p>
                <p className="text-xs text-gray-600 mt-1">
                  Scan product image, edit AI findings, then confirm deduction.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-6xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-800">Record Manual Sale Transaction</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Choose product, set quantity and optional price, then confirm with stock checks.
                </p>
              </div>
              <button
                onClick={closeManualCreateModal}
                className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-700"
                disabled={isSubmitting}
              >
                <XCircle size={18} />
              </button>
            </div>

            <form
              onSubmit={handleCreateSale}
              className="flex-1 overflow-auto p-5 grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider">
                    Choose Product
                  </h4>
                  <span className="text-xs text-gray-400 font-bold">
                    {filteredProducts.length} found
                  </span>
                </div>

                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
                      size={16}
                    />
                    <input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="Search product"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#3E2723]"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
                  >
                    {productCategories.map((category) => (
                      <option key={category} value={category}>
                        {category === "all" ? "All Categories" : category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-gray-100 overflow-auto max-h-[360px]">
                  {productsLoading ? (
                    <div className="p-6 text-sm text-gray-500">Loading products...</div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500">No products matched your search.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredProducts.map((product) => (
                        <button
                          type="button"
                          key={product.id}
                          onClick={() => setSelectedProductId(product.id)}
                          className={`w-full text-left p-4 transition-colors ${
                            selectedProductId === product.id
                              ? "bg-[#FFF5F0]"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-gray-800">{product.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              {product.category}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {product.ingredients.length} ingredient(s) in recipe
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider">
                  Transaction Details
                </h4>

                {!selectedProduct ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                    Pick a product from the list to configure this transaction.
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/40">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                        Product
                      </p>
                      <p className="text-lg font-black text-gray-800 mt-1">{selectedProduct.name}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={quantityInput}
                          onChange={(event) => setQuantityInput(event.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block mb-1">
                          Unit Price (optional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={unitPriceInput}
                          onChange={(event) => setUnitPriceInput(event.target.value)}
                          placeholder="Example: 120"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block mb-1">
                        Notes (optional)
                      </label>
                      <textarea
                        value={notesInput}
                        onChange={(event) => setNotesInput(event.target.value)}
                        rows={2}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none resize-none"
                        placeholder="Order reference, table number, or cashier notes"
                      />
                    </div>

                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">
                          Ingredient Availability Checker
                        </p>
                        {inventoryLoading ? (
                          <span className="text-[11px] text-gray-400">Checking inventory...</span>
                        ) : (
                          <span className="text-[11px] text-gray-400">
                            {saleRequirements.length} ingredient(s)
                          </span>
                        )}
                      </div>

                      {!hasRecipeConfigured ? (
                        <div className="p-4 text-sm text-red-600">
                          This product has no recipe ingredients configured, so stock cannot be validated.
                        </div>
                      ) : (
                        <table className="w-full text-left">
                          <thead className="text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
                            <tr>
                              <th className="px-3 py-2">Ingredient</th>
                              <th className="px-3 py-2">Required</th>
                              <th className="px-3 py-2">Available</th>
                              <th className="px-3 py-2">After</th>
                              <th className="px-3 py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {saleRequirements.map((requirement) => (
                              <tr key={`${requirement.ingredient_name}-${requirement.ingredient_unit}`}>
                                <td className="px-3 py-3 text-sm font-semibold text-gray-800">
                                  {requirement.ingredient_name}
                                  <span className="ml-2 text-xs text-gray-400 uppercase">
                                    {requirement.inventory_item_unit ?? requirement.ingredient_unit}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-700">
                                  {formatQuantity(requirement.required_quantity)}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-700">
                                  {formatQuantity(requirement.available_quantity)}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-700">
                                  {formatQuantity(requirement.remaining_quantity)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {requirement.is_available ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                      <CheckCircle2 size={14} /> OK
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                                      <TriangleAlert size={14} /> Insufficient
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {insufficientRequirements.length > 0 && (
                      <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {insufficientRequirements.length} ingredient requirement(s) are insufficient. Update stock before confirming.
                      </div>
                    )}

                    <div className="rounded-xl border border-gray-100 px-4 py-3 bg-gray-50/40 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">Estimated total</span>
                      <span className="text-lg font-black text-gray-800">
                        {unitPriceInput.trim()
                          ? formatCurrency(Number(unitPriceInput) * normalizedQuantity)
                          : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={closeManualCreateModal}
                        className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2.5 rounded-xl bg-[#3E2723] text-white font-semibold disabled:opacity-60"
                        disabled={!canConfirmSale}
                      >
                        {isSubmitting ? (
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle className="animate-spin" size={14} /> Confirming...
                          </span>
                        ) : (
                          "Confirm Sale"
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {isStockOutAiModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-6xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-800">AI Scan Stock Out</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Human in the loop: scan image, edit findings, then confirm deduction.
                </p>
              </div>
              <button
                onClick={closeAiStockOutModal}
                className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-700"
                disabled={isAiScanning || isAiSubmitting}
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {recipeIngredientCatalog.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  No recipe ingredients are configured. Add recipe ingredients first.
                </div>
              ) : (
                <>
                  <div
                    onDrop={handleAiDrop}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsAiDragging(true);
                    }}
                    onDragLeave={() => setIsAiDragging(false)}
                    className={`flex min-h-48 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                      isAiDragging ? "border-amber-600 bg-amber-50" : "border-gray-200"
                    }`}
                  >
                    <input
                      ref={aiFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif"
                      className="hidden"
                      onChange={(event) => {
                        const nextFile = event.currentTarget.files?.[0];

                        if (nextFile) {
                          setAiImageFile(nextFile);
                        }

                        event.currentTarget.value = "";
                      }}
                    />

                    {aiPreviewUrl ? (
                      <img
                        src={aiPreviewUrl}
                        alt="AI stock-out preview"
                        className="max-h-56 w-full max-w-md rounded-lg border border-gray-200 object-contain"
                      />
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-gray-400" />
                        <div className="space-y-1">
                          <p className="font-medium text-gray-700">Drop image here</p>
                          <p className="text-sm text-gray-500">
                            Or choose a file to scan stock-out ingredients.
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => aiFileInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white"
                      disabled={isAiScanning || isAiSubmitting}
                    >
                      Choose Image
                    </button>
                    <button
                      type="button"
                      onClick={handleAiScan}
                      className="px-3 py-2 rounded-xl bg-[#3E2723] text-white text-sm font-semibold disabled:opacity-70"
                      disabled={!aiImage || isAiScanning || isAiSubmitting}
                    >
                      {isAiScanning ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="animate-spin" size={14} /> Scanning...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Sparkles size={14} /> Scan With AI
                        </span>
                      )}
                    </button>
                    {aiImage ? (
                      <span className="text-xs text-gray-500">{aiImage.name}</span>
                    ) : null}
                  </div>

                  {aiScanResult ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            Detected Product
                          </p>
                          <p className="text-sm font-semibold text-gray-800 mt-1">
                            {aiScanResult.item_name}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            Confidence
                          </p>
                          <p className="text-sm font-semibold text-gray-800 mt-1 capitalize">
                            {aiScanResult.confidence}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            Estimated Qty
                          </p>
                          <p className="text-sm font-semibold text-gray-800 mt-1">
                            {formatQuantity(aiScanResult.quantity_estimate)} {aiScanResult.unit}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">
                            Review And Edit Findings
                          </p>
                          <button
                            type="button"
                            onClick={addAiLine}
                            className="text-xs font-bold text-[#3E2723]"
                            disabled={isAiSubmitting}
                          >
                            + Add Line
                          </button>
                        </div>

                        {aiLines.length === 0 ? (
                          <div className="p-4 text-sm text-amber-700 bg-amber-50 border-t border-amber-100">
                            AI returned no lines. Add at least one line manually before confirming.
                          </div>
                        ) : (
                          <div className="overflow-auto">
                            <table className="w-full text-left">
                              <thead className="text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
                                <tr>
                                  <th className="px-3 py-2">Detected</th>
                                  <th className="px-3 py-2">Match To Recipe Ingredient</th>
                                  <th className="px-3 py-2">Quantity</th>
                                  <th className="px-3 py-2">Unit</th>
                                  <th className="px-3 py-2 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {aiLines.map((line) => {
                                  const selectedIngredient =
                                    recipeCatalogByKey.get(line.selected_key) ?? null;

                                  return (
                                    <tr key={line.id}>
                                      <td className="px-3 py-3 text-sm text-gray-700 font-semibold">
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
                                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-xs outline-none"
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
                                          onChange={(event) =>
                                            updateAiLine(
                                              line.id,
                                              "quantity",
                                              event.target.value
                                            )
                                          }
                                          className="w-28 px-2 py-2 border border-gray-200 rounded-lg text-xs outline-none"
                                        />
                                      </td>
                                      <td className="px-3 py-3 text-xs text-gray-600 font-semibold uppercase">
                                        {selectedIngredient?.unit || line.detected_unit || "-"}
                                      </td>
                                      <td className="px-3 py-3 text-right">
                                        <button
                                          type="button"
                                          onClick={() => removeAiLine(line.id)}
                                          className="text-xs font-bold text-red-500 disabled:opacity-40"
                                          disabled={aiLines.length <= 1 || isAiSubmitting}
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
                        )}
                      </div>

                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">
                            Ingredient Availability Checker
                          </p>
                          <span className="text-[11px] text-gray-400">
                            {aiAggregatedRequirements.length} ingredient(s)
                          </span>
                        </div>

                        {aiAggregatedRequirements.length === 0 ? (
                          <div className="p-4 text-sm text-gray-500">
                            Select ingredients and enter quantity to validate stock.
                          </div>
                        ) : (
                          <table className="w-full text-left">
                            <thead className="text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
                              <tr>
                                <th className="px-3 py-2">Ingredient</th>
                                <th className="px-3 py-2">Required</th>
                                <th className="px-3 py-2">Available</th>
                                <th className="px-3 py-2">After</th>
                                <th className="px-3 py-2 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {aiAggregatedRequirements.map((requirement) => (
                                <tr key={requirement.key}>
                                  <td className="px-3 py-3 text-sm font-semibold text-gray-800">
                                    {requirement.ingredient_name}
                                    <span className="ml-2 text-xs text-gray-400 uppercase">
                                      {requirement.inventory_item_unit ?? requirement.ingredient_unit}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700">
                                    {formatQuantity(requirement.required_quantity)}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700">
                                    {formatQuantity(requirement.available_quantity)}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700">
                                    {formatQuantity(requirement.remaining_quantity)}
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    {requirement.is_available ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                        <CheckCircle2 size={14} /> OK
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600">
                                        <TriangleAlert size={14} /> Insufficient
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {insufficientAiRequirements.length > 0 && (
                        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {insufficientAiRequirements.length} ingredient requirement(s) are insufficient.
                        </div>
                      )}

                      <div>
                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block mb-1">
                          Notes (optional)
                        </label>
                        <textarea
                          value={aiNotesInput}
                          onChange={(event) => setAiNotesInput(event.target.value)}
                          rows={2}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none resize-none"
                          placeholder="Order reference or operator notes"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeAiStockOutModal}
                          className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-semibold"
                          disabled={isAiSubmitting}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmAiStockOut}
                          className="px-4 py-2.5 rounded-xl bg-[#3E2723] text-white font-semibold disabled:opacity-70"
                          disabled={!canConfirmAiStockOut}
                        >
                          {isAiSubmitting ? (
                            <span className="inline-flex items-center gap-2">
                              <LoaderCircle className="animate-spin" size={14} /> Confirming...
                            </span>
                          ) : (
                            "Confirm Stock Out"
                          )}
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {combinedError && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {combinedError}
        </div>
      )}

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {actionSuccess}
        </div>
      )}

      <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 h-[calc(100vh-84px)]">
        <div className="w-full lg:flex-[2] bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden min-h-0">
          <div className="p-5 border-b border-gray-50 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-800">Transactions Log</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {filteredOperations.length} records
                </span>
                <button
                  onClick={openCreateOptionsModal}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#3E2723] text-white text-xs font-bold"
                >
                  <PlusCircle size={14} /> Record Stock Out
                </button>
              </div>
            </div>

            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
                size={16}
              />
              <input
                type="text"
                placeholder="Search by product, type, or notes"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-1 focus:ring-[#3E2723] outline-none"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Filter size={14} className="text-gray-400" />

              <select
                value={operationFilter}
                onChange={(event) => {
                  setOperationFilter(event.target.value as OperationFilter);
                  setPage(1);
                }}
                className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none"
              >
                <option value="all">All Types</option>
                <option value="sale">Sale</option>
                <option value="scan">Scan</option>
                <option value="manual_stock_in">Manual Stock In</option>
                <option value="manual_stock_out">Manual Stock Out</option>
                <option value="adjustment">Adjustment</option>
              </select>

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none"
                />
              </div>

              {(dateFrom || dateTo || operationFilter !== "all") && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setOperationFilter("all");
                    setPage(1);
                  }}
                  className="text-[10px] font-bold text-[#3E2723] uppercase tracking-widest hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="p-6 text-sm text-gray-500">Loading transactions...</div>
            ) : (
              <div className="p-5">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-300 uppercase tracking-widest border-b border-gray-100">
                      <th className="pb-3 px-2">Timestamp</th>
                      <th className="pb-3 px-2">Type</th>
                      <th className="pb-3 px-2">Product</th>
                      <th className="pb-3 px-2 text-right">Qty</th>
                      <th className="pb-3 px-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedOperations.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-12 text-center text-sm text-gray-400 font-semibold"
                        >
                          No transactions found.
                        </td>
                      </tr>
                    )}

                    {paginatedOperations.map((operation) => (
                      <tr
                        key={operation.id}
                        onClick={() => setSelectedId(operation.id)}
                        className={`cursor-pointer transition-all ${
                          selectedId === operation.id ? "bg-[#FFF5F0]" : "hover:bg-gray-50"
                        }`}
                      >
                        <td className="py-3 px-2">
                          <p className="text-sm font-bold text-gray-800">
                            {formatDate(operation.created_at)}
                          </p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            {formatTime(operation.created_at)}
                          </p>
                        </td>
                        <td className="py-3 px-2">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${getOperationBadgeClass(
                              operation.operation_type
                            )}`}
                          >
                            {getOperationLabel(operation.operation_type)}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-sm font-semibold text-gray-700">
                          {operation.product_name ?? "Unassigned"}
                        </td>
                        <td className="py-3 px-2 text-right text-sm font-semibold text-gray-700">
                          {formatQuantity(operation.quantity)}
                        </td>
                        <td className="py-3 px-2 text-right text-sm font-bold text-gray-700">
                          {formatCurrency(operation.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <span className="text-[11px] text-gray-400 font-bold">
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((previousPage) => previousPage - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((previousPage) => previousPage + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden min-h-[300px] lg:min-h-0">
          {!selectedOperation ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <CalendarDays size={28} className="text-gray-300" />
              </div>
              <h3 className="text-xl font-black text-gray-800">Select a Transaction</h3>
              <p className="text-sm text-gray-400 mt-2 max-w-xs">
                Open any transaction to review details and impacted ingredients.
              </p>
            </div>
          ) : (
            <TransactionDetailPanel operation={selectedOperation} />
          )}
        </div>
      </div>
    </div>
  );
}

interface TransactionDetailPanelProps {
  operation: TransactionOperationWithLines;
}

function TransactionDetailPanel({ operation }: TransactionDetailPanelProps) {
  return (
    <>
      <div className="p-5 sm:p-8 border-b border-gray-50 bg-gray-50/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-[#3E2723] text-white">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 tracking-tight">
              {operation.product_name ?? "Unassigned Transaction"}
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
              {getOperationLabel(operation.operation_type)} • {operation.lines.length} ingredient line(s)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</p>
            <p className="text-sm font-bold text-gray-800 mt-1">{formatDate(operation.created_at)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Time</p>
            <p className="text-sm font-bold text-gray-800 mt-1">{formatTime(operation.created_at)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Quantity</p>
            <p className="text-sm font-bold text-gray-800 mt-1">{formatQuantity(operation.quantity)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount</p>
            <p className="text-sm font-bold text-gray-800 mt-1">{formatCurrency(operation.total_amount)}</p>
          </div>
        </div>

        {operation.notes ? (
          <div className="mt-4 rounded-xl border border-gray-100 bg-white px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notes</p>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{operation.notes}</p>
          </div>
        ) : null}
      </div>

      <div className="p-5 sm:p-8 flex-1 overflow-auto">
        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-4">
          Inventory Movements
        </p>

        {operation.lines.length === 0 ? (
          <p className="text-sm text-gray-500">No ingredient-level movements logged for this transaction.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold text-gray-300 uppercase tracking-widest border-b border-gray-100">
                <th className="pb-3 px-2">Ingredient</th>
                <th className="pb-3 px-2">Type</th>
                <th className="pb-3 px-2 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {operation.lines.map((line) => {
                const isStockIn = line.transaction_type === "stock_in";

                return (
                  <tr key={line.id}>
                    <td className="py-4 px-2 font-bold text-gray-700 text-sm">
                      {line.item_name}
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-gray-400">
                        {line.item_unit}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                      {line.transaction_type.replace("_", " ")}
                    </td>
                    <td className="py-4 px-2 text-right">
                      <span
                        className={`font-mono font-black text-lg ${
                          isStockIn ? "text-emerald-600" : "text-[#3E2723]"
                        }`}
                      >
                        {isStockIn ? "+" : "-"}
                        {formatQuantity(line.quantity)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
