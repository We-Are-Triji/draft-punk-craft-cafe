import { useMemo, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  PlusCircle,
  Search,
  ShoppingCart,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { useProducts } from "@/hooks/useProducts";
import {
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  type OrderStatus,
} from "@/lib/purchasingService";

const PAGE_SIZE = 8;

function generateLineId(): string {
  return `li-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

const statusStyles: Record<OrderStatus, string> = {
  draft: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground",
  sent: "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
  received: "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
};

interface FormLineItem {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  estimated_cost: number;
}

interface IngredientOption {
  name: string;
  unit: string;
}

function buildIngredientOptions(products: { ingredients: { name: string; unit: string }[] }[]): IngredientOption[] {
  const map = new Map<string, IngredientOption>();
  for (const product of products) {
    for (const ing of product.ingredients) {
      const key = ing.name.trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { name: ing.name.trim(), unit: ing.unit.trim() || "pcs" });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function PurchaseOrdersScreen() {
  const { orders, loading, error: loadError, refresh } = usePurchaseOrders();
  const { products } = useProducts();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state
  const [supplierName, setSupplierName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [lineItems, setLineItems] = useState<FormLineItem[]>([
    { id: generateLineId(), ingredient_name: "", quantity: 1, unit: "pcs", estimated_cost: 0 },
  ]);

  const ingredientOptions = useMemo(() => buildIngredientOptions(products), [products]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        o.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
        o.items.some((i) => i.ingredient_name.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetForm = () => {
    setSupplierName("");
    setExpectedDate("");
    setFormNotes("");
    setLineItems([{ id: generateLineId(), ingredient_name: "", quantity: 1, unit: "pcs", estimated_cost: 0 }]);
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { id: generateLineId(), ingredient_name: "", quantity: 1, unit: "pcs", estimated_cost: 0 }]);
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((li) => li.id !== id)));
  };

  const updateLineItem = (id: string, field: keyof FormLineItem, value: string | number) => {
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));
  };

  const selectLineIngredient = (id: string, ingredientName: string) => {
    const matched = ingredientOptions.find((o) => o.name === ingredientName);
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === id
          ? { ...li, ingredient_name: ingredientName, unit: matched?.unit ?? li.unit }
          : li
      )
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;
    const validItems = lineItems.filter((li) => li.ingredient_name.trim() && li.quantity > 0);
    if (validItems.length === 0) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      await createPurchaseOrder({
        supplier_name: supplierName.trim(),
        expected_date: expectedDate || null,
        notes: formNotes.trim(),
        items: validItems.map((li) => ({
          ingredient_name: li.ingredient_name.trim(),
          quantity: li.quantity,
          unit: li.unit.trim() || "pcs",
          estimated_cost: Math.max(0, li.estimated_cost),
        })),
      });
      await refresh();
      resetForm();
      setIsFormOpen(false);
      setPage(1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    setActionError(null);
    try {
      await updatePurchaseOrderStatus(id, status);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await deletePurchaseOrder(id);
      if (expandedId === id) setExpandedId(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete order.");
    }
  };

  const getOrderTotal = (items: { estimated_cost: number; quantity: number }[]): number =>
    items.reduce((sum, li) => sum + li.estimated_cost * li.quantity, 0);

  const displayError = actionError ?? loadError;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Purchase Orders</h1>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-bold">Track orders to suppliers</p>
        </div>
        <button onClick={() => setIsFormOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-800 to-amber-700 text-white text-sm font-semibold shadow-md shadow-amber-900/20 hover:from-amber-700 hover:to-amber-600 transition-all">
          <PlusCircle className="w-4 h-4" /> New Order
        </button>
      </div>

      {displayError && (
        <div className="rounded-xl border border-red-100 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">{displayError}</div>
      )}

      {/* New Order Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-foreground">New Purchase Order</h2>
              <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Supplier Name</label>
                <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Metro Wholesale" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Expected Delivery Date</label>
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-muted-foreground">Items</label>
                  <button type="button" onClick={addLineItem} className="text-xs text-amber-700 dark:text-amber-400 font-semibold hover:underline">+ Add Item</button>
                </div>
                <div className="grid grid-cols-[1fr_64px_56px_80px_28px] gap-1 mb-1 px-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">Ingredient</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-right">Qty</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">Unit</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-right">Cost (₱)</span>
                  <span />
                </div>
                <div className="space-y-2">
                  {lineItems.map((li) => (
                    <div key={li.id} className="grid grid-cols-[1fr_64px_56px_80px_28px] gap-2 items-start">
                      <div className="relative">
                        <input
                          type="text"
                          list={`ingredients-${li.id}`}
                          value={li.ingredient_name}
                          onChange={(e) => selectLineIngredient(li.id, e.target.value)}
                          placeholder="Select or type..."
                          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        />
                        <datalist id={`ingredients-${li.id}`}>
                          {ingredientOptions.map((opt) => (
                            <option key={opt.name} value={opt.name}>{opt.name} ({opt.unit})</option>
                          ))}
                        </datalist>
                      </div>
                      <input type="number" value={li.quantity} onChange={(e) => updateLineItem(li.id, "quantity", Number(e.target.value))} min="0.01" step="any" className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                      <span className="rounded-lg border border-border bg-muted/40 px-2 py-2 text-xs text-muted-foreground text-center">{li.unit}</span>
                      <input type="number" value={li.estimated_cost} onChange={(e) => updateLineItem(li.id, "estimated_cost", Number(e.target.value))} min="0" step="0.01" placeholder="0.00" className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs text-right focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                      <button type="button" onClick={() => removeLineItem(li.id)} className="text-red-400 hover:text-red-600 pt-2"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional notes..." rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none" />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-800 to-amber-700 text-white text-sm font-semibold shadow-md hover:from-amber-700 hover:to-amber-600 transition-all disabled:opacity-60">
                {isSubmitting ? <span className="inline-flex items-center gap-2"><LoaderCircle className="w-4 h-4 animate-spin" /> Creating...</span> : "Create Order"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white dark:bg-card rounded-3xl shadow-sm border border-gray-100 dark:border-border p-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 dark:text-muted-foreground" size={18} />
            <input type="text" placeholder="Search by supplier or ingredient..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as "all" | OrderStatus); setPage(1); }} className="rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30">
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="received">Received</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <LoaderCircle className="w-5 h-5 animate-spin mr-2" /> Loading orders...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No purchase orders yet.</p>
            <p className="text-xs mt-1">Click "New Order" to create one.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {paginated.map((o) => (
                <div key={o.id} className="rounded-xl border border-gray-100 dark:border-border overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-muted/20 transition-colors" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{o.supplier_name}</span>
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", statusStyles[o.status])}>{o.status}</span>
                      </div>
                      <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{o.items.length} item{o.items.length !== 1 ? "s" : ""}</span>
                        <span>{formatCurrency(getOrderTotal(o.items))}</span>
                        {o.expected_date && <span>Expected: {formatDate(o.expected_date)}</span>}
                        <span>Created: {formatDate(o.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={o.status} onClick={(e) => e.stopPropagation()} onChange={(e) => handleStatusChange(o.id, e.target.value as OrderStatus)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none">
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="received">Received</option>
                      </select>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(o.id); }} className="text-red-400 hover:text-red-600 transition-colors" title="Delete"><XCircle className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {expandedId === o.id && (
                    <div className="border-t border-gray-100 dark:border-border px-4 py-3 bg-gray-50/50 dark:bg-muted/10">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground uppercase tracking-wider">
                            <th className="text-left py-1 font-semibold">Ingredient</th>
                            <th className="text-right py-1 font-semibold">Qty</th>
                            <th className="text-left py-1 font-semibold">Unit</th>
                            <th className="text-right py-1 font-semibold">Unit Cost</th>
                            <th className="text-right py-1 font-semibold">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.items.map((li) => (
                            <tr key={li.id} className="border-t border-gray-100/50 dark:border-border/30">
                              <td className="py-1.5 text-foreground">{li.ingredient_name}</td>
                              <td className="py-1.5 text-right tabular-nums">{li.quantity}</td>
                              <td className="py-1.5 text-muted-foreground">{li.unit}</td>
                              <td className="py-1.5 text-right tabular-nums">{formatCurrency(li.estimated_cost)}</td>
                              <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(li.estimated_cost * li.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 dark:border-border font-semibold">
                            <td colSpan={4} className="py-1.5 text-right text-muted-foreground">Total:</td>
                            <td className="py-1.5 text-right tabular-nums text-foreground">{formatCurrency(getOrderTotal(o.items))}</td>
                          </tr>
                        </tfoot>
                      </table>
                      {o.notes && <p className="mt-2 text-xs text-muted-foreground">Notes: {o.notes}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-border">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages} ({filtered.length} orders)</span>
                <div className="flex gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-muted/80 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-muted/80 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
