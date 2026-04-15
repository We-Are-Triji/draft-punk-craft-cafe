import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { StockLevelChart } from "@/components/dashboard/StockLevelChart";
import { TopDishesChart } from "@/components/dashboard/TopDishesChart";
import { QuickInsights } from "@/components/dashboard/QuickInsights";

export function DashboardScreen() {
  return (
    <div className="flex flex-col gap-6">
      <WelcomeBanner />
      <StatsCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopDishesChart />
        <StockLevelChart />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Insights</h2>
        <QuickInsights />
      </div>
    </div>
  );
}
