import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, Clock, Flame } from "lucide-react";
import type {
  DashboardPeakHour,
  DashboardStockLevelDatum,
  DashboardTopTransactionDatum,
} from "@/hooks/useDashboardMetrics";
import type { TransactionOperationWithLines } from "@/types/inventory";

interface QuickInsightsProps {
  loading: boolean;
  lowestStockItem: DashboardStockLevelDatum | null;
  trendingProduct: DashboardTopTransactionDatum | null;
  peakTransactionHour: DashboardPeakHour | null;
  latestTransaction: TransactionOperationWithLines | null;
}

interface InsightItem {
  icon: typeof TrendingDown;
  iconBg: string;
  iconColor: string;
  text: string;
  detail: string;
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(2)));
}

function formatDateTime(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return "recently";
  }

  return parsedDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function QuickInsights({
  loading,
  lowestStockItem,
  trendingProduct,
  peakTransactionHour,
  latestTransaction,
}: QuickInsightsProps) {
  const insights: InsightItem[] = [
    {
      icon: TrendingDown,
      iconBg: "bg-red-50 dark:bg-red-950/40",
      iconColor: "text-red-500",
      text: loading
        ? "Checking inventory levels"
        : lowestStockItem
          ? `${lowestStockItem.name} needs attention`
          : "Inventory is healthy",
      detail: loading
        ? "Loading stock status..."
        : lowestStockItem
          ? `${formatQuantity(lowestStockItem.current_stock)} ${lowestStockItem.unit} left, reorder at ${formatQuantity(lowestStockItem.reorder_threshold)} ${lowestStockItem.unit}`
          : "No ingredient is currently below threshold.",
    },
    {
      icon: Flame,
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600",
      text: loading
        ? "Analyzing transaction trends"
        : trendingProduct
          ? `${trendingProduct.name} is trending`
          : "No trend available yet",
      detail: loading
        ? "Loading transaction activity..."
        : trendingProduct
          ? `${trendingProduct.transactions} transaction(s) over the last 3 days`
          : "Record transactions to unlock trend insights.",
    },
    {
      icon: Clock,
      iconBg: "bg-blue-50 dark:bg-blue-950/40",
      iconColor: "text-blue-500",
      text: loading
        ? "Building transaction timeline"
        : peakTransactionHour
          ? `Peak transaction time: ${peakTransactionHour.label}`
          : latestTransaction
            ? `Latest transaction: ${latestTransaction.product_name ?? "Unassigned"}`
            : "No transaction timeline yet",
      detail: loading
        ? "Loading transaction timeline..."
        : peakTransactionHour
          ? `${peakTransactionHour.count} transaction(s), ${peakTransactionHour.share_percent}% of today's activity`
          : latestTransaction
            ? `Last recorded on ${formatDateTime(latestTransaction.created_at)}`
            : "Your most active transaction hour will appear after transactions are logged.",
    },
  ];

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
