import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

interface AdvancedCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageData: string) => void;
  title?: string;
}

export function AdvancedCameraModal({
  isOpen,
  onClose,
  onCapture,
  title = 'التقط صورة'
}: AdvancedCameraModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('خطأ في الكاميرا:', error);
      alert('لم يتمكن من الوصول إلى الكاميرا');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageData = canvasRef.current.toDataURL('image/jpeg');
        setCapturedImage(imageData);
        stopCamera();
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target?.result as string;
        setCapturedImage(imageData);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      handleClose();
    }
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!stream && !capturedImage && (
            <div className="flex gap-4">
              <Button
                onClick={startCamera}
                className="flex-1"
                size="lg"
              >
                <Camera className="mr-2 h-4 w-4" />
                افتح الكاميرا
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex-1"
                size="lg"
              >
                <ImageIcon className="mr-2 h-4 w-4" />
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

          {stream && !capturedImage && (
            <div className="space-y-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full rounded-lg bg-black"
              />
              <div className="flex gap-2">
                <Button
                  onClick={capturePhoto}
                  className="flex-1"
                  size="lg"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  التقط الصورة
                </Button>
                <Button
                  onClick={stopCamera}
                  variant="outline"
                  className="flex-1"
                >
                  <X className="mr-2 h-4 w-4" />
                  إلغاء
                </Button>
              </div>
            </div>
          )}

          {capturedImage && (
            <div className="space-y-4">
              <img
                src={capturedImage}
                alt="الصورة الملتقطة"
                className="w-full rounded-lg"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirm}
                  className="flex-1"
                  size="lg"
                >
                  تأكيد
                </Button>
                <Button
                  onClick={() => {
                    setCapturedImage(null);
                    startCamera();
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  إعادة محاولة
                </Button>
              </div>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
