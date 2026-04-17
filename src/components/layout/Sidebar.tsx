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
        "flex flex-col border-r border-border bg-card h-screen sticky top-0 transition-all duration-300",
        collapsed ? "w-[68px]" : "w-56"
      )}
    >
      {/* Brand */}
      <div className={cn(
        "flex items-center border-b border-border",
        collapsed ? "flex-col gap-2 px-2 py-4" : "gap-2.5 px-4 py-4"
      )}>
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
          className={cn(
            "flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
            collapsed ? "w-7 h-7" : "ml-auto w-6 h-6"
          )}
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
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm transition-all",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
              activeTab === item.tab
                ? "bg-amber-800 text-white font-medium shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}

        {/* Theme toggle */}
        <div className="mt-auto pt-2">
          {collapsed ? (
            <button
              onClick={onToggleTheme}
              className="flex items-center justify-center w-full py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          ) : (
            <div className="bg-muted/60 rounded-lg p-1 flex">
              <button
                onClick={theme === "light" ? undefined : onToggleTheme}
                className={cn(
                  "flex items-center justify-center gap-1.5 flex-1 py-1.5 rounded-md text-xs font-medium transition-all",
                  theme === "light"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
              <button
                onClick={theme === "dark" ? undefined : onToggleTheme}
                className={cn(
                  "flex items-center justify-center gap-1.5 flex-1 py-1.5 rounded-md text-xs font-medium transition-all",
                  theme === "dark"
                    ? "bg-card text-foreground shadow-sm"
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
            "flex items-center w-full rounded-lg text-[11px] font-medium transition-all",
            "text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20",
            collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2"
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
