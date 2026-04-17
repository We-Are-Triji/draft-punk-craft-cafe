import {
  ArrowRight,
  Camera,
  ClipboardList,
  Package,
  Receipt,
} from "lucide-react";
import type { Tab } from "@/components/layout/Sidebar";

interface ShortcutItem {
  id: string;
  title: string;
  description: string;
  tab: Tab;
  icon: typeof Package;
  style: string;
}

interface QuickShortcutsProps {
  onNavigate?: (tab: Tab) => void;
}

const shortcutItems: ShortcutItem[] = [
  {
    id: "stock-in",
    title: "Stock In",
    description: "Open Inventory and use AI or manual stock-in quickly.",
    tab: "inventory",
    icon: Package,
    style: "bg-cyan-50 text-cyan-700 border-cyan-100",
  },
  {
    id: "stock-out",
    title: "Stock Out",
    description: "Open Transactions and create stock-out via AI scan or manual entry.",
    tab: "transactions",
    icon: Camera,
    style: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    id: "transactions",
    title: "Transactions Log",
    description: "Review recent operations and ingredient-level movements.",
    tab: "transactions",
    icon: Receipt,
    style: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    id: "recipes",
    title: "Recipes",
    description: "Manage product recipes that drive stock-in and stock-out matching.",
    tab: "recipes",
    icon: ClipboardList,
    style: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
];

export function QuickShortcuts({ onNavigate }: QuickShortcutsProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Quick Shortcuts</h2>
        <p className="text-[11px] text-muted-foreground">One-click navigation</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {shortcutItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate?.(item.tab)}
            className="min-w-0 rounded-2xl border border-border bg-card text-left p-4 hover:shadow-md transition-shadow disabled:opacity-60"
            disabled={!onNavigate}
          >
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${item.style}`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
            </div>

            <h3 className="mt-3 text-sm font-bold text-foreground leading-tight break-words">
              {item.title}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed break-words">
              {item.description}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
