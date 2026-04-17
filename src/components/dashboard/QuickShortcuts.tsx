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
  iconStyle: string;
}

interface QuickShortcutsProps {
  onNavigate?: (tab: Tab) => void;
}

const shortcutItems: ShortcutItem[] = [
  {
    id: "stock-in",
    title: "Stock In",
    description: "AI or manual stock-in from Inventory.",
    tab: "inventory",
    icon: Package,
    iconStyle: "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400 ring-cyan-100 dark:ring-cyan-900/30",
  },
  {
    id: "stock-out",
    title: "Stock Out",
    description: "Create stock-out via AI scan or manual entry.",
    tab: "transactions",
    icon: Camera,
    iconStyle: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 ring-amber-100 dark:ring-amber-900/30",
  },
  {
    id: "transactions",
    title: "Transactions",
    description: "Review operations and ingredient movements.",
    tab: "transactions",
    icon: Receipt,
    iconStyle: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 ring-blue-100 dark:ring-blue-900/30",
  },
  {
    id: "recipes",
    title: "Recipes",
    description: "Manage product recipes and ingredients.",
    tab: "recipes",
    icon: ClipboardList,
    iconStyle: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 ring-emerald-100 dark:ring-emerald-900/30",
  },
];

export function QuickShortcuts({ onNavigate }: QuickShortcutsProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Quick Shortcuts</h2>
        <p className="text-[11px] text-muted-foreground">One-click navigation</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {shortcutItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate?.(item.tab)}
            className="group min-w-0 rounded-xl border border-border bg-card text-left p-4 hover:shadow-md hover:border-border/80 transition-all duration-200 disabled:opacity-60"
            disabled={!onNavigate}
          >
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ${item.iconStyle}`}
              >
                <item.icon className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-200 shrink-0 mt-1" />
            </div>

            <h3 className="mt-3 text-sm font-semibold text-foreground leading-tight break-words">
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
