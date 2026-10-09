import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Barcode, Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType, NotFoundException } from "@zxing/library";
import { getCameraConstraintAttempts, getCameraErrorMessage, isExpectedCameraAccessError } from "@/lib/cameraScanner";

interface AdvancedBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDetect: (barcode: string) => void;
  title?: string;
  continuous?: boolean;
}

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type ImageRegion = { x: number; y: number; width: number; height: number };

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC,
];

const NATIVE_DETECTOR_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar", "qr_code", "data_matrix", "pdf417", "aztec"];

function createBarcodeReader(tryHarder = false) {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
  if (tryHarder) hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, 140);
}

function getBarcodeDetectorConstructor() {
  return (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذر فتح الصورة"));
    image.src = url;
  });
}

function createContrastVariant(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return source;
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const contrast = 1.65;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance = imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114;
    const adjusted = Math.max(0, Math.min(255, (luminance - 128) * contrast + 128));
    imageData.data[index] = adjusted;
    imageData.data[index + 1] = adjusted;
    imageData.data[index + 2] = adjusted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function buildDecodeCanvases(image: HTMLImageElement): HTMLCanvasElement[] {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error("الصورة فارغة");

  const regions: ImageRegion[] = [
    { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
    { x: 0, y: sourceHeight * 0.2, width: sourceWidth, height: sourceHeight * 0.8 },
    { x: 0, y: sourceHeight * 0.5, width: sourceWidth, height: sourceHeight * 0.5 },
    { x: sourceWidth * 0.03, y: sourceHeight * 0.42, width: sourceWidth * 0.94, height: sourceHeight * 0.58 },
  ];

  return regions.map((region, index) => {
    const maxDimension = index === 0 ? 1800 : 1600;
    const scale = Math.min(1, maxDimension / Math.max(region.width, region.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(region.width * scale));
    canvas.height = Math.max(1, Math.round(region.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("تعذر تجهيز الصورة");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر تحويل الصورة")), "image/png");
  });
}

async function decodeWithZxingWasm(canvases: HTMLCanvasElement[]): Promise<string> {
  const { readBarcodes } = await import("zxing-wasm/reader");
  for (const canvas of canvases) {
    const results = await readBarcodes(await canvasToBlob(canvas), {
      formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF", "QRCode", "DataMatrix", "PDF417", "Aztec"],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: false,
      tryDenoise: true,
      maxNumberOfSymbols: 4,
    });
    const value = results.find(result => result.text?.trim())?.text?.trim();
    if (value) return value;
  }
  throw new Error("لم يتم العثور على باركود");
}

async function decodeWithZxing(file: File): Promise<string> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const canvases = buildDecodeCanvases(image);
    const Detector = getBarcodeDetectorConstructor();

    if (Detector) {
      try {
        const detector = new Detector({ formats: NATIVE_DETECTOR_FORMATS });
        for (const canvas of canvases) {
          const detected = await detector.detect(canvas);
          const value = detected.find(item => item.rawValue?.trim())?.rawValue?.trim();
          if (value) return value;
        }
      } catch {
        // ننتقل إلى ZXing إذا لم تدعم نسخة أندرويد كل الصيغ.
      }
    }

    const reader = createBarcodeReader(true);
    try {
      for (const canvas of canvases) {
        const candidates = [canvas];
        if (canvas !== canvases[0]) candidates.push(createContrastVariant(canvas));
        for (const candidate of candidates) {
          try {
            const result = await reader.decodeFromImageUrl(candidate.toDataURL("image/jpeg", 0.96));
            const value = result.getText().trim();
            if (value) return value;
          } catch {
            // نكمل المحاولة على الجزء التالي من الصورة.
          }
        }
      }
    } finally {
      reader.reset();
    }
    throw new Error("لم يتم العثور على باركود");
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function stopHtmlScanner(scanner: Html5Qrcode | null) {
  if (!scanner) return;
  try {
    if (scanner.isScanning) await scanner.stop();
  } catch {
    // قد يكون start لم يكتمل بعد؛ clear في الأسفل يكفي لتنظيف العناصر.
  }
  try {
    scanner.clear();
  } catch {
    // لا نعرض خطأ للمستخدم عند تنظيف عناصر الكاميرا.
  }
}

function cameraSelectorFromConstraints(constraints: MediaStreamConstraints): string | MediaTrackConstraints {
  const video = constraints.video;
  if (video && typeof video === "object") {
    const track = video as MediaTrackConstraints;
    if (track.facingMode) return { facingMode: track.facingMode };
    if (track.deviceId) return { deviceId: track.deviceId };
  }
  return { facingMode: "user" };
}

export function AdvancedBarcodeScanner({
  isOpen,
  onClose,
  onDetect,
  title = "ماسح الباركود",
  continuous = false,
}: AdvancedBarcodeScannerProps) {
  const scannerElementId = `barcode-scanner-${useId().replace(/:/g, "")}`;
  const [cameraReady, setCameraReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const liveScannerRef = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const startingRef = useRef(false);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const lastDetectedRef = useRef<{ value: string; at: number } | null>(null);

  const stopScanning = () => {
    sessionRef.current += 1;
    scanningRef.current = false;
    startingRef.current = false;
    const scanner = liveScannerRef.current;
    liveScannerRef.current = null;
    void stopHtmlScanner(scanner);
    if (mountedRef.current) {
      setCameraReady(false);
      setStarting(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (!isOpen) stopScanning();
    return () => {
      mountedRef.current = false;
      stopScanning();
    };
  }, [isOpen]);

  const startScanning = async () => {
    if (startingRef.current || scanningRef.current || !isOpen) return;
    stopScanning();
    const session = sessionRef.current;
    startingRef.current = true;
    setStarting(true);
    setCameraReady(false);
    setError(null);

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("Camera needs a secure browser context", "SecurityError");
      }

      let started = false;
      let lastError: unknown = null;
      for (const constraints of getCameraConstraintAttempts()) {
        if (!mountedRef.current || !isOpen || sessionRef.current !== session) return;
        // A failed Html5Qrcode.start attempt is cleaned up with clear(). Do
        // not reuse that cleared instance for the next camera constraint.
        const scanner = new Html5Qrcode(scannerElementId, {
          verbose: false,
          formatsToSupport: SUPPORTED_FORMATS,
          useBarCodeDetectorIfSupported: true,
        });
        liveScannerRef.current = scanner;
        scanningRef.current = true;
        try {
          await scanner.start(
            cameraSelectorFromConstraints(constraints),
            { fps: 8, qrbox: { width: 280, height: 160 }, aspectRatio: 1.777, disableFlip: false },
            decodedText => {
              if (!scanningRef.current || sessionRef.current !== session) return;
              const barcode = decodedText.trim();
              if (!barcode) return;
              const now = Date.now();
              if (continuous && lastDetectedRef.current?.value === barcode && now - lastDetectedRef.current.at < 1400) return;
              lastDetectedRef.current = { value: barcode, at: now };
              onDetect(barcode);
              if (!continuous) handleClose();
            },
            () => {
              // عدم العثور على كود في إطار واحد أمر طبيعي، ولا نعرضه كخطأ.
            },
          );
          started = true;
          break;
        } catch (attemptError) {
          lastError = attemptError;
          await stopHtmlScanner(scanner);
          if (liveScannerRef.current === scanner) liveScannerRef.current = null;
          if ((attemptError as DOMException)?.name === "NotAllowedError" || (attemptError as DOMException)?.name === "SecurityError") break;
        }
      }
      const scanner = liveScannerRef.current;
      if (!started || !scanner) throw lastError || new Error("No camera stream");
      if (!mountedRef.current || !isOpen || sessionRef.current !== session) {
        await stopHtmlScanner(scanner);
        return;
      }
      setCameraReady(true);
      scanningRef.current = true;
    } catch (caughtError) {
      if (!isExpectedCameraAccessError(caughtError)) console.error("خطأ غير متوقع في الكاميرا:", caughtError);
      if (mountedRef.current && sessionRef.current === session && isOpen) setError(getCameraErrorMessage(caughtError));
      stopScanning();
    } finally {
      startingRef.current = false;
      if (mountedRef.current && sessionRef.current === session && isOpen) setStarting(false);
    }
  };

  const prepareNativeCapture = () => {
    stopScanning();
    setError(null);
  };

  const handleCapturedCameraImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    stopScanning();
    setProcessingImage(true);
    setError(null);
    try {
      const fileScanner = new Html5Qrcode(scannerElementId, { verbose: false, formatsToSupport: SUPPORTED_FORMATS, useBarCodeDetectorIfSupported: true });
      let barcode = "";
      try {
        barcode = (await fileScanner.scanFile(file, false)).trim();
      } catch {
        // نستخدم معالجة القص والتحسين عندما لا تقرأ المكتبة الصورة كاملة.
      } finally {
        try { fileScanner.clear(); } catch {}
      }
      if (!barcode) {
        try {
          barcode = await decodeWithZxing(file);
        } catch {
          const imageUrl = URL.createObjectURL(file);
          try {
            const image = await loadImage(imageUrl);
            barcode = await decodeWithZxingWasm(buildDecodeCanvases(image));
          } finally {
            URL.revokeObjectURL(imageUrl);
          }
        }
      }
      onDetect(barcode);
      if (!continuous) handleClose();
    } catch {
      setError("لم أجد باركودًا واضحًا في الصورة. صوّر المربع قريبًا وبإضاءة جيدة، وتأكد أن الخطوط كاملة داخل الصورة، أو استخدم الإدخال اليدوي.");
    } finally {
      setProcessingImage(false);
    }
  };

  const handleManualInput = () => {
    const barcode = manualInput.trim();
    if (!barcode) return;
    onDetect(barcode);
    if (!continuous) handleClose();
  };

  const handleClose = () => {
    stopScanning();
    setManualInput("");
    setError(null);
    setProcessingImage(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            id={`${scannerElementId}-native-capture`}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="فتح كاميرا الهاتف أو المعرض"
            className="sr-only"
            onChange={handleCapturedCameraImage}
          />
          <div className="relative min-h-64">
            <div id={scannerElementId} className="min-h-64 w-full overflow-hidden rounded-2xl bg-black" aria-label="معاينة الكاميرا" />
            {!cameraReady && !starting && (
              <div className="absolute inset-0 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                <Camera className="mx-auto h-10 w-10 text-orange-500" />
                <p className="mt-3 font-bold text-slate-900">اختار طريقة المسح</p>
                <p className="mt-1 text-sm text-slate-600">صوّر مربع الباركود بالكاميرا الأصلية؛ بعد الرجوع سيقرأ التطبيق الصورة ويسجل الرقم تلقائيًا.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <label htmlFor={`${scannerElementId}-native-capture`} onClick={prepareNativeCapture} className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500"><ImageIcon className="ml-2 h-4 w-4" />تصوير بالكاميرا / المعرض</label>
                  <Button type="button" variant="outline" onClick={() => void startScanning()} className="border-orange-300 text-orange-700"><Camera className="ml-2 h-4 w-4" />تشغيل الكاميرا المباشرة</Button>
                </div>
              </div>
            )}
          </div>

          {cameraReady && <p className="text-center text-sm text-gray-600">وجّه المربع نحو الباركود وثبّت الهاتف لحظة. سيتم تسجيله تلقائيًا عند القراءة.</p>}
          {processingImage && <div className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-800"><Loader2 className="h-4 w-4 animate-spin" />جاري قراءة الباركود من الصورة...</div>}

          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p>{error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void startScanning()}>إعادة محاولة الكاميرا المباشرة</Button>
                <label htmlFor={`${scannerElementId}-native-capture`} onClick={prepareNativeCapture} className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"><Camera className="ml-1 h-4 w-4" />فتح كاميرا الهاتف</label>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">إدخال يدوي للباركود</label>
            <div className="flex gap-2">
              <Input value={manualInput} onChange={event => setManualInput(event.target.value)} placeholder="أدخل رمز الباركود يدويًا" dir="ltr" className="text-left" onKeyDown={event => { if (event.key === "Enter") handleManualInput(); }} />
              <Button type="button" onClick={handleManualInput} disabled={!manualInput.trim()}><Barcode className="mr-2 h-4 w-4" />تأكيد</Button>
            </div>
          </div>

          <Button type="button" onClick={handleClose} variant="outline" className="w-full"><X className="mr-2 h-4 w-4" />إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
