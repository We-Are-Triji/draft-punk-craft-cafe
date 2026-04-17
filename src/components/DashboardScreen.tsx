import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { QuickShortcuts } from "@/components/dashboard/QuickShortcuts";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StockLevelChart } from "@/components/dashboard/StockLevelChart";
import { TopDishesChart } from "@/components/dashboard/TopDishesChart";
import { QuickInsights } from "@/components/dashboard/QuickInsights";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import type { Tab } from "@/components/layout/Sidebar";

interface DashboardScreenProps {
  onNavigate?: (tab: Tab) => void;
}

export function DashboardScreen({ onNavigate }: DashboardScreenProps) {
  const { metrics, loading, error } = useDashboardMetrics();

  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner />
      <QuickShortcuts onNavigate={onNavigate} />

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <StatsCards
        loading={loading}
        lowStockCount={metrics.low_stock_count}
        criticalStockCount={metrics.critical_stock_count}
        transactionsToday={metrics.transactions_today}
        transactionsYesterday={metrics.transactions_yesterday}
        scanTransactionsToday={metrics.scan_transactions_today}
        saleTransactionsToday={metrics.sale_transactions_today}
        topProductName={metrics.top_transaction_product_name}
        topProductCount={metrics.top_transaction_product_count}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopDishesChart data={metrics.top_transaction_products} loading={loading} />
        <StockLevelChart data={metrics.stock_levels} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Insights</h2>
        <QuickInsights
          loading={loading}
          lowestStockItem={metrics.lowest_stock_item}
          trendingProduct={metrics.trending_product}
          peakTransactionHour={metrics.peak_transaction_hour}
          latestTransaction={metrics.latest_transaction}
        />
      </div>
    </div>
  );
}
