export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProductRow = {
  id: string;
  shop_id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  barcodes: string[];
  plu: string | null;
  sale_mode: "unit" | "weight";
  unit_name: string;
  content_unit: string;
  units_per_package: number;
  wholesale_price_per_unit: number;
  wholesale_price_per_piece: number;
  retail_price: number;
  wholesale_retail_price: number;
  bulk_price: number;
  cost_per_unit: number;
  cost_per_piece: number;
  bulk_profit_percent: number;
  retail_profit_percent: number;
  category_id: string | null;
  category_name: string;
  quantity: number;
  min_quantity: number;
  image_id: string | null;
  catalog_image_path: string | null;
  loyalty_points: number;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.0.0" };
  public: {
    Tables: {
      shops: Table<{ id: string; name: string; timezone: string; currency: string; created_at: string; updated_at: string }>;
      profiles: Table<{ user_id: string; display_name: string | null; phone: string | null; created_at: string; updated_at: string }>;
      shop_memberships: Table<{ user_id: string; shop_id: string; role: "manager" | "admin" | "supervisor" | "seller"; status: "pending" | "active" | "suspended"; approved_by: string | null; created_at: string; updated_at: string }>;
      product_categories: Table<{ id: string; shop_id: string; name: string; sort_order: number; created_at: string; updated_at: string }>;
      products: Table<ProductRow>;
      product_images: Table<{ id: string; shop_id: string; product_id: string; storage_path: string; content_type: string; size_bytes: number; created_by: string | null; created_at: string }>;
      invoices: Table<{ id: string; shop_id: string; invoice_number: string; idempotency_key: string; status: string; sale_type: string; payment_method: string; customer_name: string; customer_phone: string; subtotal: number; discount_type: string; discount_value: number; discount_amount: number; total: number; loyalty_points_awarded: number; created_by: string | null; created_at: string }>;
      invoice_items: Table<{ id: string; invoice_id: string; shop_id: string; product_id: string | null; product_name_snapshot: string; product_code_snapshot: string | null; selected_unit_snapshot: string; sale_mode_snapshot: "unit" | "weight"; quantity: number; stock_quantity_delta: number; unit_price_snapshot: number; unit_cost_snapshot: number; line_total: number; created_at: string }>;
      stock_movements: Table<{ id: string; shop_id: string; product_id: string; invoice_id: string | null; kind: string; quantity_delta: number; reason: string; created_by: string | null; created_at: string }>;
      audit_events: Table<{ id: number; shop_id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; changed_fields: string[]; details: Json; created_at: string }>;
      shop_change_events: Table<{ id: number; shop_id: string; entity_type: string; entity_id: string; operation: "INSERT" | "UPDATE" | "DELETE"; version: number | null; created_at: string }>;
    };
    Views: {
      seller_invoice_items: { Row: Omit<Database["public"]["Tables"]["invoice_items"]["Row"], "unit_cost_snapshot">; Relationships: [] };
      manager_invoice_items: { Row: Database["public"]["Tables"]["invoice_items"]["Row"]; Relationships: [] };
    };
    Functions: {
      search_products_by_barcode: { Args: { p_shop_id: string; p_barcode: string }; Returns: Json };
      list_products_page: { Args: { p_shop_id: string; p_after_created_at?: string | null; p_after_id?: string | null; p_search?: string | null; p_category_id?: string | null; p_limit?: number }; Returns: Json };
      create_product: { Args: { p_shop_id: string; p_payload: Json }; Returns: ProductRow };
      update_product: { Args: { p_shop_id: string; p_product_id: string; p_expected_version: number; p_payload: Json }; Returns: ProductRow };
      soft_delete_products: { Args: { p_shop_id: string; p_product_ids: string[] }; Returns: number };
      register_product_image: { Args: { p_shop_id: string; p_product_id: string; p_expected_version: number; p_image_id: string; p_storage_path: string; p_content_type: string; p_size_bytes: number }; Returns: string };
      create_invoice_with_stock: { Args: { p_shop_id: string; p_idempotency_key: string; p_items: Json; p_sale_type?: string; p_payment_method?: string; p_customer_name?: string; p_customer_phone?: string; p_discount_type?: string; p_discount_value?: number }; Returns: Json };
      list_shop_members: { Args: { p_shop_id: string }; Returns: Array<{ user_id: string; email: string; display_name: string | null; role: "manager" | "admin" | "supervisor" | "seller"; status: "pending" | "active" | "suspended"; created_at: string; updated_at: string; last_sign_in_at: string | null }> };
      set_shop_membership: { Args: { p_shop_id: string; p_user_id: string; p_role: "manager" | "admin" | "supervisor" | "seller"; p_status: "pending" | "active" | "suspended" }; Returns: Database["public"]["Tables"]["shop_memberships"]["Row"] };
    };
    Enums: {
      shop_role: "manager" | "admin" | "supervisor" | "seller";
      membership_status: "pending" | "active" | "suspended";
      product_sale_mode: "unit" | "weight";
      invoice_status: "completed" | "voided" | "partially_returned" | "returned";
      stock_movement_kind: "sale" | "return" | "adjustment" | "receive" | "waste" | "transfer";
    };
    CompositeTypes: Record<string, never>;
  };
};
