import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight } from "lucide-react";

const lowStockItems = [
  { name: "Milk", qty: 0.94, max: 5, unit: "L", level: "critical" as const },
  { name: "Vanilla Syrup", qty: 1.5, max: 6, unit: "L", level: "warning" as const },
  { name: "Choco Powder", qty: 3.97, max: 10, unit: "kg", level: "warning" as const },
];

export function LowStockAlert() {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-red-500" />
        </div>
        <div className="flex-1">
          <CardTitle className="text-sm font-semibold">Low Stock</CardTitle>
          <p className="text-[11px] text-muted-foreground">Needs attention</p>
        </div>
        <Badge variant="destructive" className="text-[10px] h-5">
          {lowStockItems.length}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {lowStockItems.map((item) => {
          const pct = Math.round((item.qty / item.max) * 100);
          const isCritical = item.level === "critical";
          return (
            <div
              key={item.name}
              className={`rounded-lg p-3 border ${
                isCritical
                  ? "border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {item.name}
                  </span>
                  {isCritical && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-red-500">
                      Critical
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium text-foreground">
                  {item.qty} {item.unit}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isCritical ? "bg-red-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {pct}% of {item.max} {item.unit}
                </span>
              </div>
            </div>
          );
        })}
        <button className="flex items-center justify-center gap-1 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 font-medium mt-1 transition-colors">
          View all inventory
          <ArrowRight className="w-3 h-3" />
        </button>
      </CardContent>
    </Card>
  );
}
