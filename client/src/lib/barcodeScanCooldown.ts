export const BARCODE_CAMERA_PAUSE_MS = 1_500;
export const BARCODE_DUPLICATE_WINDOW_MS = 2_000;

export type BarcodeScanGate = {
  pauseUntil: number;
  lastReadAt: Map<string, number>;
};

export type BarcodeScanDecision = {
  accepted: boolean;
  pauseUntil: number;
  reason?: "empty" | "camera-paused" | "duplicate";
};

export const createBarcodeScanGate = (): BarcodeScanGate => ({
  pauseUntil: 0,
  lastReadAt: new Map(),
});

/** Accept one live-camera read, then ignore every read during the camera pause and
 * ignore the same barcode for the full duplicate window, even after auto-resume.
 */
export function acceptLiveBarcode(
  gate: BarcodeScanGate,
  rawBarcode: string,
  now = Date.now(),
): BarcodeScanDecision {
  const barcode = rawBarcode.trim();
  if (!barcode) return { accepted: false, pauseUntil: gate.pauseUntil, reason: "empty" };

  gate.lastReadAt.forEach((readAt, value) => {
    if (now - readAt >= BARCODE_DUPLICATE_WINDOW_MS) gate.lastReadAt.delete(value);
  });

  if (now < gate.pauseUntil) {
    return { accepted: false, pauseUntil: gate.pauseUntil, reason: "camera-paused" };
  }

  const lastReadAt = gate.lastReadAt.get(barcode);
  if (lastReadAt !== undefined && now - lastReadAt < BARCODE_DUPLICATE_WINDOW_MS) {
    return { accepted: false, pauseUntil: gate.pauseUntil, reason: "duplicate" };
  }

  gate.lastReadAt.set(barcode, now);
  gate.pauseUntil = now + BARCODE_CAMERA_PAUSE_MS;
  return { accepted: true, pauseUntil: gate.pauseUntil };
}
