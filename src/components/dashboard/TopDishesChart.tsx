import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DashboardTopTransactionDatum } from "@/hooks/useDashboardMetrics";
import { useTheme } from "@/hooks/useTheme";

interface TopDishesChartProps {
  data: DashboardTopTransactionDatum[];
  loading: boolean;
}

const barColors = [
  "#92400e",
  "#b45309",
  "#d97706",
  "#f59e0b",
  "#fbbf24",
  "#fcd34d",
];

export function TopDishesChart({ data, loading }: TopDishesChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const chartDomainMax = Math.max(
    5,
    ...data.map((item) => Math.ceil(item.quantity * 1.25))
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Top Products</CardTitle>
        <p className="text-xs text-muted-foreground">
          Most sold products this week (by servings)
        </p>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Loading scan history...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No products sold.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 30, bottom: 0, left: 0 }}
              barCategoryGap="25%"
            >
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, chartDomainMax]}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fontWeight: 500 }}
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
                  padding: "8px 12px",
                  color: isDark ? "oklch(0.985 0 0)" : "#000",
                }}
                cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}
                formatter={(value) => [`${value ?? 0} servings sold`, "Quantity"]}
                labelStyle={{ color: isDark ? "oklch(0.985 0 0)" : "#000" }}
              />
              <Bar
                dataKey="quantity"
                radius={[0, 8, 8, 0]}
                barSize={20}
                label={{
                  position: "right",
                  fontSize: 12,
                  fontWeight: 600,
                  fill: isDark ? "#a8a29e" : "#78716c",
                }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={barColors[i % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
