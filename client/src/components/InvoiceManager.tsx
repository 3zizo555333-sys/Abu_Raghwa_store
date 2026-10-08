import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Download, Share2, Trash2, Plus } from 'lucide-react';
import { AdvancedCameraModal } from './AdvancedCameraModal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Invoice {
  id: string;
  image: string;
  notes: string;
  date: string;
}

export function InvoiceManager() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const handleCapture = (imageData: string) => {
    const newInvoice: Invoice = {
      id: Date.now().toString(),
      image: imageData,
      notes,
      date: new Date().toLocaleString('ar-EG'),
    };
    setInvoices([newInvoice, ...invoices]);
    setNotes('');
    setCameraOpen(false);
  };

  const downloadInvoice = async (invoice: Invoice) => {
    try {
      const doc = new jsPDF();
      const img = new Image();
      img.src = invoice.image;

      img.onload = () => {
        const width = doc.internal.pageSize.getWidth();
        const height = (img.height / img.width) * width;

        doc.addImage(invoice.image, 'JPEG', 0, 0, width, height);

        if (invoice.notes) {
          doc.addPage();
          doc.text('الملاحظات:', 10, 10);
          doc.text(invoice.notes, 10, 20, { maxWidth: 190 });
        }

        doc.save(`invoice-${invoice.id}.pdf`);
      };
    } catch (error) {
      console.error('خطأ في التحميل:', error);
      alert('حدث خطأ في تحميل الفاتورة');
    }
  };

  const shareInvoice = async (invoice: Invoice) => {
    try {
      if (navigator.share) {
        const blob = await fetch(invoice.image).then(r => r.blob());
        const file = new File([blob], `invoice-${invoice.id}.jpg`, { type: 'image/jpeg' });

        await navigator.share({
          title: 'الفاتورة',
          text: invoice.notes || 'الفاتورة',
          files: [file],
        });
      } else {
        // Fallback for browsers that don't support Web Share API
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
          `الفاتورة: ${invoice.notes || 'بدون ملاحظات'}`
        )}`;
        window.open(whatsappUrl, '_blank');
      }
    } catch (error) {
      console.error('خطأ في المشاركة:', error);
    }
  };

  const deleteInvoice = (id: string) => {
    setInvoices(invoices.filter(inv => inv.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Camera Section */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">إضافة فاتورة جديدة</h3>
        <div className="space-y-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أضف ملاحظات عن الفاتورة..."
            className="min-h-24"
          />
          <Button
            onClick={() => setCameraOpen(true)}
            className="w-full"
            size="lg"
          >
            <Camera className="mr-2 h-4 w-4" />
            التقط الفاتورة
          </Button>
        </div>
      </Card>

      <AdvancedCameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCapture}
        title="التقط الفاتورة"
      />

      {/* Invoices List */}
      {invoices.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">الفواتير المحفوظة ({invoices.length})</h3>
          <div className="grid gap-4">
            {invoices.map((invoice) => (
              <Card key={invoice.id} className="overflow-hidden">
                <div className="grid md:grid-cols-3 gap-4 p-4">
                  {/* Image */}
                  <div className="md:col-span-1">
                    <img
                      src={invoice.image}
                      alt="الفاتورة"
                      className="w-full h-48 object-cover rounded-lg cursor-pointer"
                      onClick={() => setSelectedInvoice(invoice)}
                    />
                  </div>

                  {/* Details */}
                  <div className="md:col-span-1 space-y-2">
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">التاريخ:</span> {invoice.date}
                    </p>
                    {invoice.notes && (
                      <p className="text-sm">
                        <span className="font-semibold">الملاحظات:</span>
                        <br />
                        {invoice.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="md:col-span-1 flex flex-col gap-2">
                    <Button
                      onClick={() => downloadInvoice(invoice)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      تحميل PDF
                    </Button>
                    <Button
                      onClick={() => shareInvoice(invoice)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      مشاركة
                    </Button>
                    <Button
                      onClick={() => deleteInvoice(invoice.id)}
                      variant="destructive"
                      size="sm"
                      className="w-full"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      حذف
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedInvoice(null)}
        >
          <div className="bg-white rounded-lg max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-4">
              <img
                src={selectedInvoice.image}
                alt="الفاتورة"
                className="w-full rounded-lg"
              />
              <Button
                onClick={() => setSelectedInvoice(null)}
                className="w-full mt-4"
              >
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
