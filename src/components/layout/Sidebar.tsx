import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ChevronLeft,
  ChevronRight,
  Coffee,
  CameraIcon,
  Receipt,
  HandPlatter,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab = "scan" | "dashboard" | "inventory" | "transactions" | "recipes";

const navItems = [
  { icon: CameraIcon, label: "Scan", tab: "scan" as const },
  { icon: LayoutDashboard, label: "Dashboard", tab: "dashboard" as const },
  { icon: Package, label: "Inventory", tab: "inventory" as const },
  { icon: Receipt, label: "Transactions", tab: "transactions" as const },
  { icon: HandPlatter, label: "Recipes", tab: "recipes" as const },
];

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card h-screen sticky top-0 transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-800 text-white shrink-0">
          <Coffee className="w-4 h-4" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-foreground text-sm whitespace-nowrap">
            Draft Punk
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-2 flex-1">
        {navItems.map((item) => (
          <button
            key={item.tab}
            onClick={() => onTabChange(item.tab)}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === item.tab
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
