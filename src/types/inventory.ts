export type ConfidenceLevel = "high" | "medium" | "low";

export type TransactionType = "stock_in" | "stock_out" | "sample" | "wastage";

export type OperationType =
  | "sale"
  | "scan"
  | "manual_stock_in"
  | "manual_stock_out"
  | "adjustment";

export interface IngredientDeduction {
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
}

export interface CachedImageResult {
  image_hash: string;
  item_name: string;
  category: string;
  confidence: ConfidenceLevel;
  quantity_estimate: number;
  unit: string;
}

export interface ScanDetectionResult extends CachedImageResult {
  source: "cache" | "gemini";
  ingredients_to_deduct: IngredientDeduction[];
}

export interface InventoryItemRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  reorder_threshold: number;
  price_amount: number;
  price_basis_quantity: number;
  price_basis_unit: string;
  created_at: string;
}

export interface StockTransactionRow {
  id: string;
  operation_id: string | null;
  item_id: string;
  transaction_type: TransactionType;
  quantity: number;
  image_url: string | null;
  detected_by_ai: boolean;
  notes: string | null;
  created_at: string;
}

export interface TransactionOperationRow {
  id: string;
  operation_type: OperationType;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TransactionOperationLineRow {
  id: string;
  operation_id: string;
  item_id: string;
  item_name: string;
  item_unit: string;
  transaction_type: TransactionType;
  quantity: number;
  notes: string | null;
  created_at: string;
}

export interface TransactionOperationWithLines extends TransactionOperationRow {
  lines: TransactionOperationLineRow[];
}

export interface CreateSaleTransactionInput {
  product_id: string;
  quantity: number;
  unit_price?: number | null;
  notes?: string | null;
}

export interface ConfirmDeductionLine {
  item_name: string;
  unit: string;
  quantity: number;
}

export interface ConfirmDeductionResult {
  deductionsApplied: number;
  transactionIds: string[];
  appliedLines: ConfirmDeductionLine[];
}
