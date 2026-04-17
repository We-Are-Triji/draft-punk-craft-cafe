import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Receipt,
  HandPlatter,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab = "dashboard" | "inventory" | "transactions" | "recipes";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", tab: "dashboard" as const },
  { icon: Package, label: "Inventory", tab: "inventory" as const },
  { icon: Receipt, label: "Transactions", tab: "transactions" as const },
  { icon: HandPlatter, label: "Recipes", tab: "recipes" as const },
];

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => void;
  userName?: string;
  userEmail?: string;
}

export function Sidebar({ activeTab, onTabChange, onLogout, userName, userEmail }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const initial = (userName || userEmail || "U").charAt(0).toUpperCase();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card h-screen sticky top-0 transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-800 text-white shrink-0">
          <Coffee className="w-4 h-4" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-bold text-foreground text-sm leading-tight">
              Draft Punk
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Craft Cafe
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {!collapsed && (
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
            Menu
          </span>
        )}
        {navItems.map((item) => (
          <button
            key={item.tab}
            onClick={() => onTabChange(item.tab)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
              activeTab === item.tab
                ? "bg-amber-800 text-white font-medium shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-3">
        {!collapsed && (
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-amber-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{userName || "User"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{userEmail || ""}</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-amber-800 text-white flex items-center justify-center text-xs font-bold">
              {initial}
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className={cn(
            "flex items-center gap-2.5 w-full rounded-xl text-xs font-semibold transition-all active:scale-[0.97]",
            "border border-red-200 dark:border-red-900/40",
            "bg-white dark:bg-red-950/10 text-red-600 dark:text-red-400",
            "hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800",
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
          )}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
