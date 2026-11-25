import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogProductMatchesSearch, getCatalogDiscountPercent, getCatalogPrice, getCatalogTotal, getSafeCatalogDetailsUrl, recipeToCatalogProduct } from "../client/src/lib/catalog";
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ productId: "p1", confidence: 0.92 }) } }] })),
}));
import { buildCatalogFulfillmentUrl, getCatalogFulfillmentMode, getFulfillmentPrice } from "../client/src/lib/catalogPricing";
import * as db from "./db";
import * as storage from "./storage";
import { appRouter } from "./routers";

describe("حسابات كتالوج المتجر", () => {
  it("يستخدم سعر الكتالوج ويحسب الخصم من السعر القديم", () => {
    const product = { id: "p1", name: "مسحوق", wholesaleRetailPrice: 120, catalogPrice: 100, catalogOldPrice: 125 };
    expect(getCatalogPrice(product)).toBe(100);
    expect(getCatalogDiscountPercent(product)).toBe(20);
  });

  it("يحسب إجمالي العربة بدقة", () => {
    expect(getCatalogTotal([{ productId: "p1", name: "صنف", unit: "قطعة", price: 12.5, quantity: 2 }, { productId: "p2", name: "صنف آخر", unit: "قطعة", price: 5, quantity: 3 }])).toBe(40);
  });

  it("يبحث بأمان حتى عند وجود بيانات فئة أو شركة ناقصة", () => {
    expect(catalogProductMatchesSearch({ name: "مسحوق غسيل", category: undefined, company: undefined }, "غسيل")).toBe(true);
    expect(catalogProductMatchesSearch({ name: "منظف", category: 12 as unknown as string, company: null as unknown as string }, "12")).toBe(true);
  });

  it("يحول التركيبة إلى منتج كتالوج منفصل بسعر البيع", () => {
    const product = recipeToCatalogProduct({ id: "recipe-1", name: "صابون سائل", salePrice: 25, productionUnit: "لتر", notes: "تركيبة مركزة", catalogVisible: true, category: "تركيبات", company: "أبو رغوة" });
    expect(product).toMatchObject({ id: "catalog_recipe_recipe-1", sourceId: "recipe-1", catalogSource: "recipe", name: "صابون سائل", wholesaleRetailPrice: 25, catalogVisible: true });
  });

  it("يفصل سعر الاستلام عن سعر التوصيل ويحافظ على رابطين واضحين", () => {
    expect(getFulfillmentPrice(100, "pickup", { deliveryMarkupPercent: 15 })).toBe(100);
    expect(getFulfillmentPrice(100, "delivery", { deliveryMarkupPercent: 15 })).toBe(115);
    expect(buildCatalogFulfillmentUrl("https://shop.example/", "pickup")).toBe("https://shop.example/catalog?mode=pickup");
    expect(buildCatalogFulfillmentUrl("https://shop.example/", "delivery")).toBe("https://shop.example/catalog?mode=delivery");
    expect(getCatalogFulfillmentMode("?mode=delivery")).toBe("delivery");
  });

  it("يقبل رابط الفيديو أو المنشور الآمن ويرفض الروابط غير الآمنة", () => {
    expect(getSafeCatalogDetailsUrl("https://www.facebook.com/example/posts/1")).toBe("https://www.facebook.com/example/posts/1");
    expect(getSafeCatalogDetailsUrl("javascript:alert(1)")).toBe("");
    expect(getSafeCatalogDetailsUrl("رابط غير صالح")).toBe("");
  });
});

describe("طلبات كتالوج العملاء", () => {
  let staffAccounts: any[] = [];

  function mockCatalogMembershipClient(input: { authUserId: string; email: string; authorizedShopId: string }) {
    const filters: Record<string, string> = {};
    const membershipQuery = {
      select: vi.fn(() => membershipQuery),
      eq: vi.fn((column: string, value: string) => { filters[column] = value; return membershipQuery; }),
      limit: vi.fn(async () => ({
        data: filters.user_id === input.authUserId && filters.shop_id === input.authorizedShopId && filters.status === "active"
          ? [{ shop_id: input.authorizedShopId, role: "manager", status: "active" }]
          : [],
        error: null,
      })),
    };
    const serviceClient = {
      auth: {
        admin: {
          getUserById: vi.fn(async (id: string) => ({
            data: { user: id === input.authUserId ? { id, email: input.email } : null },
            error: null,
          })),
        },
      },
      from: vi.fn((table: string) => {
        if (table !== "shop_memberships") throw new Error(`Unexpected table ${table}`);
        return membershipQuery;
      }),
    };
    vi.spyOn(db, "getSupabaseServiceRoleClient").mockReturnValue(serviceClient as any);
    return serviceClient;
  }

  beforeEach(() => {
    staffAccounts = [];
    vi.spyOn(db, "getStaffAccounts").mockImplementation(async () => staffAccounts as any);
    vi.spyOn(db, "importStaffAccounts").mockImplementation(async accounts => { staffAccounts = [...accounts] as any; });
    vi.spyOn(db, "updateStaffAccount").mockImplementation(async (email, changes) => { staffAccounts = staffAccounts.map(account => account.email === email ? { ...account, ...changes } : account); });
    vi.spyOn(db, "deleteStaffAccount").mockImplementation(async email => { staffAccounts = staffAccounts.filter(account => account.email !== email); });
  });

  afterEach(async () => {
    await db.deleteStaffAccount("catalog-orders-manager@example.com").catch(() => undefined);
    await db.deleteStaffAccount("catalog-images-manager@example.com").catch(() => undefined);
    vi.restoreAllMocks();
  });

  it("يعرض ملف الولاء باستخدام الكود المولد من أربع خانات دون الحاجة للهاتف", async () => {
    const profile = { name: "عميل", customerCode: "5555", phone: "", points: 27, usedCoupons: [], transactions: [] };
    const lookup = vi.spyOn(db, "getCustomerLoyaltyProfile").mockResolvedValue(profile as any);
    const caller = appRouter.createCaller({} as any);

    await expect(caller.catalog.getLoyaltyProfile({ customerCode: "5555" })).resolves.toEqual(profile);
    expect(lookup).toHaveBeenCalledWith({ customerCode: "5555" });
  });

  it("يعرض مستويات الهدايا المعتمدة فقط للعداد العام ويرتبها بالنقاط", async () => {
    const levels = [
      { points: 50, giftName: "هدية ثانية", confirmed: true },
      { points: 20, giftName: "هدية أولى", confirmed: true },
    ];
    const lookup = vi.spyOn(db, "getPublicLoyaltyRewardLevels").mockResolvedValue(levels);
    const caller = appRouter.createCaller({} as any);

    await expect(caller.catalog.getPublicLoyaltyRewardLevels()).resolves.toEqual(levels);
    expect(lookup).toHaveBeenCalledOnce();
  });

  it("يسجل الطلب العام ثم يحدّث حالته للمتابعة", async () => {
    const create = vi.spyOn(db, "createCatalogOrder").mockResolvedValue(undefined);
    const update = vi.spyOn(db, "updateCatalogOrderStatus").mockResolvedValue(undefined);
    const archive = vi.spyOn(db, "archiveCatalogOrder").mockResolvedValue({ success: true, pointsReversed: 3 });
    const restore = vi.spyOn(db, "restoreCatalogOrder").mockResolvedValue({ success: true, pointsRestored: 3 });
    const remove = vi.spyOn(db, "deleteCatalogOrder").mockResolvedValue({ success: true, loyaltyPointsReversed: 3 });
    const restoreSalePoints = vi.spyOn(db, "restoreDirectSaleLoyalty").mockResolvedValue({ profile: null, pointsRestored: 3 });
    vi.spyOn(db, "listCatalogOrders").mockResolvedValue([]);
    vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue({ key: "abu_raghwa_users", dataJson: JSON.stringify([{ email: "catalog-orders-manager@example.com", password: "secure-pass", role: "manager", isApproved: true }]), updatedAt: new Date() });
    const cookies: string[] = [];
    const managerCaller = appRouter.createCaller({ req: { protocol: "https", headers: {} }, res: { cookie: (_name: string, value: string) => cookies.push(value) } } as any);
    const publicCaller = appRouter.createCaller({} as any);
    const order = { id: "catalog_order_1", customerName: "عميل", customerPhone: "01000000000", itemsJson: "[]", totalAmount: 50, fulfillmentMethod: "delivery" as const, priceAdjustmentPercent: 12 };
    const shopId = "123e4567-e89b-12d3-a456-426614174000";
    const authUserId = "123e4567-e89b-12d3-a456-426614174002";
    mockCatalogMembershipClient({ authUserId, email: "catalog-orders-manager@example.com", authorizedShopId: shopId });

    await expect(publicCaller.catalog.createOrder(order)).resolves.toEqual({ success: true, id: order.id });
    expect(create).toHaveBeenCalledWith(order);
    const login = await managerCaller.catalog.login({ managerEmail: "catalog-orders-manager@example.com", managerPassword: "secure-pass" });
    expect(login).toMatchObject({ success: true, token: expect.any(String) });
    const sessionCaller = appRouter.createCaller({ req: { headers: { cookie: `abu_catalog_admin=${cookies[0]}` } }, res: {} } as any);
    await expect(sessionCaller.catalog.updateOrderStatus({ id: order.id, shopId, authUserId, status: "preparing" })).resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(order.id, "preparing", shopId);
    await expect(sessionCaller.catalog.updateOrderStatus({ id: order.id, shopId, authUserId, status: "ready" })).resolves.toEqual({ success: true });
    expect(update).toHaveBeenLastCalledWith(order.id, "ready", shopId);
    await expect(sessionCaller.catalog.archiveOrder({ id: order.id })).resolves.toEqual({ success: true, pointsReversed: 3 });
    await expect(sessionCaller.catalog.restoreOrder({ id: order.id })).resolves.toEqual({ success: true, pointsRestored: 3 });
    await expect(sessionCaller.catalog.deleteOrder({ id: order.id })).resolves.toEqual({ success: true, loyaltyPointsReversed: 3 });
    await expect(sessionCaller.catalog.restoreDirectSaleLoyalty({ restoreId: "restore-1", saleId: "INV-test-1", customerName: "عميل", customerCode: "LOY-1", points: 3 })).resolves.toEqual({ profile: null, pointsRestored: 3 });
    expect(archive).toHaveBeenCalledWith(order.id);
    expect(restore).toHaveBeenCalledWith(order.id);
    expect(remove).toHaveBeenCalledWith(order.id);
    expect(restoreSalePoints).toHaveBeenCalledWith({ restoreId: "restore-1", saleId: "INV-test-1", customerName: "عميل", customerCode: "LOY-1", points: 3 });
    const phoneSessionCaller = appRouter.createCaller({ req: { headers: { "x-abu-catalog-session": login.token } }, res: {} } as any);
    await expect(phoneSessionCaller.catalog.listOrders({ shopId, authUserId })).resolves.toEqual([]);
  }, 15_000);

  it("يرفض مدير الكتالوج إذا لم تكن له عضوية نشطة في المتجر المطلوب", async () => {
    const listOrders = vi.spyOn(db, "listCatalogOrders").mockResolvedValue([]);
    const updateStatus = vi.spyOn(db, "updateCatalogOrderStatus").mockResolvedValue(undefined);
    vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue({ key: "abu_raghwa_users", dataJson: JSON.stringify([{ email: "catalog-orders-manager@example.com", password: "secure-pass", role: "manager", isApproved: true }]), updatedAt: new Date() });
    const cookies: string[] = [];
    const managerCaller = appRouter.createCaller({ req: { protocol: "https", headers: {} }, res: { cookie: (_name: string, value: string) => cookies.push(value) } } as any);
    await managerCaller.catalog.login({ managerEmail: "catalog-orders-manager@example.com", managerPassword: "secure-pass" });
    const authUserId = "123e4567-e89b-12d3-a456-426614174002";
    const authorizedShopId = "123e4567-e89b-12d3-a456-426614174000";
    const requestedShopId = "123e4567-e89b-12d3-a456-426614174001";
    mockCatalogMembershipClient({ authUserId, email: "catalog-orders-manager@example.com", authorizedShopId });
    const sessionCaller = appRouter.createCaller({ req: { headers: { cookie: `abu_catalog_admin=${cookies[0]}` } }, res: {} } as any);

    await expect(sessionCaller.catalog.listOrders({ shopId: requestedShopId, authUserId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sessionCaller.catalog.updateOrderStatus({ id: "catalog_order_1", shopId: requestedShopId, authUserId, status: "confirmed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listOrders).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  }, 15_000);

  it("يعرض للعميل طلباته المحفوظة فقط عند مطابقة رقم الهاتف", async () => {
    const customerOrders = [{ id: "catalog_order_1", customerPhone: "01000000000", customerName: "عميل", itemsJson: "[]", totalAmount: 50, status: "confirmed", createdAt: new Date(), updatedAt: new Date(), address: null, note: null }];
    const getForCustomer = vi.spyOn(db, "getCatalogOrdersForCustomer").mockResolvedValue(customerOrders as any);
    const caller = appRouter.createCaller({} as any);
    await expect(caller.catalog.getCustomerOrders({ orderIds: ["catalog_order_1"], customerPhone: "01000000000" })).resolves.toEqual(customerOrders);
    expect(getForCustomer).toHaveBeenCalledWith(["catalog_order_1"], "01000000000");
  });

  it("يمنع الزبون العام من قراءة طلبات العملاء أو تعديل حالتها", async () => {
    const caller = appRouter.createCaller({} as any);
    const shopId = "123e4567-e89b-12d3-a456-426614174000";
    const authUserId = "123e4567-e89b-12d3-a456-426614174002";
    await expect(caller.catalog.listOrders({ shopId, authUserId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.updateOrderStatus({ id: "order-1", shopId, authUserId, status: "confirmed" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.archiveOrder({ id: "order-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.restoreOrder({ id: "order-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.deleteOrder({ id: "order-123" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.restoreDirectSaleLoyalty({ restoreId: "restore-1", saleId: "INV-test-1", customerName: "عميل", customerCode: "LOY-1", points: 3 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("يشغّل بحث الصورة من الكاشير المحلي دون جلسة كتالوج منفصلة", async () => {
    const caller = appRouter.createCaller({ req: { headers: {} }, res: {} } as any);
    await expect(caller.productLookup.matchImage({ imageDataUrl: "data:image/jpeg;base64,aGVsbG8=", candidates: [{ id: "p1", name: "منظف", code: "123", imageUrl: "" }] })).resolves.toMatchObject({ productId: "p1", confidence: 0.92 });
  });

  it("يرفض الموظف غير المعتمد حتى لو كان دوره بائعًا", async () => {
    vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue({ key: "abu_raghwa_users", dataJson: JSON.stringify([{ email: "seller@example.com", password: "seller-pass", role: "seller", isApproved: false }]), updatedAt: new Date() });
    const cookies: string[] = [];
    const caller = appRouter.createCaller({ req: { protocol: "https", headers: {} }, res: { cookie: (_name: string, value: string) => cookies.push(value) } } as any);
    await expect(caller.catalog.login({ managerEmail: "seller@example.com", managerPassword: "seller-pass" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(cookies).toHaveLength(0);
  });

  it("يرفع صورة المنتج للتخزين السحابي بعد إنشاء جلسة الإدارة", async () => {
    vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue({ key: "abu_raghwa_users", dataJson: JSON.stringify([{ email: "catalog-images-manager@example.com", password: "secure-pass", role: "manager", isApproved: true }]), updatedAt: new Date() });
    const putImage = vi.spyOn(storage, "storagePut").mockResolvedValue({ key: "catalog-products/p1/image.jpg", url: "/manus-storage/catalog-products/p1/image.jpg" });
    const cookies: string[] = [];
    const managerCaller = appRouter.createCaller({ req: { protocol: "https", headers: {} }, res: { cookie: (_name: string, value: string) => cookies.push(value) } } as any);
    await managerCaller.catalog.login({ managerEmail: "catalog-images-manager@example.com", managerPassword: "secure-pass" });
    const sessionCaller = appRouter.createCaller({ req: { headers: { cookie: `abu_catalog_admin=${cookies[0]}` } }, res: {} } as any);
    await expect(sessionCaller.catalog.uploadProductImage({ productId: "p1", fileName: "soap.jpg", mimeType: "image/jpeg", base64: "aGVsbG8=" })).resolves.toEqual({ url: "/manus-storage/catalog-products/p1/image.jpg" });
    expect(putImage).toHaveBeenCalledWith(expect.stringMatching(/^catalog-products\/p1\//), expect.any(Buffer), "image/jpeg");
  });
});
