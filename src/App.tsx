import { useEffect, useState } from "react";
import { Sidebar, type Tab } from "@/components/layout/Sidebar";
import { DashboardScreen } from "@/components/DashboardScreen";
import { LoginScreen } from "@/components/LoginScreen";
import { InventoryScreen } from "@/components/InventoryScreen";
import { RecipesScreen } from "@/components/RecipesScreen";
import { TransactionsScreen } from "@/components/TransactionsScreen";
import { getSupabaseClient } from "@/lib/supabaseClient";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();

    const extractUserInfo = (session: { user: { email?: string; user_metadata?: Record<string, unknown> } } | null) => {
      if (!session) {
        setUserName("");
        setUserEmail("");
        return;
      }
      setUserEmail(session.user.email ?? "");
      const meta = session.user.user_metadata;
      const name = (meta?.full_name ?? meta?.name ?? "") as string;
      setUserName(name);
    };

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Failed to read auth session:", error.message);
        setLoggedIn(false);
      } else {
        setLoggedIn(Boolean(data.session));
        extractUserInfo(data.session);
      }

      setAuthReady(true);
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
      extractUserInfo(session);
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
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} userName={userName} userEmail={userEmail} />
      <main className="flex-1 p-6 overflow-auto">
        {activeTab === "dashboard" && <DashboardScreen onNavigate={setActiveTab} />}
        {activeTab === "inventory" && <InventoryScreen />}
        {activeTab === "transactions" && <TransactionsScreen />}
        {activeTab === "recipes" && <RecipesScreen />}
      </main>
    </div>
  );
}

export default App;
