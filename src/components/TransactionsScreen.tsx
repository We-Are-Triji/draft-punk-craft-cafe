import { useMemo, useState, type FormEvent } from "react";
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
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { useProducts } from "@/hooks/useProducts";
import { useTransactionOperations } from "@/hooks/useTransactionOperations";
import { createSaleTransaction } from "@/lib/transactionService";
import type {
  InventoryItemRow,
  OperationType,
  TransactionOperationWithLines,
} from "@/types/inventory";
import type { ProductWithIngredients } from "@/types/recipes";

const PAGE_SIZE = 8;

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

  return "bg-gray-100 text-gray-600";
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

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [quantityInput, setQuantityInput] = useState("1");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

    return ["all", ...[...uniqueCategories].sort((left, right) => left.localeCompare(right))];
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

  const openCreateModal = () => {
    setIsCreateModalOpen(true);
    setSelectedProductId(null);
    setProductSearch("");
    setCategoryFilter("all");
    setQuantityInput("1");
    setUnitPriceInput("");
    setNotesInput("");
    setActionError(null);
  };

  const closeCreateModal = () => {
    if (isSubmitting) {
      return;
    }

    setIsCreateModalOpen(false);
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

    if (parsedUnitPrice !== null && (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0)) {
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
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-6xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-800">Record Sale Transaction</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Choose product, set quantity and optional price, then confirm with stock checks.
                </p>
              </div>
              <button
                onClick={closeCreateModal}
                className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-700"
                disabled={isSubmitting}
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSale} className="flex-1 overflow-auto p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
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
                        onClick={closeCreateModal}
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
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#3E2723] text-white text-xs font-bold"
                >
                  <PlusCircle size={14} /> Record Sale
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
                        <td colSpan={5} className="py-12 text-center text-sm text-gray-400 font-semibold">
                          No transactions found.
                        </td>
                      </tr>
                    )}

                    {paginatedOperations.map((operation) => (
                      <tr
                        key={operation.id}
                        onClick={() => setSelectedId(operation.id)}
                        className={`cursor-pointer transition-all ${
                          selectedId === operation.id
                            ? "bg-[#FFF5F0]"
                            : "hover:bg-gray-50"
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
