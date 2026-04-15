import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  CameraIcon,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

interface StatItem {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

const stats: StatItem[] = [
  {
    title: "Low Stock Items",
    value: "3",
    subtitle: "+1 since yesterday",
    icon: AlertTriangle,
    iconBg: "bg-red-50 dark:bg-red-950/40",
    iconColor: "text-red-500",
  },
  {
    title: "Scans Today",
    value: "47",
    subtitle: "+12% vs last week",
    icon: CameraIcon,
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    iconColor: "text-blue-500",
  },
  {
    title: "Most Scanned Dish",
    value: "Latte",
    subtitle: "18 scans today",
    icon: UtensilsCrossed,
    iconBg: "bg-amber-50 dark:bg-amber-950/40",
    iconColor: "text-amber-700",
  },
];

export function StatsCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="hover:shadow-md transition-shadow">
          <CardContent className="flex items-center gap-4 p-5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${stat.iconBg}`}
            >
              <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {stat.title}
              </p>
              <p className="text-2xl font-bold text-foreground leading-tight mt-0.5">
                {stat.value}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stat.subtitle}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
