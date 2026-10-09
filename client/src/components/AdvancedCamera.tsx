import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Camera, Image as ImageIcon, Loader } from 'lucide-react';

interface AdvancedCameraProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
}

export default function AdvancedCamera({ 
  onCapture, 
  onClose, 
  title = "📷 التقط صورة",
  description = "اختر طريقة الالتقاط"
}: AdvancedCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [showCameraOptions, setShowCameraOptions] = useState(true);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setCameraActive(true);
          setShowCameraOptions(false);
          setIsLoading(false);
        };
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('لم يتمكن من الوصول للكاميرا. يرجى التحقق من الأذونات.');
      setIsLoading(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.95);
    onCapture(imageData);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      onCapture(imageData);
    };
    reader.readAsDataURL(file);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setCameraActive(false);
    setShowCameraOptions(true);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-blue-100 mt-1">{description}</p>
          </div>
          <button onClick={handleClose} className="text-white hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 p-4 text-red-800 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Camera View */}
        {cameraActive && (
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
              
              {/* Focus Frame */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 border-2 border-green-400 rounded-lg opacity-50"></div>
              </div>
            </div>
          </div>
        )}

        {/* Options Menu */}
        {showCameraOptions && !cameraActive && (
          <div className="p-6 space-y-4">
            <Button
              onClick={startCamera}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg"
            >
              <Camera className="w-5 h-5 ml-2" />
              التقط صورة من الكاميرا
            </Button>

            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full py-6 text-lg"
            >
              <ImageIcon className="w-5 h-5 ml-2" />
              اختر من المعرض
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {/* Camera Controls */}
        {cameraActive && (
          <div className="bg-gray-50 p-4 border-t border-gray-200 flex gap-2">
            <Button onClick={stopCamera} variant="outline" className="flex-1">
              إلغاء
            </Button>
            <Button
              onClick={capturePhoto}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              📸 التقط الصورة
            </Button>
          </div>
        )}

        {/* Footer */}
        {showCameraOptions && (
          <div className="bg-blue-50 px-4 py-3 border-t border-blue-200 text-sm text-blue-800">
            💡 اختر طريقة الالتقاط المناسبة لك
          </div>
        )}
      </div>
    </div>
  );
}
