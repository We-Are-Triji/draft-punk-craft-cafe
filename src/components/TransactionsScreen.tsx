import { useState, useMemo } from "react";
import {
  Search,
  CalendarDays,
  CameraIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

interface Transaction {
  id: string;
  timestamp: string;
  dish: string;
  scannedBy: string;
  ingredients: { name: string; qty: string }[];
}

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "1",
    timestamp: "2026-04-15T10:32:00",
    dish: "Latte",
    scannedBy: "Barista A",
    ingredients: [
      { name: "Milk", qty: "0.25 L" },
      { name: "Coffee Beans", qty: "0.02 kg" },
      { name: "Sugar", qty: "0.01 kg" },
    ],
  },
  {
    id: "2",
    timestamp: "2026-04-15T10:15:00",
    dish: "Cappuccino",
    scannedBy: "Barista B",
    ingredients: [
      { name: "Milk", qty: "0.20 L" },
      { name: "Coffee Beans", qty: "0.02 kg" },
    ],
  },
  {
    id: "3",
    timestamp: "2026-04-15T09:48:00",
    dish: "Mocha",
    scannedBy: "Barista A",
    ingredients: [
      { name: "Milk", qty: "0.20 L" },
      { name: "Coffee Beans", qty: "0.02 kg" },
      { name: "Choco Powder", qty: "0.03 kg" },
    ],
  },
  {
    id: "4",
    timestamp: "2026-04-15T09:30:00",
    dish: "Espresso",
    scannedBy: "Barista C",
    ingredients: [{ name: "Coffee Beans", qty: "0.03 kg" }],
  },
  {
    id: "5",
    timestamp: "2026-04-15T09:12:00",
    dish: "Hot Choco",
    scannedBy: "Barista B",
    ingredients: [
      { name: "Milk", qty: "0.25 L" },
      { name: "Choco Powder", qty: "0.05 kg" },
      { name: "Sugar", qty: "0.02 kg" },
    ],
  },
  {
    id: "6",
    timestamp: "2026-04-14T16:45:00",
    dish: "Latte",
    scannedBy: "Barista A",
    ingredients: [
      { name: "Milk", qty: "0.25 L" },
      { name: "Coffee Beans", qty: "0.02 kg" },
    ],
  },
  {
    id: "7",
    timestamp: "2026-04-14T15:20:00",
    dish: "Americano",
    scannedBy: "Barista C",
    ingredients: [{ name: "Coffee Beans", qty: "0.03 kg" }],
  },
  {
    id: "8",
    timestamp: "2026-04-14T14:05:00",
    dish: "Cappuccino",
    scannedBy: "Barista A",
    ingredients: [
      { name: "Milk", qty: "0.20 L" },
      { name: "Coffee Beans", qty: "0.02 kg" },
    ],
  },
  {
    id: "9",
    timestamp: "2026-04-14T11:30:00",
    dish: "Mocha",
    scannedBy: "Barista B",
    ingredients: [
      { name: "Milk", qty: "0.20 L" },
      { name: "Coffee Beans", qty: "0.02 kg" },
      { name: "Choco Powder", qty: "0.03 kg" },
    ],
  },
  {
    id: "10",
    timestamp: "2026-04-13T10:00:00",
    dish: "Latte",
    scannedBy: "Barista C",
    ingredients: [
      { name: "Milk", qty: "0.25 L" },
      { name: "Coffee Beans", qty: "0.02 kg" },
      { name: "Sugar", qty: "0.01 kg" },
    ],
  },
];

const PAGE_SIZE = 6;
const SKELETON_ROWS = 6;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function TransactionsScreen() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return MOCK_TRANSACTIONS.filter((t) => {
      const matchesSearch =
        t.dish.toLowerCase().includes(search.toLowerCase()) ||
        t.scannedBy.toLowerCase().includes(search.toLowerCase());
      const tDate = t.timestamp.slice(0, 10);
      const afterFrom = !dateFrom || tDate >= dateFrom;
      const beforeTo = !dateTo || tDate <= dateTo;
      return matchesSearch && afterFrom && beforeTo;
    });
  }, [search, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const selectedTx = selectedId
    ? MOCK_TRANSACTIONS.find((t) => t.id === selectedId)
    : null;

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 p-2 h-[calc(100vh-48px)] animate-in fade-in duration-500">
      {/* Left — Transaction list */}
      <div className="w-full lg:flex-[2] bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden min-h-0">
        <div className="p-5 border-b border-gray-50 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-800">
              Transactions Log
            </h2>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {filtered.length} records
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
              size={16}
            />
            <input
              type="text"
              placeholder="Search by dish or barista..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-1 focus:ring-[#3E2723] outline-none"
            />
          </div>

          {/* Date range filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter size={14} className="text-gray-400" />
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[#3E2723]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[#3E2723]"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
                className="text-[10px] font-bold text-[#3E2723] uppercase tracking-widest hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-5">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-300 uppercase tracking-widest border-b border-gray-100">
                    <th className="pb-4 px-2">Timestamp</th>
                    <th className="pb-4 px-2">Dish</th>
                    <th className="pb-4 px-2">Scanned By</th>
                    <th className="pb-4 px-2">Ingredients</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td className="py-5 px-2">
                        <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                        <div className="h-3 w-16 rounded bg-gray-100 animate-pulse mt-1" />
                      </td>
                      <td className="py-5 px-2">
                        <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                      </td>
                      <td className="py-5 px-2">
                        <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
                      </td>
                      <td className="py-5 px-2">
                        <div className="h-4 w-40 rounded bg-gray-100 animate-pulse" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-300 uppercase tracking-widest border-b border-gray-100">
                    <th className="pb-3 px-2">Timestamp</th>
                    <th className="pb-3 px-2">Dish</th>
                    <th className="pb-3 px-2 hidden sm:table-cell">Scanned By</th>
                    <th className="pb-3 px-2 hidden md:table-cell">Ingredients</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-12 text-center text-sm text-gray-400 font-semibold"
                      >
                        No transactions found.
                      </td>
                    </tr>
                  )}
                  {paginated.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedId(tx.id)}
                      className={`cursor-pointer transition-all ${
                        selectedId === tx.id
                          ? "bg-[#FFF5F0]"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="py-3 px-2">
                        <p className="text-sm font-bold text-gray-800">
                          {formatDate(tx.timestamp)}
                        </p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                          {formatTime(tx.timestamp)}
                        </p>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded-lg ${
                              selectedId === tx.id
                                ? "bg-[#3E2723] text-white"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            <CameraIcon size={14} />
                          </div>
                          <span className="font-bold text-gray-800 text-sm">
                            {tx.dish}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-600 hidden sm:table-cell">
                        {tx.scannedBy}
                      </td>
                      <td className="py-3 px-2 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {tx.ingredients.slice(0, 2).map((ing) => (
                            <span
                              key={ing.name}
                              className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                            >
                              {ing.name}
                            </span>
                          ))}
                          {tx.ingredients.length > 2 && (
                            <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                              +{tx.ingredients.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <span className="text-[11px] text-gray-400 font-bold">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
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

      {/* Right — Detail panel */}
      <div className="w-full lg:flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden min-h-[300px] lg:min-h-0">
        {!selectedTx ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <CalendarDays size={28} className="text-gray-300" />
            </div>
            <h3 className="text-xl font-black text-gray-800">
              Select a Transaction
            </h3>
            <p className="text-sm text-gray-400 mt-2 max-w-xs">
              Click on any row to view the full scan details and ingredients
              deducted.
            </p>
          </div>
        ) : (
          <>
            <div className="p-5 sm:p-8 border-b border-gray-50 bg-gray-50/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-[#3E2723] text-white">
                  <CameraIcon size={20} />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-gray-800 tracking-tight">
                    {selectedTx.dish}
                  </h1>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                    Scan Event • {selectedTx.scannedBy}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Date
                  </p>
                  <p className="text-sm font-bold text-gray-800 mt-1">
                    {formatDate(selectedTx.timestamp)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Time
                  </p>
                  <p className="text-sm font-bold text-gray-800 mt-1">
                    {formatTime(selectedTx.timestamp)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-8 flex-1 overflow-auto">
              <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-4">
                Ingredients Deducted
              </p>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-300 uppercase tracking-widest border-b border-gray-100">
                    <th className="pb-3 px-2">Ingredient</th>
                    <th className="pb-3 px-2 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedTx.ingredients.map((ing) => (
                    <tr key={ing.name}>
                      <td className="py-4 px-2 font-bold text-gray-700 text-sm">
                        {ing.name}
                      </td>
                      <td className="py-4 px-2 text-right">
                        <span className="font-mono font-black text-lg text-[#3E2723]">
                          -{ing.qty}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
