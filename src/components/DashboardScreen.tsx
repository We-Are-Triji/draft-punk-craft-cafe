import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StockLevelChart } from "@/components/dashboard/StockLevelChart";
import { TopDishesChart } from "@/components/dashboard/TopDishesChart";
import { QuickInsights } from "@/components/dashboard/QuickInsights";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

export function DashboardScreen() {
  const { metrics, loading, error } = useDashboardMetrics();

  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner />

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <StatsCards
        loading={loading}
        lowStockCount={metrics.low_stock_count}
        criticalStockCount={metrics.critical_stock_count}
        scansToday={metrics.scans_today}
        scansYesterday={metrics.scans_yesterday}
        mostScannedItemName={metrics.most_scanned_item_name}
        mostScannedItemCount={metrics.most_scanned_item_count}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopDishesChart data={metrics.top_scanned_items} loading={loading} />
        <StockLevelChart data={metrics.stock_levels} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Insights</h2>
        <QuickInsights
          loading={loading}
          lowestStockItem={metrics.lowest_stock_item}
          trendingItem={metrics.trending_item}
          peakScanHour={metrics.peak_scan_hour}
          latestScan={metrics.latest_scan}
        />
      </div>
    </div>
  );
}
