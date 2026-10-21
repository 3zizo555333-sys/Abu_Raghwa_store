import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLoyaltyPhone } from "./supabaseLoyalty";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261021030000_central_loyalty_wallet.sql"), "utf8");

describe("محفظة Supabase المركزية", () => {
  it("تطبع أرقام الهاتف العربية إلى هوية رقمية موحدة", () => {
    expect(normalizeLoyaltyPhone("٠١٠-١٢٣٤ ٥٦٧٨٩")).toBe("010123456789");
    expect(normalizeLoyaltyPhone("+20 (10) 1234-5678")).toBe("201012345678");
  });

  it("يضيف مصدر الحركة ومفتاح idempotency إلى دفتر Supabase بفهرس فريد لكل متجر", () => {
    expect(migration).toContain("add column if not exists source text");
    expect(migration).toContain("add column if not exists idempotency_key text");
    expect(migration).toContain("loyalty_point_ledger_idempotency_uidx");
    expect(migration).toContain("on conflict (shop_id, idempotency_key)");
  });

  it("يقصر إنشاء ملفات العملاء والحركات والقراءة الإدارية على RPC خادمية", () => {
    expect(migration).toContain("LOYALTY_SERVER_ONLY");
    expect(migration).toContain("revoke all on function public.apply_loyalty_wallet_event");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.apply_loyalty_wallet_event");
    expect(migration).toContain("to service_role");
  });

  it("يرفض تخمين سياق المتجر عند وجود أكثر من متجر", () => {
    expect(migration).toContain("if v_shop_count <> 1 then return null");
    expect(migration).toContain("LOYALTY_SHOP_REQUIRED");
  });
});
