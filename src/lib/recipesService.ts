import { getSupabaseClient } from "@/lib/supabaseClient";
import type {
  ProductCreateInput,
  ProductIngredientInput,
  ProductIngredientRow,
  ProductRow,
  ProductUpdateInput,
  ProductWithIngredients,
} from "@/types/recipes";

function toNumber(value: unknown, fallbackValue = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return parsed;
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function mapProductRow(row: Record<string, unknown>): ProductRow {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    description: row.description ? String(row.description) : null,
    is_active: Boolean(row.is_active),
    properties: toObject(row.properties),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapIngredientRow(row: Record<string, unknown>): ProductIngredientRow {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    name: String(row.name),
    quantity: toNumber(row.quantity, 0),
    unit: String(row.unit),
    sort_order: Math.max(0, Math.trunc(toNumber(row.sort_order, 0))),
    properties: toObject(row.properties),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeIngredientInput(
  ingredient: ProductIngredientInput,
  index: number,
  productId: string
): Record<string, unknown> {
  return {
    product_id: productId,
    name: ingredient.name.trim(),
    quantity: toNumber(ingredient.quantity, 0),
    unit: ingredient.unit.trim() || "pcs",
    sort_order:
      ingredient.sort_order === undefined
        ? index
        : Math.max(0, Math.trunc(toNumber(ingredient.sort_order, index))),
    properties: ingredient.properties ?? {},
  };
}

function normalizeProductInput(
  input: ProductCreateInput | ProductUpdateInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("name" in input && input.name !== undefined) {
    payload.name = input.name.trim();
  }

  if ("category" in input && input.category !== undefined) {
    payload.category = input.category.trim() || "Food";
  }

  if ("description" in input) {
    payload.description = input.description?.trim() || null;
  }

  if ("is_active" in input && input.is_active !== undefined) {
    payload.is_active = input.is_active;
  }

  if ("properties" in input && input.properties !== undefined) {
    payload.properties = input.properties;
  }

  return payload;
}

async function replaceProductIngredients(
  productId: string,
  ingredients: ProductIngredientInput[]
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error: deleteError } = await supabase
    .from("product_ingredients")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    throw new Error(`Failed to clear ingredients: ${deleteError.message}`);
  }

  const cleanedIngredients = ingredients
    .map((ingredient, index) => normalizeIngredientInput(ingredient, index, productId))
    .filter((ingredient) => String(ingredient.name).length > 0);

  if (cleanedIngredients.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("product_ingredients")
    .insert(cleanedIngredients);

  if (insertError) {
    throw new Error(`Failed to save ingredients: ${insertError.message}`);
  }
}

export async function listProductsWithIngredients(): Promise<ProductWithIngredients[]> {
  const supabase = getSupabaseClient();

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, name, category, description, is_active, properties, created_at, updated_at")
    .order("name", { ascending: true });

  if (productsError) {
    throw new Error(`Failed to load products: ${productsError.message}`);
  }

  const { data: ingredientRows, error: ingredientsError } = await supabase
    .from("product_ingredients")
    .select(
      "id, product_id, name, quantity, unit, sort_order, properties, created_at, updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (ingredientsError) {
    throw new Error(`Failed to load ingredients: ${ingredientsError.message}`);
  }

  const products = (productRows ?? []).map((row) =>
    mapProductRow(row as Record<string, unknown>)
  );
  const ingredients = (ingredientRows ?? []).map((row) =>
    mapIngredientRow(row as Record<string, unknown>)
  );

  const ingredientsByProduct = new Map<string, ProductIngredientRow[]>();

  for (const ingredient of ingredients) {
    const bucket = ingredientsByProduct.get(ingredient.product_id) ?? [];
    bucket.push(ingredient);
    ingredientsByProduct.set(ingredient.product_id, bucket);
  }

  return products.map((product) => ({
    ...product,
    ingredients: ingredientsByProduct.get(product.id) ?? [],
  }));
}

export async function createProduct(
  input: ProductCreateInput
): Promise<ProductWithIngredients> {
  const supabase = getSupabaseClient();
  const payload = normalizeProductInput(input);

  if (!payload.name) {
    throw new Error("Product name is required.");
  }

  const { data: createdRow, error: createError } = await supabase
    .from("products")
    .insert(payload)
    .select("id, name, category, description, is_active, properties, created_at, updated_at")
    .single();

  if (createError) {
    throw new Error(`Failed to create product: ${createError.message}`);
  }

  const product = mapProductRow(createdRow as Record<string, unknown>);

  if (input.ingredients && input.ingredients.length > 0) {
    await replaceProductIngredients(product.id, input.ingredients);
  }

  return {
    ...product,
    ingredients: input.ingredients
      ? input.ingredients.map((ingredient, index) => ({
          id: `${product.id}-temp-${index}`,
          product_id: product.id,
          name: ingredient.name,
          quantity: toNumber(ingredient.quantity, 0),
          unit: ingredient.unit,
          sort_order: ingredient.sort_order ?? index,
          properties: ingredient.properties ?? {},
          created_at: product.created_at,
          updated_at: product.updated_at,
        }))
      : [],
  };
}

export async function updateProduct(
  productId: string,
  input: ProductUpdateInput
): Promise<void> {
  const supabase = getSupabaseClient();
  const payload = normalizeProductInput(input);

  if (Object.keys(payload).length > 0) {
    const { error: updateError } = await supabase
      .from("products")
      .update(payload)
      .eq("id", productId);

    if (updateError) {
      throw new Error(`Failed to update product: ${updateError.message}`);
    }
  }

  if (input.ingredients) {
    await replaceProductIngredients(productId, input.ingredients);
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("products").delete().eq("id", productId);

  if (error) {
    throw new Error(`Failed to delete product: ${error.message}`);
  }
}
