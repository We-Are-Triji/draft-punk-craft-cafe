import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { listProductsWithIngredients } from "@/lib/recipesService";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { ProductWithIngredients } from "@/types/recipes";

interface UseProductsResult {
  products: ProductWithIngredients[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProducts(): UseProductsResult {
  const [products, setProducts] = useState<ProductWithIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const rows = await listProductsWithIngredients();
      setProducts(rows);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to load products."
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
      .channel("products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_ingredients" },
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
    products,
    loading,
    error,
    refresh,
  };
}
