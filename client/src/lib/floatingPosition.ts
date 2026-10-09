export interface FloatingPosition {
  x: number;
  y: number;
}

export function clampFloatingPosition(
  position: FloatingPosition,
  viewportWidth: number,
  viewportHeight: number,
  size = 56,
  margin = 16,
): FloatingPosition {
  const maxX = Math.max(margin, viewportWidth - size - margin);
  const maxY = Math.max(margin, viewportHeight - size - margin);

  return {
    x: Math.min(maxX, Math.max(margin, Number.isFinite(position.x) ? position.x : margin)),
    y: Math.min(maxY, Math.max(margin, Number.isFinite(position.y) ? position.y : margin)),
  };
}
