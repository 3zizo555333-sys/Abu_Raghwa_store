export type OfferExpirySource = {
  startAt?: number;
  endAt?: number;
  startDate?: string;
  endDate?: string;
};

export type OfferExpiryInfo = {
  endAt: number | null;
  status: "active" | "expired";
  remainingMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(value: string) {
  return value.replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)));
}

export function createOfferExpiryWindow(validityDays: number, now = Date.now()) {
  const safeDays = Math.max(1, Math.floor(validityDays));
  const startAt = now;
  const endAt = startAt + safeDays * DAY_MS;
  return {
    startAt,
    endAt,
    startDate: new Date(startAt).toLocaleDateString("ar-EG"),
    endDate: new Date(endAt).toLocaleDateString("ar-EG"),
  };
}

/** يقبل تواريخ العروض القديمة المسجلة بصيغة عربية يوم/شهر/سنة. */
export function parseLegacyOfferDate(value?: string) {
  if (!value) return null;
  const parts = normalizeDigits(value).replace(/[^0-9/.-]/g, "").split(/[/. -]/).filter(Boolean);
  if (parts.length < 3) return null;
  const [day, month, year] = parts.map(Number);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  const parsed = new Date(year, month - 1, day, 23, 59, 59, 999);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

export function getOfferEndAt(offer: OfferExpirySource) {
  if (Number.isFinite(offer.endAt) && Number(offer.endAt) > 0) return Number(offer.endAt);
  return parseLegacyOfferDate(offer.endDate);
}

export function getOfferExpiryInfo(offer: OfferExpirySource, now = Date.now()): OfferExpiryInfo {
  const endAt = getOfferEndAt(offer);
  if (!endAt) {
    return { endAt: null, status: "active", remainingMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const remainingMs = Math.max(0, endAt - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { endAt, status: endAt <= now ? "expired" : "active", remainingMs, days, hours, minutes, seconds };
}

export function formatOfferTimeRemaining(info: OfferExpiryInfo) {
  if (info.status === "expired") return "انتهت صلاحية العرض";
  if (!info.endAt) return "المدة غير محددة";
  if (info.days > 0) return `متبقي ${info.days} يوم و${info.hours} ساعة`;
  if (info.hours > 0) return `متبقي ${info.hours} ساعة و${info.minutes} دقيقة`;
  return `متبقي ${info.minutes} دقيقة و${info.seconds} ثانية`;
}
