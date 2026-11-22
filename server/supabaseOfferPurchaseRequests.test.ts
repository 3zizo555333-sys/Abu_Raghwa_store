import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabaseLoyaltyProfile: vi.fn(),
  applySupabaseLoyaltyEvent: vi.fn(),
}));

vi.mock("@supabase/supabase-js", async importOriginal => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return { ...actual, createClient: mocks.createClient };
});
vi.mock("./supabaseLoyalty", () => ({
  getSupabaseLoyaltyProfile: mocks.getSupabaseLoyaltyProfile,
  applySupabaseLoyaltyEvent: mocks.applySupabaseLoyaltyEvent,
}));

const offerRow = {
  id: "offer-123",
  store_id: "a1b2c3d4-e5f6-4789-8123-456789abcdef",
  status: "active",
  deleted_at: null,
  title: "عرض مسحوق",
  offer_price: 25,
  points_reward: 6,
  offer_data: { title: "عرض مسحوق", offerPrice: 25, loyaltyPoints: 6, items: [{ name: "مسحوق" }] },
  starts_at: null,
  ends_at: null,
};
const profile = { customerCode: "A1B2C3", phone: "01000000000", name: "عميل اختبار" };

function makeClient(orderRow: Record<string, unknown> | null = null) {
  let inserted: Record<string, unknown> | null = null;
  let operation = "select";
  const calls: Array<{ table: string; operation: string; payload?: Record<string, unknown> }> = [];
  const client = {
    from: vi.fn((table: string) => {
      const query: any = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.in = vi.fn(() => query);
      query.is = vi.fn(() => query);
      query.order = vi.fn(() => query);
      query.limit = vi.fn(async () => ({ data: table === "catalog_orders" && orderRow ? [orderRow] : [], error: null }));
      query.maybeSingle = vi.fn(async () => {
        if (table === "store_offers") return { data: offerRow, error: null };
        if (table === "catalog_orders" && operation === "update") return { data: { id: String(orderRow?.id || inserted?.id) }, error: null };
        return { data: orderRow, error: null };
      });
      query.insert = vi.fn((payload: Record<string, unknown>) => {
        operation = "insert";
        inserted = payload;
        calls.push({ table, operation, payload });
        return query;
      });
      query.update = vi.fn((payload: Record<string, unknown>) => {
        operation = "update";
        calls.push({ table, operation, payload });
        return query;
      });
      query.single = vi.fn(async () => ({ data: { ...inserted, created_at: "2026-11-22T11:00:00.000Z" }, error: null }));
      return query;
    }),
  };
  return { client, calls };
}

beforeEach(() => {
  vi.resetModules();
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  mocks.getSupabaseLoyaltyProfile.mockResolvedValue(profile);
  mocks.applySupabaseLoyaltyEvent.mockResolvedValue({ points_delta: 6 });
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.clearAllMocks();
});

describe("طلبات عروض Supabase الخادمية", () => {
  it("يحفظ الطلب كاملاً عبر مفتاح الخدمة في catalog_orders دون كتابة من المتصفح", async () => {
    const { client, calls } = makeClient();
    mocks.createClient.mockReturnValue(client);
    const service = await import("./supabaseOfferPurchaseRequests");

    const request = await service.createSupabaseOfferPurchaseRequest({
      offerId: offerRow.id,
      customerCode: profile.customerCode,
      deliveryAddress: "شارع الاختبار",
      customerNote: "اتصل قبل الوصول",
    });

    expect(mocks.createClient).toHaveBeenCalledWith("https://supabase.test", "service-role-test-key", expect.any(Object));
    expect(request).toMatchObject({ offerId: offerRow.id, offerTitle: "عرض مسحوق", customerCode: profile.customerCode, customerPhone: profile.phone, deliveryAddress: "شارع الاختبار", created: true });
    const insert = calls.find(call => call.table === "catalog_orders" && call.operation === "insert")?.payload;
    expect(insert).toMatchObject({
      shop_id: offerRow.store_id,
      customer_name: profile.name,
      customer_phone: profile.phone,
      delivery_address: "شارع الاختبار",
      address: "شارع الاختبار",
      note: "اتصل قبل الوصول",
      order_type: "offer",
      offer_id: offerRow.id,
      offer_title: "عرض مسحوق",
      customer_code: profile.customerCode,
      total_amount: 25,
      loyalty_points: 6,
      loyalty_points_awarded: 0,
    });
  });

  it("يعتمد طلب العرض مرة واحدة ويمنح النقاط بمفتاح idempotency", async () => {
    const requestRow = {
      id: "a1b2c3d4-e5f6-4789-8123-456789abcdef",
      order_type: "offer",
      offer_id: offerRow.id,
      offer_title: "عرض مسحوق",
      customer_name: profile.name,
      customer_phone: profile.phone,
      customer_code: profile.customerCode,
      status: "pending",
      loyalty_points: 6,
      loyalty_points_awarded: 0,
      offer_snapshot: {},
      created_at: "2026-11-22T11:00:00.000Z",
    };
    const { client, calls } = makeClient(requestRow);
    mocks.createClient.mockReturnValue(client);
    const service = await import("./supabaseOfferPurchaseRequests");

    await expect(service.approveSupabaseOfferPurchaseRequest(String(requestRow.id))).resolves.toMatchObject({ success: true, alreadyApproved: false, awardedPoints: 6 });
    expect(mocks.applySupabaseLoyaltyEvent).toHaveBeenCalledWith(expect.objectContaining({
      pointsDelta: 6,
      source: "offer",
      sourceId: requestRow.id,
      idempotencyKey: `offer-purchase:${requestRow.id}:earned`,
    }));
    expect(calls.find(call => call.table === "catalog_orders" && call.operation === "update")?.payload).toMatchObject({ status: "confirmed", loyalty_points_awarded: 6 });
  });
});
