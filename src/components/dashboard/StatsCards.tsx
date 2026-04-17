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
  transactionsToday: number;
  transactionsYesterday: number;
  scanTransactionsToday: number;
  saleTransactionsToday: number;
  topProductName: string | null;
  topProductCount: number;
}

function toTransactionDeltaText(
  transactionsToday: number,
  transactionsYesterday: number
): string {
  if (transactionsToday === 0 && transactionsYesterday === 0) {
    return "No transactions yet today";
  }

  if (transactionsYesterday === 0) {
    return "First recorded transactions today";
  }

  const percentDelta = Math.round(
    ((transactionsToday - transactionsYesterday) / transactionsYesterday) * 100
  );
  const prefix = percentDelta > 0 ? "+" : "";

  return `${prefix}${percentDelta}% vs yesterday`;
}

export function StatsCards({
  loading,
  lowStockCount,
  criticalStockCount,
  transactionsToday,
  transactionsYesterday,
  scanTransactionsToday,
  saleTransactionsToday,
  topProductName,
  topProductCount,
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
      title: "Transactions Today",
      value: loading ? "--" : String(transactionsToday),
      subtitle: loading
        ? "Loading transaction history..."
        : `${saleTransactionsToday} sale(s), ${scanTransactionsToday} scan(s)`,
      icon: CameraIcon,
      iconBg: "bg-blue-50 dark:bg-blue-950/40",
      iconColor: "text-blue-500",
    },
    {
      title: "Top Product",
      value: loading
        ? "--"
        : topProductName && topProductName.length > 0
          ? topProductName
          : "No transactions yet",
      subtitle: loading
        ? "Loading trend data..."
        : topProductCount > 0
          ? `${topProductCount} transactions in the last 7 days`
          : toTransactionDeltaText(transactionsToday, transactionsYesterday),
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
