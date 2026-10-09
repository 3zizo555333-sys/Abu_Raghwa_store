import { useCallback, useEffect, useRef, useState } from "react";
import type { ScaleUnit } from "./scaleSettings";

export type ScaleReading = { value: number; unit: ScaleUnit; stable: boolean; raw: string; receivedAt: number };
export type ScaleConnectionStatus = "unsupported" | "disconnected" | "connecting" | "connected" | "error";

type SerialPortLike = { open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; flowControl?: string }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array> | null; writable?: WritableStream<Uint8Array> | null };
type SerialNavigator = Navigator & { serial?: { requestPort(): Promise<SerialPortLike> } };
type UsbDeviceLike = { open(): Promise<void>; close(): Promise<void>; configurations?: Array<{ configurationValue: number; interfaces: Array<{ interfaceNumber: number; alternates: Array<{ endpoints?: Array<{ endpointNumber: number; direction: string; type: string }> }> }> }>; configuration?: { interfaces: Array<{ interfaceNumber: number; alternates: Array<{ endpoints?: Array<{ endpointNumber: number; direction: string; type: string }> }> }> }; selectConfiguration(value: number): Promise<void>; claimInterface(value: number): Promise<void>; transferIn(endpoint: number, length: number): Promise<{ data?: DataView }>; releaseInterface?(value: number): Promise<void> };
type UsbNavigator = Navigator & { usb?: { requestDevice(options: { filters: Array<Record<string, never>> }): Promise<UsbDeviceLike> } };

export function parseScaleReading(raw: string, preferredUnit: ScaleUnit = "kg"): ScaleReading | null {
  const text = raw.trim();
  if (!text || /(?:over|error|err|unstable|underload|overload)/i.test(text)) return null;
  const normalized = text.replace(/[٫،]/g, ".").replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = normalized.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const explicitUnit = /\b(g|gram|grams|جرام)\b/i.test(normalized) ? "g" : /\b(kg|kilogram|كيلو|كجم)\b/i.test(normalized) ? "kg" : preferredUnit;
  const stable = !/(?:motion|unstable|moving|غير مستقر)/i.test(normalized) && /(?:stable|st|استقرار|ثابت)/i.test(normalized) || !/(?:motion|unstable|moving|غير مستقر)/i.test(normalized);
  return { value: explicitUnit === "g" ? parsed / 1000 : parsed, unit: "kg", stable, raw: text, receivedAt: Date.now() };
}

export function useScaleConnection(preferredUnit: ScaleUnit = "kg") {
  const [status, setStatus] = useState<ScaleConnectionStatus>(() => typeof navigator !== "undefined" && ("serial" in navigator || "usb" in navigator) ? "disconnected" : "unsupported");
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const portRef = useRef<SerialPortLike | null>(null);
  const usbRef = useRef<{ device: UsbDeviceLike; interfaceNumber: number; endpointNumber: number } | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const bufferRef = useRef("");
  const stopRef = useRef(false);

  const disconnect = useCallback(async () => {
    stopRef.current = true;
    try { await readerRef.current?.cancel(); } catch {}
    readerRef.current = null;
    try { await portRef.current?.close(); } catch {}
    portRef.current = null;
    if (usbRef.current) {
      try { await usbRef.current.device.releaseInterface?.(usbRef.current.interfaceNumber); } catch {}
      try { await usbRef.current.device.close(); } catch {}
      usbRef.current = null;
    }
    setStatus(typeof navigator !== "undefined" && ("serial" in navigator || "usb" in navigator) ? "disconnected" : "unsupported");
  }, []);

  const connect = useCallback(async () => {
    const serial = (navigator as SerialNavigator).serial;
    const usb = (navigator as UsbNavigator).usb;
    if (!serial && !usb) throw new Error("هذا المتصفح لا يدعم Web Serial أو WebUSB. استخدم ميزاناً يرسل الوزن كلوحة مفاتيح.");
    await disconnect();
    setStatus("connecting");
    try {
      if (!serial && usb) {
        const device = await usb.requestDevice({ filters: [] });
        await device.open();
        const configuration = device.configuration || device.configurations?.[0];
        if (!configuration) await device.selectConfiguration(1);
        const active = device.configuration || device.configurations?.[0];
        const candidate = active?.interfaces.flatMap(item => item.alternates.map(alternate => ({ interfaceNumber: item.interfaceNumber, alternate }))).find(item => item.alternate.endpoints?.some(endpoint => endpoint.direction === "in" && endpoint.type === "bulk"));
        const endpoint = candidate?.alternate.endpoints?.find(item => item.direction === "in" && item.type === "bulk");
        if (!candidate || !endpoint) throw new Error("لم أجد قناة USB لقراءة بيانات الميزان.");
        await device.claimInterface(candidate.interfaceNumber);
        usbRef.current = { device, interfaceNumber: candidate.interfaceNumber, endpointNumber: endpoint.endpointNumber };
        stopRef.current = false;
        setStatus("connected");
        while (!stopRef.current) {
          const result = await device.transferIn(endpoint.endpointNumber, 64);
          const chunk = result.data ? new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength) : new Uint8Array();
          bufferRef.current += decoderRef.current.decode(chunk, { stream: true });
          const frames = bufferRef.current.split(/[\r\n]+/);
          bufferRef.current = frames.pop() || "";
          for (const frame of frames) { const parsed = parseScaleReading(frame, preferredUnit); if (parsed) setReading(parsed); }
        }
        return;
      }
      if (!serial) throw new Error("لم يتوفر منفذ Serial.");
      const port = await serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      portRef.current = port;
      stopRef.current = false;
      setStatus("connected");
      const reader = port.readable?.getReader();
      if (!reader) throw new Error("لم يفتح الميزان قناة قراءة البيانات.");
      readerRef.current = reader;
      while (!stopRef.current) {
        const result = await reader.read();
        if (result.done) break;
        bufferRef.current += decoderRef.current.decode(result.value, { stream: true });
        const frames = bufferRef.current.split(/[\r\n]+/);
        bufferRef.current = frames.pop() || "";
        for (const frame of frames) {
          const parsed = parseScaleReading(frame, preferredUnit);
          if (parsed) setReading(parsed);
        }
      }
    } catch (error) {
      await disconnect();
      if ((error as DOMException)?.name === "NotFoundError") return;
      setStatus("error");
      throw error;
    }
  }, [disconnect, preferredUnit]);

  useEffect(() => () => { void disconnect(); }, [disconnect]);
  return { status, reading, connect, disconnect, isSupported: status !== "unsupported" };
}
