export interface ProductRow {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_active: boolean;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProductIngredientRow {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit: string;
  sort_order: number;
  properties: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProductWithIngredients extends ProductRow {
  ingredients: ProductIngredientRow[];
}

export interface ProductCreateInput {
  name: string;
  category: string;
  description?: string | null;
  is_active?: boolean;
  properties?: Record<string, unknown>;
  ingredients?: ProductIngredientInput[];
}

export interface ProductUpdateInput {
  name?: string;
  category?: string;
  description?: string | null;
  is_active?: boolean;
  properties?: Record<string, unknown>;
  ingredients?: ProductIngredientInput[];
}

export interface ProductIngredientInput {
  name: string;
  quantity: number;
  unit: string;
  sort_order?: number;
  properties?: Record<string, unknown>;
}
