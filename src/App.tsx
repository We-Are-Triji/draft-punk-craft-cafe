import { useState } from "react";
import { Sidebar, type Tab } from "@/components/layout/Sidebar";
import { ScanScreen } from "@/components/ScanScreen";
import { DashboardScreen } from "@/components/DashboardScreen";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("scan");

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-6 overflow-auto">
        {activeTab === "scan" && <ScanScreen />}
        {activeTab === "dashboard" && <DashboardScreen />}
      </main>
    </div>
  );
}

export default App;
