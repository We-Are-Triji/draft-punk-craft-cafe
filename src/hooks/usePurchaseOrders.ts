import { useCallback, useEffect, useState } from "react";
import {
  listPurchaseOrders,
  type PurchaseOrderWithItems,
} from "@/lib/purchasingService";

interface UsePurchaseOrdersResult {
  orders: PurchaseOrderWithItems[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePurchaseOrders(): UsePurchaseOrdersResult {
  const [orders, setOrders] = useState<PurchaseOrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPurchaseOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { orders, loading, error, refresh };
}
