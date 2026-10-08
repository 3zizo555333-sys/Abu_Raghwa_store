export function createOfferId(prefix = "offer") {
  const unique = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now()}_${unique}`;
}
