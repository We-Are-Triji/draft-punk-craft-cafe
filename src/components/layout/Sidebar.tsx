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
  LoaderCircle,
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

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card h-screen sticky top-0 transition-all duration-300 ease-in-out z-50",
        "w-full md:w-56",
        collapsed ? "md:w-[68px]" : "md:w-56"
      )}
    >
      <div className={cn(
        "flex items-center border-b border-border min-h-[48px] md:min-h-[64px] shrink-0",
        collapsed ? "md:flex-col gap-2 px-2 py-2 md:py-4" : "gap-3 px-4 py-2 md:py-4"
      )}>
        <div className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 text-white shrink-0 shadow-sm">
          <Coffee className="w-4 h-4 md:w-5 md:h-5" />
        </div>
        
        <div className={cn(
          "flex flex-col min-w-0",
          collapsed ? "md:hidden" : "flex"
        )}>
          <span className="font-bold text-foreground text-sm leading-tight tracking-tight">
            Draft Punk
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Craft Cafe
          </span>
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "hidden md:flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all duration-200",
            collapsed ? "w-8 h-8" : "ml-auto w-7 h-7"
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 md:gap-1 p-2 flex-grow overflow-y-auto min-h-0">
        <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest px-3 pt-1.5 md:pt-3 pb-1 md:pb-2">
          Menu
        </span>
        
        {navItems.map((item) => (
          <button
            key={item.tab}
            onClick={() => onTabChange(item.tab)}
            className={cn(
              "relative flex items-center rounded-xl text-sm font-medium transition-all duration-200 shrink-0",
              "gap-3 px-3 py-2 md:py-2.5",
              collapsed ? "md:justify-center md:p-2.5 md:mx-auto md:w-11 md:h-11" : "",
              activeTab === item.tab
                ? "bg-gradient-to-r from-amber-800 to-amber-700 text-white shadow-md shadow-amber-900/20"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            <item.icon className={cn("shrink-0", collapsed ? "md:w-[18px] md:h-[18px]" : "w-4 h-4")} />
            <span className={cn(collapsed ? "md:hidden" : "inline")}>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="shrink-0 bg-card border-t border-border p-2 space-y-2 mb-15 md:mb-0">
        <div className="px-1">
          <div className={cn(
            "bg-muted/50 rounded-xl p-1 flex border border-border/50",
            collapsed ? "md:hidden" : "flex"
          )}>
            <button
              onClick={theme === "light" ? undefined : onToggleTheme}
              className={cn(
                "flex items-center justify-center gap-1.5 flex-1 py-1.5 md:py-2 rounded-lg text-xs font-medium transition-all duration-200",
                theme === "light" ? "bg-card text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sun className="w-3.5 h-3.5" />
              Light
            </button>
            <button
              onClick={theme === "dark" ? undefined : onToggleTheme}
              className={cn(
                "flex items-center justify-center gap-1.5 flex-1 py-1.5 md:py-2 rounded-lg text-xs font-medium transition-all duration-200",
                theme === "dark" ? "bg-card text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Moon className="w-3.5 h-3.5" />
              Dark
            </button>
          </div>
        </div>

        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          className={cn(
            "flex items-center w-full rounded-xl text-xs font-medium transition-all duration-200",
            "text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20",
            isLoggingOut ? "opacity-70 cursor-not-allowed" : "",
            "gap-2.5 px-3 py-2 md:py-2.5",
            collapsed ? "md:justify-center md:p-2.5 md:mx-auto md:w-11 md:h-11" : ""
          )}
        >
          {isLoggingOut ? (
            <LoaderCircle className="w-4 h-4 shrink-0 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4 shrink-0" />
          )}
          <span className={cn(collapsed ? "md:hidden" : "inline")}>
            {isLoggingOut ? "Signing out..." : "Sign out"}
          </span>
        </button>
      </div>
    </aside>
  );
}