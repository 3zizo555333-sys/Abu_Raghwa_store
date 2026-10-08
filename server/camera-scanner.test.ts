import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCameraConstraintAttempts, getCameraErrorMessage, isExpectedCameraAccessError } from "../client/src/lib/cameraScanner";

describe("تهيئة كاميرا ماسح الباركود", () => {
  it("يبدأ بدقة خفيفة من الكاميرا الخلفية ثم يعود لكاميرا متاحة", () => {
    const attempts = getCameraConstraintAttempts();
    expect(attempts).toHaveLength(3);
    expect(attempts[0]?.video).toMatchObject({ facingMode: { exact: "environment" }, width: { ideal: 640, max: 960 } });
    expect(attempts[2]).toEqual({ video: { width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 720 } }, audio: false });
  });

  it("يعرض سببًا عمليًا عند رفض الإذن أو انشغال الكاميرا", () => {
    expect(getCameraErrorMessage({ name: "NotAllowedError" })).toContain("رفض المتصفح إذن الكاميرا");
    expect(getCameraErrorMessage({ name: "NotAllowedError" })).toContain("Chrome");
    expect(getCameraErrorMessage({ name: "SecurityError" })).toContain("فتح الرابط يمنع الوصول للكاميرا");
    expect(getCameraErrorMessage({ name: "NotReadableError" })).toContain("مشغولة");
    expect(getCameraErrorMessage(new Error("Permission denied"))).toContain("إعدادات الموقع");
    expect(isExpectedCameraAccessError(new Error("Permission denied"))).toBe(true);
  });

  it("يعرض بديل كاميرا الهاتف عند منع معاينة المتصفح", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../client/src/components/AdvancedBarcodeScanner.tsx"), "utf8");
    expect(source).toContain('capture="environment"');
    expect(source).toContain('className="sr-only"');
    expect(source).toContain('aria-label="فتح كاميرا الهاتف أو المعرض"');
    expect(source).toContain('htmlFor={`${scannerElementId}-native-capture`}');
    expect(source).toContain("prepareNativeCapture");
    expect(source).not.toContain("input?.click()");
    expect(source).toContain("فتح كاميرا الهاتف");
    expect(source).toContain("decodeWithZxing");
    expect(source).toContain("scanFile(file, false)");
    expect(source).toContain("Html5Qrcode");
    expect(source).toContain("جاري قراءة الباركود من الصورة");
    expect(source).toContain("sessionRef");
    expect(source).toContain("stopHtmlScanner");
    expect(source).toContain("scanner.start(");
    expect(source).toContain("if (startingRef.current || scanningRef.current || !isOpen) return;");
    expect(source).toContain("const canvases = buildDecodeCanvases(image)");
    expect(source).toContain("onDetect(barcode);");
    expect(source).toContain("handleClose();");
    expect(source).toContain("startingRef.current = true;");
    expect(source).toContain("scanner.isScanning");
    expect(source).toContain("useBarCodeDetectorIfSupported: true");
  });

  it("ينشئ ماسحًا جديدًا لكل محاولة للكاميرا المباشرة", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../client/src/components/AdvancedBarcodeScanner.tsx"), "utf8");
    expect(source).toMatch(/for \(const constraints of getCameraConstraintAttempts\(\)\) \{[\s\S]*?const scanner = new Html5Qrcode/);
    expect(source).toContain("if (liveScannerRef.current === scanner) liveScannerRef.current = null;");
  });

  it("يستخدم طبقة الحوار الأصلية حتى لا يمرر ref إلى مكوّن وظيفي", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../client/src/components/ui/dialog.tsx"), "utf8");
    expect(source).toContain("<DialogPrimitive.Overlay");
    expect(source).not.toContain("<DialogOverlay />");
  });
});
