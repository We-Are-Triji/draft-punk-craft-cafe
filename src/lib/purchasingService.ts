import { getSupabaseClient } from "@/lib/supabaseClient";

// --- Types ---

export type RequestStatus = "pending" | "approved" | "rejected";
export type UrgencyLevel = "low" | "normal" | "urgent";
export type OrderStatus = "draft" | "sent" | "received";

export interface PurchaseRequestRow {
  id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  urgency: UrgencyLevel;
  notes: string;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderRow {
  id: string;
  supplier_name: string;
  expected_date: string | null;
  notes: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItemRow {
  id: string;
  order_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  estimated_cost: number;
  created_at: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrderRow {
  items: PurchaseOrderItemRow[];
}

export interface CreatePurchaseRequestInput {
  ingredient_name: string;
  quantity: number;
  unit: string;
  urgency: UrgencyLevel;
  notes?: string;
}

export interface CreatePurchaseOrderInput {
  supplier_name: string;
  expected_date?: string | null;
  notes?: string;
  items: Array<{
    ingredient_name: string;
    quantity: number;
    unit: string;
    estimated_cost: number;
  }>;
}

// --- Helpers ---

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toRequestStatus(value: unknown): RequestStatus {
  const s = String(value);
  if (s === "pending" || s === "approved" || s === "rejected") return s;
  return "pending";
}

function toUrgency(value: unknown): UrgencyLevel {
  const s = String(value);
  if (s === "low" || s === "normal" || s === "urgent") return s;
  return "normal";
}

function toOrderStatus(value: unknown): OrderStatus {
  const s = String(value);
  if (s === "draft" || s === "sent" || s === "received") return s;
  return "draft";
}

function mapRequestRow(row: Record<string, unknown>): PurchaseRequestRow {
  return {
    id: String(row.id),
    ingredient_name: String(row.ingredient_name),
    quantity: toNumber(row.quantity),
    unit: String(row.unit ?? "pcs"),
    urgency: toUrgency(row.urgency),
    notes: String(row.notes ?? ""),
    status: toRequestStatus(row.status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapOrderRow(row: Record<string, unknown>): PurchaseOrderRow {
  return {
    id: String(row.id),
    supplier_name: String(row.supplier_name),
    expected_date: row.expected_date ? String(row.expected_date) : null,
    notes: String(row.notes ?? ""),
    status: toOrderStatus(row.status),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapOrderItemRow(row: Record<string, unknown>): PurchaseOrderItemRow {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    ingredient_name: String(row.ingredient_name),
    quantity: toNumber(row.quantity),
    unit: String(row.unit ?? "pcs"),
    estimated_cost: toNumber(row.estimated_cost),
    created_at: String(row.created_at),
  };
}

// --- Purchase Requests ---

export async function listPurchaseRequests(limit = 200): Promise<PurchaseRequestRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load purchase requests: ${error.message}`);
  return (data ?? []).map((row) => mapRequestRow(row as Record<string, unknown>));
}

export async function createPurchaseRequest(input: CreatePurchaseRequestInput): Promise<PurchaseRequestRow> {
  const name = input.ingredient_name.trim();
  if (!name) throw new Error("Ingredient name is required.");
  if (input.quantity <= 0) throw new Error("Quantity must be greater than zero.");

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .insert({
      ingredient_name: name,
      quantity: input.quantity,
      unit: input.unit.trim() || "pcs",
      urgency: input.urgency,
      notes: input.notes?.trim() ?? "",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create purchase request: ${error.message}`);
  return mapRequestRow(data as Record<string, unknown>);
}

export async function updatePurchaseRequestStatus(id: string, status: RequestStatus): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("purchase_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to update purchase request: ${error.message}`);
}

export async function deletePurchaseRequest(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("purchase_requests")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete purchase request: ${error.message}`);
}

// --- Purchase Orders ---

export async function listPurchaseOrders(limit = 200): Promise<PurchaseOrderWithItems[]> {
  const supabase = getSupabaseClient();

  const { data: orderRows, error: ordersError } = await supabase
    .from("purchase_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (ordersError) throw new Error(`Failed to load purchase orders: ${ordersError.message}`);

  const orders = (orderRows ?? []).map((row) => mapOrderRow(row as Record<string, unknown>));
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: itemRows, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (itemsError) throw new Error(`Failed to load order items: ${itemsError.message}`);

  const itemsByOrder = new Map<string, PurchaseOrderItemRow[]>();
  for (const row of itemRows ?? []) {
    const item = mapOrderItemRow(row as Record<string, unknown>);
    const bucket = itemsByOrder.get(item.order_id) ?? [];
    bucket.push(item);
    itemsByOrder.set(item.order_id, bucket);
  }

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) ?? [],
  }));
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrderWithItems> {
  const supplier = input.supplier_name.trim();
  if (!supplier) throw new Error("Supplier name is required.");

  const validItems = input.items.filter((i) => i.ingredient_name.trim() && i.quantity > 0);
  if (validItems.length === 0) throw new Error("At least one item is required.");

  const supabase = getSupabaseClient();

  const { data: orderData, error: orderError } = await supabase
    .from("purchase_orders")
    .insert({
      supplier_name: supplier,
      expected_date: input.expected_date || null,
      notes: input.notes?.trim() ?? "",
    })
    .select("*")
    .single();

  if (orderError) throw new Error(`Failed to create purchase order: ${orderError.message}`);

  const order = mapOrderRow(orderData as Record<string, unknown>);

  const itemPayloads = validItems.map((i) => ({
    order_id: order.id,
    ingredient_name: i.ingredient_name.trim(),
    quantity: i.quantity,
    unit: i.unit.trim() || "pcs",
    estimated_cost: Math.max(0, i.estimated_cost),
  }));

  const { data: itemData, error: itemError } = await supabase
    .from("purchase_order_items")
    .insert(itemPayloads)
    .select("*");

  if (itemError) throw new Error(`Failed to create order items: ${itemError.message}`);

  const items = (itemData ?? []).map((row) => mapOrderItemRow(row as Record<string, unknown>));

  return { ...order, items };
}

export async function updatePurchaseOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to update purchase order: ${error.message}`);
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  // Items cascade-delete via FK
  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete purchase order: ${error.message}`);
}
