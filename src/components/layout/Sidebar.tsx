import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  ChevronLeft,
  ChevronRight,
  CameraIcon,
  Receipt,
  HandPlatter,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/draft-punk-craft-cafe-logo.webp";

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
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
        <img
          src={logo}
          alt="Draft Punk"
          className="w-9 h-9 rounded-xl object-cover shrink-0"
        />
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
      <div className="p-2 border-t border-border">
        <button
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
