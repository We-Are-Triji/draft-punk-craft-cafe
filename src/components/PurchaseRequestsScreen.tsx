import { useMemo, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  PlusCircle,
  Search,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RequestStatus = "pending" | "approved" | "rejected";
type UrgencyLevel = "low" | "normal" | "urgent";

interface PurchaseRequest {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  urgency: UrgencyLevel;
  notes: string;
  status: RequestStatus;
  created_at: string;
}

const PAGE_SIZE = 8;

function generateId(): string {
  return `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusStyles: Record<RequestStatus, string> = {
  pending: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400",
};

const urgencyStyles: Record<UrgencyLevel, string> = {
  low: "bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground",
  normal: "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
  urgent: "bg-orange-100 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400",
};

export function PurchaseRequestsScreen() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form state
  const [ingredientName, setIngredientName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [urgency, setUrgency] = useState<UrgencyLevel>("normal");
  const [notes, setNotes] = useState("");

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const matchesSearch =
        r.ingredient_name.toLowerCase().includes(search.toLowerCase()) ||
        r.notes.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetForm = () => {
    setIngredientName("");
    setQuantity("1");
    setUnit("pcs");
    setUrgency("normal");
    setNotes("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsedQty = Number(quantity);
    if (!ingredientName.trim() || !Number.isFinite(parsedQty) || parsedQty <= 0) return;

    const newRequest: PurchaseRequest = {
      id: generateId(),
      ingredient_name: ingredientName.trim(),
      quantity: parsedQty,
      unit: unit.trim() || "pcs",
      urgency,
      notes: notes.trim(),
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setRequests((prev) => [newRequest, ...prev]);
    resetForm();
    setIsFormOpen(false);
    setPage(1);
  };

  const updateStatus = (id: string, status: RequestStatus) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r))
    );
  };

  const deleteRequest = (id: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Purchase Requests</h1>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-bold">
            Request ingredients for purchasing
          </p>
        </div>
        <button
          onClick={() => setIsFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-800 to-amber-700 text-white text-sm font-semibold shadow-md shadow-amber-900/20 hover:from-amber-700 hover:to-amber-600 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          New Request
        </button>
      </div>

      {/* New Request Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-foreground">New Purchase Request</h2>
              <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Ingredient Name</label>
                <input
                  type="text"
                  value={ingredientName}
                  onChange={(e) => setIngredientName(e.target.value)}
                  placeholder="e.g. Chicken Breast"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0.01"
                    step="any"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="pcs, kg, g, ml"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Urgency</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-800 to-amber-700 text-white text-sm font-semibold shadow-md hover:from-amber-700 hover:to-amber-600 transition-all"
              >
                Submit Request
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-card rounded-3xl shadow-sm border border-gray-100 dark:border-border p-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 dark:text-muted-foreground" size={18} />
            <input
              type="text"
              placeholder="Search by ingredient or notes..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as "all" | RequestStatus); setPage(1); }}
            className="rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No purchase requests yet.</p>
            <p className="text-xs mt-1">Click "New Request" to create one.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-3 px-3 font-semibold">Ingredient</th>
                    <th className="text-right py-3 px-3 font-semibold">Qty</th>
                    <th className="text-left py-3 px-3 font-semibold">Unit</th>
                    <th className="text-center py-3 px-3 font-semibold">Urgency</th>
                    <th className="text-center py-3 px-3 font-semibold">Status</th>
                    <th className="text-left py-3 px-3 font-semibold">Date</th>
                    <th className="text-left py-3 px-3 font-semibold">Notes</th>
                    <th className="text-center py-3 px-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 dark:border-border/50 hover:bg-gray-50/50 dark:hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3 font-medium text-foreground">{r.ingredient_name}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{r.quantity}</td>
                      <td className="py-3 px-3 text-muted-foreground">{r.unit}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", urgencyStyles[r.urgency])}>
                          {r.urgency}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <select
                          value={r.status}
                          onChange={(e) => updateStatus(r.id, e.target.value as RequestStatus)}
                          className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border-0 cursor-pointer focus:outline-none", statusStyles[r.status])}
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-xs">{formatDate(r.created_at)}</td>
                      <td className="py-3 px-3 text-muted-foreground text-xs max-w-[150px] truncate">{r.notes || "—"}</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => deleteRequest(r.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-border">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} ({filtered.length} requests)
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg hover:bg-muted/80 disabled:opacity-40">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg hover:bg-muted/80 disabled:opacity-40">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
