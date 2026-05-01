import { useEffect, useState } from "react";
import { Sidebar, type Tab } from "@/components/layout/Sidebar";
import { DashboardScreen } from "@/components/DashboardScreen";
import { LoginScreen } from "@/components/LoginScreen";
import { InventoryScreen } from "@/components/InventoryScreen";
import { RecipesScreen } from "@/components/RecipesScreen";
import { TransactionsScreen } from "@/components/TransactionsScreen";
import { PurchaseOrdersScreen } from "@/components/PurchaseOrdersScreen";
import { PurchaseRequestsScreen } from "@/components/PurchaseRequestsScreen";
import type { QuickShortcutAction } from "@/components/dashboard/QuickShortcuts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useTheme } from "@/hooks/useTheme";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [pendingStockInAiRequestId, setPendingStockInAiRequestId] = useState<string | null>(null);
  const [pendingStockOutAiRequestId, setPendingStockOutAiRequestId] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const supabase = getSupabaseClient();

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Failed to read auth session:", error.message);
        setLoggedIn(false);
      } else {
        setLoggedIn(Boolean(data.session));
      }

      setAuthReady(true);
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Checking session...
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    const supabase = getSupabaseClient();

    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });

      if (signOutError) {
        throw signOutError;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      setLoggedIn(Boolean(sessionData.session));
    } catch (error) {
      console.error("Failed to sign out:", error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const createShortcutRequestId = (): string =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleDashboardShortcutAction = (action: QuickShortcutAction) => {
    if (action === "open-stock-in-ai") {
      setPendingStockInAiRequestId(createShortcutRequestId());
      setActiveTab("inventory");
      return;
    }

    setPendingStockOutAiRequestId(createShortcutRequestId());
    setActiveTab("transactions");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        isLoggingOut={isSigningOut}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 p-6 overflow-auto">
        {activeTab === "dashboard" && (
          <DashboardScreen
            onNavigate={setActiveTab}
            onShortcutAction={handleDashboardShortcutAction}
          />
        )}
        {activeTab === "inventory" && (
          <InventoryScreen
            autoOpenStockInAiRequestId={pendingStockInAiRequestId}
            onAutoOpenStockInAiHandled={() => setPendingStockInAiRequestId(null)}
          />
        )}
        {activeTab === "transactions" && (
          <TransactionsScreen
            autoOpenStockOutAiRequestId={pendingStockOutAiRequestId}
            onAutoOpenStockOutAiHandled={() => setPendingStockOutAiRequestId(null)}
          />
        )}
        {activeTab === "recipes" && <RecipesScreen />}
        {activeTab === "purchasing-orders" && <PurchaseOrdersScreen />}
        {activeTab === "purchasing-requests" && <PurchaseRequestsScreen />}
      </main>
    </div>
  );
}

export default App;
