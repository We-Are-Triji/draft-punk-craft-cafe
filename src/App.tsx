import { useState } from "react";
import { Sidebar, type Tab } from "@/components/layout/Sidebar";
import { ScanScreen } from "@/components/ScanScreen";
import { DashboardScreen } from "@/components/DashboardScreen";
import { LoginScreen } from "@/components/LoginScreen";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("scan");

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

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
