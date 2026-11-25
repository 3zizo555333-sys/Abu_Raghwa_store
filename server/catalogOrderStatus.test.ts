import { describe, expect, it } from "vitest";
import {
  isCatalogOrderArchived,
  normalizeCatalogOrderStatus,
  toDatabaseCatalogOrderStatus,
  type CatalogOrderStatus,
} from "../shared/catalogOrderStatus";

describe("توحيد حالات طلبات الكتالوج", () => {
  const cases: Array<[unknown, CatalogOrderStatus]> = [
    [null, "new"],
    ["pending", "new"],
    [" new ", "new"],
    ["جديد", "new"],
    ["قيد الانتظار", "new"],
    ["contacted", "contacted"],
    ["confirmed", "confirmed"],
    ["accepted", "confirmed"],
    ["approved", "confirmed"],
    ["جارٍ التجهيز", "preparing"],
    ["جاري التجهيز", "preparing"],
    ["ready", "ready"],
    ["جاهز للاستلام", "ready"],
    ["delivered", "delivered"],
    ["completed", "delivered"],
    ["مكتمل", "delivered"],
    ["cancelled", "cancelled"],
    ["ملغي", "cancelled"],
  ];

  it.each(cases)("يحوّل %s إلى الحالة الموحدة %s", (input, expected) => {
    expect(normalizeCatalogOrderStatus(input)).toBe(expected);
  });

  it("يبقي المؤكد والجديد والجاري ضمن الطلبات المفتوحة ويؤرشف التسليم والإلغاء فقط", () => {
    expect(isCatalogOrderArchived("confirmed")).toBe(false);
    expect(isCatalogOrderArchived("preparing")).toBe(false);
    expect(isCatalogOrderArchived("ready")).toBe(false);
    expect(isCatalogOrderArchived(null)).toBe(false);
    expect(isCatalogOrderArchived("مكتمل")).toBe(true);
    expect(isCatalogOrderArchived("ملغي")).toBe(true);
  });

  it("يحفظ الطلب الجديد بصيغة pending المتوافقة مع قاعدة البيانات", () => {
    expect(toDatabaseCatalogOrderStatus("new")).toBe("pending");
    expect(toDatabaseCatalogOrderStatus("ready")).toBe("ready");
  });
});
