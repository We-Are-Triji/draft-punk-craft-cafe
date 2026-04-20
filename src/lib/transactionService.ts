import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  CreateSaleTransactionInput,
  OperationType,
  TransactionOperationLineRow,
  TransactionOperationRow,
  TransactionOperationWithLines,
  TransactionType,
} from "@/types/inventory";

function toNumber(value: unknown, fallbackValue = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return parsed;
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return String((error as { code?: unknown }).code ?? "") === expectedCode;
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  return String((error as { message?: unknown }).message ?? "");
}

function isMissingRelationError(error: unknown, relationName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const normalizedRelationName = relationName.toLowerCase();

  return (
    hasErrorCode(error, "42P01") ||
    (message.includes(normalizedRelationName) && message.includes("does not exist"))
  );
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const normalizedColumnName = columnName.toLowerCase();

  return (
    hasErrorCode(error, "42703") ||
    (message.includes(normalizedColumnName) && message.includes("does not exist"))
  );
}

function isMissingFunctionError(error: unknown, functionName: string): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const normalizedFunctionName = functionName.toLowerCase();

  return (
    hasErrorCode(error, "42883") ||
    (message.includes(normalizedFunctionName) && message.includes("does not exist"))
  );
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toOperationType(value: unknown): OperationType {
  const normalizedValue = String(value);

  if (
    normalizedValue === "sale" ||
    normalizedValue === "scan" ||
    normalizedValue === "manual_stock_in" ||
    normalizedValue === "manual_stock_out" ||
    normalizedValue === "adjustment"
  ) {
    return normalizedValue;
  }

  return "adjustment";
}

function toTransactionType(value: unknown): TransactionType {
  const normalizedValue = String(value);

  if (
    normalizedValue === "stock_in" ||
    normalizedValue === "stock_out" ||
    normalizedValue === "sample" ||
    normalizedValue === "wastage"
  ) {
    return normalizedValue;
  }

  return "stock_out";
}

function getInventoryRelation(
  value: unknown
): { name: string; unit: string } | null {
  if (Array.isArray(value)) {
    const firstEntry = value[0];

    if (firstEntry && typeof firstEntry === "object") {
      return {
        name: String((firstEntry as Record<string, unknown>).name ?? "Unknown Item"),
        unit: String((firstEntry as Record<string, unknown>).unit ?? "pcs"),
      };
    }

    return null;
  }

  if (value && typeof value === "object") {
    const relationRow = value as Record<string, unknown>;

    return {
      name: String(relationRow.name ?? "Unknown Item"),
      unit: String(relationRow.unit ?? "pcs"),
    };
  }

  return null;
}

function mapOperationRow(row: Record<string, unknown>): TransactionOperationRow {
  return {
    id: String(row.id),
    operation_type: toOperationType(row.operation_type),
    product_id: row.product_id ? String(row.product_id) : null,
    product_name: row.product_name ? String(row.product_name) : null,
    quantity: toNumber(row.quantity, 0),
    unit_price: row.unit_price === null || row.unit_price === undefined
      ? null
      : toNumber(row.unit_price, 0),
    total_amount: row.total_amount === null || row.total_amount === undefined
      ? null
      : toNumber(row.total_amount, 0),
    notes: row.notes ? String(row.notes) : null,
    metadata: toObject(row.metadata),
    created_at: String(row.created_at),
  };
}

function mapOperationLineRow(
  row: Record<string, unknown>
): TransactionOperationLineRow {
  const relation = getInventoryRelation(row.inventory_items);

  return {
    id: String(row.id),
    operation_id: String(row.operation_id),
    item_id: String(row.item_id),
    item_name: relation?.name ?? "Unknown Item",
    item_unit: relation?.unit ?? "pcs",
    transaction_type: toTransactionType(row.transaction_type),
    quantity: toNumber(row.quantity, 0),
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
  };
}

function mapLegacyOperationLineRow(
  row: Record<string, unknown>,
  operationId: string
): TransactionOperationLineRow {
  const relation = getInventoryRelation(row.inventory_items);

  return {
    id: String(row.id),
    operation_id: operationId,
    item_id: String(row.item_id),
    item_name: relation?.name ?? "Unknown Item",
    item_unit: relation?.unit ?? "pcs",
    transaction_type: toTransactionType(row.transaction_type),
    quantity: toNumber(row.quantity, 0),
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
  };
}

function extractDetectedItemName(notes: string | null): string {
  if (!notes || !notes.trim()) {
    return "Unknown Item";
  }

  const matchedDetectedPrefix = notes.match(/Detected dish\/item:\s*(.+)$/im);

  if (matchedDetectedPrefix && matchedDetectedPrefix[1]) {
    return matchedDetectedPrefix[1].trim();
  }

  const matchedConfirmationPrefix = notes.match(/confirmation for\s+(.+)$/im);

  if (matchedConfirmationPrefix && matchedConfirmationPrefix[1]) {
    return matchedConfirmationPrefix[1].trim();
  }

  return notes.trim();
}

function buildLegacyScanKey(row: Record<string, unknown>, itemName: string): string {
  const imageUrl = row.image_url ? String(row.image_url).trim() : "";

  if (imageUrl) {
    return `legacy-scan:${imageUrl}`;
  }

  const createdAt = new Date(String(row.created_at));

  if (Number.isNaN(createdAt.getTime())) {
    return `legacy-fallback:${itemName.toLowerCase()}|${String(row.created_at)}`;
  }

  const secondBucket = new Date(createdAt);
  secondBucket.setMilliseconds(0);

  return `legacy-fallback:${itemName.toLowerCase()}|${secondBucket.toISOString()}`;
}

export async function listTransactionOperations(
  limit = 400
): Promise<TransactionOperationWithLines[]> {
  const supabase = getSupabaseClient();

  const { data: operationRows, error: operationsError } = await supabase
    .from("transaction_operations")
    .select(
      "id, operation_type, product_id, product_name, quantity, unit_price, total_amount, notes, metadata, created_at"
    )
    .in("operation_type", ["sale", "scan"])
    .order("created_at", { ascending: false })
    .limit(limit);

  const supportsOperationHeaders = !operationsError;

  if (
    operationsError &&
    !isMissingRelationError(operationsError, "transaction_operations")
  ) {
    throw new Error(`Failed to load transactions: ${operationsError.message}`);
  }

  const operations = supportsOperationHeaders
    ? (operationRows ?? []).map((row) =>
        mapOperationRow(row as Record<string, unknown>)
      )
    : [];

  const operationIds = operations.map((operation) => operation.id);

  const linesByOperation = new Map<string, TransactionOperationLineRow[]>();

  if (operationIds.length > 0) {
    const { data: lineRows, error: linesError } = await supabase
      .from("stock_transactions")
      .select(
        "id, operation_id, item_id, transaction_type, quantity, notes, created_at, inventory_items(name, unit)"
      )
      .in("operation_id", operationIds)
      .order("created_at", { ascending: false });

    if (linesError) {
      if (!isMissingColumnError(linesError, "operation_id")) {
        throw new Error(`Failed to load transaction lines: ${linesError.message}`);
      }
    } else {
      for (const lineRow of lineRows ?? []) {
        const line = mapOperationLineRow(lineRow as Record<string, unknown>);
        const bucket = linesByOperation.get(line.operation_id) ?? [];
        bucket.push(line);
        linesByOperation.set(line.operation_id, bucket);
      }
    }
  }

  const { data: legacyScanRowsWithOperationId, error: legacyScanError } = await supabase
    .from("stock_transactions")
    .select(
      "id, operation_id, item_id, transaction_type, quantity, notes, created_at, image_url, inventory_items(name, unit)"
    )
    .is("operation_id", null)
    .eq("detected_by_ai", true)
    .eq("transaction_type", "stock_out")
    .order("created_at", { ascending: false })
    .limit(1500);

  let legacyScanRows = (legacyScanRowsWithOperationId ?? []) as Record<
    string,
    unknown
  >[];

  if (legacyScanError) {
    if (!isMissingColumnError(legacyScanError, "operation_id")) {
      throw new Error(
        `Failed to load legacy scan transactions: ${legacyScanError.message}`
      );
    }

    const { data: legacyScanRowsWithoutOperationId, error: fallbackLegacyError } =
      await supabase
        .from("stock_transactions")
        .select(
          "id, item_id, transaction_type, quantity, notes, created_at, image_url, inventory_items(name, unit)"
        )
        .eq("detected_by_ai", true)
        .eq("transaction_type", "stock_out")
        .order("created_at", { ascending: false })
        .limit(1500);

    if (fallbackLegacyError) {
      throw new Error(
        `Failed to load legacy scan transactions: ${fallbackLegacyError.message}`
      );
    }

    legacyScanRows = (legacyScanRowsWithoutOperationId ?? []) as Record<
      string,
      unknown
    >[];
  }

  const legacyOperationMap = new Map<string, TransactionOperationWithLines>();

  for (const legacyRow of legacyScanRows) {
    const notes = legacyRow.notes ? String(legacyRow.notes) : null;
    const itemName = extractDetectedItemName(notes);
    const operationId = buildLegacyScanKey(legacyRow, itemName);
    const legacyLine = mapLegacyOperationLineRow(legacyRow, operationId);
    const existingLegacyOperation = legacyOperationMap.get(operationId);

    if (existingLegacyOperation) {
      existingLegacyOperation.lines.push(legacyLine);

      if (
        new Date(legacyLine.created_at).getTime() >
        new Date(existingLegacyOperation.created_at).getTime()
      ) {
        existingLegacyOperation.created_at = legacyLine.created_at;
      }

      continue;
    }

    legacyOperationMap.set(operationId, {
      id: operationId,
      operation_type: "scan",
      product_id: null,
      product_name: itemName,
      quantity: 1,
      unit_price: null,
      total_amount: null,
      notes,
      metadata: {
        source: "legacy_scan",
      },
      created_at: legacyLine.created_at,
      lines: [legacyLine],
    });
  }

  const mappedOperations = operations.map((operation) => ({
    ...operation,
    lines: linesByOperation.get(operation.id) ?? [],
  }));

  const allOperations = [
    ...mappedOperations.filter((operation) => {
      if (operation.operation_type === "sale") {
        return true;
      }

      if (operation.operation_type !== "scan") {
        return false;
      }

      return operation.lines.some(
        (line) => line.transaction_type === "stock_out"
      );
    }),
    ...legacyOperationMap.values(),
  ];

  allOperations.sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );

  return allOperations;
}

export async function createSaleTransaction(
  input: CreateSaleTransactionInput
): Promise<string> {
  const normalizedQuantity = toNumber(input.quantity, 0);

  if (normalizedQuantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  const normalizedProductId = input.product_id.trim();

  if (!normalizedProductId) {
    throw new Error("Product is required.");
  }

  const normalizedUnitPrice =
    input.unit_price === null || input.unit_price === undefined
      ? null
      : toNumber(input.unit_price, 0);

  if (normalizedUnitPrice !== null && normalizedUnitPrice < 0) {
    throw new Error("Unit price cannot be negative.");
  }

  const normalizedNotes = input.notes?.trim() || null;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("create_sale_operation", {
    p_product_id: normalizedProductId,
    p_quantity: normalizedQuantity,
    p_unit_price: normalizedUnitPrice,
    p_notes: normalizedNotes,
  });

  if (error) {
    if (isMissingFunctionError(error, "create_sale_operation")) {
      throw new Error(
        "Sale transaction failed because database migration is not applied yet. Apply the latest Supabase migrations and retry."
      );
    }

    throw new Error(`Sale transaction failed: ${error.message}`);
  }

  return String(data);
}
