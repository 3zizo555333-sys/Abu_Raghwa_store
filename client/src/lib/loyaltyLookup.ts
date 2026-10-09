export const MIN_GENERATED_LOYALTY_CODE_LENGTH = 4;

export function shouldLookupLoyaltyProfile(phone: string, customerCode: string): boolean {
  return customerCode.trim().length >= MIN_GENERATED_LOYALTY_CODE_LENGTH || phone.trim().length >= 7;
}

export function buildLoyaltyPageHref(customerCode?: string | null, phone?: string | null): string {
  const params = new URLSearchParams();
  const code = String(customerCode || "").trim();
  const phoneNumber = String(phone || "").trim();

  if (code.length >= MIN_GENERATED_LOYALTY_CODE_LENGTH) params.set("code", code);
  if (phoneNumber) params.set("phone", phoneNumber);

  const query = params.toString();
  return query ? `/loyalty?${query}` : "/loyalty";
}
