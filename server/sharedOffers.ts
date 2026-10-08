export type SharedOffer = Record<string, unknown> & { id: string };

function parseOffer(value: unknown): SharedOffer | null {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).id !== "string") return null;
  return value as SharedOffer;
}

export function mergeSharedOfferRecords(legacyDataJson: string | null, individualOfferJsons: string[]): SharedOffer[] {
  const offersById = new Map<string, SharedOffer>();

  // Individual rows are the durable source of truth and arrive newest first.
  for (const json of individualOfferJsons) {
    try {
      const offer = parseOffer(JSON.parse(json));
      if (offer && !offersById.has(offer.id)) offersById.set(offer.id, offer);
    } catch { /* Skip a malformed row without dropping other offers. */ }
  }

  if (legacyDataJson) {
    try {
      const legacy = JSON.parse(legacyDataJson);
      if (Array.isArray(legacy)) {
        for (const value of legacy) {
          const offer = parseOffer(value);
          if (offer && !offersById.has(offer.id)) offersById.set(offer.id, offer);
        }
      }
    } catch { /* Preserve valid individual rows if the old list is malformed. */ }
  }

  return Array.from(offersById.values());
}

export function removeOfferFromLegacyData(legacyDataJson: string, offerId: string): { dataJson: string; changed: boolean } {
  try {
    const legacy = JSON.parse(legacyDataJson);
    if (!Array.isArray(legacy)) return { dataJson: legacyDataJson, changed: false };
    const remaining = legacy.filter(value => !value || typeof value !== "object" || value.id !== offerId);
    return { dataJson: JSON.stringify(remaining), changed: remaining.length !== legacy.length };
  } catch {
    return { dataJson: legacyDataJson, changed: false };
  }
}
