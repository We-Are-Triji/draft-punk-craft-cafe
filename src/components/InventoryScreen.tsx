import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Edit3,
  Filter,
  PlusCircle,
  Search,
  Trash2,
} from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import {
  createInventoryItem,
  deleteInventoryItem,
  updateInventoryItem,
} from "@/lib/inventoryService";
import type { InventoryItemRow } from "@/types/inventory";

interface InventoryFormDraft {
  name: string;
  category: string;
  unit: string;
  current_stock: string;
  reorder_threshold: string;
}

type InventoryFilter =
  | "all"
  | "healthy"
  | "low"
  | "critical"
  | "stock-asc"
  | "stock-desc";

type InventoryEditorMode = "create" | "edit";

const INITIAL_DRAFT: InventoryFormDraft = {
  name: "",
  category: "Uncategorized",
  unit: "pcs",
  current_stock: "0",
  reorder_threshold: "10",
};

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(3)));
}

function toDraft(item: InventoryItemRow): InventoryFormDraft {
  return {
    name: item.name,
    category: item.category,
    unit: item.unit,
    current_stock: formatNumber(item.current_stock),
    reorder_threshold: formatNumber(item.reorder_threshold),
  };
}

function parseNonNegativeNumber(value: string, fieldLabel: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} must be a non-negative number.`);
  }

  return parsed;
}

function toMutationPayload(draft: InventoryFormDraft) {
  const trimmedName = draft.name.trim();

  if (!trimmedName) {
    throw new Error("Ingredient name is required.");
  }

  const trimmedUnit = draft.unit.trim();

  if (!trimmedUnit) {
    throw new Error("Unit is required.");
  }

  return {
    name: trimmedName,
    category: draft.category.trim() || "Uncategorized",
    unit: trimmedUnit,
    current_stock: parseNonNegativeNumber(draft.current_stock, "Current stock"),
    reorder_threshold: parseNonNegativeNumber(
      draft.reorder_threshold,
      "Reorder threshold"
    ),
  };
}

function getStatus(item: InventoryItemRow): {
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
      color: "bg-orange-100 text-orange-600",
    };
  }

  if (item.current_stock <= safeThreshold) {
    return {
      level: "low",
      label: "LOW STOCK",
      color: "bg-[#FFF5F0] text-orange-400",
    };
  }

  return {
    level: "healthy",
    label: "HEALTHY",
    color: "bg-emerald-100 text-emerald-600",
  };
}

export function InventoryScreen() {
  const { items, loading, error, refresh } = useInventory();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<InventoryFilter>("all");
  const [editorMode, setEditorMode] = useState<InventoryEditorMode | null>(null);
  const [draft, setDraft] = useState<InventoryFormDraft>(INITIAL_DRAFT);
  const [editingItem, setEditingItem] = useState<InventoryItemRow | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItemRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredIngredients = useMemo(() => {
    let list = [...items];

    list = list.filter((item) => {
      const query = searchTerm.toLowerCase();

      return (
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.unit.toLowerCase().includes(query)
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
      list.sort((a, b) => a.current_stock - b.current_stock);
    } else if (filterType === "stock-desc") {
      list.sort((a, b) => b.current_stock - a.current_stock);
    }

    return list;
  }, [filterType, items, searchTerm]);

  const lowStockItems = useMemo(
    () =>
      [...items]
        .filter((item) => getStatus(item).level !== "healthy")
        .sort((a, b) => a.current_stock - b.current_stock)
        .slice(0, 5),
    [items]
  );

  const openAddModal = () => {
    setDraft(INITIAL_DRAFT);
    setEditingItem(null);
    setEditorMode("create");
    setActionError(null);
  };

  const openEditModal = (item: InventoryItemRow) => {
    setDraft(toDraft(item));
    setEditingItem(item);
    setEditorMode("edit");
    setActionError(null);
  };

  const closeEditorModal = () => {
    setEditorMode(null);
    setEditingItem(null);
    setDraft(INITIAL_DRAFT);
  };

  const closeDeleteModal = () => {
    setItemToDelete(null);
  };

  const handleDraftChange = (field: keyof InventoryFormDraft, value: string) => {
    setDraft((previousValue) => ({
      ...previousValue,
      [field]: value,
    }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setActionError(null);

    try {
      const payload = toMutationPayload(draft);

      if (editorMode === "create") {
        await createInventoryItem(payload);
      } else if (editorMode === "edit" && editingItem) {
        await updateInventoryItem(editingItem.id, payload);
      } else {
        throw new Error("No ingredient selected for editing.");
      }

      await refresh();
      closeEditorModal();
    } catch (saveError) {
      setActionError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save ingredient."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      await deleteInventoryItem(itemToDelete.id);
      await refresh();
      closeDeleteModal();
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete ingredient."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-2">
      {editorMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-lg font-bold mb-4">
              {editorMode === "create" ? "Add New Ingredient" : "Edit Ingredient"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Ingredient name"
                  value={draft.name}
                  onChange={(event) => handleDraftChange("name", event.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-xl outline-none"
                  required
                />
                <input
                  type="text"
                  placeholder="Category"
                  value={draft.category}
                  onChange={(event) =>
                    handleDraftChange("category", event.target.value)
                  }
                  className="w-full p-3 bg-gray-50 border rounded-xl outline-none"
                />
                <input
                  type="text"
                  placeholder="Unit"
                  value={draft.unit}
                  onChange={(event) => handleDraftChange("unit", event.target.value)}
                  className="w-full p-3 bg-gray-50 border rounded-xl outline-none"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Current stock"
                  value={draft.current_stock}
                  onChange={(event) =>
                    handleDraftChange("current_stock", event.target.value)
                  }
                  className="w-full p-3 bg-gray-50 border rounded-xl outline-none"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Reorder threshold"
                  value={draft.reorder_threshold}
                  onChange={(event) =>
                    handleDraftChange("reorder_threshold", event.target.value)
                  }
                  className="w-full p-3 bg-gray-50 border rounded-xl outline-none md:col-span-2"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-[#3E2723] text-white py-3 rounded-xl font-bold disabled:opacity-70"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Saving..."
                    : editorMode === "create"
                      ? "Save"
                      : "Update"}
                </button>
                <button
                  type="button"
                  onClick={closeEditorModal}
                  className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-500" size={30} />
            </div>
            <h3 className="text-xl font-bold mb-2">Are you sure?</h3>
            <p className="text-gray-500 mb-6 text-sm">
              Do you really want to delete
              <span className="font-bold text-gray-800"> {itemToDelete.name}</span>? This
              action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={closeDeleteModal}
                className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold disabled:opacity-70"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(error || actionError) && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? actionError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="text-red-500" size={18} />
            <h3 className="font-bold text-gray-800">Low Stock Alerts</h3>
          </div>
          <div className="space-y-2">
            {loading && (
              <p className="text-sm text-gray-500">Loading inventory alerts...</p>
            )}
            {!loading && lowStockItems.length === 0 && (
              <p className="text-sm text-gray-500">All ingredients are healthy.</p>
            )}
            {!loading &&
              lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center bg-red-50 p-4 rounded-2xl border border-red-100/50"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-700">{item.name}</span>
                    <span className="text-xs text-gray-500">{item.category}</span>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="text-lg font-black text-red-600">
                      {formatNumber(item.current_stock)}
                    </span>
                    <span className="text-[#3E2723] font-black uppercase text-[10px] tracking-widest">
                      {item.unit}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-[#3E2723] rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
          <h3 className="text-white font-bold text-xl mb-6">Inventory Management</h3>
          <button
            onClick={openAddModal}
            className="bg-white text-[#3E2723] px-8 py-3 rounded-2xl font-bold flex items-center gap-2 active:scale-95 transition-all"
          >
            <PlusCircle size={20} /> Add New Ingredient
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">
            Ingredients List
          </h2>
          <div className="flex gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"
                size={18}
              />
              <input
                type="text"
                placeholder="Search by name, category, or unit"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none"
              />
            </div>
            <div className="relative">
              <Filter
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <select
                value={filterType}
                onChange={(event) =>
                  setFilterType(event.target.value as InventoryFilter)
                }
                className="pl-11 pr-8 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold text-gray-600 appearance-none cursor-pointer outline-none"
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
          <thead className="text-gray-400 text-[10px] uppercase font-bold tracking-widest border-b border-gray-50">
            <tr>
              <th className="pb-4 px-2">Name</th>
              <th className="pb-4 px-2">Category</th>
              <th className="pb-4 px-2">Current Stock</th>
              <th className="pb-4 px-2">Reorder At</th>
              <th className="pb-4 px-2">Status</th>
              <th className="pb-4 px-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                  Loading inventory...
                </td>
              </tr>
            )}

            {!loading && filteredIngredients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                  No ingredients found.
                </td>
              </tr>
            )}

            {!loading &&
              filteredIngredients.map((item) => {
                const status = getStatus(item);

                return (
                  <tr key={item.id} className="group hover:bg-gray-50/50">
                    <td className="py-6 px-2 font-bold text-gray-800 text-lg tracking-tight">
                      {item.name}
                    </td>
                    <td className="py-6 px-2 text-sm text-gray-600">{item.category}</td>
                    <td className="py-6 px-2 font-bold text-lg text-gray-700">
                      {formatNumber(item.current_stock)}
                      <span className="text-[#3E2723] font-black uppercase text-[10px] tracking-widest ml-2">
                        {item.unit}
                      </span>
                    </td>
                    <td className="py-6 px-2 text-sm font-semibold text-gray-600">
                      {formatNumber(item.reorder_threshold)} {item.unit}
                    </td>
                    <td className="py-6 px-2">
                      <span
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="py-6 px-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          className="bg-gray-100 hover:bg-[#3E2723] hover:text-white text-gray-500 p-2.5 rounded-xl transition-all"
                          disabled={isSubmitting}
                        >
                          <Edit3 size={18} />
                        </button>
                        <button
                          onClick={() => setItemToDelete(item)}
                          className="bg-gray-100 hover:bg-red-500 hover:text-white text-gray-500 p-2.5 rounded-xl transition-all"
                          disabled={isSubmitting}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}