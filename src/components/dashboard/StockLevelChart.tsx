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

function toStatusColor(status: DashboardStockLevelDatum["status"]): string {
  if (status === "critical") {
    return "#ef4444";
  }

  if (status === "low") {
    return "#f59e0b";
  }

  return "#16a34a";
}

export function StockLevelChart({ data, loading }: StockLevelChartProps) {
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
          <Badge variant="outline" className="text-[10px] h-5 border-amber-200 text-amber-700">
            {lowCount} low
          </Badge>
          <Badge variant="outline" className="text-[10px] h-5 border-emerald-200 text-emerald-700">
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
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#fff",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  padding: "10px 14px",
                  lineHeight: "1.6",
                }}
                formatter={(value, name, payload) => {
                  const itemUnit = payload?.payload?.unit ?? "";
                  return [`${formatStockValue(Number(value ?? 0))} ${itemUnit}`, name];
                }}
                itemStyle={{ padding: 0 }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
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
                    fill={toStatusColor(item.status)}
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
