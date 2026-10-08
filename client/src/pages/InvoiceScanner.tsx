import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocation } from 'wouter';
import { ArrowLeft, Download, Share2, Trash2 } from 'lucide-react';
import AdvancedCamera from '@/components/AdvancedCamera';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ScannedInvoice {
  id: string;
  imageData: string;
  capturedAt: string;
  notes?: string;
}

export default function InvoiceScanner() {
  const [, navigate] = useLocation();
  const [invoices, setInvoices] = useState<ScannedInvoice[]>(() => {
    const saved = localStorage.getItem('abu_raghwa_scanned_invoices');
    return saved ? JSON.parse(saved) : [];
  });
  const [showCamera, setShowCamera] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ScannedInvoice | null>(null);

  const saveInvoices = (updated: ScannedInvoice[]) => {
    localStorage.setItem('abu_raghwa_scanned_invoices', JSON.stringify(updated));
    setInvoices(updated);
  };

  const handleCaptureImage = (imageData: string) => {
    const newInvoice: ScannedInvoice = {
      id: Date.now().toString(),
      imageData,
      capturedAt: new Date().toLocaleString('ar-EG'),
      notes: ''
    };

    saveInvoices([newInvoice, ...invoices]);
    setShowCamera(false);
  };

  const handleDownloadPDF = async (invoice: ScannedInvoice) => {
    try {
      const img = new Image();
      img.src = invoice.imageData;

      img.onload = () => {
        const pdf = new jsPDF({
          orientation: img.width > img.height ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [img.width * 0.264583, img.height * 0.264583]
        });

        pdf.addImage(invoice.imageData, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
        pdf.save(`فاتورة-${invoice.id}.pdf`);
      };
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('حدث خطأ في تحميل الفاتورة');
    }
  };

  const handleShare = async (invoice: ScannedInvoice) => {
    try {
      if (navigator.share) {
        // استخدام Web Share API إذا كانت متاحة
        const blob = await fetch(invoice.imageData).then(r => r.blob());
        const file = new File([blob], `فاتورة-${invoice.id}.jpg`, { type: 'image/jpeg' });

        await navigator.share({
          title: 'فاتورة',
          text: `فاتورة مسحوبة في ${invoice.capturedAt}`,
          files: [file]
        });
      } else {
        // fallback: نسخ الصورة للحافظة
        const blob = await fetch(invoice.imageData).then(r => r.blob());
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/jpeg': blob })
        ]);
        alert('تم نسخ الصورة. يمكنك الآن مشاركتها');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      alert('حدث خطأ في المشاركة');
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('هل تريد حذف هذه الفاتورة؟')) {
      saveInvoices(invoices.filter(inv => inv.id !== id));
      if (selectedInvoice?.id === id) {
        setSelectedInvoice(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">📸 ماسح الفواتير</h1>
              <p className="text-sm text-gray-600">التقط وأدر فواتيرك بسهولة</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Action Button */}
        <div className="mb-6">
          <Button
            onClick={() => setShowCamera(true)}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-6 text-lg"
          >
            📷 التقط فاتورة جديدة
          </Button>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Invoices List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>الفواتير المسحوبة ({invoices.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">لا توجد فواتير مسحوبة</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {invoices.map((invoice) => (
                      <button
                        key={invoice.id}
                        onClick={() => setSelectedInvoice(invoice)}
                        className={`w-full p-3 rounded-lg text-left transition ${
                          selectedInvoice?.id === invoice.id
                            ? 'bg-blue-100 border-2 border-blue-500'
                            : 'bg-gray-100 hover:bg-gray-200 border-2 border-transparent'
                        }`}
                      >
                        <p className="text-sm font-semibold">فاتورة #{invoice.id.slice(-4)}</p>
                        <p className="text-xs text-gray-600">{invoice.capturedAt}</p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Invoice Preview */}
          <div className="lg:col-span-2">
            {selectedInvoice ? (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>معاينة الفاتورة</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{selectedInvoice.capturedAt}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Image Preview */}
                  <div className="bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={selectedInvoice.imageData}
                      alt="فاتورة مسحوبة"
                      className="w-full h-auto"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-semibold mb-2">ملاحظات:</label>
                    <textarea
                      value={selectedInvoice.notes || ''}
                      onChange={(e) => {
                        const updated = invoices.map(inv =>
                          inv.id === selectedInvoice.id
                            ? { ...inv, notes: e.target.value }
                            : inv
                        );
                        saveInvoices(updated);
                        setSelectedInvoice({ ...selectedInvoice, notes: e.target.value });
                      }}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="أضف ملاحظات عن الفاتورة..."
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={() => handleDownloadPDF(selectedInvoice)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Download className="w-4 h-4 ml-2" />
                      تحميل
                    </Button>
                    <Button
                      onClick={() => handleShare(selectedInvoice)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Share2 className="w-4 h-4 ml-2" />
                      مشاركة
                    </Button>
                    <Button
                      onClick={() => handleDelete(selectedInvoice.id)}
                      variant="destructive"
                    >
                      <Trash2 className="w-4 h-4 ml-2" />
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <p className="text-gray-500 text-lg">اختر فاتورة لعرض التفاصيل</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Camera Modal */}
      {showCamera && (
        <AdvancedCamera
          onCapture={handleCaptureImage}
          onClose={() => setShowCamera(false)}
          title="📸 التقط الفاتورة"
          description="اختر طريقة الالتقاط"
        />
      )}
    </div>
  );
}
