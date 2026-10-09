import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Loader, AlertCircle } from 'lucide-react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';

interface BarcodeReaderAdvancedProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeReaderAdvanced({ onScan, onClose }: BarcodeReaderAdvancedProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  useEffect(() => {
    const startScanner = async () => {
      try {
        setError(null);

        const scanner = new Html5QrcodeScanner(
          'barcode-scanner-container',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
            defaultZoomValueIfSupported: 2
          },
          false
        );

        scannerRef.current = scanner;

        scanner.render(
          (decodedText) => {
            setScannedCode(decodedText);
            onScan(decodedText);
          },
          (error) => {
            // Ignore scanning errors
            console.debug('Scan error:', error);
          }
        );

        setIsLoading(false);
      } catch (err) {
        console.error('Scanner initialization error:', err);
        setError('فشل تشغيل ماسح الباركود. يرجى التحقق من الأذونات.');
        setIsLoading(false);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (err) {
          console.error('Error clearing scanner:', err);
        }
      }
    };
  }, [onScan]);

  const handleClose = () => {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error clearing scanner:', err);
      }
    }
    onClose();
  };

  const handleManualInput = () => {
    const barcode = prompt('أدخل رمز الباركود يدوياً:');
    if (barcode?.trim()) {
      onScan(barcode.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">📱 ماسح الباركود</h2>
            <p className="text-sm text-purple-100 mt-1">وجه الكاميرا نحو الباركود</p>
          </div>
          <button onClick={handleClose} className="text-white hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 p-4 text-red-800 text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center">
            <Loader className="w-8 h-8 text-purple-600 animate-spin mb-3" />
            <p className="text-gray-700 text-center">جاري تشغيل ماسح الباركود...</p>
          </div>
        )}

        {/* Scanner Container */}
        {!isLoading && !error && (
          <div className="p-4">
            <div id="barcode-scanner-container" className="w-full" />
          </div>
        )}

        {/* Scanned Result */}
        {scannedCode && (
          <div className="bg-green-50 border-b border-green-200 p-4 text-green-800 text-sm">
            ✅ تم المسح: <span className="font-bold">{scannedCode}</span>
          </div>
        )}

        {/* Controls */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex gap-2">
          <Button onClick={handleClose} variant="outline" className="flex-1">
            إغلاق
          </Button>
          <Button
            onClick={handleManualInput}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            إدخال يدوي
          </Button>
        </div>

        {/* Footer */}
        <div className="bg-purple-50 px-4 py-3 border-t border-purple-200 text-sm text-purple-800">
          💡 تأكد من إضاءة جيدة وركز على الباركود
        </div>
      </div>
    </div>
  );
}
