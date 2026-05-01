import { useCallback, useEffect, useState } from "react";
import {
  listPurchaseRequests,
  type PurchaseRequestRow,
} from "@/lib/purchasingService";

interface UsePurchaseRequestsResult {
  requests: PurchaseRequestRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePurchaseRequests(): UsePurchaseRequestsResult {
  const [requests, setRequests] = useState<PurchaseRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPurchaseRequests();
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load purchase requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { requests, loading, error, refresh };
}
