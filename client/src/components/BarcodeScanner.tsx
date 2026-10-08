import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (!isMounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setIsLoading(false);
            startScanning();
          };
        }
      } catch (error) {
        console.error('Camera error:', error);
        if (isMounted) {
          setError('لم يتمكن من الوصول للكاميرا. يرجى التحقق من الأذونات.');
          setIsLoading(false);
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      scanningRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startScanning = () => {
    if (scanningRef.current) return;
    scanningRef.current = true;

    const scanFrame = () => {
      if (!scanningRef.current || !videoRef.current || !canvasRef.current) return;

      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // محاولة قراءة الباركود من الصورة
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const barcode = detectBarcode(imageData);

        if (barcode) {
          onScan(barcode);
          return;
        }
      } catch (err) {
        console.error('Scanning error:', err);
      }

      requestAnimationFrame(scanFrame);
    };

    scanFrame();
  };

  // دالة بسيطة لكشف الباركود من الصورة
  const detectBarcode = (imageData: ImageData): string | null => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // البحث عن أنماط الباركود (خطوط سوداء وبيضاء)
    let barcode = '';
    let inBarcode = false;
    let barcodeStart = -1;

    for (let y = Math.floor(height * 0.3); y < Math.floor(height * 0.7); y++) {
      let line = '';
      let lastPixel = 255;

      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;

        const isBlack = brightness < 128;
        const pixel = isBlack ? 0 : 1;

        if (pixel !== lastPixel) {
          line += pixel;
          lastPixel = pixel;
        }
      }

      // البحث عن أنماط الباركود
      if (line.includes('101') && line.length > 20) {
        barcode = line;
        break;
      }
    }

    // محاولة استخراج الأرقام من النمط
    if (barcode && barcode.length > 20) {
      // هذا تبسيط - في الواقع نحتاج مكتبة متخصصة
      return extractBarcodeNumber(barcode);
    }

    return null;
  };

  const extractBarcodeNumber = (pattern: string): string | null => {
    // محاولة استخراج أرقام من النمط
    const numbers = pattern.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      const barcode = numbers.join('');
      if (barcode.length >= 8 && barcode.length <= 14) {
        return barcode;
      }
    }
    return null;
  };

  const handleClose = () => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    onClose();
  };

  const handleManualInput = () => {
    const barcode = prompt('أدخل رمز الباركود:');
    if (barcode?.trim()) {
      onScan(barcode.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">📷 ماسح الباركود</h2>
            <p className="text-sm text-blue-100 mt-1">وجه الكاميرا نحو الباركود</p>
          </div>
          <button onClick={handleClose} className="text-white hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-b border-red-200 p-4 text-red-800 text-sm">
            ⚠️ {error}
          </div>
        )}

        <div className="p-4">
          <div className="relative bg-black rounded-lg overflow-hidden">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
                <div className="text-center">
                  <Loader className="w-8 h-8 text-white animate-spin mx-auto mb-2" />
                  <p className="text-white text-sm">جاري تشغيل الكاميرا...</p>
                </div>
              </div>
            )}
            <video
              ref={videoRef}
              className="w-full h-80 object-cover"
              playsInline
              autoPlay
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 border-2 border-green-400 rounded-lg opacity-50"></div>
              <div className="absolute top-0 left-0 right-0 h-1/4 bg-gradient-to-b from-black to-transparent opacity-30"></div>
              <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-black to-transparent opacity-30"></div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 border-t border-gray-200 flex gap-2">
          <Button onClick={handleClose} variant="outline" className="flex-1">
            إغلاق
          </Button>
          <Button onClick={handleManualInput} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
            إدخال يدوي
          </Button>
        </div>

        <div className="bg-blue-50 px-4 py-3 border-t border-blue-200 text-sm text-blue-800">
          💡 تأكد من إضاءة جيدة وركز على الباركود - أو استخدم الإدخال اليدوي
        </div>
      </div>
    </div>
  );
}
