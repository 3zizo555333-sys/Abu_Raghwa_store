export type HiddenReportItem = { id: string; label: string };

export const parseHiddenReportItems = (raw: string | null): HiddenReportItem[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is HiddenReportItem =>
      Boolean(item) && typeof item.id === "string" && typeof item.label === "string"
    );
  } catch {
    return [];
  }
};

export const hideReportItem = (items: readonly HiddenReportItem[], item: HiddenReportItem): HiddenReportItem[] => [
  ...items.filter(existing => existing.id !== item.id),
  { id: item.id, label: item.label.trim() },
];

export const restoreReportItem = (items: readonly HiddenReportItem[], id: string): HiddenReportItem[] =>
  items.filter(item => item.id !== id);
