import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const weekData = [
  { day: "Mon", milk: 4.2, coffee: 8.1, sugar: 12.0, choco: 6.5 },
  { day: "Tue", milk: 3.8, coffee: 7.5, sugar: 11.2, choco: 6.0 },
  { day: "Wed", milk: 3.1, coffee: 6.9, sugar: 10.5, choco: 5.3 },
  { day: "Thu", milk: 2.5, coffee: 6.2, sugar: 9.8, choco: 4.8 },
  { day: "Fri", milk: 1.8, coffee: 5.5, sugar: 9.0, choco: 4.2 },
  { day: "Sat", milk: 1.2, coffee: 4.8, sugar: 8.2, choco: 3.9 },
  { day: "Sun", milk: 0.9, coffee: 4.1, sugar: 7.5, choco: 3.5 },
];

const monthData = [
  { day: "Wk 1", milk: 5.0, coffee: 9.0, sugar: 14.0, choco: 8.0 },
  { day: "Wk 2", milk: 4.2, coffee: 8.1, sugar: 12.0, choco: 6.5 },
  { day: "Wk 3", milk: 2.5, coffee: 6.2, sugar: 9.8, choco: 4.8 },
  { day: "Wk 4", milk: 0.9, coffee: 4.1, sugar: 7.5, choco: 3.5 },
];

const lines = [
  { key: "milk", color: "#3b82f6", label: "Milk (L)" },
  { key: "coffee", color: "#92400e", label: "Coffee (kg)" },
  { key: "sugar", color: "#a855f7", label: "Sugar (kg)" },
  { key: "choco", color: "#f59e0b", label: "Choco (kg)" },
];

type Range = "week" | "month";

export function StockLevelChart() {
  const [range, setRange] = useState<Range>("week");
  const data = range === "week" ? weekData : monthData;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Stock Levels</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ingredient quantities over time
          </p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["week", "month"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                range === r
                  ? "bg-amber-800 text-white"
                  : "bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <div className="flex items-center gap-5 mb-5 flex-wrap">
          {lines.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              {lines.map((l) => (
                <linearGradient
                  key={l.key}
                  id={`fill-${l.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={l.color} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={l.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={30}
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
              itemStyle={{ padding: 0 }}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            />
            {lines.map((l) => (
              <Area
                key={l.key}
                type="monotone"
                dataKey={l.key}
                stroke={l.color}
                strokeWidth={2.5}
                fill={`url(#fill-${l.key})`}
                dot={false}
                activeDot={{
                  r: 5,
                  fill: l.color,
                  strokeWidth: 2,
                  stroke: "#fff",
                }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
