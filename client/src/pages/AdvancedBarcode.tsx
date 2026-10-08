import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdvancedBarcodeScanner } from '@/components/AdvancedBarcodeScanner';
import { Barcode } from 'lucide-react';

export default function AdvancedBarcode() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);

  const handleDetect = (barcode: string) => {
    setScannedCode(barcode);
    setScannedCodes([barcode, ...scannedCodes]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ماسح الباركود</h1>
          <p className="text-gray-600">
            امسح الباركود باستخدام الكاميرا أو أدخله يدويًا
          </p>
        </div>

        {/* Scanner Card */}
        <Card className="p-6">
          <div className="space-y-4">
            <Button
              onClick={() => setScannerOpen(true)}
              size="lg"
              className="w-full"
            >
              <Barcode className="mr-2 h-4 w-4" />
              افتح ماسح الباركود
            </Button>

            {scannedCode && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">آخر باركود تم مسحه:</p>
                <p className="text-2xl font-mono font-bold text-green-700">
                  {scannedCode}
                </p>
              </div>
            )}
          </div>
        </Card>

        <AdvancedBarcodeScanner
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onDetect={handleDetect}
        />

        {/* History */}
        {scannedCodes.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">السجل ({scannedCodes.length})</h2>
            <div className="space-y-2">
              {scannedCodes.map((code, index) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200 font-mono text-sm"
                >
                  {code}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
