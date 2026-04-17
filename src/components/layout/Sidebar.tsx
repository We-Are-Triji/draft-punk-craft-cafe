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
  Sun,
  Moon,
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
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function Sidebar({ activeTab, onTabChange, onLogout, theme, onToggleTheme }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

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
        {navItems.map((item) => (
          <button
            key={item.tab}
            onClick={() => onTabChange(item.tab)}
            title={collapsed ? item.label : undefined}
            className={cn(
              "relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
              collapsed ? "justify-center p-2.5 mx-auto w-11 h-11" : "gap-3 px-3 py-2.5",
              activeTab === item.tab
                ? "bg-gradient-to-r from-amber-800 to-amber-700 text-white shadow-md shadow-amber-900/20"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            <item.icon className={cn("shrink-0", collapsed ? "w-[18px] h-[18px]" : "w-4 h-4")} />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}

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
          className={cn(
            "flex items-center w-full rounded-xl text-xs font-medium transition-all duration-200",
            "text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20",
            collapsed ? "justify-center p-2.5 mx-auto w-11 h-11" : "gap-2.5 px-3 py-2.5"
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
