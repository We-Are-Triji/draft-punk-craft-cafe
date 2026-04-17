import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";

interface StockTransactionScanRow {
  id: string;
  image_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface ScanHistoryEvent {
  event_id: string;
  item_name: string;
  created_at: string;
  transaction_ids: string[];
}

interface UseScanHistoryResult {
  events: ScanHistoryEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function toStringValue(value: unknown, fallbackValue = ""): string {
  if (typeof value === "string") {
    return value;
  }

  return fallbackValue;
}

function mapScanRow(row: Record<string, unknown>): StockTransactionScanRow {
  return {
    id: toStringValue(row.id),
    image_url: row.image_url ? toStringValue(row.image_url) : null,
    notes: row.notes ? toStringValue(row.notes) : null,
    created_at: toStringValue(row.created_at),
  };
}

function extractScannedItemName(notes: string | null): string {
  if (!notes) {
    return "Unknown Item";
  }

  const normalizedNotes = notes.trim();

  if (!normalizedNotes) {
    return "Unknown Item";
  }

  const matchedDetectedPrefix = normalizedNotes.match(/Detected dish\/item:\s*(.+)$/im);

  if (matchedDetectedPrefix && matchedDetectedPrefix[1]) {
    return matchedDetectedPrefix[1].trim();
  }

  const matchedConfirmationPrefix = normalizedNotes.match(/confirmation for\s+(.+)$/im);

  if (matchedConfirmationPrefix && matchedConfirmationPrefix[1]) {
    return matchedConfirmationPrefix[1].trim();
  }

  return normalizedNotes;
}

function buildScanEventKey(row: StockTransactionScanRow, itemName: string): string {
  const imageUrl = row.image_url?.trim();

  if (imageUrl) {
    return `img:${imageUrl}`;
  }

  const createdAt = new Date(row.created_at);

  if (!Number.isNaN(createdAt.getTime())) {
    const secondBucket = new Date(createdAt);
    secondBucket.setMilliseconds(0);

    return `fallback:${itemName.toLowerCase()}|${secondBucket.toISOString()}`;
  }

  return `fallback:${itemName.toLowerCase()}|${row.created_at}`;
}

function dedupeScanRows(rows: StockTransactionScanRow[]): ScanHistoryEvent[] {
  const bucket = new Map<string, ScanHistoryEvent>();

  for (const row of rows) {
    const itemName = extractScannedItemName(row.notes);
    const eventKey = buildScanEventKey(row, itemName);
    const existingEvent = bucket.get(eventKey);

    if (existingEvent) {
      existingEvent.transaction_ids.push(row.id);
      continue;
    }

    bucket.set(eventKey, {
      event_id: eventKey,
      item_name: itemName,
      created_at: row.created_at,
      transaction_ids: [row.id],
    });
  }

  return [...bucket.values()].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

export function useScanHistory(): UseScanHistoryResult {
  const [events, setEvents] = useState<ScanHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    setError(null);

    const { data, error: queryError } = await supabase
      .from("stock_transactions")
      .select("id, image_url, notes, created_at")
      .eq("detected_by_ai", true)
      .order("created_at", { ascending: false })
      .limit(1500);

    if (queryError) {
      setError(queryError.message);
      return;
    }

    const normalizedRows = (data ?? []).map((row) =>
      mapScanRow(row as Record<string, unknown>)
    );
    const dedupedEvents = dedupeScanRows(normalizedRows);

    setEvents(dedupedEvents);
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
      .channel("scan-history-realtime")
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
    events,
    loading,
    error,
    refresh,
  };
}