import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DashboardStockLevelDatum } from "@/hooks/useDashboardMetrics";
import { useTheme } from "@/hooks/useTheme";

interface StockLevelChartProps {
  data: DashboardStockLevelDatum[];
  loading: boolean;
}

function formatStockValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(2)));
}

function toStatusColor(status: DashboardStockLevelDatum["status"], isDark: boolean): string {
  if (status === "critical") {
    return isDark ? "#f87171" : "#ef4444";
  }

  if (status === "low") {
    return isDark ? "#fbbf24" : "#f59e0b";
  }

  return isDark ? "#4ade80" : "#16a34a";
}

export function StockLevelChart({ data, loading }: StockLevelChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const criticalCount = data.filter((stock) => stock.status === "critical").length;
  const lowCount = data.filter((stock) => stock.status === "low").length;
  const healthyCount = data.filter((stock) => stock.status === "healthy").length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold">Stock Levels</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Current stock compared to reorder thresholds
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive" className="text-[10px] h-5">
            {criticalCount} critical
          </Badge>
          <Badge variant="outline" className="text-[10px] h-5 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
            {lowCount} low
          </Badge>
          <Badge variant="outline" className="text-[10px] h-5 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
            {healthyCount} healthy
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {loading ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Loading inventory status...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No inventory data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
                vertical={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "10px",
                  border: isDark ? "1px solid oklch(1 0 0 / 10%)" : "1px solid #e5e7eb",
                  backgroundColor: isDark ? "oklch(0.205 0 0)" : "#fff",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  padding: "10px 14px",
                  lineHeight: "1.6",
                  color: isDark ? "oklch(0.985 0 0)" : "#000",
                }}
                formatter={(value, name, payload) => {
                  const itemUnit = payload?.payload?.unit ?? "";
                  return [`${formatStockValue(Number(value ?? 0))} ${itemUnit}`, name];
                }}
                itemStyle={{ padding: 0 }}
                labelStyle={{ fontWeight: 600, marginBottom: 4, color: isDark ? "oklch(0.985 0 0)" : "#000" }}
              />
              <Bar
                dataKey="current_stock"
                name="Current Stock"
                radius={[0, 4, 4, 0]}
                barSize={14}
              >
                {data.map((item) => (
                  <Cell
                    key={`${item.name}-${item.unit}-current`}
                    fill={toStatusColor(item.status, isDark)}
                  />
                ))}
              </Bar>
              <Bar
                dataKey="reorder_threshold"
                name="Reorder Threshold"
                fill="#cbd5e1"
                radius={[0, 4, 4, 0]}
                barSize={12}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
