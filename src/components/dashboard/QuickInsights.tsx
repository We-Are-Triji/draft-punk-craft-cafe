import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, Clock, Flame } from "lucide-react";

const insights = [
  {
    icon: TrendingDown,
    iconBg: "bg-red-50 dark:bg-red-950/40",
    iconColor: "text-red-500",
    text: "Milk is running low",
    detail: "Only 0.94 L left — restock recommended",
  },
  {
    icon: Flame,
    iconBg: "bg-amber-50 dark:bg-amber-950/40",
    iconColor: "text-amber-600",
    text: "Latte is trending",
    detail: "Most scanned dish 3 days in a row",
  },
  {
    icon: Clock,
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    iconColor: "text-blue-500",
    text: "Peak scan time: 9–11 AM",
    detail: "62% of today's scans happened in the morning",
  },
];

export function QuickInsights() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {insights.map((item) => (
        <Card key={item.text} className="hover:shadow-md transition-shadow">
          <CardContent className="flex items-start gap-3 p-4">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${item.iconBg}`}
            >
              <item.icon className={`w-4 h-4 ${item.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">
                {item.text}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {item.detail}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
