import { Sidebar } from "@/components/layout/Sidebar";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { LowStockAlert } from "@/components/dashboard/LowStockAlert";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { IngredientsTable } from "@/components/dashboard/IngredientsTable";
import { NotificationsPanel } from "@/components/dashboard/NotificationsPanel";

function App() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex gap-6">
          <div className="flex-1 flex flex-col gap-6">
            <WelcomeBanner />
            <LowStockAlert count={1} />
            <StatsCards />
            <IngredientsTable />
          </div>
          <div className="w-72 shrink-0 hidden lg:block">
            <NotificationsPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
