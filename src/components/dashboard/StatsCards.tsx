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

interface StatsCardsProps {
  loading: boolean;
  lowStockCount: number;
  criticalStockCount: number;
  scansToday: number;
  scansYesterday: number;
  mostScannedItemName: string | null;
  mostScannedItemCount: number;
}

function toScanDeltaText(scansToday: number, scansYesterday: number): string {
  if (scansToday === 0 && scansYesterday === 0) {
    return "No scans yet today";
  }

  if (scansYesterday === 0) {
    return "First scan activity recorded today";
  }

  const percentDelta = Math.round(
    ((scansToday - scansYesterday) / scansYesterday) * 100
  );
  const prefix = percentDelta > 0 ? "+" : "";

  return `${prefix}${percentDelta}% vs yesterday`;
}

export function StatsCards({
  loading,
  lowStockCount,
  criticalStockCount,
  scansToday,
  scansYesterday,
  mostScannedItemName,
  mostScannedItemCount,
}: StatsCardsProps) {
  const stats: StatItem[] = [
    {
      title: "Low Stock Items",
      value: loading ? "--" : String(lowStockCount),
      subtitle: loading
        ? "Loading stock status..."
        : criticalStockCount > 0
          ? `${criticalStockCount} critical item(s)`
          : "No critical stock issues",
      icon: AlertTriangle,
      iconBg: "bg-red-50 dark:bg-red-950/40",
      iconColor: "text-red-500",
    },
    {
      title: "Scans Today",
      value: loading ? "--" : String(scansToday),
      subtitle: loading
        ? "Loading scan history..."
        : toScanDeltaText(scansToday, scansYesterday),
      icon: CameraIcon,
      iconBg: "bg-blue-50 dark:bg-blue-950/40",
      iconColor: "text-blue-500",
    },
    {
      title: "Most Scanned Item",
      value: loading
        ? "--"
        : mostScannedItemName && mostScannedItemName.length > 0
          ? mostScannedItemName
          : "No scans yet",
      subtitle: loading
        ? "Loading trend data..."
        : mostScannedItemCount > 0
          ? `${mostScannedItemCount} scans in the last 7 days`
          : "Waiting for scanned history",
      icon: UtensilsCrossed,
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-700",
    },
  ];

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
