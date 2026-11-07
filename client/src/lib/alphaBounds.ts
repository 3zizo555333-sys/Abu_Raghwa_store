export type AlphaBounds = { x: number; y: number; width: number; height: number };

/** Finds the smallest rectangle containing pixels whose alpha exceeds the transparent-edge threshold. */
export function findAlphaBounds(data: Uint8ClampedArray, width: number, height: number, alphaThreshold = 2): AlphaBounds | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (data.length < width * height * 4) return null;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const threshold = Math.max(0, Math.min(255, Math.floor(alphaThreshold)));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
