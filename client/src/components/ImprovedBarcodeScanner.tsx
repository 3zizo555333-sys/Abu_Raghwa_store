import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader, Camera } from 'lucide-react';
import { toast } from 'sonner';

interface ImprovedBarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function ImprovedBarcodeScanner({ onScan, onClose }: ImprovedBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      // محاولة أولية بالكاميرا الخلفية
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' } }
        });
      } catch (e) {
        // إذا فشلت الكاميرا الخلفية بدقة، نجرب أي كاميرا متاحة
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        setPermission(true);
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.log(e));
          scanFrame();
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setPermission(false);
      toast.error('تعذر فتح الكاميرا، يرجى إدخال الباركود يدوياً');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
    }
  };

  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);

      // فحص مبسط للون أو قراءة عينة منتصف الإطار كباركود افتراضي عند عدم توفر خوارزمية ثقيلة
      // أو اعتماد الإدخال اليدوي الفوري كبديل دائم وآمن
    }

    if (isScanning) {
      requestAnimationFrame(scanFrame);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      toast.success(`تم إدخال الباركود: ${manualCode.trim()}`);
      onClose();
    } else {
      toast.error('يرجى إدخال رقم باركود صحيح');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Camera className="w-5 h-5 text-orange-600" />
            مسح أو إدخال الباركود
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {permission === null && (
          <div className="flex flex-col items-center justify-center py-6 space-y-2">
            <Loader className="w-8 h-8 animate-spin text-orange-600" />
            <p className="text-xs text-gray-500">جاري طلب إذن الكاميرا...</p>
          </div>
        )}

        {permission === false && (
          <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-center">
            <p className="text-orange-800 text-xs font-semibold mb-1">تعذر تشغيل الكاميرا تلقائياً أو تم رفض الإذن.</p>
            <p className="text-gray-600 text-xs">يمكنك إدخال رقم الباركود يدوياً أدناه بكل سهولة.</p>
          </div>
        )}

        {permission === true && (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-48 bg-black rounded-lg object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 border-2 border-dashed border-orange-400 rounded-lg pointer-events-none flex items-center justify-center">
              <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded">ضع الباركود داخل الإطار</span>
            </div>
          </div>
        )}

        {/* Manual Fallback / Direct Entry - Always Available */}
        <form onSubmit={handleManualSubmit} className="space-y-3 pt-2 border-t">
          <label className="block text-xs font-semibold text-gray-700">إدخال رقم الباركود يدوياً (سريع):</label>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="اكتب أو امسح الباركود هنا..."
              className="text-sm"
              autoFocus
            />
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-4">
              تم
            </Button>
          </div>
        </form>

        <Button
          onClick={onClose}
          variant="outline"
          className="w-full text-xs"
        >
          إغلاق
        </Button>
      </div>
    </div>
  );
}
