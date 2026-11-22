export type VirtualStoreNode = {
  id: string;
  kind: "shelf" | "barrel" | "sack";
  x: number;
  z: number;
  rotation: number;
  color?: string;
  productIds: string[];
  copies?: number;
  displayName?: string;
  displayPrice?: number;
};

export type VirtualStoreLayout = { version: 1; nodes: VirtualStoreNode[] };
export type VirtualStoreStock = Record<string, number>;
export function normalizeVirtualStoreLayout(value: unknown): VirtualStoreLayout | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<VirtualStoreLayout>;
  if (raw.version !== 1 || !Array.isArray(raw.nodes)) return null;
  const nodes = raw.nodes.filter(node => node && ["shelf", "barrel", "sack"].includes(node.kind) && typeof node.id === "string")
    .slice(0, 80).map(node => ({ id: node.id.slice(0, 80), kind: node.kind,
      x: Math.max(-4.4, Math.min(4.4, Number(node.x) || 0)), z: Math.max(-9, Math.min(2, Number(node.z) || 0)),
      rotation: Number(node.rotation) || 0, color: typeof node.color === "string" ? node.color.slice(0, 20) : undefined,
      productIds: Array.isArray(node.productIds) ? node.productIds.filter((id): id is string => typeof id === "string").slice(0, 30) : [],
      copies: Math.max(1, Math.min(20, Number(node.copies) || 6)),
      displayName: typeof node.displayName === "string" ? node.displayName.slice(0, 100) : undefined,
      displayPrice: Number.isFinite(Number(node.displayPrice)) ? Math.max(0, Number(node.displayPrice)) : undefined }));
  return { version: 1, nodes };
}
