import { Card, CardContent } from "@/components/ui/card";
import { TrendingDown, Clock, Flame } from "lucide-react";
import type {
  DashboardPeakHour,
  DashboardStockLevelDatum,
  DashboardTopScannedDatum,
} from "@/hooks/useDashboardMetrics";
import type { ScanHistoryEvent } from "@/hooks/useScanHistory";

interface QuickInsightsProps {
  loading: boolean;
  lowestStockItem: DashboardStockLevelDatum | null;
  trendingItem: DashboardTopScannedDatum | null;
  peakScanHour: DashboardPeakHour | null;
  latestScan: ScanHistoryEvent | null;
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

function formatScanDateTime(value: string): string {
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
  trendingItem,
  peakScanHour,
  latestScan,
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
        ? "Analyzing scan trends"
        : trendingItem
          ? `${trendingItem.name} is trending`
          : "No trend available yet",
      detail: loading
        ? "Loading scan activity..."
        : trendingItem
          ? `${trendingItem.scans} scan(s) over the last 3 days`
          : "Scan an item to start seeing trend insights.",
    },
    {
      icon: Clock,
      iconBg: "bg-blue-50 dark:bg-blue-950/40",
      iconColor: "text-blue-500",
      text: loading
        ? "Building scan timeline"
        : peakScanHour
          ? `Peak scan time: ${peakScanHour.label}`
          : latestScan
            ? `Latest scan: ${latestScan.item_name}`
            : "No scan timeline yet",
      detail: loading
        ? "Loading scan timeline..."
        : peakScanHour
          ? `${peakScanHour.count} scan(s), ${peakScanHour.share_percent}% of today's activity`
          : latestScan
            ? `Last recorded on ${formatScanDateTime(latestScan.created_at)}`
            : "Your most active scan hour will appear after scans are logged.",
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
