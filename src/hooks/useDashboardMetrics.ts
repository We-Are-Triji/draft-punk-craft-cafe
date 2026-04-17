import { useMemo } from "react";
import { useInventory } from "@/hooks/useInventory";
import { useScanHistory, type ScanHistoryEvent } from "@/hooks/useScanHistory";
import type { InventoryItemRow } from "@/types/inventory";

type StockStatusLevel = "healthy" | "low" | "critical";

export interface DashboardStockLevelDatum {
  name: string;
  unit: string;
  current_stock: number;
  reorder_threshold: number;
  status: StockStatusLevel;
}

export interface DashboardTopScannedDatum {
  name: string;
  scans: number;
}

export interface DashboardPeakHour {
  label: string;
  count: number;
  share_percent: number;
}

export interface DashboardMetrics {
  low_stock_count: number;
  critical_stock_count: number;
  scans_today: number;
  scans_yesterday: number;
  most_scanned_item_name: string | null;
  most_scanned_item_count: number;
  top_scanned_items: DashboardTopScannedDatum[];
  stock_levels: DashboardStockLevelDatum[];
  lowest_stock_item: DashboardStockLevelDatum | null;
  trending_item: DashboardTopScannedDatum | null;
  peak_scan_hour: DashboardPeakHour | null;
  latest_scan: ScanHistoryEvent | null;
}

interface UseDashboardMetricsResult {
  metrics: DashboardMetrics;
  loading: boolean;
  error: string | null;
}

function toLocalDayStart(value: Date): Date {
  const dayStart = new Date(value);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
}

function classifyStockStatus(item: InventoryItemRow): StockStatusLevel {
  const safeThreshold = Math.max(0, item.reorder_threshold);
  const criticalThreshold =
    safeThreshold === 0 ? 0 : Number((safeThreshold * 0.5).toFixed(3));

  if (item.current_stock <= criticalThreshold) {
    return "critical";
  }

  if (item.current_stock <= safeThreshold) {
    return "low";
  }

  return "healthy";
}

function countScansByItemName(events: ScanHistoryEvent[]): DashboardTopScannedDatum[] {
  const scanCountMap = new Map<string, number>();

  for (const event of events) {
    const normalizedName = event.item_name.trim() || "Unknown Item";

    scanCountMap.set(
      normalizedName,
      (scanCountMap.get(normalizedName) ?? 0) + 1
    );
  }

  return [...scanCountMap.entries()]
    .map(([name, scans]) => ({ name, scans }))
    .sort((left, right) => {
      if (right.scans !== left.scans) {
        return right.scans - left.scans;
      }

      return left.name.localeCompare(right.name);
    });
}

function getPeakScanHour(eventsToday: ScanHistoryEvent[]): DashboardPeakHour | null {
  if (eventsToday.length === 0) {
    return null;
  }

  const hourCounts = new Array<number>(24).fill(0);

  for (const event of eventsToday) {
    const scanDate = new Date(event.created_at);

    if (Number.isNaN(scanDate.getTime())) {
      continue;
    }

    hourCounts[scanDate.getHours()] += 1;
  }

  let bestHour = 0;
  let bestCount = 0;

  for (let hour = 0; hour < hourCounts.length; hour += 1) {
    if (hourCounts[hour] > bestCount) {
      bestHour = hour;
      bestCount = hourCounts[hour];
    }
  }

  if (bestCount === 0) {
    return null;
  }

  const nextHour = (bestHour + 1) % 24;
  const rangeLabel = `${String(bestHour).padStart(2, "0")}:00-${String(nextHour).padStart(2, "0")}:00`;

  return {
    label: rangeLabel,
    count: bestCount,
    share_percent: Math.round((bestCount / eventsToday.length) * 100),
  };
}

function toFallbackMetrics(): DashboardMetrics {
  return {
    low_stock_count: 0,
    critical_stock_count: 0,
    scans_today: 0,
    scans_yesterday: 0,
    most_scanned_item_name: null,
    most_scanned_item_count: 0,
    top_scanned_items: [],
    stock_levels: [],
    lowest_stock_item: null,
    trending_item: null,
    peak_scan_hour: null,
    latest_scan: null,
  };
}

export function useDashboardMetrics(): UseDashboardMetricsResult {
  const {
    items,
    loading: inventoryLoading,
    error: inventoryError,
  } = useInventory();
  const {
    events,
    loading: scanHistoryLoading,
    error: scanHistoryError,
  } = useScanHistory();

  const metrics = useMemo<DashboardMetrics>(() => {
    if (items.length === 0 && events.length === 0) {
      return toFallbackMetrics();
    }

    const now = new Date();
    const todayStart = toLocalDayStart(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);

    const trendingWindowStart = new Date(todayStart);
    trendingWindowStart.setDate(trendingWindowStart.getDate() - 2);

    const scansToday = events.filter((event) => new Date(event.created_at) >= todayStart);
    const scansYesterday = events.filter((event) => {
      const createdAt = new Date(event.created_at);
      return createdAt >= yesterdayStart && createdAt < todayStart;
    });

    const scansThisWeek = events.filter(
      (event) => new Date(event.created_at) >= weekStart
    );
    const topScannedWeek = countScansByItemName(scansThisWeek).slice(0, 6);
    const mostScannedWeek = topScannedWeek[0] ?? null;

    const trendingScans = events.filter(
      (event) => new Date(event.created_at) >= trendingWindowStart
    );
    const trendingItem = countScansByItemName(trendingScans)[0] ?? null;

    const stockLevels = items
      .map((item) => {
        const status = classifyStockStatus(item);
        const safeThreshold = Math.max(0, item.reorder_threshold);
        const coverageRatio =
          safeThreshold === 0
            ? item.current_stock > 0
              ? Number.POSITIVE_INFINITY
              : 0
            : item.current_stock / safeThreshold;

        return {
          name: item.name,
          unit: item.unit,
          current_stock: item.current_stock,
          reorder_threshold: item.reorder_threshold,
          status,
          coverage_ratio: coverageRatio,
        };
      })
      .sort((left, right) => {
        if (left.coverage_ratio !== right.coverage_ratio) {
          return left.coverage_ratio - right.coverage_ratio;
        }

        return left.name.localeCompare(right.name);
      });

    const lowStockCount = stockLevels.filter(
      (stockLevel) => stockLevel.status !== "healthy"
    ).length;
    const criticalStockCount = stockLevels.filter(
      (stockLevel) => stockLevel.status === "critical"
    ).length;

    return {
      low_stock_count: lowStockCount,
      critical_stock_count: criticalStockCount,
      scans_today: scansToday.length,
      scans_yesterday: scansYesterday.length,
      most_scanned_item_name: mostScannedWeek?.name ?? null,
      most_scanned_item_count: mostScannedWeek?.scans ?? 0,
      top_scanned_items: topScannedWeek,
      stock_levels: stockLevels.slice(0, 8),
      lowest_stock_item:
        stockLevels.length > 0
          ? {
              name: stockLevels[0].name,
              unit: stockLevels[0].unit,
              current_stock: stockLevels[0].current_stock,
              reorder_threshold: stockLevels[0].reorder_threshold,
              status: stockLevels[0].status,
            }
          : null,
      trending_item: trendingItem,
      peak_scan_hour: getPeakScanHour(scansToday),
      latest_scan: events[0] ?? null,
    };
  }, [events, items]);

  return {
    metrics,
    loading: inventoryLoading || scanHistoryLoading,
    error: inventoryError ?? scanHistoryError,
  };
}