export type ConfidenceLevel = "high" | "medium" | "low";

export type TransactionType = "stock_in" | "stock_out" | "sample" | "wastage";

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
  created_at: string;
}

export interface StockTransactionRow {
  id: string;
  item_id: string;
  transaction_type: TransactionType;
  quantity: number;
  image_url: string | null;
  detected_by_ai: boolean;
  notes: string | null;
  created_at: string;
}

export interface ConfirmDeductionResult {
  deductionsApplied: number;
  transactionIds: string[];
}
