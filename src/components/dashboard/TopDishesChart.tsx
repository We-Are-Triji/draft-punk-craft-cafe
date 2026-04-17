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

const data = [
  { name: "Latte", scans: 18 },
  { name: "Cappuccino", scans: 14 },
  { name: "Mocha", scans: 11 },
  { name: "Espresso", scans: 9 },
  { name: "Hot Choco", scans: 7 },
  { name: "Americano", scans: 5 },
];

const barColors = [
  "#92400e",
  "#b45309",
  "#d97706",
  "#f59e0b",
  "#fbbf24",
  "#fcd34d",
];

export function TopDishesChart() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Top Dishes</CardTitle>
        <p className="text-xs text-muted-foreground">
          Most scanned recipes this week
        </p>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
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
              domain={[0, 20]}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={85}
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
              formatter={(value) => [`${value ?? 0} scans`, "Scans"]}
            />
            <Bar dataKey="scans" radius={[0, 8, 8, 0]} barSize={20} label={{
              position: "right",
              fontSize: 12,
              fontWeight: 600,
              fill: "#78716c",
            }}>
              {data.map((_, i) => (
                <Cell key={i} fill={barColors[i % barColors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
