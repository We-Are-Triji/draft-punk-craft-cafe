import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { DashboardStockLevelDatum } from "@/hooks/useDashboardMetrics";

interface LowStockAlertProps {
  data: DashboardStockLevelDatum[];
  loading: boolean;
}

function formatStockValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(2)));
}

function getCoveragePercent(item: DashboardStockLevelDatum): number {
  const safeThreshold = Math.max(0, item.reorder_threshold);

  if (safeThreshold === 0) {
    return item.current_stock > 0 ? 100 : 0;
  }

  return Math.max(0, Math.min(100, Math.round((item.current_stock / safeThreshold) * 100)));
}

export function LowStockAlert({ data, loading }: LowStockAlertProps) {
  const lowStockItems = data
    .filter((item) => item.status !== "healthy")
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "critical" ? -1 : 1;
      }

      return left.current_stock - right.current_stock;
    });

  const visibleItems = lowStockItems.slice(0, 5);
  const criticalCount = lowStockItems.filter((item) => item.status === "critical").length;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-red-500" />
        </div>
        <div className="flex-1">
          <CardTitle className="text-sm font-semibold">Low Stock</CardTitle>
          <p className="text-[11px] text-muted-foreground">Showing up to 5 ingredients that need restock attention</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="text-[10px] h-5">
            {criticalCount} critical
          </Badge>
          <Badge variant="outline" className="text-[10px] h-5">
            Showing {visibleItems.length} of {lowStockItems.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {loading ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Loading inventory alerts...
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            All ingredients are healthy.
          </div>
        ) : (
          visibleItems.map((item) => {
          const pct = getCoveragePercent(item);
          const isCritical = item.status === "critical";

          return (
            <div
              key={`${item.name}-${item.unit}`}
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
                  {formatStockValue(item.current_stock)} {item.unit}
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
                  {pct}% of {formatStockValue(item.reorder_threshold)} {item.unit}
                </span>
              </div>
            </div>
          );
        }))}
      </CardContent>
    </Card>
  );
}
