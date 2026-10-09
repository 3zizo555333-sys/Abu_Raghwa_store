export type ScaleConnectionMode = "manual" | "keyboard" | "bluetooth" | "usb";
export type ScaleUnit = "kg" | "g";

export type ScaleSettings = {
  enabled: boolean;
  connectionMode: ScaleConnectionMode;
  deviceName: string;
  unit: ScaleUnit;
  decimalPlaces: number;
  connectedAt: string;
};

export const DEFAULT_SCALE_SETTINGS: ScaleSettings = {
  enabled: false,
  connectionMode: "manual",
  deviceName: "",
  unit: "kg",
  decimalPlaces: 3,
  connectedAt: "",
};

export function normalizeScaleSettings(value: unknown): ScaleSettings {
  const source = value && typeof value === "object" ? value as Partial<ScaleSettings> : {};
  const decimals = Number(source.decimalPlaces);
  const connectionMode = source.connectionMode;
  return {
    ...DEFAULT_SCALE_SETTINGS,
    ...source,
    enabled: source.enabled === true,
    connectionMode: connectionMode === "keyboard" || connectionMode === "bluetooth" || connectionMode === "usb" ? connectionMode : "manual",
    deviceName: String(source.deviceName || ""),
    unit: source.unit === "g" ? "g" : "kg",
    decimalPlaces: Number.isFinite(decimals) ? Math.min(6, Math.max(0, Math.round(decimals))) : 3,
    connectedAt: String(source.connectedAt || ""),
  };
}
