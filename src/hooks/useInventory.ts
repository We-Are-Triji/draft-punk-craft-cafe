import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { InventoryItemRow } from "@/types/inventory";

interface UseInventoryResult {
  items: InventoryItemRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function toNumber(value: unknown, fallbackValue = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return parsed;
}

function mapInventoryRow(row: Record<string, unknown>): InventoryItemRow {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    unit: String(row.unit),
    current_stock: toNumber(row.current_stock, 0),
    reorder_threshold: toNumber(row.reorder_threshold, 0),
    price_amount: toNumber(row.price_amount, 0),
    price_basis_quantity: toNumber(row.price_basis_quantity, 1),
    price_basis_unit: String(row.price_basis_unit ?? row.unit ?? "unit"),
    created_at: String(row.created_at),
  };
}

export function useInventory(): UseInventoryResult {
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    setError(null);

    const { data, error: queryError } = await supabase
      .from("inventory_items")
      .select(
        "id, name, category, unit, current_stock, reorder_threshold, price_amount, price_basis_quantity, price_basis_unit, created_at"
      )
      .order("name", { ascending: true });

    if (queryError) {
      setError(queryError.message);
      return;
    }

    const normalizedRows = (data ?? []).map((row) =>
      mapInventoryRow(row as Record<string, unknown>)
    );

    setItems(normalizedRows);
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

    runInitialFetch();

    const channel: RealtimeChannel = supabase
      .channel("inventory-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_items" },
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
    items,
    loading,
    error,
    refresh,
  };
}
