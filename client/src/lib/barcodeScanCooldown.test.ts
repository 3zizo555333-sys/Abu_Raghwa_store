import { describe, expect, it } from "vitest";
import {
  acceptLiveBarcode,
  BARCODE_CAMERA_PAUSE_MS,
  BARCODE_DUPLICATE_WINDOW_MS,
  createBarcodeScanGate,
} from "./barcodeScanCooldown";

describe("live barcode scan cooldown", () => {
  it("pauses the camera for 1.5 seconds after an accepted read", () => {
    const gate = createBarcodeScanGate();
    const first = acceptLiveBarcode(gate, "  12345  ", 1_000);

    expect(first).toEqual({ accepted: true, pauseUntil: 1_000 + BARCODE_CAMERA_PAUSE_MS });
    expect(acceptLiveBarcode(gate, "67890", 1_100)).toMatchObject({ accepted: false, reason: "camera-paused" });
    expect(acceptLiveBarcode(gate, "67890", 2_500)).toMatchObject({ accepted: true, pauseUntil: 4_000 });
  });

  it("ignores the same barcode for two seconds after auto-resume", () => {
    const gate = createBarcodeScanGate();
    expect(acceptLiveBarcode(gate, "A-1", 10_000).accepted).toBe(true);
    expect(acceptLiveBarcode(gate, "A-1", 11_500)).toMatchObject({ accepted: false, reason: "duplicate" });
    expect(acceptLiveBarcode(gate, "A-1", 10_000 + BARCODE_DUPLICATE_WINDOW_MS)).toMatchObject({ accepted: true });
  });

  it("allows a different barcode after the pause and rejects empty values", () => {
    const gate = createBarcodeScanGate();
    acceptLiveBarcode(gate, "A", 1_000);
    expect(acceptLiveBarcode(gate, "B", 2_500).accepted).toBe(true);
    expect(acceptLiveBarcode(gate, "   ", 4_100)).toMatchObject({ accepted: false, reason: "empty" });
  });
});
