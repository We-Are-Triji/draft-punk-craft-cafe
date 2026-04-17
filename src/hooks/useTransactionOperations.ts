import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { listTransactionOperations } from "@/lib/transactionService";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { TransactionOperationWithLines } from "@/types/inventory";

interface UseTransactionOperationsResult {
  operations: TransactionOperationWithLines[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTransactionOperations(): UseTransactionOperationsResult {
  const [operations, setOperations] = useState<TransactionOperationWithLines[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const rows = await listTransactionOperations();
      setOperations(rows);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to load transactions."
      );
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    const runInitialFetch = async () => {
      if (!isMounted) {
        return;
      }

      await refresh();

      if (isMounted) {
        setLoading(false);
      }
    };

    void runInitialFetch();

    const channel: RealtimeChannel = supabase
      .channel("transaction-operations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transaction_operations" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_transactions" },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return {
    operations,
    loading,
    error,
    refresh,
  };
}
