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
  const chartDomainMax = Math.max(
    5,
    ...data.map((item) => Math.ceil(item.transactions * 1.25))
  );

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Top Products</CardTitle>
        <p className="text-xs text-muted-foreground">
          Most transacted products this week
        </p>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Loading scan history...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No scanned items yet.
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
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#fff",
                  fontSize: "12px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  padding: "8px 12px",
                }}
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
                formatter={(value) => [`${value ?? 0} transactions`, "Transactions"]}
                labelStyle={{ color: "#000" }}
              />
              <Bar
                dataKey="transactions"
                radius={[0, 8, 8, 0]}
                barSize={20}
                label={{
                  position: "right",
                  fontSize: 12,
                  fontWeight: 600,
                  fill: "#78716c",
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
