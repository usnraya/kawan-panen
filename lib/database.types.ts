// Minimal hand-written types for the fields this app reads/writes in M0-M1.
// Regenerate with `supabase gen types typescript` once the project schema stabilizes.

export type UserRole = "farmer" | "buyer" | "coordinator";
export type Grade = "A" | "B" | "C";
export type ForecastStatus = "open" | "closed";
export type RequestRecurrence = "none" | "weekly";
export type RequestStatus =
  | "DRAFT"
  | "OPEN"
  | "MATCHED"
  | "PARTIAL"
  | "FALLBACK_ACTIVE"
  | "CONFIRMED"
  | "DELIVERED"
  | "CLOSED"
  | "CANCELLED";
export type AllocationRole = "primary" | "backup";
export type AllocationStatus =
  | "PROPOSED"
  | "STANDBY"
  | "CONFIRMED"
  | "DECLINED"
  | "EXPIRED"
  | "DELIVERED"
  | "FAILED";

type Profile = {
  id: string;
  role: UserRole;
  display_name: string;
  org_name: string | null;
  regency: string;
  wa_number: string | null;
  is_simulated: boolean;
  created_at: string;
};

type Commodity = {
  id: string;
  name: string;
  shelf_life_days: number | null;
};

type HarvestForecast = {
  id: string;
  farmer_id: string;
  commodity_id: string;
  est_kg: number;
  reserved_kg: number;
  expected_harvest_date: string;
  grade: Grade;
  status: ForecastStatus;
  production_cost_per_kg: number | null;
  price_per_kg: number | null;
  hub_id: string | null;
  verification_status: "pending" | "verified" | "rejected";
  created_at: string;
};

type BuyerRequest = {
  id: string;
  buyer_id: string;
  commodity_id: string;
  qty_kg: number;
  delivery_date: string;
  min_grade: Grade;
  recurrence: RequestRecurrence;
  status: RequestStatus;
  shortfall_kg: number;
  created_at: string;
};

type Allocation = {
  id: string;
  request_id: string;
  forecast_id: string;
  farmer_id: string;
  role: AllocationRole;
  committed_kg: number;
  status: AllocationStatus;
  confirm_deadline: string | null;
  confirmed_at: string | null;
  delivered_kg: number | null;
  actual_kg: number | null;
  on_time: boolean | null;
  grade_ok: boolean | null;
  qc_photo_url: string | null;
  qc_checked_by: string | null;
  qc_checked_at: string | null;
  created_at: string;
};

type BuyerRequestInsert = Omit<BuyerRequest, "id" | "created_at" | "shortfall_kg"> & {
  id?: string;
  created_at?: string;
  shortfall_kg?: number;
};
type BuyerRequestUpdate = Partial<Omit<BuyerRequest, "id" | "buyer_id" | "created_at">>;
type AllocationInsert = Partial<Omit<Allocation, "id" | "created_at">> & Pick<Allocation, "request_id" | "forecast_id" | "farmer_id" | "role" | "committed_kg"> & { id?: string; created_at?: string };
type AllocationUpdate = Partial<Omit<Allocation, "id" | "request_id" | "forecast_id" | "farmer_id" | "created_at">>;

type ProfileInsert = Omit<Profile, "created_at"> & { created_at?: string };
type ProfileUpdate = Partial<Omit<Profile, "id" | "created_at">>;
type CommodityInsert = Omit<Commodity, "id"> & { id?: string };
type CommodityUpdate = Partial<Omit<Commodity, "id">>;
type ForecastInsert = Omit<HarvestForecast, "id" | "reserved_kg" | "status" | "production_cost_per_kg" | "price_per_kg" | "hub_id" | "verification_status" | "created_at"> & {
  id?: string;
  reserved_kg?: number;
  status?: ForecastStatus;
  production_cost_per_kg?: number | null;
  price_per_kg?: number | null;
  hub_id?: string | null;
  verification_status?: HarvestForecast["verification_status"];
  created_at?: string;
};
type ForecastUpdate = Partial<Omit<HarvestForecast, "id" | "farmer_id" | "created_at">>;

type SupplierScore = { farmer_id: string; score: number; n_deliveries: number };
type ZoneDistance = { from_regency: string; to_regency: string; km: number };
type EventRow = { id: number; request_id: string | null; type: string; payload: Record<string, unknown> | null; created_at: string };
type SettingsRow = { key: string; value: Record<string, unknown> };

type SupplierScoreUpdate = Partial<Omit<SupplierScore, "farmer_id">>;
type EventInsert = Omit<EventRow, "id" | "created_at"> & { id?: number; created_at?: string };

// M7 commerce extension (supabase/migrations/20261108_m7_commerce.sql).
export type CartStatus = "active" | "checked_out" | "abandoned";
export type OrderStatus = "DRAFT" | "AWAITING_FARMER" | "CONFIRMED" | "PAID" | "AT_HUB" | "QC_DONE" | "IN_TRANSIT" | "DELIVERED" | "COMPLETED" | "DISPUTED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PAID_HELD" | "RELEASED" | "PARTIALLY_REFUNDED" | "REFUNDED";

type Cart = { id: string; buyer_id: string; status: CartStatus; created_at: string };
type CartItem = { id: string; cart_id: string; product_id: string; commodity_id: string | null; qty_kg: number; created_at: string };
type Order = { id: string; buyer_id: string; cart_id: string | null; request_id: string | null; hub_id: string | null; idempotency_key: string; status: OrderStatus; total_amount: number; currency: string; created_at: string };
type OrderItem = { id: string; order_id: string; product_id: string; product_name: string; supplier_label: string; grade: Grade; unit_price: number; qty_kg: number; subtotal: number; allocation_id: string | null; farmer_id: string | null; buyer_commission: number; farmer_commission: number; logistics_fee: number };
type PaymentTransaction = { id: string; order_id: string; midtrans_order_id: string; snap_token: string | null; status: PaymentStatus; provider: "mock" | "midtrans"; idempotency_key: string | null; raw_response: Record<string, unknown> | null; created_at: string };
type PaymentWebhookEvent = { id: number; midtrans_order_id: string; payload: Record<string, unknown>; signature_valid: boolean; received_at: string };
type StockReservation = { id: string; order_id: string; product_id: string; qty_kg: number; expires_at: string; released_at: string | null };
type Hub = { id: string; name: string; regency: string; is_active: boolean };
type Delivery = { order_id: string; hub_id: string | null; courier_label: string; status: "assigned" | "picked_up" | "in_transit" | "delivered" | "failed"; picked_up_at: string | null; delivered_at: string | null; proof_photo_url: string | null };
type Subscription = { id: string; buyer_id: string; status: "active" | "cancelled" | "expired"; current_period_end: string; payment_transaction_id: string | null; created_at: string };
type LocalAbsorptionInput = { buyer_id: string; period_month: string; total_all_horticulture_spend: number; updated_at: string };
type LedgerAccount = { code: string };
type LedgerTransaction = { id: string; source_type: "order_settlement" | "refund" | "release"; source_id: string; idempotency_key: string; created_at: string };
type LedgerEntry = { id: number; transaction_id: string; account_code: string; debit: number; credit: number; reference: string | null; created_at: string };

type CartInsert = Omit<Cart, "id" | "status" | "created_at"> & { id?: string; status?: CartStatus; created_at?: string };
type CartUpdate = Partial<Omit<Cart, "id" | "buyer_id" | "created_at">>;
type CartItemInsert = Omit<CartItem, "id" | "created_at"> & { id?: string; created_at?: string };
type CartItemUpdate = Partial<Omit<CartItem, "id" | "cart_id" | "created_at">>;
type OrderInsert = Omit<Order, "id" | "request_id" | "hub_id" | "status" | "currency" | "created_at"> & { id?: string; request_id?: string | null; hub_id?: string | null; status?: OrderStatus; currency?: string; created_at?: string };
type OrderUpdate = Partial<Omit<Order, "id" | "buyer_id" | "created_at">>;
type OrderItemInsert = Omit<OrderItem, "id" | "allocation_id" | "farmer_id" | "buyer_commission" | "farmer_commission" | "logistics_fee"> & {
  id?: string;
  allocation_id?: string | null;
  farmer_id?: string | null;
  buyer_commission?: number;
  farmer_commission?: number;
  logistics_fee?: number;
};
type PaymentTransactionInsert = Omit<PaymentTransaction, "id" | "status" | "provider" | "idempotency_key" | "raw_response" | "created_at"> & { id?: string; status?: PaymentStatus; provider?: "mock" | "midtrans"; idempotency_key?: string | null; raw_response?: Record<string, unknown> | null; created_at?: string };
type PaymentTransactionUpdate = Partial<Omit<PaymentTransaction, "id" | "order_id" | "created_at">>;
type PaymentWebhookEventInsert = Omit<PaymentWebhookEvent, "id" | "received_at"> & { id?: number; received_at?: string };
type StockReservationInsert = Omit<StockReservation, "id" | "released_at"> & { id?: string; released_at?: string | null };
type StockReservationUpdate = Partial<Omit<StockReservation, "id" | "order_id" | "created_at">>;
type HubInsert = Omit<Hub, "id" | "is_active"> & { id?: string; is_active?: boolean };
type DeliveryInsert = Omit<Delivery, "status" | "picked_up_at" | "delivered_at" | "proof_photo_url"> & { status?: Delivery["status"]; picked_up_at?: string | null; delivered_at?: string | null; proof_photo_url?: string | null };
type DeliveryUpdate = Partial<Omit<Delivery, "order_id">>;
type SubscriptionInsert = Omit<Subscription, "id" | "status" | "created_at"> & { id?: string; status?: Subscription["status"]; created_at?: string };
type LocalAbsorptionInputInsert = Omit<LocalAbsorptionInput, "updated_at"> & { updated_at?: string };
type LocalAbsorptionInputUpdate = Partial<Omit<LocalAbsorptionInput, "buyer_id" | "period_month">>;
type LedgerTransactionInsert = Omit<LedgerTransaction, "id" | "created_at"> & { id?: string; created_at?: string };
type LedgerEntryInsert = Omit<LedgerEntry, "id" | "created_at"> & { id?: number; created_at?: string };

type Table<Row, Insert = Row, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type AvailabilitySummary = {
  commodity_id: string;
  commodity_name: string;
  week_start: string;
  available_kg: number;
  forecast_count: number;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile, ProfileInsert, ProfileUpdate>;
      commodities: Table<Commodity, CommodityInsert, CommodityUpdate>;
      harvest_forecasts: Table<HarvestForecast, ForecastInsert, ForecastUpdate>;
      buyer_requests: Table<BuyerRequest, BuyerRequestInsert, BuyerRequestUpdate>;
      allocations: Table<Allocation, AllocationInsert, AllocationUpdate>;
      supplier_scores: Table<SupplierScore, SupplierScore, SupplierScoreUpdate>;
      zone_distance: Table<ZoneDistance>;
      events: Table<EventRow, EventInsert>;
      settings: Table<SettingsRow>;
      carts: Table<Cart, CartInsert, CartUpdate>;
      cart_items: Table<CartItem, CartItemInsert, CartItemUpdate>;
      orders: Table<Order, OrderInsert, OrderUpdate>;
      order_items: Table<OrderItem, OrderItemInsert>;
      payment_transactions: Table<PaymentTransaction, PaymentTransactionInsert, PaymentTransactionUpdate>;
      payment_webhook_events: Table<PaymentWebhookEvent, PaymentWebhookEventInsert>;
      stock_reservations: Table<StockReservation, StockReservationInsert, StockReservationUpdate>;
      hubs: Table<Hub, HubInsert>;
      deliveries: Table<Delivery, DeliveryInsert, DeliveryUpdate>;
      subscriptions: Table<Subscription, SubscriptionInsert>;
      local_absorption_inputs: Table<LocalAbsorptionInput, LocalAbsorptionInputInsert, LocalAbsorptionInputUpdate>;
      ledger_accounts: Table<LedgerAccount>;
      ledger_transactions: Table<LedgerTransaction, LedgerTransactionInsert>;
      ledger_entries: Table<LedgerEntry, LedgerEntryInsert>;
    };
    Views: Record<string, never>;
    Functions: {
      get_availability_summary: {
        Args: Record<string, never>;
        Returns: AvailabilitySummary[];
      };
    };
    Enums: {
      user_role: UserRole;
      grade_t: Grade;
    };
    CompositeTypes: Record<string, never>;
  };
}
