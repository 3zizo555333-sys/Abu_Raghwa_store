import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { CSSProperties } from 'react';
import { Download, Share2, Copy, ArrowLeft, Printer, MessageCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { buildInvoiceImageFilename, downloadImageBlob, openImageForManualSave } from '@/lib/invoiceImage';
import { buildLoyaltyWhatsAppUrl } from '@/lib/loyaltyReport';
import { getInvoiceLoyaltyPoints } from '@/lib/invoiceLoyalty';

interface SaleItem {
  productId: string;
  productName: string;
  selectedUnitType: string;
  quantity: number;
  unitPrice: number;
  total: number;
  loyaltyPoints?: number;
}

interface Sale {
  id: string;
  date: string;
  items: SaleItem[];
  subTotal?: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  discountAmount?: number;
  total: number;
  paymentMethod: string;
  customerName?: string;
  customerPhone?: string;
  customerCode?: string;
  loyaltyPointsAwarded?: number;
  returnedItems?: Array<{ lineIndex: number; quantity: number; total: number; pointsReversed: number; returnedAt: string }>;
  returnedTotal?: number;
  returnedPointsReversed?: number;
}

export default function Invoice() {
  const [, navigate] = useLocation();
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [thermalWidth, setThermalWidth] = useState<"58" | "80">(() => localStorage.getItem("abu_raghwa_thermal_width") === "58" ? "58" : "80");
  const [loyaltyQrDataUrl, setLoyaltyQrDataUrl] = useState("");

  useEffect(() => {
    const savedInvoice = localStorage.getItem("current_invoice");
    if (savedInvoice) {
      try {
        setSale(JSON.parse(savedInvoice));
      } catch (e) {
        console.error("خطأ في قراءة الفاتورة:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!sale?.customerCode) {
      setLoyaltyQrDataUrl("");
      return;
    }
    const loyaltyUrl = `${window.location.origin}/loyalty?code=${encodeURIComponent(sale.customerCode)}`;
    QRCode.toDataURL(loyaltyUrl, { width: 128, margin: 1, errorCorrectionLevel: "M" }).then(setLoyaltyQrDataUrl).catch(() => setLoyaltyQrDataUrl(""));
  }, [sale?.customerCode]);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(130, prev + 10));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(70, prev - 10));
  const handleResetZoom = () => setZoomLevel(100);

  const handlePrint = () => {
    localStorage.setItem("abu_raghwa_thermal_width", thermalWidth);
    window.print();
  };

  const canvasToPngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("تعذر إنشاء ملف PNG"));
    }, "image/png", 1);
  });

  const createFallbackInvoiceImageBlob = async () => {
    if (!sale) throw new Error("بيانات الفاتورة غير متاحة");

    const width = 1080;
    const rowHeight = 82;
    const hasCustomerDetails = Boolean(sale.customerName || sale.customerPhone);
    const customerDetailsOffset = hasCustomerDetails ? (sale.customerCode ? 92 : 58) : 0;
    const tableY = 314 + customerDetailsOffset;
    const height = Math.max(880, tableY + 54 + sale.items.length * rowHeight + (sale.customerCode ? 320 : 200));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر إعداد صورة الفاتورة");

    const right = width - 56;
    const drawRight = (value: string, y: number, font: string, color = "#1f2937") => {
      context.direction = "rtl";
      context.textAlign = "right";
      context.font = font;
      context.fillStyle = color;
      context.fillText(value, right, y);
    };
    const ellipsis = (value: string, maxLength: number) => value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff7ed";
    context.fillRect(0, 0, width, 190);
    context.fillStyle = "#ea580c";
    context.fillRect(0, 0, width, 12);

    context.direction = "rtl";
    context.textAlign = "center";
    context.font = "bold 38px Arial";
    context.fillStyle = "#c2410c";
    context.fillText("محلات أبو رغوة للمنظفات والعطور", width / 2, 72);
    context.font = "24px Arial";
    context.fillStyle = "#4b5563";
    context.fillText("أصل الرغوة في مصر — هنسيب علامة في بيتك", width / 2, 112);
    context.font = "bold 24px Arial";
    context.fillStyle = "#c2410c";
    context.fillText("للتواصل: 01069035599", width / 2, 150);

    drawRight(`رقم الفاتورة: ${sale.id}`, 235, "bold 25px Arial");
    drawRight(`التاريخ: ${new Date(sale.date).toLocaleDateString("ar-EG")}`, 278, "24px Arial");
    if (hasCustomerDetails) {
      drawRight(`اسم العميل: ${sale.customerName || "عميل"}`, 321, "bold 23px Arial");
      drawRight(`رقم الهاتف: ${sale.customerPhone || "غير محدد"}`, 354, "23px Arial");
      if (sale.customerCode) drawRight(`كود نقاط الولاء: ${sale.customerCode}`, 387, "bold 23px Arial");
    }

    const tableX = 48;
    const tableWidth = width - 96;
    const columns = [420, 170, 110, 150, 180];
    const headers = ["المنتج", "الوحدة", "الكمية", "السعر", "الإجمالي"];
    context.fillStyle = "#ea580c";
    context.fillRect(tableX, tableY, tableWidth, 54);
    context.font = "bold 21px Arial";
    context.fillStyle = "#ffffff";
    let headerRight = tableX + tableWidth;
    headers.forEach((header, index) => {
      const columnWidth = columns[index];
      context.direction = "rtl";
      context.textAlign = index < 2 ? "right" : "center";
      context.fillText(header, index < 2 ? headerRight - 14 : headerRight - columnWidth / 2, tableY + 34);
      headerRight -= columnWidth;
    });

    sale.items.forEach((item, index) => {
      const y = tableY + 54 + index * rowHeight;
      context.fillStyle = index % 2 === 0 ? "#fff7ed" : "#ffffff";
      context.fillRect(tableX, y, tableWidth, rowHeight);
      context.strokeStyle = "#fed7aa";
      context.strokeRect(tableX, y, tableWidth, rowHeight);
      let cellRight = tableX + tableWidth;
      const values = [ellipsis(item.productName, 26), item.selectedUnitType || "قطعة", String(item.quantity), item.unitPrice.toFixed(2), item.total.toFixed(2)];
      context.font = "21px Arial";
      values.forEach((value, cellIndex) => {
        const columnWidth = columns[cellIndex];
        context.direction = "rtl";
        context.textAlign = cellIndex < 2 ? "right" : "center";
        context.fillStyle = cellIndex === 4 ? "#c2410c" : "#374151";
        context.fillText(value, cellIndex < 2 ? cellRight - 14 : cellRight - columnWidth / 2, y + 49);
        cellRight -= columnWidth;
      });
    });

    const totalY = tableY + 54 + sale.items.length * rowHeight + 38;
    context.fillStyle = "#ea580c";
    context.fillRect(tableX, totalY, tableWidth, 96);
    context.direction = "rtl";
    context.textAlign = "right";
    context.font = "bold 28px Arial";
    context.fillStyle = "#ffffff";
    context.fillText(`الإجمالي النهائي: ${sale.total.toFixed(2)} ج.م`, right - 20, totalY + 58);
    const invoiceLoyaltyPoints = getInvoiceLoyaltyPoints(sale);
    if (invoiceLoyaltyPoints > 0) {
      context.font = "bold 22px Arial";
      context.fillText(`نقاط الولاء المكتسبة: ${invoiceLoyaltyPoints}`, right - 20, totalY + 88);
    }
    if (sale.customerCode) {
      const loyaltyUrl = `${window.location.origin}/loyalty?code=${encodeURIComponent(sale.customerCode)}`;
      const qrDataUrl = await QRCode.toDataURL(loyaltyUrl, { width: 128, margin: 1, errorCorrectionLevel: "M" });
      const qrImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("تعذر تحميل رمز نقاط الولاء"));
        image.src = qrDataUrl;
      });
      context.drawImage(qrImage, 48, totalY + 112, 128, 128);
      context.direction = "rtl";
      context.textAlign = "left";
      context.font = "bold 20px Arial";
      context.fillStyle = "#6b21a8";
      context.fillText("امسح الرمز لمتابعة نقاطك", 194, totalY + 180);
    }
    const footerY = totalY + (sale.customerCode ? 290 : 152);
    context.direction = "rtl";
    context.textAlign = "center";
    context.font = "22px Arial";
    context.fillStyle = "#6b7280";
    context.fillText("شكراً لتعاملكم معنا", width / 2, footerY);

    return canvasToPngBlob(canvas);
  };

  const createInvoiceImageBlob = async () => {
    if (!invoiceRef.current) throw new Error("عنصر الفاتورة غير متاح");

    const invoiceElement = invoiceRef.current;
    const previousTransform = invoiceElement.style.transform;
    invoiceElement.style.transform = "none";

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const canvas = await html2canvas(invoiceElement, {
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.clientWidth,
      });
      return await canvasToPngBlob(canvas);
    } catch (snapshotError) {
      console.warn("تعذر التقاط واجهة الفاتورة، سيتم استخدام الصورة البديلة:", snapshotError);
      return createFallbackInvoiceImageBlob();
    } finally {
      invoiceElement.style.transform = previousTransform;
    }
  };

  const handleDownloadImage = async () => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);

    try {
      const blob = await createInvoiceImageBlob();
      downloadImageBlob(blob, buildInvoiceImageFilename(sale?.id));
      toast.success("تم بدء تنزيل صورة الفاتورة بصيغة PNG على جهازك");
    } catch (error) {
      console.error("Invoice image download failed:", error);
      toast.error("تعذر التنزيل المباشر. استخدم زر «فتح الصورة للحفظ» كبديل.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleOpenImageForSaving = async () => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);

    try {
      const blob = await createInvoiceImageBlob();
      openImageForManualSave(blob);
      toast.info("فُتحت الصورة في صفحة جديدة؛ اضغط عليها مطولاً ثم اختر «حفظ الصورة».");
    } catch (error) {
      console.error("Invoice image preview failed:", error);
      toast.error("تعذر إنشاء صورة الفاتورة. أعد المحاولة بعد لحظات.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleNativeShare = async (includeImage: boolean) => {
    if (!sale || isGeneratingImage) return;
    setIsGeneratingImage(true);

    const itemsText = sale.items.map(i => `• ${i.productName}: ${i.quantity} ${i.selectedUnitType || "قطعة"} = ${i.total.toFixed(2)} ج.م`).join("\n");
    const invoiceLoyaltyPoints = getInvoiceLoyaltyPoints(sale);
    const loyaltyText = invoiceLoyaltyPoints > 0 || sale.customerCode ? `\nنقاط الولاء المكتسبة: ${invoiceLoyaltyPoints}${sale.customerCode ? `\nكود متابعة النقاط: ${sale.customerCode}\nصفحة النقاط: ${window.location.origin}/loyalty?code=${encodeURIComponent(sale.customerCode)}` : ""}` : "";
    const shareText = `فاتورة أبو رغوة للمنظفات\nرقم الفاتورة: ${sale.id}\nاسم العميل: ${sale.customerName || "عميل"}\nرقم الهاتف: ${sale.customerPhone || "غير محدد"}\n\n${itemsText}\n\nالإجمالي: ${sale.total.toFixed(2)} ج.م${loyaltyText}\nللتواصل: 01069035599`;

    try {
      if (includeImage) {
        const blob = await createInvoiceImageBlob();
        const imageFile = new File([blob], buildInvoiceImageFilename(sale.id), { type: "image/png" });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [imageFile] }))) {
          await navigator.share({ title: "فاتورة أبو رغوة", text: shareText, files: [imageFile] });
          toast.success("اختر WhatsApp من قائمة مشاركة الهاتف لإرسال صورة الفاتورة.");
          return;
        }

        downloadImageBlob(blob, buildInvoiceImageFilename(sale.id));
        toast.info("تم تنزيل الصورة؛ أرسلها من معرض الهاتف عبر WhatsApp.");
        return;
      }

      if (navigator.share) {
        await navigator.share({ title: "فاتورة أبو رغوة", text: shareText });
        return;
      }

      window.location.assign(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Native invoice share failed:", error);
      toast.error("تعذر فتح قائمة المشاركة. جرّب زر «إرسال الصورة» أو أرسلها من معرض الهاتف.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleShareLoyaltyViaWhatsApp = () => {
    if (!sale?.customerCode) return;
    const target = buildLoyaltyWhatsAppUrl(window.location.origin, sale.customerCode, sale.customerName, sale.customerPhone);
    window.open(target, "_blank", "noopener,noreferrer");
    toast.success(sale.customerPhone ? "تم تجهيز الرسالة لرقم العميل على WhatsApp." : "تم تجهيز رسالة مشاركة كود الولاء؛ اختر العميل من WhatsApp.");
  };

  if (!sale) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <p className="text-gray-600 mb-4">لا توجد فاتورة حالية للعرض</p>
        <Button onClick={() => navigate("/sales")} className="bg-orange-600 hover:bg-orange-700 text-white">
          العودة للمبيعات
        </Button>
      </div>
    );
  }

  const saleDate = new Date(sale.date);
  const returnedQuantityByLine = sale.items.map((_, lineIndex) => (sale.returnedItems || []).filter(item => item.lineIndex === lineIndex).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0));
  const returnedTotal = Math.max(0, Number(sale.returnedTotal) || 0);
  const netAfterReturns = Math.max(0, Number(sale.total) - returnedTotal);
  const invoiceLoyaltyPoints = getInvoiceLoyaltyPoints(sale);

  return (
    <div className="min-h-screen bg-gray-100 p-2 md:p-4 print:p-0 print:bg-white" dir="rtl">
      <div className="thermal-print-shell max-w-md mx-auto">
        {/* Top Controls Bar - Hidden on Print */}
        <div className="mb-3 flex flex-wrap justify-between items-center gap-2 bg-white p-2 rounded-lg shadow-sm print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/sales")}
            className="flex items-center gap-1 text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            العودة
          </Button>

          <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
            <button onClick={handleZoomOut} className="px-1.5 py-0.5 font-bold hover:bg-gray-200 rounded">−</button>
            <span className="font-semibold">{zoomLevel}%</span>
            <button onClick={handleZoomIn} className="px-1.5 py-0.5 font-bold hover:bg-gray-200 rounded">+</button>
            <button onClick={handleResetZoom} className="text-[10px] text-orange-600 underline mr-1">إعادة تعيين</button>
          </div>

          <div className="flex gap-1">
            <select value={thermalWidth} onChange={event => setThermalWidth(event.target.value as "58" | "80")} className="h-7 rounded border border-orange-200 bg-white px-1 text-[10px] font-bold text-orange-800" title="اختر مقاس رول الطابعة الحرارية">
              <option value="80">حراري 80 مم</option>
              <option value="58">حراري 58 مم</option>
            </select>
            <Button size="sm" onClick={handleDownloadImage} disabled={isGeneratingImage} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-2">
              <Download className="w-3.5 h-3.5" />
              <span className="mr-1">{isGeneratingImage ? "جاري الإنشاء" : "تحميل صورة"}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleOpenImageForSaving} disabled={isGeneratingImage} className="border-blue-300 text-blue-700 text-xs h-7 px-2" title="فتح الصورة في صفحة مستقلة للحفظ اليدوي">
              <span>فتح للحفظ</span>
            </Button>
            <Button size="sm" onClick={() => handleNativeShare(false)} className="bg-green-600 hover:bg-green-700 text-white text-xs h-7 px-2" title="اختر WhatsApp من قائمة مشاركة الهاتف">
              <Share2 className="w-3.5 h-3.5" />
              <span className="mr-1">مشاركة</span>
            </Button>
            {sale.customerCode && <Button size="sm" onClick={handleShareLoyaltyViaWhatsApp} className="bg-green-500 hover:bg-green-600 text-white text-xs h-7 px-2" title="إرسال كود ورابط نقاط العميل عبر WhatsApp">
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="mr-1">كود واتساب</span>
            </Button>}
            <Button size="sm" onClick={() => handleNativeShare(true)} disabled={isGeneratingImage} className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-7 px-2" title="إرسال صورة الفاتورة عبر قائمة المشاركة">
              <Share2 className="w-3.5 h-3.5" />
              <span className="mr-1">إرسال الصورة</span>
            </Button>
            <Button size="sm" onClick={handlePrint} className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-7 px-2">
              <Printer className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Invoice Card - Compact & Full Screen Fit */}
        <div className="thermal-receipt bg-white rounded-lg shadow-lg overflow-hidden border border-orange-100" style={{ "--receipt-width": `${thermalWidth}mm` } as CSSProperties}>
          <div
            ref={invoiceRef}
            className="bg-gradient-to-b from-orange-50 to-white p-4"
            style={{ 
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
            }}
          >
            {/* Header */}
            <div className="text-center mb-3 pb-2 border-b border-orange-300">
              <h1 className="text-base font-bold text-orange-700 mb-0.5">
                محلات أبو رغوة للمنظفات والعطور
              </h1>
              <p className="text-[10px] text-gray-600 italic mb-1">
                "أبو رغوة أصل الرغوة في مصر" | "هنسيب علامة في بيتك"
              </p>
              <div className="text-[10px] text-gray-700 font-semibold">
                📞 للتواصل: <span className="text-orange-700 font-bold">01069035599</span>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="mb-2 flex justify-between items-center bg-orange-100/60 px-2 py-1.5 rounded text-[11px]">
              <div>
                <span className="text-gray-500">رقم الفاتورة: </span>
                <span className="font-bold text-gray-800">{sale.id}</span>
              </div>
              <div>
                <span className="text-gray-500">التاريخ: </span>
                <span className="font-bold text-gray-800">{saleDate.toLocaleDateString('ar-EG')}</span>
              </div>
            </div>

            {(sale.customerName || sale.customerPhone || sale.customerCode) && (
              <div className="mb-2 flex justify-between items-center bg-white/80 px-2 py-1.5 rounded border border-orange-200 text-[11px]">
                <div>
                  <span className="text-gray-500">اسم العميل: </span>
                  <span className="font-bold text-gray-800">{sale.customerName || 'عميل'}</span>
                </div>
                <div>
                  <span className="text-gray-500">رقم الهاتف: </span>
                  <span className="font-bold text-gray-800">{sale.customerPhone || 'غير محدد'}</span>
                </div>
                {sale.customerCode && <div>
                  <span className="text-gray-500">كود النقاط: </span>
                  <span className="font-bold text-purple-700" dir="ltr">{sale.customerCode}</span>
                </div>}
              </div>
            )}

            {/* Items Table - No Horizontal Scroll needed */}
            <div className="mb-2">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-orange-600 text-white">
                    <th className="border border-orange-700 p-1 text-right font-bold">المنتج</th>
                    <th className="border border-orange-700 p-1 text-right font-bold">الوحدة</th>
                    <th className="border border-orange-700 p-1 text-center font-bold">الكمية</th>
                    <th className="border border-orange-700 p-1 text-center font-bold">السعر</th>
                    <th className="border border-orange-700 p-1 text-center font-bold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-orange-50/50' : 'bg-white'}>
                      <td className="border border-gray-200 p-1 text-right font-semibold text-gray-900 truncate max-w-[90px]">
                        {item.productName}
                      </td>
                      <td className="border border-gray-200 p-1 text-right text-gray-700">
                        {item.selectedUnitType || 'قطعة'}
                      </td>
                      <td className="border border-gray-200 p-1 text-center font-semibold text-gray-900">
                        <span>{Math.max(0, item.quantity - returnedQuantityByLine[index])}</span>
                        {returnedQuantityByLine[index] > 0 && <span className="mt-0.5 block text-[9px] font-bold text-amber-700">أُرجع {returnedQuantityByLine[index]}</span>}
                      </td>
                      <td className="border border-gray-200 p-1 text-center text-gray-700">
                        {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="border border-gray-200 p-1 text-center font-bold text-orange-700 bg-orange-50">
                        {item.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Section */}
            <div className="mb-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white p-2 rounded shadow text-[11px] space-y-0.5">
              {sale.discountAmount && sale.discountAmount > 0 ? (
                <>
                  <div className="flex justify-between items-center text-orange-100">
                    <span>إجمالي المنتجات:</span>
                    <span>{(sale.subTotal ?? (sale.total + sale.discountAmount)).toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center text-orange-100">
                    <span>الخصم ({sale.discountType === 'percent' ? `${sale.discountValue}%` : 'ثابت'}):</span>
                    <span>−{sale.discountAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-orange-400 font-bold text-xs">
                    <span>الإجمالي النهائي:</span>
                    <span>{sale.total.toFixed(2)} ج.م</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center font-bold text-xs">
                  <span>الإجمالي النهائي:</span>
                  <span>{sale.total.toFixed(2)} ج.م</span>
                </div>
              )}
            </div>

            {returnedTotal > 0 && <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900">
              <div className="flex justify-between"><span>إجمالي الفاتورة الأصلية:</span><strong>{sale.total.toFixed(2)} ج.م</strong></div>
              <div className="mt-1 flex justify-between"><span>قيمة المرتجع المسجل:</span><strong>−{returnedTotal.toFixed(2)} ج.م</strong></div>
              <div className="mt-1 flex justify-between border-t border-amber-200 pt-1 font-black"><span>الصافي بعد المرتجع:</span><strong>{netAfterReturns.toFixed(2)} ج.م</strong></div>
              <p className="mt-1 text-amber-700">تم عكس {sale.returnedPointsReversed || 0} نقطة ولاء مع الحفاظ على الفاتورة الأصلية.</p>
            </div>}

            {(invoiceLoyaltyPoints > 0 || sale.customerCode) && <div className="mb-2 flex items-center justify-between gap-3 rounded border border-purple-200 bg-purple-50 p-2 text-[10px]">
              <div><p className="font-black text-purple-900">كسبت {invoiceLoyaltyPoints} نقطة ولاء</p><p className="mt-1 text-purple-700">{sale.customerCode ? "امسح الرمز أو افتح الرابط لمتابعة رصيدك" : "تم احتساب نقاط منتجات هذه الفاتورة"}</p></div>
              {loyaltyQrDataUrl && <img src={loyaltyQrDataUrl} alt="رمز صفحة نقاط الولاء" className="h-16 w-16 rounded bg-white p-1" />}
            </div>}

            {/* Payment & Footer Mini */}
            <div className="flex justify-between items-center text-[10px] text-gray-600 bg-gray-50 p-1.5 rounded border border-gray-200">
              <span>طريقة الدفع: {sale.paymentMethod === 'cash' ? 'نقداً' : 'أخرى'}</span>
              <span className="font-bold text-orange-700">شكراً لتعاملكم معنا ❤️</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
