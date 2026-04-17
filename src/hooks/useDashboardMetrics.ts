import { useMemo } from "react";
import { useInventory } from "@/hooks/useInventory";
import { useTransactionOperations } from "@/hooks/useTransactionOperations";
import type { InventoryItemRow } from "@/types/inventory";
import type { TransactionOperationWithLines } from "@/types/inventory";

type StockStatusLevel = "healthy" | "low" | "critical";

export interface DashboardStockLevelDatum {
  name: string;
  unit: string;
  current_stock: number;
  reorder_threshold: number;
  status: StockStatusLevel;
}

export interface DashboardTopTransactionDatum {
  name: string;
  transactions: number;
  quantity: number;
}

export interface DashboardPeakHour {
  label: string;
  count: number;
  share_percent: number;
}

export interface DashboardMetrics {
  low_stock_count: number;
  critical_stock_count: number;
  transactions_today: number;
  transactions_yesterday: number;
  scan_transactions_today: number;
  sale_transactions_today: number;
  top_transaction_product_name: string | null;
  top_transaction_product_count: number;
  top_transaction_products: DashboardTopTransactionDatum[];
  stock_levels: DashboardStockLevelDatum[];
  lowest_stock_item: DashboardStockLevelDatum | null;
  trending_product: DashboardTopTransactionDatum | null;
  peak_transaction_hour: DashboardPeakHour | null;
  latest_transaction: TransactionOperationWithLines | null;
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

function countOperationsByProduct(
  operations: TransactionOperationWithLines[]
): DashboardTopTransactionDatum[] {
  const transactionCountMap = new Map<string, { transactions: number; quantity: number }>();

  for (const operation of operations) {
    const normalizedName = operation.product_name?.trim() || "";

    if (!normalizedName) {
      continue;
    }

    const current = transactionCountMap.get(normalizedName) ?? {
      transactions: 0,
      quantity: 0,
    };

    transactionCountMap.set(normalizedName, {
      transactions: current.transactions + 1,
      quantity: Number((current.quantity + operation.quantity).toFixed(3)),
    });
  }

  return [...transactionCountMap.entries()]
    .map(([name, values]) => ({
      name,
      transactions: values.transactions,
      quantity: values.quantity,
    }))
    .sort((left, right) => {
      if (right.transactions !== left.transactions) {
        return right.transactions - left.transactions;
      }

      if (right.quantity !== left.quantity) {
        return right.quantity - left.quantity;
      }

      return left.name.localeCompare(right.name);
    });
}

function getPeakOperationHour(
  operationsToday: TransactionOperationWithLines[]
): DashboardPeakHour | null {
  if (operationsToday.length === 0) {
    return null;
  }

  const hourCounts = new Array<number>(24).fill(0);

  for (const operation of operationsToday) {
    const operationDate = new Date(operation.created_at);

    if (Number.isNaN(operationDate.getTime())) {
      continue;
    }

    hourCounts[operationDate.getHours()] += 1;
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
    share_percent: Math.round((bestCount / operationsToday.length) * 100),
  };
}

function toFallbackMetrics(): DashboardMetrics {
  return {
    low_stock_count: 0,
    critical_stock_count: 0,
    transactions_today: 0,
    transactions_yesterday: 0,
    scan_transactions_today: 0,
    sale_transactions_today: 0,
    top_transaction_product_name: null,
    top_transaction_product_count: 0,
    top_transaction_products: [],
    stock_levels: [],
    lowest_stock_item: null,
    trending_product: null,
    peak_transaction_hour: null,
    latest_transaction: null,
  };
}

export function useDashboardMetrics(): UseDashboardMetricsResult {
  const {
    items,
    loading: inventoryLoading,
    error: inventoryError,
  } = useInventory();
  const {
    operations,
    loading: operationsLoading,
    error: operationsError,
  } = useTransactionOperations();

  const metrics = useMemo<DashboardMetrics>(() => {
    if (items.length === 0 && operations.length === 0) {
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

    const transactionsToday = operations.filter(
      (operation) => new Date(operation.created_at) >= todayStart
    );
    const transactionsYesterday = operations.filter((operation) => {
      const createdAt = new Date(operation.created_at);
      return createdAt >= yesterdayStart && createdAt < todayStart;
    });

    const transactionsThisWeek = operations.filter(
      (operation) => new Date(operation.created_at) >= weekStart
    );
    const topTransactionsWeek = countOperationsByProduct(transactionsThisWeek).slice(0, 6);
    const topProductWeek = topTransactionsWeek[0] ?? null;

    const trendingTransactions = operations.filter(
      (operation) => new Date(operation.created_at) >= trendingWindowStart
    );
    const trendingProduct = countOperationsByProduct(trendingTransactions)[0] ?? null;

    const scanTransactionsTodayCount = transactionsToday.filter(
      (operation) => operation.operation_type === "scan"
    ).length;
    const saleTransactionsTodayCount = transactionsToday.filter(
      (operation) => operation.operation_type === "sale"
    ).length;

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
      transactions_today: transactionsToday.length,
      transactions_yesterday: transactionsYesterday.length,
      scan_transactions_today: scanTransactionsTodayCount,
      sale_transactions_today: saleTransactionsTodayCount,
      top_transaction_product_name: topProductWeek?.name ?? null,
      top_transaction_product_count: topProductWeek?.transactions ?? 0,
      top_transaction_products: topTransactionsWeek,
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
      trending_product: trendingProduct,
      peak_transaction_hour: getPeakOperationHour(transactionsToday),
      latest_transaction: operations[0] ?? null,
    };
  }, [items, operations]);

  return {
    metrics,
    loading: inventoryLoading || operationsLoading,
    error: inventoryError ?? operationsError,
  };
}