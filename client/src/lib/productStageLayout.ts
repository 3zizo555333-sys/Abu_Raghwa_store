export interface ProductStagePose {
  id: string;
  x: number;
  baseline: number;
  scale: number;
  rotation: number;
  depth: number;
}

const STAGE_POSES: Record<number, Array<Omit<ProductStagePose, "id">>> = {
  1: [
    { x: 0.5, baseline: 0.88, scale: 1.14, rotation: 0, depth: 1 },
  ],
  2: [
    { x: 0.58, baseline: 0.88, scale: 1.08, rotation: 2, depth: 2 },
    { x: 0.41, baseline: 0.84, scale: 0.79, rotation: -9, depth: 1 },
  ],
  3: [
    { x: 0.5, baseline: 0.88, scale: 1.05, rotation: 0, depth: 3 },
    { x: 0.33, baseline: 0.84, scale: 0.76, rotation: -11, depth: 1 },
    { x: 0.68, baseline: 0.84, scale: 0.76, rotation: 10, depth: 2 },
  ],
  4: [
    { x: 0.5, baseline: 0.88, scale: 1, rotation: 0, depth: 4 },
    { x: 0.28, baseline: 0.84, scale: 0.72, rotation: -12, depth: 1 },
    { x: 0.72, baseline: 0.84, scale: 0.72, rotation: 11, depth: 2 },
    { x: 0.4, baseline: 0.82, scale: 0.7, rotation: -5, depth: 3 },
  ],
};

export function arrangeProductStage<T extends { id: string }>(layers: T[]): Array<T & Omit<ProductStagePose, "id">> {
  const poses = STAGE_POSES[Math.min(4, Math.max(1, layers.length))] || STAGE_POSES[1];
  return layers.slice(0, 4).map((layer, index) => ({ ...layer, ...poses[index] }));
}
