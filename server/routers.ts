import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import * as db from "./db";
import { storageGetSignedUrl, storagePreparePut, storagePut } from "./storage";
import { parseInvoiceDataUrl, safeInvoiceFilename } from "./invoiceUpload";
import { invokeLLM } from "./_core/llm";
import { buildEmployeeFinanceSummary, EMPLOYEE_FINANCE_KEY, getMonthKey, hashEmployeeFinancePin, normalizeEmployeeFinanceStore, type EmployeeFinanceStore } from "./employeeFinance";
import { publicOfferJson } from "./sharedOffers";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts: { ctx: { user: any } }) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }: { ctx: { req: any; res: any } }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  offers: router({
    save: publicProcedure
      .input(z.object({ id: z.string().min(1).max(64), offerData: z.string().max(100_000) }))
      .mutation(async ({ input, ctx }) => {
        await requireLegacySyncAccess(ctx.req, "abu_raghwa_offers");
        await db.saveSharedOffer(input.id, input.offerData);
        return { success: true };
      }),
    list: publicProcedure.query(async ({ ctx }) => {
      await requireLegacySyncAccess(ctx.req, "abu_raghwa_offers");
      return db.listSharedOffers();
    }),
    get: publicProcedure
      .input(z.object({ id: z.string().min(1).max(64) }))
      .query(async ({ input }) => {
        const row = await db.getSharedOffer(input.id);
        return publicOfferJson(row?.offerData);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.string().min(1).max(64) }))
      .mutation(async ({ input, ctx }) => {
        await requireLegacySyncAccess(ctx.req, "abu_raghwa_offers");
        await db.deleteSharedOffer(input.id);
        return { success: true };
      }),
  }),

  productLookup: router({
    matchImage: publicProcedure
      .input(z.object({
        imageDataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(2_400_000),
        candidates: z.array(z.object({ id: z.string().min(1).max(128), name: z.string().min(1).max(180), code: z.string().max(128).optional(), imageUrl: z.string().max(2048).optional() })).min(1).max(120),
      }))
      .mutation(async ({ input }) => {
        // الكاشير يعمل بحساب التطبيق المحلي، وليس بجلسة إدارة الكتالوج.
        // المطابقة تستقبل الصورة والمرشحين الذين اختارهم التطبيق فقط، لذلك لا نعطل العامل برسالة جلسة إدارة غير متاحة.
        const candidateList = input.candidates.map(item => `${item.id} | ${item.name}${item.code ? ` | ${item.code}` : ""}`).join("\n");
        const visualCandidates = (await Promise.all(input.candidates.filter(item => item.imageUrl).slice(0, 24).map(async item => ({ ...item, resolvedImageUrl: await resolveProductImageUrl(item.imageUrl) })))).filter(item => item.resolvedImageUrl);
        const visualReferenceText = visualCandidates.map((item, index) => `Reference image ${index + 1} belongs to candidate id ${item.id} (${item.name}). Compare the package itself, not the background.`).join("\n");
        const visualContent = visualCandidates.flatMap((item, index) => [{ type: "text" as const, text: `Reference image ${index + 1} for candidate ${item.id}:` }, { type: "image_url" as const, image_url: { url: item.resolvedImageUrl!, detail: "low" as const } }]);
        try {
          const response = await invokeLLM({
            model: "gemini-3-flash-preview",
            maxTokens: 220,
            messages: [{ role: "system", content: "You match a photographed packaged shop product to exactly one candidate supplied by the user. The same product may be held in a hand, placed on a table, photographed from a different angle, or have different lighting/background. Ignore background, hand position, shadows and small angle changes. First identify the company/brand, product family/type, package shape and visible size or volume. Color is not a separate product: if the same company and type appear in purple, yellow, blue or other colors, treat those colors as normal variants and choose the same product family. Do not reject a match only because the color differs. Size or volume matters when the candidates represent genuinely different sizes, so prefer the visible size when it can be read. When reference images are provided, compare the package identity to them rather than requiring pixel-level similarity. Never invent an id. If uncertain, return empty productId and confidence below 0.55." }, { role: "user", content: [{ type: "text", text: `Candidates:\n${candidateList}\n${visualReferenceText}\nThe next image is the new customer photo. Return the closest candidate only.` }, { type: "image_url", image_url: { url: input.imageDataUrl, detail: "high" } }, ...visualContent] }],
            response_format: { type: "json_schema", json_schema: { name: "product_image_match", strict: true, schema: { type: "object", properties: { productId: { type: "string" }, confidence: { type: "number" } }, required: ["productId", "confidence"], additionalProperties: false } } },
          });
          const content = response.choices[0]?.message.content;
          const parsed = typeof content === "string" ? JSON.parse(content) as { productId?: string; confidence?: number } : {};
          const match = input.candidates.find(item => item.id === parsed.productId);
          return { productId: match?.id || "", productName: match?.name || "", confidence: match ? Math.max(0, Math.min(1, Number(parsed.confidence) || 0)) : 0 };
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر البحث بصورة المنتج الآن" });
        }
      }),
  }),

  catalog: router({
    login: publicProcedure
      .input(z.object({ managerEmail: z.string().email(), managerPassword: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await assertCatalogManager(input.managerEmail, input.managerPassword);
        const token = await createCatalogAdminSession(input.managerEmail);
        ctx.res.cookie(CATALOG_ADMIN_COOKIE, token, {
          httpOnly: true,
          secure: ctx.req.protocol !== "http",
          sameSite: "lax",
          maxAge: CATALOG_SESSION_MAX_AGE_MS,
          path: "/",
        });
        return { success: true, token };
      }),
    loginWithStaffSession: publicProcedure
      .mutation(async ({ ctx }) => {
        const user = await requireStaffSyncSession(ctx.req);
        if (!isActiveStaffAccount(user)) throw new TRPCError({ code: "FORBIDDEN", message: "حساب الموظف غير معتمد" });
        const token = await createCatalogAdminSession(user.email);
        ctx.res.cookie(CATALOG_ADMIN_COOKIE, token, {
          httpOnly: true,
          secure: ctx.req.protocol !== "http",
          sameSite: "lax",
          maxAge: CATALOG_SESSION_MAX_AGE_MS,
          path: "/",
        });
        return { success: true, token };
      }),
    uploadProductImage: publicProcedure
      .input(z.object({
        productId: z.string().min(1).max(128),
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64: z.string().min(4).max(8_000_000),
      }))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
        const imageBytes = Buffer.from(input.base64.replace(/^data:image\/[a-z+]+;base64,/, ""), "base64");
        if (imageBytes.length === 0 || imageBytes.length > 6 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "اختر صورة بحجم لا يزيد عن 6 ميجابايت" });
        }
        const safeProductId = input.productId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const { url } = await storagePut(`catalog-products/${safeProductId}/${Date.now()}.${extension}`, imageBytes, input.mimeType);
        return { url };
      }),
    getLoyaltyProfile: publicProcedure
      .input(z.object({ phone: z.string().max(32).optional(), customerCode: z.string().max(48).optional() }).refine(value => Boolean(value.phone?.trim() || value.customerCode?.trim()), "أدخل كود العميل أو رقم الهاتف"))
      .query(async ({ input }) => db.getCustomerLoyaltyProfile(input)),
    getPublicLoyaltyRewardLevels: publicProcedure
      .query(async () => db.getPublicLoyaltyRewardLevels()),
    registerOfferCustomer: publicProcedure
      .input(z.object({ name: z.string().min(2).max(255), phone: z.string().max(32).optional(), customerCode: z.string().max(48).optional() }))
      .mutation(async ({ input }) => db.registerOfferCustomer(input)),
    createOfferPurchaseRequest: publicProcedure
      .input(z.object({ offerId: z.string().min(1).max(64), customerCode: z.string().min(4).max(48) }))
      .mutation(async ({ input }) => db.createOfferPurchaseRequest(input)),
    getOfferPurchaseStatus: publicProcedure
      .input(z.object({ id: z.string().min(16).max(96), customerCode: z.string().min(4).max(48) }))
      .query(async ({ input }) => db.getCustomerOfferPurchaseStatus(input)),
    listOfferPurchaseRequests: publicProcedure
      .query(async ({ ctx }) => {
        await requireOfferManagerSession(ctx.req);
        return db.listOfferPurchaseRequests();
      }),
    approveOfferPurchaseRequest: publicProcedure
      .input(z.object({ id: z.string().min(16).max(96) }))
      .mutation(async ({ input, ctx }) => {
        await requireOfferManagerSession(ctx.req);
        return db.approveOfferPurchaseRequest(input.id);
      }),
    cancelOfferPurchaseRequest: publicProcedure
      .input(z.object({ id: z.string().min(16).max(96) }))
      .mutation(async ({ input, ctx }) => {
        await requireOfferManagerSession(ctx.req);
        return db.cancelOfferPurchaseRequest(input.id);
      }),
    listLoyaltyCustomers: publicProcedure
      .query(async ({ ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.listCustomerLoyalty();
      }),
    redeemLoyaltyReward: publicProcedure
      .input(z.object({ phone: z.string().max(32).optional(), customerCode: z.string().max(48).optional(), giftName: z.string().min(1).max(255), points: z.number().positive(), mode: z.enum(["deduct", "reset"]) }).refine(value => Boolean(value.phone?.trim() || value.customerCode?.trim()), "أدخل كود العميل أو رقم الهاتف"))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.redeemLoyaltyReward(input);
      }),
    recordDirectSaleLoyalty: publicProcedure
      .input(z.object({ saleId: z.string().min(6).max(128), customerName: z.string().min(2).max(255), phone: z.string().max(32).optional(), customerCode: z.string().max(48).optional(), itemsJson: z.string().min(2).max(100_000) }))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.recordDirectSaleLoyalty(input);
      }),
    reverseDirectSaleLoyalty: publicProcedure
      .input(z.object({ returnId: z.string().min(6).max(128), saleId: z.string().min(6).max(128), customerName: z.string().max(255), phone: z.string().max(32).optional(), customerCode: z.string().max(48).optional(), points: z.number().nonnegative() }).refine(value => Boolean(value.phone?.trim() || value.customerCode?.trim()), "لا يمكن عكس النقاط بدون كود العميل أو رقم الهاتف"))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.reverseDirectSaleLoyalty(input);
      }),
    restoreDirectSaleLoyalty: publicProcedure
      .input(z.object({ restoreId: z.string().min(6).max(128), saleId: z.string().min(6).max(128), customerName: z.string().max(255), phone: z.string().max(32).optional(), customerCode: z.string().max(48).optional(), points: z.number().nonnegative() }).refine(value => Boolean(value.phone?.trim() || value.customerCode?.trim()), "لا يمكن استعادة النقاط بدون كود العميل أو رقم الهاتف"))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.restoreDirectSaleLoyalty(input);
      }),
    createOrder: publicProcedure
      .input(z.object({
        id: z.string().min(6),
        customerName: z.string().min(2).max(255),
        customerPhone: z.string().min(7).max(32),
        customerCode: z.string().max(48).optional(),
        address: z.string().max(1000).optional(),
        note: z.string().max(1000).optional(),
        itemsJson: z.string().min(2),
        totalAmount: z.number().nonnegative(),
        fulfillmentMethod: z.enum(["pickup", "delivery"]).default("pickup"),
        priceAdjustmentPercent: z.number().min(0).max(500).default(0),
      }))
      .mutation(async ({ input }) => {
        const loyalty = await db.createCatalogOrder(input);
        return { success: true, id: input.id, ...(loyalty?.customerCode ? { customerCode: loyalty.customerCode } : {}) };
      }),
    getCustomerOrders: publicProcedure
      .input(z.object({ orderIds: z.array(z.string().min(6)).min(1).max(50), customerPhone: z.string().min(7).max(32) }))
      .query(async ({ input }) => db.getCatalogOrdersForCustomer(input.orderIds, input.customerPhone)),
    listOrders: publicProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.listCatalogOrders({ includeArchived: input?.includeArchived });
      }),
    archiveOrder: publicProcedure
      .input(z.object({ id: z.string().min(6).max(64) }))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.archiveCatalogOrder(input.id);
      }),
    restoreOrder: publicProcedure
      .input(z.object({ id: z.string().min(6).max(64) }))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.restoreCatalogOrder(input.id);
      }),
    updateOrderStatus: publicProcedure
      .input(z.object({ id: z.string(), status: z.enum(["new", "contacted", "confirmed", "preparing", "delivered", "cancelled"]) }))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        const loyalty = await db.updateCatalogOrderStatus(input.id, input.status);
        return { success: true, loyalty };
      }),
    deleteOrder: publicProcedure
      .input(z.object({ id: z.string().min(6).max(64) }))
      .mutation(async ({ input, ctx }) => {
        await requireCatalogAdminSession(ctx.req);
        return db.deleteCatalogOrder(input.id);
      }),
  }),

  employeeFinance: router({
    login: publicProcedure
      .input(z.object({ email: z.string().email().optional(), password: z.string().min(1).optional(), cardPassword: z.string().min(4).max(32).optional(), pin: z.string().min(4).max(32).optional() }))
      .mutation(async ({ input }) => {
        if (input.email && input.password) {
          const user = await assertEmployeeFinanceUser(input.email, input.password);
          if (user.role === "manager") return { token: await createEmployeeFinanceSession({ email: user.email, access: "manager" }), access: "manager" as const };
        }
        const cardPassword = input.cardPassword || input.pin;
        if (!cardPassword) throw new TRPCError({ code: "UNAUTHORIZED", message: "اكتب كلمة مرور بطاقة العامل التي منحها لك المدير" });
        const store = await getEmployeeFinanceStore();
        const assignment = store.assignments.find(item => item.isActive && hashEmployeeFinancePin(cardPassword) === item.pinHash);
        if (!assignment) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "كلمة مرور بطاقة العامل غير صحيحة أو أن البطاقة موقوفة" });
        }
        return { token: await createEmployeeFinanceSession({ email: `employee-card:${assignment.employeeId}`, access: "employee", employeeId: assignment.employeeId }), access: "employee" as const };
      }),
    loginWithStaffSession: publicProcedure
      .mutation(async ({ ctx }) => {
        const user = await requireStaffSyncSession(ctx.req);
        if (user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "إدارة رواتب الموظفين للمدير فقط" });
        return { token: await createEmployeeFinanceSession({ email: user.email, access: "manager" }), access: "manager" as const };
      }),
    managerOverview: publicProcedure.query(async ({ ctx }) => {
      const session = await requireEmployeeFinanceSession(ctx.req);
      if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "حسابات جميع الموظفين متاحة للمدير فقط" });
      const { store, employees, attendance } = await getEmployeeFinanceData();
      const now = new Date();
        return employees.map(employee => {
          const assignment = store.assignments.find(item => item.employeeId === employee.id);
          const withdrawals = store.withdrawals.filter(item => item.employeeId === employee.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
          return { employee, pinConfigured: Boolean(assignment), cardActive: assignment?.isActive ?? false, summary: buildEmployeeFinanceSummary(employee, attendance, withdrawals, now), withdrawals };
      });
    }),
    managerAccount: publicProcedure.query(async ({ ctx }) => {
      const session = await requireEmployeeFinanceSession(ctx.req);
      if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "حساب المدير مخصص للمدير فقط" });
      const store = await getEmployeeFinanceStore();
      const monthKey = getMonthKey(new Date());
      const withdrawals = store.managerWithdrawals.filter(item => getMonthKey(item.recordedAt) === monthKey).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      return { monthKey, monthlyWithdrawals: withdrawals.reduce((total, item) => total + item.amount, 0), withdrawals };
    }),
    createEmployee: publicProcedure
      .input(z.object({ name: z.string().trim().min(2).max(160), position: z.string().trim().max(160).optional(), salary: z.number().nonnegative().max(1_000_000), joinDate: z.string().trim().min(4).max(32), phone: z.string().trim().max(32).optional() }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
        if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "إضافة موظف وحساب راتبه من صلاحية المدير فقط" });
        const store = await getEmployeeFinanceStore();
        const employee = { id: `finance_employee_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: input.name, position: input.position || "", salary: input.salary, joinDate: input.joinDate, phone: input.phone || "" };
        store.profiles.push(employee);
        await saveEmployeeFinanceStore(store);
        return { success: true, employee };
      }),
    deleteEmployee: publicProcedure
      .input(z.object({ employeeId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
        if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "حذف الموظف من صلاحية المدير فقط" });
        const [data, employeesSetting, attendanceSetting] = await Promise.all([
          getEmployeeFinanceData(),
          db.getGlobalAppSetting("abu_raghwa_employees"),
          db.getGlobalAppSetting("abu_raghwa_attendance"),
        ]);
        if (!data.employees.some(employee => employee.id === input.employeeId)) throw new TRPCError({ code: "NOT_FOUND", message: "لم أجد هذا الموظف" });
        let legacyEmployees: Array<{ id?: string }> = [];
        let legacyAttendance: Array<{ employeeId?: string }> = [];
        try { legacyEmployees = Array.isArray(JSON.parse(employeesSetting?.dataJson || "[]")) ? JSON.parse(employeesSetting?.dataJson || "[]") : []; } catch {}
        try { legacyAttendance = Array.isArray(JSON.parse(attendanceSetting?.dataJson || "[]")) ? JSON.parse(attendanceSetting?.dataJson || "[]") : []; } catch {}
        const store = normalizeEmployeeFinanceStore(data.store);
        store.profiles = store.profiles.filter(employee => employee.id !== input.employeeId);
        store.assignments = store.assignments.filter(assignment => assignment.employeeId !== input.employeeId);
        store.withdrawals = store.withdrawals.filter(withdrawal => withdrawal.employeeId !== input.employeeId);
        await Promise.all([
          saveEmployeeFinanceStore(store),
          db.setGlobalAppSetting("abu_raghwa_employees", JSON.stringify(legacyEmployees.filter(employee => employee.id !== input.employeeId))),
          db.setGlobalAppSetting("abu_raghwa_attendance", JSON.stringify(legacyAttendance.filter(record => record.employeeId !== input.employeeId))),
        ]);
        return { success: true };
      }),
    configureEmployee: publicProcedure
      .input(z.object({ employeeId: z.string().min(1), password: z.string().min(4).max(32) }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
        if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "المدير فقط هو من يحدد كلمة مرور بطاقة العامل" });
        const data = await getEmployeeFinanceData();
        const employee = data.employees.find(item => item.id === input.employeeId);
        if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم أجد هذا الموظف" });
        const now = new Date().toISOString();
        const next = normalizeEmployeeFinanceStore(data.store);
        const existing = next.assignments.find(item => item.employeeId === employee.id);
        next.assignments = [...next.assignments.filter(item => item.employeeId !== employee.id), { employeeId: employee.id, employeeEmail: "", pinHash: hashEmployeeFinancePin(input.password), isActive: true, createdAt: existing?.createdAt || now, updatedAt: now }];
        await saveEmployeeFinanceStore(next);
        return { success: true };
      }),
    setEmployeeCardAccess: publicProcedure
      .input(z.object({ employeeId: z.string().min(1), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
        if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "إيقاف أو تفعيل بطاقة العامل من صلاحية المدير فقط" });
        const store = await getEmployeeFinanceStore();
        const assignment = store.assignments.find(item => item.employeeId === input.employeeId);
        if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "حدد كلمة مرور بطاقة العامل أولًا" });
        assignment.isActive = input.isActive;
        assignment.updatedAt = new Date().toISOString();
        await saveEmployeeFinanceStore(store);
        return { success: true, isActive: assignment.isActive };
      }),
    myAccount: publicProcedure.query(async ({ ctx }) => {
      const session = await requireEmployeeFinanceSession(ctx.req);
      if (session.access !== "employee" || !session.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "هذه الصفحة مخصصة لحساب العامل الفردي" });
      const { store, employees, attendance } = await getEmployeeFinanceData();
      const assignment = store.assignments.find(item => item.employeeId === session.employeeId);
      if (!assignment?.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "بطاقة العامل موقوفة بواسطة المدير" });
      const employee = employees.find(item => item.id === session.employeeId);
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يعد الموظف المرتبط بالحساب موجودًا" });
      const withdrawals = store.withdrawals.filter(item => item.employeeId === employee.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      return { employee, summary: buildEmployeeFinanceSummary(employee, attendance, withdrawals), withdrawals };
    }),
    requestWithdrawal: publicProcedure
      .input(z.object({ amount: z.number().positive().max(100_000), description: z.string().trim().min(2).max(500) }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
      if (session.access !== "employee" || !session.employeeId) throw new TRPCError({ code: "FORBIDDEN", message: "العامل يستطيع تسجيل سحب خاص به فقط" });
      const store = await getEmployeeFinanceStore();
      const assignment = store.assignments.find(item => item.employeeId === session.employeeId);
      if (!assignment?.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "بطاقة العامل موقوفة بواسطة المدير" });
        const withdrawal = { id: `withdrawal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, employeeId: session.employeeId, amount: input.amount, description: input.description, requestedAt: new Date().toISOString(), requestedByEmail: session.email, status: "pending" as const };
        store.withdrawals.push(withdrawal);
        await saveEmployeeFinanceStore(store);
        return { success: true, withdrawal };
      }),
    recordWithdrawalByManager: publicProcedure
      .input(z.object({ employeeId: z.string().min(1), amount: z.number().positive().max(100_000), description: z.string().trim().min(2).max(500) }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
        if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "تسجيل سحبة بالنيابة عن العامل من صلاحية المدير فقط" });
        const { store, employees } = await getEmployeeFinanceData();
        if (!employees.some(employee => employee.id === input.employeeId)) throw new TRPCError({ code: "NOT_FOUND", message: "لم أجد هذا الموظف" });
        const now = new Date().toISOString();
        store.withdrawals.push({ id: `withdrawal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, employeeId: input.employeeId, amount: input.amount, description: input.description, requestedAt: now, requestedByEmail: session.email, status: "approved", reviewedAt: now, reviewedByEmail: session.email });
        await saveEmployeeFinanceStore(store);
        return { success: true };
      }),
    recordManagerWithdrawal: publicProcedure
      .input(z.object({ amount: z.number().positive().max(1_000_000), description: z.string().trim().min(2).max(500) }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
        if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "مسحوبات المدير خاصة بحساب المدير" });
        const store = await getEmployeeFinanceStore();
        store.managerWithdrawals.push({ id: `manager_withdrawal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, amount: input.amount, description: input.description, recordedAt: new Date().toISOString() });
        await saveEmployeeFinanceStore(store);
        return { success: true };
      }),
    reviewWithdrawal: publicProcedure
      .input(z.object({ withdrawalId: z.string().min(1), decision: z.enum(["approved", "rejected"]) }))
      .mutation(async ({ input, ctx }) => {
        const session = await requireEmployeeFinanceSession(ctx.req);
        if (session.access !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "اعتماد أو رفض السحب من صلاحية المدير فقط" });
        const store = await getEmployeeFinanceStore();
        const withdrawal = store.withdrawals.find(item => item.id === input.withdrawalId);
        if (!withdrawal) throw new TRPCError({ code: "NOT_FOUND", message: "لم أجد هذه السحبة" });
        if (withdrawal.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "تمت مراجعة هذه السحبة من قبل" });
        withdrawal.status = input.decision;
        withdrawal.reviewedAt = new Date().toISOString();
        withdrawal.reviewedByEmail = session.email;
        await saveEmployeeFinanceStore(store);
        return { success: true };
      }),
  }),

  invoices: router({
    uploadImage: publicProcedure
      .input(z.object({ dataUrl: z.string().min(32), fileName: z.string().max(255) }))
      .mutation(async ({ input }: { input: { dataUrl: string; fileName: string } }) => {
        const { mimeType, bytes } = parseInvoiceDataUrl(input.dataUrl);
        const fileName = safeInvoiceFilename(input.fileName, mimeType);
        return storagePut(`invoice-images/${Date.now()}-${fileName}`, bytes, mimeType);
      }),
  }),

  itemImages: router({
    upload: publicProcedure
      .input(z.object({ dataUrl: z.string().min(32).max(9_000_000), fileName: z.string().max(255), itemId: z.string().min(1).max(128) }))
      .mutation(async ({ input }: { input: { dataUrl: string; fileName: string; itemId: string } }) => {
        const { mimeType, bytes } = parseInvoiceDataUrl(input.dataUrl);
        if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) || bytes.length > 6 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "اختر صورة JPG أو PNG أو WEBP بحجم لا يزيد عن 6 ميجابايت" });
        }
        const fileName = safeInvoiceFilename(input.fileName, mimeType);
        const safeItemId = input.itemId.replace(/[^a-zA-Z0-9_-]/g, "_");
        return storagePut(`item-images/${safeItemId}/${Date.now()}-${fileName}`, bytes, mimeType);
      }),
  }),

  productImages: router({
    upload: publicProcedure
      .input(z.object({ dataUrl: z.string().min(32).max(9_000_000), fileName: z.string().max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), productId: z.string().min(1).max(128) }))
      .mutation(async ({ input, ctx }: { input: { dataUrl: string; fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; productId: string }; ctx: { req: any } }) => {
        await requireStaffSyncSession(ctx.req);
        const { mimeType, bytes } = parseInvoiceDataUrl(input.dataUrl);
        if (mimeType !== input.mimeType || bytes.length === 0 || bytes.length > 6 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر صورة JPG أو PNG أو WEBP بحجم لا يزيد عن 6 ميجابايت" });
        const fileName = safeInvoiceFilename(input.fileName, input.mimeType);
        const safeProductId = input.productId.replace(/[^a-zA-Z0-9_-]/g, "_");
        return storagePut(`product-images/${safeProductId}/${Date.now()}-${fileName}`, bytes, mimeType);
      }),
  }),

  staffSync: router({
    me: publicProcedure.query(async ({ ctx }) => publicStaffUser(await requireStaffSyncSession(ctx.req))),
    register: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(6).max(128) }))
      .mutation(async ({ input }) => {
        const email = input.email.toLowerCase().trim();
        const users = await getStoredAccessUsers(false);
        const existingUser = users.find(user => user.email.toLowerCase() === email);
        if (existingUser) {
          const hasApprovedManager = users.some(user =>
            isActiveStaffAccount(user) && (user.role === "manager" || user.role === "admin"),
          );
          if (!hasApprovedManager && verifyStaffPassword(input.password, existingUser.passwordHash || existingUser.password || "")) {
            await db.updateStaffAccount(email, { role: "manager", status: "APPROVED", isBlocked: 0 });
            const recoveredUser = {
              ...existingUser,
              role: "manager" as const,
              status: "APPROVED" as const,
              isApproved: true,
              isBlocked: false,
            };
            return {
              success: true,
              existing: true,
              pending: false,
              bootstrapRecovered: true,
              user: publicStaffUser(recoveredUser),
            };
          }
          return { success: true, existing: true, pending: !isActiveStaffAccount(existingUser), user: publicStaffUser(existingUser) };
        }
        const now = new Date().toISOString();
        const isFirstAccount = !users.some(user =>
          isActiveStaffAccount(user) && (user.role === "manager" || user.role === "admin"),
        );
        const account: db.InsertStaffAccount = {
          id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          email,
          passwordHash: hashStaffPassword(input.password),
          role: isFirstAccount ? "manager" : "seller",
          status: isFirstAccount ? "APPROVED" : "PENDING_APPROVAL",
          isBlocked: 0,
          createdAt: new Date(now),
          updatedAt: new Date(now),
          lastLoginAt: new Date(now),
        };
        try {
          await db.insertStaffAccount(account);
        } catch (error) {
          if (isDuplicateKeyError(error)) throw new TRPCError({ code: "CONFLICT", message: "هذا البريد الإلكتروني مسجل بالفعل" });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ الحساب الآن؛ حاول مرة أخرى" });
        }
        const user = storedUserFromAccount({
          ...account,
          role: account.role || "seller",
          status: account.status || "PENDING_APPROVAL",
          isBlocked: account.isBlocked ?? 0,
          createdAt: account.createdAt || new Date(now),
          lastLoginAt: account.lastLoginAt ?? null,
        });
        return { success: true, existing: false, pending: !isFirstAccount, bootstrapRecovered: false, user: publicStaffUser(user) };
      }),
    pending: publicProcedure.query(async ({ ctx }) => {
      const manager = await requireStaffSyncSession(ctx.req);
      if (manager.role !== "manager" && manager.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "طلبات اعتماد الموظفين للمدير أو المشرف فقط" });
      }
      const users = await getStoredAccessUsers();
      return users
        .filter(user => user.status === "PENDING_APPROVAL" && !user.isBlocked)
        .map(publicStaffUser);
    }),
    list: publicProcedure.query(async ({ ctx }) => {
      const manager = await requireStaffSyncSession(ctx.req);
      if (manager.role !== "manager" && manager.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "قائمة الموظفين للمدير أو المشرف فقط" });
      }
      return (await getStoredAccessUsers(false)).map(publicStaffUser);
    }),
    approve: publicProcedure
      .input(z.object({ email: z.string().email(), role: z.enum(["seller", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        const manager = await requireStaffSyncSession(ctx.req);
        if (manager.role !== "manager" && manager.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "اعتماد الموظفين للمدير أو المشرف فقط" });
        }
        const users = await getStoredAccessUsers(false);
        const email = input.email.toLowerCase().trim();
        const user = users.find(item => item.email.toLowerCase() === email);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "لم أجد طلب التسجيل على الخادم" });
        await db.updateStaffAccount(email, { role: input.role, status: "APPROVED", isBlocked: 0 });
        const approvedUser = { ...user, role: input.role, status: "APPROVED" as const, isApproved: true, isBlocked: false };
        return { success: true, email, role: input.role, user: publicStaffUser(approvedUser) };
      }),
    update: publicProcedure
      .input(z.object({
        email: z.string().email(),
        role: z.enum(["seller", "admin"]).optional(),
        isBlocked: z.boolean().optional(),
      }).refine(input => input.role !== undefined || input.isBlocked !== undefined, "لم تحدد أي تغيير"))
      .mutation(async ({ input, ctx }) => {
        const manager = await requireStaffSyncSession(ctx.req);
        if (manager.role !== "manager" && manager.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "تعديل حسابات الموظفين للمدير أو المشرف فقط" });
        }
        const users = await getStoredAccessUsers(false);
        const email = input.email.trim().toLowerCase();
        const user = users.find(item => item.email === email);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "لم أجد حساب الموظف على الخادم" });
        if (user.role === "manager") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل حساب المدير الرئيسي" });
        const changes: db.UpdateStaffAccount = {};
        if (input.role !== undefined) changes.role = input.role;
        if (input.isBlocked !== undefined) changes.isBlocked = input.isBlocked ? 1 : 0;
        await db.updateStaffAccount(email, changes);
        const updatedUser = { ...user, ...(input.role !== undefined ? { role: input.role } : {}), ...(input.isBlocked !== undefined ? { isBlocked: input.isBlocked } : {}) };
        return { success: true, email, user: publicStaffUser(updatedUser) };
      }),
    remove: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        const manager = await requireStaffSyncSession(ctx.req);
        if (manager.role !== "manager" && manager.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "حذف حسابات الموظفين للمدير أو المشرف فقط" });
        }
        const email = input.email.trim().toLowerCase();
        const users = await getStoredAccessUsers(false);
        const user = users.find(item => item.email === email);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "لم أجد حساب الموظف على الخادم" });
        if (user.role === "manager") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن حذف حساب المدير الرئيسي" });
        await db.deleteStaffAccount(email);
        return { success: true, email };
      }),
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const email = input.email.trim().toLowerCase();
        const user = (await getStoredAccessUsers()).find(item => item.email === email);
        if (!user || !verifyStaffPassword(input.password, user.passwordHash || "")) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
        }
        if (user.isBlocked) throw new TRPCError({ code: "FORBIDDEN", message: "تم إيقاف حسابك من المدير" });
        if (!isActiveStaffAccount(user)) throw new TRPCError({ code: "FORBIDDEN", message: "حسابك قيد مراجعة الإدارة" });
        const lastLogin = new Date().toISOString();
        await db.updateStaffAccount(email, { lastLoginAt: new Date(lastLogin) });
        const token = await createStaffSyncSession(user);
        if (typeof ctx.res.cookie === "function") {
          ctx.res.cookie(STAFF_SYNC_COOKIE, token, {
            httpOnly: true,
            secure: ctx.req.protocol !== "http",
            sameSite: "lax",
            maxAge: STAFF_SYNC_COOKIE_MAX_AGE_MS,
            path: "/",
          });
        }
        return { token, user: publicStaffUser({ ...user, lastLogin, status: "APPROVED", isApproved: true }) };
      }),
    logout: publicProcedure
      .mutation(({ ctx }) => {
        if (typeof ctx.res.clearCookie === "function") {
          ctx.res.clearCookie(STAFF_SYNC_COOKIE, {
            httpOnly: true,
            secure: ctx.req.protocol !== "http",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
          });
        }
        return { success: true } as const;
      }),
  }),

  sync: router({
    set: publicProcedure
      // global_app_settings.dataJson is LONGTEXT; keep requests bounded while
      // allowing large product catalogs and other shared collections.
      .input(z.object({ key: z.string().min(1).max(128), dataJson: z.string().max(16_000_000), baseDataJson: z.string().max(16_000_000).optional() }))
      .mutation(async ({ input, ctx }: { input: { key: string; dataJson: string; baseDataJson?: string }; ctx: { req: any } }) => {
        if (input.key === EMPLOYEE_FINANCE_KEY || input.key === "abu_raghwa_users") throw new TRPCError({ code: "FORBIDDEN", message: "حسابات الموظفين لا تُدار من مسار المزامنة العام" });
        await requireLegacySyncAccess(ctx.req, input.key);
        // Every product save is one atomic cloud snapshot. Existing IDs are
        // updated in place and new IDs are appended; no client can publish a
        // half-written page or delete products from another device.
        if (input.key === "abu_raghwa_products") {
          await db.mergeGlobalAppSettingSnapshot(input.key, input.dataJson, input.baseDataJson);
          return { success: true };
        }
        if (input.baseDataJson) {
          try {
            if (Array.isArray(JSON.parse(input.dataJson)) && Array.isArray(JSON.parse(input.baseDataJson))) {
              await db.mergeGlobalAppSettingSnapshot(input.key, input.dataJson, input.baseDataJson);
              return { success: true };
            }
          } catch {
            // Fall through to the scalar writer for malformed/legacy values.
          }
        }
        await db.setGlobalAppSetting(input.key, input.dataJson);
        return { success: true };
      }),
    mergeChunk: publicProcedure
      .input(z.object({ key: z.string().min(1).max(128), offset: z.number().int().min(0).max(1_000_000).default(0), dataJson: z.string().min(2).max(1_200_000) }))
      .mutation(async ({ input, ctx }: { input: { key: string; offset: number; dataJson: string }; ctx: { req: any } }) => {
        if (input.key === EMPLOYEE_FINANCE_KEY || input.key === "abu_raghwa_users") throw new TRPCError({ code: "FORBIDDEN", message: "هذه البيانات خاصة" });
        await requireLegacySyncAccess(ctx.req, input.key);
        await db.mergeGlobalAppSettingChunk(input.key, input.dataJson, input.offset);
        return { success: true };
      }),
    getChunk: publicProcedure
      .input(z.object({ key: z.string().min(1).max(128), offset: z.number().int().min(0).max(1_000_000).default(0), limit: z.number().int().min(1).max(500).default(500), afterPosition: z.number().int().min(0).optional(), afterRecordId: z.string().max(191).optional() }))
      .query(async ({ input, ctx }: { input: { key: string; offset: number; limit: number; afterPosition?: number; afterRecordId?: string }; ctx: { req: any } }) => {
        if (input.key === EMPLOYEE_FINANCE_KEY || input.key === "abu_raghwa_users") throw new TRPCError({ code: "FORBIDDEN", message: "حسابات الموظفين خاصة" });
        if (MANAGER_ONLY_SYNC_KEYS.has(input.key) || !PUBLIC_SYNC_READ_KEYS.has(input.key)) await requireLegacySyncAccess(ctx.req, input.key);
        const after = input.afterPosition !== undefined && input.afterRecordId !== undefined
          ? { position: input.afterPosition, recordId: input.afterRecordId }
          : undefined;
        return db.getGlobalAppSettingChunk(input.key, input.offset, input.limit, after);
      }),
    get: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input, ctx }: { input: { key: string }; ctx: { req: any } }) => {
        if (input.key === EMPLOYEE_FINANCE_KEY || input.key === "abu_raghwa_users") throw new TRPCError({ code: "FORBIDDEN", message: "حسابات الموظفين خاصة" });
        if (MANAGER_ONLY_SYNC_KEYS.has(input.key) || !PUBLIC_SYNC_READ_KEYS.has(input.key)) await requireLegacySyncAccess(ctx.req, input.key);
        const row = await db.getGlobalAppSetting(input.key);
        return row ? row.dataJson : null;
      }),
  }),
});

async function resolveProductImageUrl(imageUrl?: string) {
  if (!imageUrl) return undefined;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const storagePrefix = "/manus-storage/";
  if (!imageUrl.startsWith(storagePrefix)) return undefined;
  const key = imageUrl.slice(storagePrefix.length);
  if (!key) return undefined;
  try {
    return await storageGetSignedUrl(key);
  } catch {
    return undefined;
  }
}

const CATALOG_ADMIN_COOKIE = "abu_catalog_admin";
const CATALOG_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CATALOG_SESSION_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "abu-raghwa-catalog-session");

async function assertCatalogManager(email: string, password: string) {
  const user = (await getStoredAccessUsers()).find(candidate => candidate.email === email.trim().toLowerCase() && verifyStaffPassword(password, candidate.passwordHash || ""));
  const isAllowedCatalogStaff = Boolean(user && ["manager", "admin", "seller"].includes(String(user.role)) && isActiveStaffAccount(user));
  if (!isAllowedCatalogStaff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا يحق إلا للعامل أو المشرف أو المدير المعتمد متابعة طلبات الكتالوج" });
  }
}

async function createCatalogAdminSession(email: string) {
  return new SignJWT({ email, purpose: "catalog-admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(CATALOG_SESSION_SECRET);
}

function readCookie(cookieHeader: string | undefined, name: string) {
  const item = (cookieHeader || "").split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

const EMPLOYEE_FINANCE_SESSION_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "abu-raghwa-employee-finance-session");
const STAFF_SYNC_SESSION_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "abu-raghwa-staff-sync-session");
const STAFF_SYNC_HEADER = "x-abu-staff-session";
const STAFF_SYNC_COOKIE = "abu_staff_sync_session";
const STAFF_SYNC_COOKIE_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const PUBLIC_SYNC_READ_KEYS = new Set(["abu_raghwa_product_categories", "abu_catalog_categories", "abu_catalog_companies", "abu_raghwa_display_settings"]);
const MANAGER_ONLY_SYNC_KEYS = new Set([
  "abu_raghwa_products", "abu_catalog_manual_products", "abu_catalog_pricing", "abu_raghwa_global_offers", "abu_raghwa_offers", "abu_raghwa_saved_offers",
  "abu_raghwa_employees", "abu_raghwa_attendance", "abu_raghwa_employee_finance", "abu_raghwa_sales", "abu_raghwa_expenses", "abu_raghwa_debts", "abu_raghwa_receivables", "abu_raghwa_checks",
  "abu_raghwa_suppliers_advanced", "abu_raghwa_raw_materials", "abu_raghwa_materials", "abu_raghwa_shortages", "abu_raghwa_productions", "abu_raghwa_customers", "abu_raghwa_customers_advanced",
  "abu_raghwa_audit_log", "abu_raghwa_alert_history", "abu_raghwa_manual_products", "abu_raghwa_processed_sales", "abu_gift_delivery_logs", "points_system_employees", "abu_reward_levels",
  "abu_raghwa_tasks", "abu_raghwa_penalty_rules", "abu_raghwa_penalty_logs", "abu_raghwa_apartment_items", "abu_raghwa_apartment_categories", "abu_raghwa_scanned_invoices",
  "abu_raghwa_custom_voice_commands", "abu_raghwa_shortage_categories", "abu_raghwa_invoice_categories_v2", "abu_raghwa_notifications",
]);

export type StoredAccessUser = { id?: string; email: string; password?: string; passwordHash?: string; role: string; status?: "PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "pending" | "approved"; createdDate?: string; lastLogin?: string; deviceIds?: string[]; isApproved?: boolean; isBlocked?: boolean };

const STAFF_PASSWORD_ALGORITHM = "scrypt";

function hashStaffPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `${STAFF_PASSWORD_ALGORITHM}$${salt}$${digest}`;
}

function verifyStaffPassword(password: string, encoded: string) {
  if (!encoded.includes("$")) {
    const expected = Buffer.from(encoded);
    const actual = Buffer.from(password);
    return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== STAFF_PASSWORD_ALGORITHM || !salt || !digest) return false;
  try {
    const expected = Buffer.from(digest, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY");
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function storedUserFromAccount(account: {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  status: "PENDING_APPROVAL" | "APPROVED";
  isBlocked: number;
  createdAt: Date | string;
  lastLoginAt: Date | string | null;
}): StoredAccessUser {
  return {
    id: account.id,
    email: account.email,
    passwordHash: account.passwordHash,
    role: account.role,
    status: account.status,
    createdDate: toIso(account.createdAt),
    lastLogin: toIso(account.lastLoginAt),
    deviceIds: [],
    isApproved: account.status === "APPROVED",
    isBlocked: Boolean(account.isBlocked),
  };
}

function publicStaffUser(user: StoredAccessUser) {
  return {
    id: user.id || `staff_${user.email}`,
    email: user.email,
    role: user.role as "seller" | "admin" | "manager",
    createdDate: user.createdDate || "",
    lastLogin: user.lastLogin || "",
    deviceIds: user.deviceIds || [],
    status: user.status === "APPROVED" || user.status === "ACTIVE" || user.status === "approved" ? "APPROVED" as const : "PENDING_APPROVAL" as const,
    isApproved: Boolean(user.isApproved),
    isBlocked: Boolean(user.isBlocked),
  };
}

export function normalizeStoredAccessUsers(value: unknown): StoredAccessUser[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is StoredAccessUser => Boolean(item && typeof item === "object" && typeof (item as StoredAccessUser).email === "string" && (typeof (item as StoredAccessUser).password === "string" || typeof (item as StoredAccessUser).passwordHash === "string")))
    .map(item => {
      const status = item.status === "ACTIVE" || item.status === "APPROVED" || item.status === "approved" || item.isApproved === true ? "APPROVED" : "PENDING_APPROVAL";
      return { ...item, email: item.email.trim().toLowerCase(), role: item.role || "seller", isBlocked: Boolean(item.isBlocked), isApproved: status === "APPROVED", status } as StoredAccessUser;
    });
  // A bad merge or a legacy migration may have stored the same email more than once.
  // Keep the last record so login and approval always operate on one canonical account.
  return Array.from(new Map(normalized.map(user => [user.email, user])).values());
}

export function isActiveStaffAccount(user: StoredAccessUser) {
  return !user.isBlocked && (user.status === "ACTIVE" || user.status === "APPROVED" || user.status === "approved" || user.isApproved === true);
}

let staffMigrationPromise: Promise<void> | null = null;

export function resetStaffAccountMigrationForTests() {
  staffMigrationPromise = null;
}

async function ensureStaffAccountsMigrated() {
  const existing = await db.getStaffAccounts();
  const setting = await db.getGlobalAppSetting("abu_raghwa_users");
  let legacyUsers: StoredAccessUser[] = [];
  try { legacyUsers = normalizeStoredAccessUsers(JSON.parse(setting?.dataJson || "[]")); } catch { legacyUsers = []; }
  const existingEmails = new Set(existing.map(account => account.email.toLowerCase()));
  const missingUsers = legacyUsers.filter(user => !existingEmails.has(user.email.toLowerCase()));
  if (!missingUsers.length) return;
  if (!staffMigrationPromise) {
    staffMigrationPromise = db.importStaffAccounts(missingUsers.map((user, index) => ({
      id: user.id || `legacy_${Date.now()}_${index}`,
      email: user.email,
      passwordHash: user.passwordHash || hashStaffPassword(user.password || ""),
      role: (user.role === "manager" || user.role === "admin" || user.role === "seller" ? user.role : "seller") as "manager" | "admin" | "seller",
      status: isActiveStaffAccount(user) ? "APPROVED" as const : "PENDING_APPROVAL" as const,
      isBlocked: user.isBlocked ? 1 : 0,
      createdAt: user.createdDate ? new Date(user.createdDate) : new Date(),
      updatedAt: new Date(),
      lastLoginAt: user.lastLogin ? new Date(user.lastLogin) : null,
    }))).finally(() => { staffMigrationPromise = null; });
  }
  await staffMigrationPromise;
}

async function getStoredAccessUsers(_includeDefaults = true): Promise<StoredAccessUser[]> {
  await ensureStaffAccountsMigrated();
  const accounts = await db.getStaffAccounts();
  if (accounts.length > 0) return accounts.map(storedUserFromAccount);
  const setting = await db.getGlobalAppSetting("abu_raghwa_users");
  try {
    return normalizeStoredAccessUsers(JSON.parse(setting?.dataJson || "[]"));
  } catch {
    return [];
  }
}

async function createStaffSyncSession(user: StoredAccessUser) {
  // This session intentionally has no time limit. It is invalidated by an
  // explicit logout on the device or immediately when the manager blocks or
  // removes the staff account; every request reloads the account from DB.
  return new SignJWT({ email: user.email, role: user.role, purpose: "staff-sync" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().sign(STAFF_SYNC_SESSION_SECRET);
}

async function requireStaffSyncSession(req: { protocol?: string; headers?: Record<string, string | string[] | undefined> }) {
  const raw = req.headers?.[STAFF_SYNC_HEADER];
  const headerToken = Array.isArray(raw) ? raw[0] : raw;
  const cookieHeader = req.headers?.cookie;
  const token = headerToken || readCookie(Array.isArray(cookieHeader) ? cookieHeader.join(";") : cookieHeader, STAFF_SYNC_COOKIE);
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل دخول الموظف قبل مزامنة البيانات" });
  try {
    const verified = await jwtVerify(token, STAFF_SYNC_SESSION_SECRET);
    const payload = verified.payload as { email?: string; role?: string; purpose?: string };
    if (payload.purpose !== "staff-sync" || !payload.email) throw new Error("invalid staff session");
    // The role in a JWT is only a snapshot. Always reload by email so a manager's
    // seller -> supervisor change takes effect without forcing a stale session.
    const user = (await getStoredAccessUsers()).find(item => item.email === payload.email);
    if (!user || !isActiveStaffAccount(user)) throw new Error("inactive staff session");
    return user;
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "انتهت جلسة الموظف؛ سجّل الدخول مرة أخرى" });
  }
}

async function requireLegacySyncAccess(req: { protocol?: string; headers?: Record<string, string | string[] | undefined> }, key: string) {
  const user = await requireStaffSyncSession(req);
  if (MANAGER_ONLY_SYNC_KEYS.has(key) && !["manager", "admin", "supervisor"].includes(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه البيانات المالية أو الإدارية متاحة للمدير والمشرف فقط" });
  }
  return user;
}

async function assertEmployeeFinanceUser(email: string, password: string) {
  const user = (await getStoredAccessUsers()).find(item => item.email === email.toLowerCase() && verifyStaffPassword(password, item.passwordHash || ""));
  if (!user || !isActiveStaffAccount(user)) throw new TRPCError({ code: "UNAUTHORIZED", message: "بيانات دخول العامل غير صالحة أو الحساب غير معتمد" });
  return user;
}

async function getEmployeeFinanceStore(): Promise<EmployeeFinanceStore> {
  const setting = await db.getGlobalAppSetting(EMPLOYEE_FINANCE_KEY);
  try {
    return normalizeEmployeeFinanceStore(JSON.parse(setting?.dataJson || "{}"));
  } catch {
    return { profiles: [], assignments: [], withdrawals: [], managerWithdrawals: [] };
  }
}

async function saveEmployeeFinanceStore(store: EmployeeFinanceStore) {
  await db.setGlobalAppSetting(EMPLOYEE_FINANCE_KEY, JSON.stringify(normalizeEmployeeFinanceStore(store)));
}

async function getEmployeeFinanceData() {
  const [store, employeesSetting, attendanceSetting] = await Promise.all([getEmployeeFinanceStore(), db.getGlobalAppSetting("abu_raghwa_employees"), db.getGlobalAppSetting("abu_raghwa_attendance")]);
  let legacyEmployees: Array<{ id: string; name: string; position?: string; salary: number; joinDate?: string; phone?: string }> = [];
  let attendance: Array<{ employeeId: string; date: string; status: string }> = [];
  try { legacyEmployees = Array.isArray(JSON.parse(employeesSetting?.dataJson || "[]")) ? JSON.parse(employeesSetting?.dataJson || "[]") : []; } catch {}
  try { attendance = Array.isArray(JSON.parse(attendanceSetting?.dataJson || "[]")) ? JSON.parse(attendanceSetting?.dataJson || "[]") : []; } catch {}
  const employeesById = new Map(legacyEmployees.filter(item => item && item.id && item.name).map(item => [item.id, item]));
  store.profiles.forEach(profile => employeesById.set(profile.id, profile));
  const employees = Array.from(employeesById.values());
  return { store, employees, attendance };
}

async function createEmployeeFinanceSession(input: { email: string; access: "manager" | "employee"; employeeId?: string }) {
  return new SignJWT({ ...input, purpose: "employee-finance" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(EMPLOYEE_FINANCE_SESSION_SECRET);
}

async function requireEmployeeFinanceSession(req: { headers?: Record<string, string | string[] | undefined> }) {
  const raw = req?.headers?.["x-abu-employee-finance-session"];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول إلى حساب الموظف أولاً" });
  try {
    const { payload } = await jwtVerify(token, EMPLOYEE_FINANCE_SESSION_SECRET);
    const access = payload.access === "manager" ? "manager" : payload.access === "employee" ? "employee" : null;
    if (payload.purpose !== "employee-finance" || !access || typeof payload.email !== "string") throw new Error("invalid finance session");
    if (payload.email.startsWith("employee-card:")) {
      return { email: payload.email, access, employeeId: typeof payload.employeeId === "string" ? payload.employeeId : undefined };
    }
    const user = (await getStoredAccessUsers()).find(item => item.email === String(payload.email).toLowerCase());
    if (!user || user.isBlocked || !user.isApproved) throw new Error("inactive finance session");
    return { email: payload.email, access, employeeId: typeof payload.employeeId === "string" ? payload.employeeId : undefined };
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "انتهت جلسة حساب الموظف. سجّل الدخول مرة أخرى" });
  }
}

async function requireCatalogAdminSession(req: { headers?: Record<string, string | string[] | undefined> }) {
  const cookieHeader = req?.headers?.cookie;
  const rawCookie = Array.isArray(cookieHeader) ? cookieHeader.join(";") : cookieHeader;
  const rawHeaderToken = req?.headers?.["x-abu-catalog-session"];
  const headerToken = Array.isArray(rawHeaderToken) ? rawHeaderToken[0] : rawHeaderToken;
  const token = headerToken || readCookie(rawCookie, CATALOG_ADMIN_COOKIE);
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "يلزم تسجيل دخول الإدارة لمتابعة الطلبات" });
  try {
    const { payload } = await jwtVerify(token, CATALOG_SESSION_SECRET);
    if (payload.purpose !== "catalog-admin" || typeof payload.email !== "string") throw new Error("invalid catalog session");
    const user = (await getStoredAccessUsers()).find(item => item.email === String(payload.email).toLowerCase());
    if (!user || user.isBlocked || !user.isApproved) throw new Error("inactive catalog session");
    return payload;
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "انتهت جلسة إدارة الكتالوج، سجّل الدخول مرة أخرى" });
  }
}

async function requireOfferManagerSession(req: { headers?: Record<string, string | string[] | undefined> }) {
  const session = await requireCatalogAdminSession(req);
  const email = String(session.email || "").toLowerCase();
  const user = (await getStoredAccessUsers()).find(item => item.email === email);
  if (!user || !isActiveStaffAccount(user)) throw new TRPCError({ code: "UNAUTHORIZED", message: "انتهت جلسة الإدارة" });
  if (user.role !== "manager" && user.role !== "admin" && user.role !== "supervisor" && user.role !== "seller") {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا يملك هذا الحساب صلاحية معالجة طلبات العروض" });
  }
  return user;
}

export type AppRouter = typeof appRouter;
