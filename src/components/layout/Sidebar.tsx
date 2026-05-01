import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Coffee,
  Receipt,
  HandPlatter,
  LogOut,
  LoaderCircle,
  Sun,
  Moon,
  ClipboardList,
  FileText,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab =
  | "dashboard"
  | "inventory"
  | "transactions"
  | "recipes"
  | "purchasing-orders"
  | "purchasing-requests";

const INVENTORY_GROUP_TABS: Tab[] = [
  "inventory",
  "purchasing-orders",
  "purchasing-requests",
];

function isInventoryGroupTab(tab: Tab): boolean {
  return INVENTORY_GROUP_TABS.includes(tab);
}

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onLogout: () => Promise<void> | void;
  isLoggingOut?: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  onLogout,
  isLoggingOut = false,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [inventoryExpanded, setInventoryExpanded] = useState(
    isInventoryGroupTab(activeTab)
  );

  // Auto-expand inventory group when navigating to a sub-tab
  if (isInventoryGroupTab(activeTab) && !inventoryExpanded) {
    setInventoryExpanded(true);
  }

  const handleInventoryGroupClick = () => {
    if (collapsed) {
      onTabChange("inventory");
      return;
    }
    if (!inventoryExpanded) {
      setInventoryExpanded(true);
      if (!isInventoryGroupTab(activeTab)) {
        onTabChange("inventory");
      }
    } else {
      setInventoryExpanded(false);
    }
  };

  const inventoryGroupActive = isInventoryGroupTab(activeTab);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card h-screen sticky top-0 transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-56"
      )}
    >
      {/* Brand */}
      <div className={cn(
        "flex items-center border-b border-border min-h-[64px]",
        collapsed ? "flex-col gap-2 px-2 py-4" : "gap-3 px-4 py-4"
      )}>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 text-white shrink-0 shadow-sm">
          <Coffee className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-foreground text-sm leading-tight tracking-tight">
              Draft Punk
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Craft Cafe
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all duration-200",
            collapsed ? "w-8 h-8" : "ml-auto w-7 h-7"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {!collapsed && (
          <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-3 pt-3 pb-2">
            Menu
          </span>
        )}
        {collapsed && <div className="h-2" />}

        {/* Dashboard */}
        <button
          onClick={() => onTabChange("dashboard")}
          title={collapsed ? "Dashboard" : undefined}
          className={cn(
            "relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
            collapsed ? "justify-center p-2.5 mx-auto w-11 h-11" : "gap-3 px-3 py-2.5",
            activeTab === "dashboard"
              ? "bg-gradient-to-r from-amber-800 to-amber-700 text-white shadow-md shadow-amber-900/20"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          <LayoutDashboard className={cn("shrink-0", collapsed ? "w-[18px] h-[18px]" : "w-4 h-4")} />
          {!collapsed && <span>Dashboard</span>}
        </button>

        {/* Inventory group */}
        <button
          onClick={handleInventoryGroupClick}
          title={collapsed ? "Inventory" : undefined}
          className={cn(
            "relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
            collapsed ? "justify-center p-2.5 mx-auto w-11 h-11" : "gap-3 px-3 py-2.5",
            inventoryGroupActive
              ? "bg-gradient-to-r from-amber-800 to-amber-700 text-white shadow-md shadow-amber-900/20"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          <Package className={cn("shrink-0", collapsed ? "w-[18px] h-[18px]" : "w-4 h-4")} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Inventory</span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                  inventoryExpanded ? "rotate-180" : ""
                )}
              />
            </>
          )}
        </button>

        {/* Inventory sub-items */}
        {!collapsed && inventoryExpanded && (
          <div className="flex flex-col gap-0.5 ml-4 pl-3 border-l border-border/50">
            <button
              onClick={() => onTabChange("inventory")}
              className={cn(
                "flex items-center gap-2.5 rounded-lg text-xs font-medium px-2.5 py-2 transition-all duration-200",
                activeTab === "inventory"
                  ? "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <ClipboardList className="w-3.5 h-3.5 shrink-0" />
              <span>Stock Take</span>
            </button>

            {!collapsed && (
              <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-2.5 pt-2 pb-1">
                Purchasing
              </span>
            )}

            <button
              onClick={() => onTabChange("purchasing-orders")}
              className={cn(
                "flex items-center gap-2.5 rounded-lg text-xs font-medium px-2.5 py-2 transition-all duration-200",
                activeTab === "purchasing-orders"
                  ? "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
              <span>Purchase Orders</span>
            </button>
            <button
              onClick={() => onTabChange("purchasing-requests")}
              className={cn(
                "flex items-center gap-2.5 rounded-lg text-xs font-medium px-2.5 py-2 transition-all duration-200",
                activeTab === "purchasing-requests"
                  ? "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              )}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Purchase Requests</span>
            </button>
          </div>
        )}

        {/* Transactions */}
        <button
          onClick={() => onTabChange("transactions")}
          title={collapsed ? "Transactions" : undefined}
          className={cn(
            "relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
            collapsed ? "justify-center p-2.5 mx-auto w-11 h-11" : "gap-3 px-3 py-2.5",
            activeTab === "transactions"
              ? "bg-gradient-to-r from-amber-800 to-amber-700 text-white shadow-md shadow-amber-900/20"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          <Receipt className={cn("shrink-0", collapsed ? "w-[18px] h-[18px]" : "w-4 h-4")} />
          {!collapsed && <span>Transactions</span>}
        </button>

        {/* Recipes */}
        <button
          onClick={() => onTabChange("recipes")}
          title={collapsed ? "Recipes" : undefined}
          className={cn(
            "relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
            collapsed ? "justify-center p-2.5 mx-auto w-11 h-11" : "gap-3 px-3 py-2.5",
            activeTab === "recipes"
              ? "bg-gradient-to-r from-amber-800 to-amber-700 text-white shadow-md shadow-amber-900/20"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          <HandPlatter className={cn("shrink-0", collapsed ? "w-[18px] h-[18px]" : "w-4 h-4")} />
          {!collapsed && <span>Recipes</span>}
        </button>

        {/* Theme toggle */}
        <div className="mt-auto pt-3 pb-1">
          {collapsed ? (
            <button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-11 h-11 mx-auto rounded-xl text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all duration-200"
              aria-label="Toggle theme"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
          ) : (
            <div className="bg-muted/50 rounded-xl p-1 flex border border-border/50">
              <button
                onClick={theme === "light" ? undefined : onToggleTheme}
                className={cn(
                  "flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                  theme === "light"
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
              <button
                onClick={theme === "dark" ? undefined : onToggleTheme}
                className={cn(
                  "flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200",
                  theme === "dark"
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Footer — sign out */}
      <div className="p-2 border-t border-border">
        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          className={cn(
            "flex items-center w-full rounded-xl text-xs font-medium transition-all duration-200",
            "text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20",
            isLoggingOut ? "opacity-70 cursor-not-allowed" : "",
            collapsed ? "justify-center p-2.5 mx-auto w-11 h-11" : "gap-2.5 px-3 py-2.5"
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          {isLoggingOut ? (
            <LoaderCircle className="w-4 h-4 shrink-0 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4 shrink-0" />
          )}
          {!collapsed && <span>{isLoggingOut ? "Signing out..." : "Sign out"}</span>}
        </button>
      </div>
    </aside>
  );
}
