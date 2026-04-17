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
  scanImageForStockOutProductCatalog,
  type StockOutProductScanResult,
} from "@/lib/inventoryService";
import { normalizeImageForAiScan } from "@/lib/imageUpload";
import { createSaleTransaction } from "@/lib/transactionService";
import type {
  InventoryItemRow,
  OperationType,
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

  return "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground";
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
  const aiImagePreparingRef = useRef(false);
  const [isStockOutAiModalOpen, setIsStockOutAiModalOpen] = useState(false);
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const [isAiDragging, setIsAiDragging] = useState(false);
  const [isAiImagePreparing, setIsAiImagePreparing] = useState(false);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [isAiSubmitting, setIsAiSubmitting] = useState(false);
  const [aiScanResult, setAiScanResult] = useState<StockOutProductScanResult | null>(null);
  const [aiSelectedProductId, setAiSelectedProductId] = useState<string | null>(null);
  const [aiQuantityInput, setAiQuantityInput] = useState("1");
  const [aiUnitPriceInput, setAiUnitPriceInput] = useState("");
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

  const aiProductCatalog = useMemo(
    () =>
      products
        .filter((product) => product.is_active)
        .map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category,
          description: product.description,
        })),
    [products]
  );

  const aiSelectedProduct = useMemo(
    () => products.find((product) => product.id === aiSelectedProductId) ?? null,
    [aiSelectedProductId, products]
  );

  const aiQuantityNumber = Number(aiQuantityInput);
  const aiNormalizedQuantity = Number.isFinite(aiQuantityNumber) ? aiQuantityNumber : 0;

  useEffect(() => {
    return () => {
      if (aiPreviewUrl) {
        URL.revokeObjectURL(aiPreviewUrl);
      }
    };
  }, [aiPreviewUrl]);

  const aiSaleRequirements = useMemo(() => {
    if (!aiSelectedProduct) {
      return [];
    }

    return buildSaleRequirements(aiSelectedProduct, aiNormalizedQuantity, inventoryItems);
  }, [aiNormalizedQuantity, aiSelectedProduct, inventoryItems]);

  const aiInsufficientRequirements = useMemo(
    () => aiSaleRequirements.filter((requirement) => !requirement.is_available),
    [aiSaleRequirements]
  );

  const aiHasRecipeConfigured =
    aiSelectedProduct !== null && aiSelectedProduct.ingredients.length > 0;

  const canConfirmAiStockOut =
    aiScanResult !== null &&
    aiSelectedProduct !== null &&
    aiHasRecipeConfigured &&
    aiNormalizedQuantity > 0 &&
    aiInsufficientRequirements.length === 0 &&
    !isAiScanning &&
    !isAiSubmitting;

  const resetAiForm = () => {
    aiImagePreparingRef.current = false;
    setIsAiImagePreparing(false);
    setAiImage(null);
    setAiScanResult(null);
    setAiSelectedProductId(null);
    setAiQuantityInput("1");
    setAiUnitPriceInput("");
    setAiNotesInput("");
    setIsAiDragging(false);
    setAiPreviewUrl((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview);
      }

      return null;
    });
  };

  const openCreateOptionsModal = () => {
    setActionError(null);
    setIsCreateOptionsOpen(true);
  };

  const closeCreateOptionsModal = () => {
    setActionError(null);
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

    setActionError(null);
    setIsCreateModalOpen(false);
  };

  const closeAiStockOutModal = () => {
    if (isAiImagePreparing || isAiScanning || isAiSubmitting) {
      return;
    }

    setActionError(null);
    setIsStockOutAiModalOpen(false);
    resetAiForm();
  };

  const setAiImageFile = async (imageFile: File) => {
    if (aiImagePreparingRef.current || isAiScanning || isAiSubmitting) {
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
    setAiImage(null);
    setAiScanResult(null);
    setAiSelectedProductId(null);
    setAiQuantityInput("1");
    setAiUnitPriceInput("");
    setAiPreviewUrl((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview);
      }

      return null;
    });

    try {
      const normalizedImageFile = await normalizeImageForAiScan(imageFile);

      setActionError(null);
      setAiImage(normalizedImageFile);
      setAiPreviewUrl((currentPreview) => {
        if (currentPreview) {
          URL.revokeObjectURL(currentPreview);
        }

        return URL.createObjectURL(normalizedImageFile);
      });
    } catch (imageError) {
      setAiImage(null);
      setAiScanResult(null);
      setAiSelectedProductId(null);
      setAiQuantityInput("1");
      setAiUnitPriceInput("");
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

    if (isAiImagePreparing || isAiScanning || isAiSubmitting) {
      return;
    }

    setIsAiDragging(false);

    const droppedFile = event.dataTransfer.files?.[0];

    if (droppedFile) {
      void setAiImageFile(droppedFile);
    }
  };

  const handleAiScan = async () => {
    if (isAiImagePreparing || isAiScanning) {
      return;
    }

    if (!aiImage) {
      setActionError("Choose or drop an image before scanning.");
      return;
    }

    if (aiProductCatalog.length === 0) {
      setActionError("No active products available. Configure products first.");
      return;
    }

    setActionSuccess(null);
    setActionError(null);
    setIsAiScanning(true);

    try {
      const detectedResult = await scanImageForStockOutProductCatalog(
        aiImage,
        aiProductCatalog
      );
      setAiScanResult(detectedResult);
      setAiSelectedProductId(detectedResult.product_id);
      setAiQuantityInput(formatQuantity(Math.max(0.05, detectedResult.quantity_estimate)));
      setAiNotesInput(`AI-assisted stock-out for ${detectedResult.product_name}`);
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

  const handleConfirmAiStockOut = async () => {
    if (!aiScanResult) {
      setActionError("No AI stock-out scan result found.");
      return;
    }

    if (!aiSelectedProduct) {
      setActionError("Select a product before confirming AI stock out.");
      return;
    }

    if (!aiHasRecipeConfigured) {
      setActionError("Selected product has no recipe ingredients configured.");
      return;
    }

    if (!(aiNormalizedQuantity > 0)) {
      setActionError("Quantity must be greater than zero.");
      return;
    }

    if (aiInsufficientRequirements.length > 0) {
      setActionError(
        "Cannot confirm AI stock out. One or more required ingredients are insufficient."
      );
      return;
    }

    const aiUnitPriceValue = aiUnitPriceInput.trim();
    const parsedAiUnitPrice =
      aiUnitPriceValue.length === 0 ? null : Number(aiUnitPriceValue);

    if (
      parsedAiUnitPrice !== null &&
      (!Number.isFinite(parsedAiUnitPrice) || parsedAiUnitPrice < 0)
    ) {
      setActionError("Unit price must be empty or a non-negative number.");
      return;
    }

    setActionSuccess(null);
    setActionError(null);
    setIsAiSubmitting(true);

    try {
      const createdOperationId = await createSaleTransaction({
        product_id: aiSelectedProduct.id,
        quantity: aiNormalizedQuantity,
        unit_price: parsedAiUnitPrice,
        notes: aiNotesInput,
      });

      await Promise.all([refresh(), refreshInventory()]);
      setSelectedId(createdOperationId);
      setPage(1);
      setActionSuccess(
        `AI stock-out confirmed for ${aiSelectedProduct.name} x${formatQuantity(aiNormalizedQuantity)}.`
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

  const hasOpenModal =
    isCreateOptionsOpen || isCreateModalOpen || isStockOutAiModalOpen;
  const combinedError =
    operationsError ??
    productsError ??
    inventoryError ??
    (hasOpenModal ? null : actionError);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 p-2 animate-in fade-in duration-500">
      {isCreateOptionsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-foreground">Create Stock Out Transaction</h3>
                <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                  Choose manual sale entry or AI image scan with human review.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateOptionsModal}
                className="p-1.5 rounded-lg bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:text-foreground"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={openManualCreateModal}
                className="w-full text-left p-4 rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 hover:bg-gray-100 dark:hover:bg-muted transition-colors"
              >
                <p className="font-bold text-gray-800 dark:text-foreground">Manual Sale Entry</p>
                <p className="text-xs text-gray-600 dark:text-muted-foreground mt-1">
                  Pick product, quantity, and optional price. Uses recipe stock checker.
                </p>
              </button>

              <button
                type="button"
                onClick={openAiStockOutModal}
                className="w-full text-left p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
              >
                <p className="font-bold text-gray-800 dark:text-foreground">AI Scan Stock Out</p>
                <p className="text-xs text-gray-600 dark:text-muted-foreground mt-1">
                  Scan product image, review AI product match, then confirm sale.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl w-full max-w-6xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-800 dark:text-foreground">Record Manual Sale Transaction</h3>
                <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                  Choose product, set quantity and optional price, then confirm with stock checks.
                </p>
              </div>
              <button
                onClick={closeManualCreateModal}
                className="p-2 rounded-lg bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:text-foreground"
                disabled={isSubmitting}
              >
                <XCircle size={18} />
              </button>
            </div>

            <form
              onSubmit={handleCreateSale}
              className="flex-1 overflow-auto p-5 grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {actionError && (
                <div className="lg:col-span-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-gray-700 dark:text-foreground uppercase tracking-wider">
                    Choose Product
                  </h4>
                  <span className="text-xs text-gray-400 dark:text-muted-foreground font-bold">
                    {filteredProducts.length} found
                  </span>
                </div>

                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-muted-foreground"
                      size={16}
                    />
                    <input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="Search product"
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#3E2723]"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                  >
                    {productCategories.map((category) => (
                      <option key={category} value={category}>
                        {category === "all" ? "All Categories" : category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-gray-100 dark:border-border overflow-auto max-h-[360px]">
                  {productsLoading ? (
                    <div className="p-6 text-sm text-gray-500 dark:text-muted-foreground">Loading products...</div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-6 text-sm text-gray-500 dark:text-muted-foreground">No products matched your search.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredProducts.map((product) => (
                        <button
                          type="button"
                          key={product.id}
                          onClick={() => setSelectedProductId(product.id)}
                          className={`w-full text-left p-4 transition-colors ${
                            selectedProductId === product.id
                              ? "bg-[#FFF5F0] dark:bg-amber-950/30"
                              : "hover:bg-gray-50 dark:hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-gray-800 dark:text-foreground">{product.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted-foreground">
                              {product.category}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-muted-foreground mt-1">
                            {product.ingredients.length} ingredient(s) in recipe
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-black text-gray-700 dark:text-foreground uppercase tracking-wider">
                  Transaction Details
                </h4>

                {!selectedProduct ? (
                  <div className="rounded-xl border border-dashed border-gray-200 dark:border-border p-8 text-center text-sm text-gray-500 dark:text-muted-foreground">
                    Pick a product from the list to configure this transaction.
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-100 dark:border-border p-4 bg-gray-50 dark:bg-muted/50/40">
                      <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
                        Product
                      </p>
                      <p className="text-lg font-black text-gray-800 dark:text-foreground mt-1">{selectedProduct.name}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={quantityInput}
                          onChange={(event) => setQuantityInput(event.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                          Unit Price (optional)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={unitPriceInput}
                          onChange={(event) => setUnitPriceInput(event.target.value)}
                          placeholder="Example: 120"
                          className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                        Notes (optional)
                      </label>
                      <textarea
                        value={notesInput}
                        onChange={(event) => setNotesInput(event.target.value)}
                        rows={2}
                        className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none resize-none"
                        placeholder="Order reference, table number, or cashier notes"
                      />
                    </div>

                    <div className="rounded-xl border border-gray-100 dark:border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-widest">
                          Ingredient Availability Checker
                        </p>
                        {inventoryLoading ? (
                          <span className="text-[11px] text-gray-400 dark:text-muted-foreground">Checking inventory...</span>
                        ) : (
                          <span className="text-[11px] text-gray-400 dark:text-muted-foreground">
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
                          <thead className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-muted-foreground border-b border-gray-100 dark:border-border">
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
                                <td className="px-3 py-3 text-sm font-semibold text-gray-800 dark:text-foreground">
                                  {requirement.ingredient_name}
                                  <span className="ml-2 text-xs text-gray-400 dark:text-muted-foreground uppercase">
                                    {requirement.inventory_item_unit ?? requirement.ingredient_unit}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-700 dark:text-foreground">
                                  {formatQuantity(requirement.required_quantity)}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-700 dark:text-foreground">
                                  {formatQuantity(requirement.available_quantity)}
                                </td>
                                <td className="px-3 py-3 text-sm text-gray-700 dark:text-foreground">
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

                    <div className="rounded-xl border border-gray-100 dark:border-border px-4 py-3 bg-gray-50 dark:bg-muted/50/40 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700 dark:text-foreground">Estimated total</span>
                      <span className="text-lg font-black text-gray-800 dark:text-foreground">
                        {unitPriceInput.trim()
                          ? formatCurrency(Number(unitPriceInput) * normalizedQuantity)
                          : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={closeManualCreateModal}
                        className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground font-semibold"
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
          <div className="bg-white dark:bg-card rounded-2xl w-full max-w-6xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-800 dark:text-foreground">AI Scan Stock Out</h3>
                <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                  Human in the loop: classify product from catalog, review quantity, then confirm sale.
                </p>
              </div>
              <button
                onClick={closeAiStockOutModal}
                className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-700"
                disabled={isAiImagePreparing || isAiScanning || isAiSubmitting}
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {actionError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {actionError}
                </div>
              )}

              {aiProductCatalog.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  No active products are configured. Add products and recipes first.
                </div>
              ) : (
                <>
                  <div
                    onDrop={handleAiDrop}
                    onDragOver={(event) => {
                      event.preventDefault();

                      if (isAiImagePreparing || isAiScanning || isAiSubmitting) {
                        return;
                      }

                      setIsAiDragging(true);
                    }}
                    onDragLeave={() => {
                      if (isAiImagePreparing || isAiScanning || isAiSubmitting) {
                        return;
                      }

                      setIsAiDragging(false);
                    }}
                    className={`flex min-h-48 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                      isAiDragging ? "border-amber-600 bg-amber-50" : "border-gray-200"
                    } ${isAiImagePreparing ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    <input
                      ref={aiFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif"
                      className="hidden"
                      disabled={isAiImagePreparing || isAiScanning || isAiSubmitting}
                      onChange={(event) => {
                        const nextFile = event.currentTarget.files?.[0];

                        if (nextFile) {
                          void setAiImageFile(nextFile);
                        }

                        event.currentTarget.value = "";
                      }}
                    />

                    {aiPreviewUrl ? (
                      <img
                        src={aiPreviewUrl}
                        alt="AI stock-out preview"
                        className="max-h-56 w-full max-w-md rounded-lg border border-gray-200 dark:border-border object-contain"
                      />
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-gray-400 dark:text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="font-medium text-gray-700 dark:text-foreground">Drop image here</p>
                          <p className="text-sm text-gray-500 dark:text-muted-foreground">
                            Or choose an image to classify product and estimate quantity.
                          </p>
                          {isAiImagePreparing ? (
                            <p className="inline-flex items-center gap-2 text-sm text-amber-700 font-semibold">
                              <LoaderCircle className="animate-spin" size={14} />
                              Processing image...
                            </p>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => aiFileInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white"
                      disabled={isAiImagePreparing || isAiScanning || isAiSubmitting}
                    >
                      {isAiImagePreparing ? "Processing..." : "Choose Image"}
                    </button>
                    <button
                      type="button"
                      onClick={handleAiScan}
                      className="px-3 py-2 rounded-xl bg-[#3E2723] text-white text-sm font-semibold disabled:opacity-70"
                      disabled={!aiImage || isAiImagePreparing || isAiScanning || isAiSubmitting}
                    >
                      {isAiImagePreparing ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="animate-spin" size={14} /> Processing image...
                        </span>
                      ) : isAiScanning ? (
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
                      <span className="text-xs text-gray-500 dark:text-muted-foreground">{aiImage.name}</span>
                    ) : null}
                  </div>

                  {aiScanResult ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
                            Detected Product
                          </p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-foreground mt-1">
                            {aiScanResult.product_name}
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
                            Estimated Qty
                          </p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-foreground mt-1">
                            {formatQuantity(aiScanResult.quantity_estimate)} {aiScanResult.unit}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 px-3 py-2">
                          <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
                            Source
                          </p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-foreground mt-1 uppercase">
                            {aiScanResult.source}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-100 dark:border-border p-4 bg-gray-50 dark:bg-muted/50/40 space-y-3">
                        <p className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-widest">
                          Review Product And Quantity
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                            <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                              Product
                            </label>
                            <select
                              value={aiSelectedProductId ?? ""}
                              onChange={(event) =>
                                setAiSelectedProductId(event.target.value || null)
                              }
                              className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                            >
                              <option value="" disabled>
                                Select product
                              </option>
                              {aiProductCatalog.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} ({product.category})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                              Quantity
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={aiQuantityInput}
                              onChange={(event) => setAiQuantityInput(event.target.value)}
                              className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                            Unit Price (optional)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={aiUnitPriceInput}
                            onChange={(event) => setAiUnitPriceInput(event.target.value)}
                            placeholder="Example: 120"
                            className="w-full md:w-60 px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-100 dark:border-border overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 flex items-center justify-between">
                          <p className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-widest">
                            Recipe Availability Checker
                          </p>
                          <span className="text-[11px] text-gray-400 dark:text-muted-foreground">
                            {aiSaleRequirements.length} ingredient(s)
                          </span>
                        </div>

                        {!aiSelectedProduct ? (
                          <div className="p-4 text-sm text-gray-500 dark:text-muted-foreground">
                            Select a product to validate recipe ingredient availability.
                          </div>
                        ) : !aiHasRecipeConfigured ? (
                          <div className="p-4 text-sm text-red-600">
                            Selected product has no recipe ingredients configured.
                          </div>
                        ) : (
                          <table className="w-full text-left">
                            <thead className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-muted-foreground border-b border-gray-100 dark:border-border">
                              <tr>
                                <th className="px-3 py-2">Ingredient</th>
                                <th className="px-3 py-2">Required</th>
                                <th className="px-3 py-2">Available</th>
                                <th className="px-3 py-2">After</th>
                                <th className="px-3 py-2 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {aiSaleRequirements.map((requirement) => (
                                <tr
                                  key={`${requirement.ingredient_name}-${requirement.ingredient_unit}`}
                                >
                                  <td className="px-3 py-3 text-sm font-semibold text-gray-800 dark:text-foreground">
                                    {requirement.ingredient_name}
                                    <span className="ml-2 text-xs text-gray-400 dark:text-muted-foreground uppercase">
                                      {requirement.inventory_item_unit ?? requirement.ingredient_unit}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700 dark:text-foreground">
                                    {formatQuantity(requirement.required_quantity)}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700 dark:text-foreground">
                                    {formatQuantity(requirement.available_quantity)}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-gray-700 dark:text-foreground">
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

                      {aiInsufficientRequirements.length > 0 && (
                        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {aiInsufficientRequirements.length} recipe ingredient requirement(s) are insufficient.
                        </div>
                      )}

                      <div>
                        <label className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest block mb-1">
                          Notes (optional)
                        </label>
                        <textarea
                          value={aiNotesInput}
                          onChange={(event) => setAiNotesInput(event.target.value)}
                          rows={2}
                          className="w-full px-3 py-2.5 border border-gray-200 dark:border-border rounded-xl text-sm outline-none resize-none"
                          placeholder="Order reference or operator notes"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeAiStockOutModal}
                          className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground font-semibold"
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
        <div className="w-full lg:flex-[2] bg-white dark:bg-card rounded-3xl border border-gray-100 dark:border-border shadow-sm flex flex-col overflow-hidden min-h-0">
          <div className="p-5 border-b border-gray-50 dark:border-border/50 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-800 dark:text-foreground">Transactions Log</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">
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
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-muted-foreground"
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
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-sm focus:ring-1 focus:ring-[#3E2723] outline-none"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Filter size={14} className="text-gray-400 dark:text-muted-foreground" />

              <select
                value={operationFilter}
                onChange={(event) => {
                  setOperationFilter(event.target.value as OperationFilter);
                  setPage(1);
                }}
                className="px-3 py-2 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-xs outline-none"
              >
                <option value="all">All Types</option>
                <option value="sale">Sale</option>
                <option value="scan">Scan</option>
                <option value="manual_stock_in">Manual Stock In</option>
                <option value="manual_stock_out">Manual Stock Out</option>
                <option value="adjustment">Adjustment</option>
              </select>

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">
                  From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    setDateFrom(event.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-xs outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">
                  To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    setDateTo(event.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-2 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-xs outline-none"
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
              <div className="p-6 text-sm text-gray-500 dark:text-muted-foreground">Loading transactions...</div>
            ) : (
              <div className="p-5">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-300 dark:text-muted-foreground uppercase tracking-widest border-b border-gray-100 dark:border-border">
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
                          className="py-12 text-center text-sm text-gray-400 dark:text-muted-foreground font-semibold"
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
                          selectedId === operation.id ? "bg-[#FFF5F0] dark:bg-amber-950/30" : "hover:bg-gray-50 dark:hover:bg-muted/50"
                        }`}
                      >
                        <td className="py-3 px-2">
                          <p className="text-sm font-bold text-gray-800 dark:text-foreground">
                            {formatDate(operation.created_at)}
                          </p>
                          <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
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
                        <td className="py-3 px-2 text-sm font-semibold text-gray-700 dark:text-foreground">
                          {operation.product_name ?? "Unassigned"}
                        </td>
                        <td className="py-3 px-2 text-right text-sm font-semibold text-gray-700 dark:text-foreground">
                          {formatQuantity(operation.quantity)}
                        </td>
                        <td className="py-3 px-2 text-right text-sm font-bold text-gray-700 dark:text-foreground">
                          {formatCurrency(operation.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-border">
                    <span className="text-[11px] text-gray-400 dark:text-muted-foreground font-bold">
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((previousPage) => previousPage - 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-muted/50 text-gray-400 dark:text-muted-foreground hover:bg-gray-100 dark:bg-muted disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((previousPage) => previousPage + 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-muted/50 text-gray-400 dark:text-muted-foreground hover:bg-gray-100 dark:bg-muted disabled:opacity-30 transition-colors"
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

        <div className="w-full lg:flex-1 bg-white dark:bg-card rounded-3xl border border-gray-100 dark:border-border shadow-sm flex flex-col overflow-hidden min-h-[300px] lg:min-h-0">
          {!selectedOperation ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-muted flex items-center justify-center mb-4">
                <CalendarDays size={28} className="text-gray-300 dark:text-muted-foreground" />
              </div>
              <h3 className="text-xl font-black text-gray-800 dark:text-foreground">Select a Transaction</h3>
              <p className="text-sm text-gray-400 dark:text-muted-foreground mt-2 max-w-xs">
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
      <div className="p-5 sm:p-8 border-b border-gray-50 dark:border-border/50 bg-gray-50 dark:bg-muted/50/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-[#3E2723] text-white">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 dark:text-foreground tracking-tight">
              {operation.product_name ?? "Unassigned Transaction"}
            </h1>
            <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
              {getOperationLabel(operation.operation_type)} • {operation.lines.length} ingredient line(s)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-4">
            <p className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">Date</p>
            <p className="text-sm font-bold text-gray-800 dark:text-foreground mt-1">{formatDate(operation.created_at)}</p>
          </div>
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-4">
            <p className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">Time</p>
            <p className="text-sm font-bold text-gray-800 dark:text-foreground mt-1">{formatTime(operation.created_at)}</p>
          </div>
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-4">
            <p className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">Quantity</p>
            <p className="text-sm font-bold text-gray-800 dark:text-foreground mt-1">{formatQuantity(operation.quantity)}</p>
          </div>
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-border p-4">
            <p className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">Amount</p>
            <p className="text-sm font-bold text-gray-800 dark:text-foreground mt-1">{formatCurrency(operation.total_amount)}</p>
          </div>
        </div>

        {operation.notes ? (
          <div className="mt-4 rounded-xl border border-gray-100 dark:border-border bg-white dark:bg-card px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest">Notes</p>
            <p className="text-sm text-gray-700 dark:text-foreground mt-1 whitespace-pre-wrap">{operation.notes}</p>
          </div>
        ) : null}
      </div>

      <div className="p-5 sm:p-8 flex-1 overflow-auto">
        <p className="text-[10px] font-bold text-gray-300 dark:text-muted-foreground uppercase tracking-widest mb-4">
          Inventory Movements
        </p>

        {operation.lines.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-muted-foreground">No ingredient-level movements logged for this transaction.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold text-gray-300 dark:text-muted-foreground uppercase tracking-widest border-b border-gray-100 dark:border-border">
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
                    <td className="py-4 px-2 font-bold text-gray-700 dark:text-foreground text-sm">
                      {line.item_name}
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-gray-400 dark:text-muted-foreground">
                        {line.item_unit}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
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
