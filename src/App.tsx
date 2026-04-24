import { useEffect, useState } from "react";
import { Sidebar, type Tab } from "@/components/layout/Sidebar";
import { DashboardScreen } from "@/components/DashboardScreen";
import { LoginScreen } from "@/components/LoginScreen";
import { InventoryScreen } from "@/components/InventoryScreen";
import { RecipesScreen } from "@/components/RecipesScreen";
import { TransactionsScreen } from "@/components/TransactionsScreen";
import type { QuickShortcutAction } from "@/components/dashboard/QuickShortcuts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingStockInAiRequestId, setPendingStockInAiRequestId] = useState<string | null>(null);
  const [pendingStockOutAiRequestId, setPendingStockOutAiRequestId] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const supabase = getSupabaseClient();
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setLoggedIn(false);
      } else {
        setLoggedIn(Boolean(data.session));
      }
      setAuthReady(true);
    };
    void checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    if (isSigningOut) return;
    setIsSigningOut(true);
    const supabase = getSupabaseClient();
    try {
      await supabase.auth.signOut({ scope: "global" });
      setLoggedIn(false);
    } catch (error) {
      console.error("Failed to sign out:", error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
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
    <div className="flex min-h-screen bg-background flex-col md:flex-row">
      <div className="hidden md:block">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onLogout={handleLogout}
          isLoggingOut={isSigningOut}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          <div className="flex justify-end p-4">
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)}>
              <X className="w-6 h-6" />
            </Button>
          </div>
          <Sidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onLogout={handleLogout}
            isLoggingOut={isSigningOut}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        </div>
      )}

      <main className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-4 md:hidden border-b pb-4">
          <h1 className="font-bold text-lg capitalize">{activeTab}</h1>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="w-6 h-6" />
          </Button>
        </div>

        <div className="w-full max-w-6xl mx-auto">
          {activeTab === "dashboard" && (
            <DashboardScreen
              onNavigate={handleTabChange}
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
        </div>
      </main>
    </div>
  );
}

export default App;