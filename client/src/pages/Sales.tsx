import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Barcode, Download, MessageCircle, Trash2, Printer, Plus, ArrowLeft, Search, RotateCcw } from "lucide-react";
import { useNotification } from "@/components/NotificationSystem";
import { SalesAlertManager } from "@/components/SalesAlertManager";
import Cashier from "@/pages/Cashier";
import { getContentUnit, getPackageStockDeduction, getSalePriceForUnit, getSaleUnitOptions } from "@/lib/packageUnits";
import { appendSaleReturn, calculateReturnItems } from "@/lib/salesReturns";
import { trpc } from "@/lib/trpc";
import { useCloudState } from "@/lib/cloudSync";
import { useSalesCloudState } from "@/lib/useSalesCloudState";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  sku: string;
  wholesalePrice: number;
  unitName: string;
  unitType: string;
  unitValue: number;
  pieces: number;
  unitsPerPackage?: number;
  unit?: string;
  contentUnit?: string;
  availableQuantity?: number;
  retailPrice: number;
  wholesaleRetailPrice: number;
  bulkPrice?: number;
  quantity: number;
  category: string;
  profitPercentage: number;
  loyaltyPoints?: number;
}

interface SaleItem {
  productId: string;
  productName: string;
  selectedUnitType: string;
  quantity: number;
  unitPrice: number;
  total: number;
  loyaltyPoints?: number;
}

interface ReturnedSaleItem {
  lineIndex: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  pointsReversed: number;
  returnedAt: string;
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
  customerName: string;
  customerPhone: string;
  customerCode?: string;
  loyaltyPointsAwarded?: number;
  returnedItems?: ReturnedSaleItem[];
  returnedTotal?: number;
  returnedPointsReversed?: number;
  saleType: 'retail' | 'wholesale' | 'bulk';
}

export default function Sales() {
  const [, navigate] = useLocation();
  const { addNotification } = useNotification();
  const [saleMode, setSaleMode] = useState<"choose" | "normal" | "cashier">("choose");
  const [showSalesList, setShowSalesList] = useState(false);
  const [sales, setSales] = useSalesCloudState<Sale>();

  const [baseProducts, setBaseProducts] = useCloudState<Product[]>("abu_raghwa_products", []);
  const [cloudRecipes] = useCloudState<any[]>("abu_raghwa_recipes", []);
  const recipes = useMemo(() => {
    try {
      return (Array.isArray(cloudRecipes) ? cloudRecipes : []).map((recipe: any) => ({
        id: `catalog_recipe_${recipe.id}`,
        name: recipe.name || "تركيبة",
        sku: "تركيبة",
        wholesalePrice: Number(recipe.salePrice || recipe.catalogPrice || 0),
        unitName: recipe.productionUnit || "وحدة",
        unitType: "recipe",
        unitValue: 1,
        pieces: 1,
        quantity: 0,
        category: recipe.category || "تركيبات",
        retailPrice: Number(recipe.catalogPrice || recipe.salePrice || 0),
        wholesaleRetailPrice: Number(recipe.catalogPrice || recipe.salePrice || 0),
        bulkPrice: Number(recipe.catalogPrice || recipe.salePrice || 0),
        profitPercentage: 0,
        loyaltyPoints: Number(recipe.loyaltyPoints || 0),
        catalogImageUrl: recipe.catalogImageUrl,
        unit: recipe.productionUnit || "وحدة",
      }));
    } catch {
      return [];
    }
  }, [cloudRecipes]);
  const products = useMemo(() => [...baseProducts, ...recipes], [baseProducts, recipes]);

  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const catalogLogin = trpc.catalog.loginWithStaffSession.useMutation({ onSuccess: result => { try { sessionStorage.setItem("abu_catalog_admin_token", result.token); } catch {} } });
  const recordDirectSaleLoyalty = trpc.catalog.recordDirectSaleLoyalty.useMutation();
  const reverseDirectSaleLoyalty = trpc.catalog.reverseDirectSaleLoyalty.useMutation();
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({});
  useEffect(() => {
    if (sessionStorage.getItem("abu_catalog_admin_token")) return;
    catalogLogin.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [saleType, setSaleType] = useState<'retail' | 'wholesale' | 'bulk'>('retail');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState("");

  const getProductUnits = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return [];
    return getSaleUnitOptions(product);
  };

  const filteredSaleProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    return !query || product.name.toLowerCase().includes(query);
  });

  const handleAddProduct = () => {
    // جميع الحقول اختيارية

    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    const qty = parseFloat(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return alert("أدخل كمية صحيحة أولًا");
    if (!selectedUnit) return alert("اختر البيع بالعبوة أو بوحدة المحتوى أولًا");
    // تحديد السعر حسب نوع البيع
    let unitPrice = product.retailPrice;
    if (saleType === 'wholesale') {
      unitPrice = product.wholesaleRetailPrice || product.retailPrice;
    } else if (saleType === 'bulk') {
      unitPrice = product.bulkPrice || product.wholesaleRetailPrice || product.retailPrice;
    }
    unitPrice = getSalePriceForUnit(product, unitPrice, selectedUnit);
    const total = qty * unitPrice;

    const newItem: SaleItem = {
      productId: product.id,
      productName: product.name,
      selectedUnitType: selectedUnit,
      quantity: qty,
      unitPrice,
      total,
      loyaltyPoints: Math.max(0, Math.trunc(Number(product.loyaltyPoints) || 0))
    };

    setSaleItems([...saleItems, newItem]);
    setSelectedProduct("");
    setSelectedUnit("");
    setQuantity("");
  };

  const handleRemoveItem = (index: number) => {
    setSaleItems(saleItems.filter((_, i) => i !== index));
  };

  const subTotal = saleItems.reduce((sum, item) => sum + item.total, 0);
  const parsedDiscount = parseFloat(discountValue) || 0;
  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = (subTotal * Math.min(100, Math.max(0, parsedDiscount))) / 100;
  } else {
    discountAmount = Math.min(subTotal, Math.max(0, parsedDiscount));
  }
  const totalAmount = Math.max(0, subTotal - discountAmount);
  const expectedLoyaltyPoints = saleItems.reduce((sum, item) => {
    const product = products.find(candidate => candidate.id === item.productId);
    return sum + Math.max(0, Math.trunc(Number(product?.loyaltyPoints) || 0)) * Math.max(0, Math.trunc(Number(item.quantity) || 0));
  }, 0);

  const handleCompleteSale = async () => {
    // جميع الحقول اختيارية

    try {
      const saleId = `INV-${Date.now()}`;
      let loyaltyProfile: { customerCode: string; phone: string; name: string } | null = null;
      // Keep earned product points on the invoice even without a customer
      // profile or if the optional cloud loyalty request fails.
      let loyaltyPointsAwarded = expectedLoyaltyPoints;
      if (customerName.trim()) {
        try {
          if (!sessionStorage.getItem("abu_catalog_admin_token")) {
            await catalogLogin.mutateAsync();
          }
          const loyaltyResult = await recordDirectSaleLoyalty.mutateAsync({ saleId, customerName: customerName.trim(), phone: customerPhone.trim() || undefined, customerCode: customerCode.trim() || undefined, itemsJson: JSON.stringify(saleItems.map(item => ({ productId: item.productId, quantity: item.quantity, loyaltyPoints: item.loyaltyPoints || 0 }))) });
          loyaltyProfile = loyaltyResult.profile;
          loyaltyPointsAwarded = Math.max(expectedLoyaltyPoints, Number(loyaltyResult.pointsAwarded) || 0);
        } catch {
          toast.warning("تم تسجيل المبيعة، لكن تعذر مزامنة نقاط العميل الآن. حاول مزامنتها لاحقًا.");
        }
      }
      const newSale: Sale = {
        id: saleId,
        date: new Date().toISOString(),
        items: saleItems,
        subTotal,
        discountType,
        discountValue: parsedDiscount,
        discountAmount,
        total: totalAmount,
        paymentMethod,
        customerName,
        customerPhone,
        customerCode: loyaltyProfile?.customerCode || customerCode.trim() || undefined,
        loyaltyPointsAwarded,
        saleType
      };

      // خصم الكميات المباعة من النسخة السحابية نفسها حتى يراها كل جهاز.
      setBaseProducts(currentProducts => currentProducts.map(product => {
        const matchedItems = saleItems.filter(item => item.productId === product.id);
        if (!matchedItems.length) return product;
        const decrement = matchedItems.reduce((sum, item) => sum + getPackageStockDeduction(product, item.selectedUnitType, item.quantity), 0);
        const currentQty = Number(product.availableQuantity ?? product.quantity ?? 0);
        const newQty = Math.max(0, currentQty - decrement);
        return { ...product, availableQuantity: newQty, quantity: newQty };
      }));

      const updatedSales = [...sales, newSale];
      setSales(updatedSales);
      localStorage.setItem("abu_raghwa_sales", JSON.stringify(updatedSales));
      localStorage.setItem("current_invoice", JSON.stringify(newSale));

      setSaleItems([]);
      setPaymentMethod("cash");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerCode("");
      setSaleType('retail');
      
      // إضافة إشعار نجاح المبيعة
      addNotification(
        'success',
        'تم تسجيل المبيعة بنجاح',
        `رقم الفاتورة: ${newSale.id} - الإجمالي: ${totalAmount.toFixed(2)} ج.م`
      );
      
      navigate("/invoice");
    } catch (error) {
      console.error("خطأ في تسجيل المبيعة:", error);
      alert("حدث خطأ في تسجيل المبيعة. يرجى المحاولة مرة أخرى.");
    }
  };

  const downloadInvoice = (sale: Sale) => {
    try {
      const invoiceText = `محلات أبو رغوة للمنظفات\nأصل الرغوة في مصر\nهنسيب علامة في بيتك\nالهاتف: 01069035599\n\n===================================\nرقم الفاتورة: ${sale.id}\nالتاريخ: ${new Date(sale.date).toLocaleDateString('ar-EG')}\nالوقت: ${new Date(sale.date).toLocaleTimeString('ar-EG')}\nاسم العميل: ${sale.customerName || 'عميل'}\nرقم التليفون: ${sale.customerPhone || 'غير محدد'}\n===================================\n\nالمنتجات:\n${sale.items.map(item => `${item.productName}\nالوحدة: ${item.selectedUnitType} | الكمية: ${item.quantity} | السعر: ${item.unitPrice.toFixed(2)} ج.م\nالإجمالي: ${item.total.toFixed(2)} ج.م\n`).join('')}\n===================================\nالإجمالي الكلي: ${sale.total.toFixed(2)} ج.م\nطريقة الدفع: ${sale.paymentMethod === 'cash' ? 'نقداً' : sale.paymentMethod === 'card' ? 'بطاقة' : sale.paymentMethod === 'check' ? 'شيك' : 'تحويل بنكي'}\n===================================\n\nشكراً لتعاملكم معنا`;

      const blob = new Blob([invoiceText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `فاتورة-${sale.id}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert("تم تحميل الفاتورة بنجاح!");
    } catch (error) {
      console.error("خطأ في تحميل الفاتورة:", error);
      alert("حدث خطأ في تحميل الفاتورة. يرجى المحاولة مرة أخرى.");
    }
  };

  const shareOnWhatsApp = (sale: Sale) => {
    try {
      if (!sale.customerPhone) {
        alert("يرجى إدخال رقم تليفون العميل أولاً");
        return;
      }

      const messageText = `*محلات أبو رغوة للمنظفات*\nأصل الرغوة في مصر\nهنسيب علامة في بيتك\n\n*فاتورتك*\nرقم الفاتورة: ${sale.id}\nالتاريخ: ${new Date(sale.date).toLocaleDateString('ar-EG')}\nاسم العميل: ${sale.customerName || 'عميل'}\n\n*المنتجات:*\n${sale.items.map(item => `• ${item.productName}\n  الوحدة: ${item.selectedUnitType} | الكمية: ${item.quantity}\n  السعر: ${item.unitPrice.toFixed(2)} ج.م | الإجمالي: ${item.total.toFixed(2)} ج.م\n`).join('')}*الإجمالي الكلي: ${sale.total.toFixed(2)} ج.م*\n\nشكراً لتعاملكم معنا\nللتواصل: 01069035599`;

      const phoneNumber = sale.customerPhone.replace(/[^0-9]/g, '');
      const encodedMessage = encodeURIComponent(messageText);
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
      
      window.open(whatsappUrl, '_blank');
      alert("تم فتح WhatsApp بنجاح!");
    } catch (error) {
      console.error("خطأ في المشاركة على الواتس:", error);
      alert("حدث خطأ في المشاركة على الواتس. يرجى التأكد من رقم التليفون.");
    }
  };

  const getReturnedQuantity = (sale: Sale, lineIndex: number) => (sale.returnedItems || [])
    .filter(item => item.lineIndex === lineIndex)
    .reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);

  const getReturnableQuantity = (sale: Sale, lineIndex: number) => {
    const item = sale.items[lineIndex];
    return Math.max(0, Number(item?.quantity) || 0) - getReturnedQuantity(sale, lineIndex);
  };

  const getItemLoyaltyPoints = (item: SaleItem) => {
    const configuredPoints = Number(item.loyaltyPoints);
    if (Number.isFinite(configuredPoints)) return Math.max(0, Math.trunc(configuredPoints));
    const product = products.find(candidate => candidate.id === item.productId);
    return Math.max(0, Math.trunc(Number(product?.loyaltyPoints) || 0));
  };

  const handleDeleteSale = (sale: Sale) => {
    if (!confirm(`سيتم حذف الفاتورة ${sale.id} من سجل المبيعات نهائيًا. هل تريد المتابعة؟`)) return;
    const updatedSales = sales.filter(item => item.id !== sale.id);
    setSales(updatedSales);
    localStorage.setItem("abu_raghwa_sales", JSON.stringify(updatedSales));
    try {
      const currentInvoice = JSON.parse(localStorage.getItem("current_invoice") || "null") as Sale | null;
      if (currentInvoice?.id === sale.id) localStorage.removeItem("current_invoice");
    } catch {
      // لا يمنع فشل قراءة الفاتورة الحالية حذف المبيعة من السجل.
    }
    addNotification("info", "تم حذف مبيعة من السجل", `تم حذف الفاتورة: ${sale.id}`);
  };

  const openReturnDialog = (sale: Sale) => {
    const initialQuantities = Object.fromEntries(sale.items.map((_, index) => [index, ""]));
    setReturnQuantities(initialQuantities);
    setReturnSale(sale);
  };

  const closeReturnDialog = () => {
    if (reverseDirectSaleLoyalty.isPending) return;
    setReturnSale(null);
    setReturnQuantities({});
  };

  const handleReturnSale = async () => {
    if (!returnSale) return;
    let requestedItems: ReturnType<typeof calculateReturnItems> = [];
    try {
      requestedItems = calculateReturnItems(returnSale, returnQuantities, getItemLoyaltyPoints);
    } catch (error) {
      alert(error instanceof Error ? error.message : "كمية المرتجع غير صحيحة");
      return;
    }
    if (!requestedItems.length) {
      alert("اكتب كمية مرتجع واحدة على الأقل");
      return;
    }

    const returnId = `RET-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pointsToReverse = requestedItems.reduce((sum, item) => sum + item.pointsReversed, 0);
    try {
      if (pointsToReverse > 0) {
        if (!returnSale.customerName.trim()) {
          throw new Error("لا يمكن عكس نقاط المرتجع لأن الفاتورة بلا اسم عميل");
        }
        if (!sessionStorage.getItem("abu_catalog_admin_token")) {
          await catalogLogin.mutateAsync();
        }
        if (!returnSale.customerCode && !returnSale.customerPhone) {
          throw new Error("هذه الفاتورة لا تحتوي على كود عميل أو رقم هاتف لعكس نقاط الولاء");
        }
        const loyaltyResult = await reverseDirectSaleLoyalty.mutateAsync({
          returnId,
          saleId: returnSale.id,
          customerName: returnSale.customerName.trim(),
          phone: returnSale.customerPhone.trim() || undefined,
          customerCode: returnSale.customerCode || undefined,
          points: pointsToReverse,
        });
        if (!loyaltyResult.profile) {
          throw new Error("لم يتم العثور على ملف الولاء المرتبط بهذه الفاتورة؛ لم يتم حفظ المرتجع");
        }
      }

      const returnedAt = new Date().toISOString();
      const newReturnedItems: ReturnedSaleItem[] = requestedItems.map(({ lineIndex, item, quantity, total, pointsReversed }) => ({
        lineIndex,
        productId: item.productId,
        productName: item.productName,
        quantity,
        unitPrice: item.unitPrice,
        total,
        pointsReversed,
        returnedAt,
      }));
      const updatedSale: Sale = appendSaleReturn(returnSale, newReturnedItems);
      const updatedSales = sales.map(sale => sale.id === returnSale.id ? updatedSale : sale);
      setSales(updatedSales);
      localStorage.setItem("abu_raghwa_sales", JSON.stringify(updatedSales));

      setBaseProducts(currentProducts => currentProducts.map(product => {
        const returnedForProduct = requestedItems.filter(item => item.item.productId === product.id).reduce((sum, item) => sum + getPackageStockDeduction(product, item.item.selectedUnitType, item.quantity), 0);
        if (!returnedForProduct) return product;
        const currentQty = Number(product.availableQuantity ?? product.quantity ?? 0);
        const nextQty = currentQty + returnedForProduct;
        return { ...product, availableQuantity: nextQty, quantity: nextQty };
      }));

      addNotification("success", "تم تسجيل المرتجع", `الفاتورة ${returnSale.id}: استرجاع ${requestedItems.reduce((sum, item) => sum + item.quantity, 0)} وحدة وعكس ${pointsToReverse} نقطة`);
      closeReturnDialog();
    } catch (error) {
      console.error("خطأ في تسجيل المرتجع:", error);
      alert(error instanceof Error ? error.message : "تعذر تسجيل المرتجع الآن");
    }
  };

  if (saleMode === "cashier") return <Cashier onBackToSalesChoice={() => setSaleMode("normal")} />;

  if (saleMode === "choose") return <main className="min-h-screen bg-slate-50 p-4" dir="rtl"><div className="mx-auto max-w-4xl"><header className="mb-7 flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-orange-600">تسجيل مبيعة</p><h1 className="text-3xl font-black text-slate-950">اختر طريقة البيع</h1><p className="mt-2 text-sm text-slate-600">كلتا الطريقتين تسجلان المبيعات في نفس السجل والمخزون.</p></div><Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="ml-1 h-4 w-4" />العودة</Button></header><div className="grid gap-5 md:grid-cols-2"><button onClick={() => setSaleMode("normal")} className="rounded-3xl border-2 border-blue-100 bg-white p-7 text-right shadow-sm transition hover:-translate-y-1 hover:border-blue-400 hover:shadow-lg"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-blue-700"><Printer className="h-7 w-7" /></div><h2 className="mt-5 text-2xl font-black text-slate-950">بيع عادي</h2><p className="mt-2 leading-7 text-slate-600">اختيار المنتج والوحدة والكمية والسعر والخصم وبيانات العميل يدويًا.</p><span className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">فتح البيع العادي</span></button><button onClick={() => setSaleMode("cashier")} className="rounded-3xl border-2 border-orange-100 bg-white p-7 text-right shadow-sm transition hover:-translate-y-1 hover:border-orange-400 hover:shadow-lg"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-orange-100 text-orange-700"><Barcode className="h-7 w-7" /></div><h2 className="mt-5 text-2xl font-black text-slate-950">بيع كاشير</h2><p className="mt-2 leading-7 text-slate-600">للبيع السريع بالليزر أو كاميرا الباركود والبحث السريع وسلة الكاشير.</p><span className="mt-6 inline-flex rounded-xl bg-orange-600 px-4 py-2 font-bold text-white">فتح بيع الكاشير</span></button></div></div></main>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <SalesAlertManager largeOrderThreshold={1000} />
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">نظام المبيعات</h1>
          <div className="flex gap-2">
            <Button
              onClick={() => setSaleMode("choose")}
              variant="outline"
              className="flex items-center gap-2"
            >
              اختر نوع البيع
            </Button>
            <Button
              onClick={() => setShowSalesList(!showSalesList)}
              variant={showSalesList ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              سجل المبيعات
            </Button>
            <Button
              onClick={() => navigate("/dashboard")}
              variant="outline"
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              العودة
            </Button>
          </div>
        </div>

        {!showSalesList ? (
          <>
            <Card className="border-0 shadow-sm mb-3">
              <CardHeader className="py-2">
                <CardTitle className="text-lg">تسجيل المبيعات مع مرونة الاختيار</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 py-2">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">اسم العميل</label>
                    <input
                      type="text"
                      placeholder="أدخل اسم العميل"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">رقم التليفون (اختياري)</label>
                    <input
                      type="text"
                      placeholder="اختياري"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">كود نقاط العميل (اختياري)</label>
                    <input
                      type="text"
                      placeholder="AR-..."
                      value={customerCode}
                      onChange={(e) => setCustomerCode(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">نوع البيع</label>
                    <select
                      value={saleType}
                      onChange={(e) => setSaleType(e.target.value as 'retail' | 'wholesale' | 'bulk')}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="retail">تجزئة</option>
                      <option value="wholesale">قطاعي</option>
                      <option value="bulk">جملة</option>
                    </select>
                  </div>
                </div>
                {customerName.trim() && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">نقاط العميل المتوقعة لهذه الفاتورة: {expectedLoyaltyPoints} نقطة. تُثبت بعد إتمام البيع.</div>}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm mb-3">
              <CardHeader className="py-2">
                <CardTitle className="text-lg">إضافة منتج للمبيعة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 py-2">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">المنتج</label>
                    <select
                      value={selectedProduct}
                      onChange={(e) => { const product = products.find(item => item.id === e.target.value); setSelectedProduct(e.target.value); setSelectedUnit(product ? getContentUnit(product) : ""); }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- اختر منتج --</option>
                      {filteredSaleProducts.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name} (متوفر: {product.quantity})
                        </option>
                      ))}
                    </select>
                    <div className="relative mt-2">
                      <Search className="absolute right-2 top-2 w-4 h-4 text-gray-400" />
                      <input
                        type="search"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="ابحث باسم المنتج..."
                        className="w-full pr-8 pl-2 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label="البحث باسم المنتج"
                      />
                    </div>
                    {productSearch.trim() && filteredSaleProducts.length === 0 && (
                      <p className="mt-1 text-xs text-red-600">لا يوجد منتج بهذا الاسم</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">وحدة البيع من داخل العبوة</label>
                    <select
                      value={selectedUnit}
                      onChange={(e) => setSelectedUnit(e.target.value)}
                      disabled={!selectedProduct}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    >
                      <option value="">-- اختر المنتج أولًا --</option>
                      {selectedProduct && getProductUnits(selectedProduct).map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">الكمية</label>
                    <input
                      type="number"
                      placeholder="أدخل الكمية"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      onClick={handleAddProduct}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      إضافة
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {saleItems.length > 0 && (
              <Card className="border-0 shadow-sm mb-3">
                <CardHeader className="py-2">
                  <CardTitle className="text-lg">المنتجات المضافة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 py-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 border-b">
                        <tr>
                          <th className="px-2 py-1 text-right">المنتج</th>
                          <th className="px-2 py-1 text-right">الوحدة</th>
                          <th className="px-2 py-1 text-right">الكمية</th>
                          <th className="px-2 py-1 text-right">السعر</th>
                          <th className="px-2 py-1 text-right">الإجمالي</th>
                          <th className="px-2 py-1 text-right">الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saleItems.map((item, index) => (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="px-2 py-1 text-xs">{item.productName}</td>
                            <td className="px-2 py-1 text-xs">{item.selectedUnitType}</td>
                            <td className="px-2 py-1 text-xs">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    const updated = [...saleItems];
                                    updated[index].quantity = Math.max(0, updated[index].quantity - 1);
                                    updated[index].total = updated[index].quantity * updated[index].unitPrice;
                                    setSaleItems(updated);
                                  }}
                                  className="bg-red-500 hover:bg-red-600 text-white px-1 py-0.5 rounded text-xs"
                                >
                                  −
                                </button>
                                <span className="w-8 text-center">{item.quantity}</span>
                                <button
                                  onClick={() => {
                                    const updated = [...saleItems];
                                    updated[index].quantity += 1;
                                    updated[index].total = updated[index].quantity * updated[index].unitPrice;
                                    setSaleItems(updated);
                                  }}
                                  className="bg-green-500 hover:bg-green-600 text-white px-1 py-0.5 rounded text-xs"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-1 text-xs">
                              <input
                                type="number"
                                step="0.01"
                                value={item.unitPrice === 0 ? "" : item.unitPrice}
                                onChange={(e) => {
                                  const newPrice = parseFloat(e.target.value) || 0;
                                  const updated = [...saleItems];
                                  updated[index].unitPrice = newPrice;
                                  updated[index].total = updated[index].quantity * newPrice;
                                  setSaleItems(updated);
                                }}
                                className="w-20 px-1 py-0.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-2 py-1 font-bold text-xs text-blue-600">{(item.quantity * item.unitPrice).toFixed(2)} ج.م</td>
                            <td className="px-2 py-1">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRemoveItem(index)}
                                className="flex items-center gap-1 text-xs"
                              >
                                <Trash2 className="w-3 h-3" />
                                حذف
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 space-y-3 bg-gray-50 p-3 rounded-lg border">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-1">نوع الخصم</label>
                        <select
                          value={discountType}
                          onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                        >
                          <option value="percent">نسبة مئوية (%)</option>
                          <option value="fixed">قيمة ثابتة (ج.م)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">قيمة الخصم</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded text-right"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 text-xs pt-1 border-t">
                      <div className="flex justify-between items-center text-gray-600">
                        <span>إجمالي المنتجات:</span>
                        <span>{subTotal.toFixed(2)} ج.م</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between items-center text-red-600">
                          <span>قيمة الخصم:</span>
                          <span>−{discountAmount.toFixed(2)} ج.م</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm font-bold pt-1 border-t">
                        <span>الإجمالي النهائي:</span>
                        <span className="text-green-600 text-base">{totalAmount.toFixed(2)} ج.م</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">طريقة الدفع</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg"
                      >
                        <option value="cash">نقداً</option>
                        <option value="card">بطاقة</option>
                        <option value="check">شيك</option>
                        <option value="transfer">تحويل بنكي</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleCompleteSale}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                      >
                        <Printer className="w-4 h-4" />
                        إتمام البيعة وطباعة الفاتورة
                      </Button>
                      <Button
                        onClick={() => setSaleItems([])}
                        variant="outline"
                        className="flex-1"
                      >
                        إلغاء
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {saleItems.length === 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-center text-gray-600 py-8">لم تضف أي منتجات بعد. ابدأ بإضافة منتج!</p>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            {/* سجل المبيعات */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>سجل المبيعات</CardTitle>
              </CardHeader>
              <CardContent>
                {sales.length === 0 ? (
                  <p className="text-center text-gray-600 py-8">لا توجد مبيعات حتى الآن</p>
                ) : (
                  <div className="space-y-4">
                    {sales.map(sale => (
                      <div key={sale.id || Math.random()} className="border rounded-lg p-4 hover:bg-gray-50 bg-white shadow-xs">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-lg">{sale.customerName || 'عميل عام'}</p>
                            <p className="text-sm text-gray-500">{sale.date ? new Date(sale.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'تاريخ غير محدد'}</p>
                          </div>
                          <span className="text-green-600 font-bold text-lg">{(sale.total || 0).toFixed(2)} ج.م</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">عدد المنتجات: {sale.items ? sale.items.length : 0} | رقم الفاتورة: {sale.id || 'بدون رقم'}</p>
                        {Number(sale.returnedTotal || 0) > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">تم تسجيل مرتجعات بقيمة {(sale.returnedTotal || 0).toFixed(2)} ج.م وعكس {(sale.returnedPointsReversed || 0)} نقطة</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              localStorage.setItem("current_invoice", JSON.stringify(sale));
                              navigate("/invoice");
                            }}
                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            <Printer className="w-4 h-4" />
                            عرض وطباعة
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => downloadInvoice(sale)}
                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Download className="w-4 h-4" />
                            تحميل النص
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openReturnDialog(sale)}
                            disabled={sale.items.every((_, index) => getReturnableQuantity(sale, index) <= 0)}
                            className="flex items-center gap-1 bg-amber-600 text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                            تسجيل مرتجع
                          </Button>
                          {sale.customerPhone && (
                            <Button
                              size="sm"
                              onClick={() => shareOnWhatsApp(sale)}
                              className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white"
                            >
                              <MessageCircle className="w-4 h-4" />
                              واتس
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteSale(sale)}
                            className="flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            حذف المبيعة
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      {returnSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" dir="rtl">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b pb-4">
              <div>
                <p className="text-sm font-bold text-amber-600">مرتجع مرتبط بالفاتورة الأصلية</p>
                <h2 className="text-2xl font-black text-slate-950">الفاتورة {returnSale.id}</h2>
                <p className="mt-1 text-sm text-slate-600">اكتب الكمية التي رجعها العميل فقط. الفاتورة الأصلية ستظل محفوظة.</p>
              </div>
              <Button variant="outline" onClick={closeReturnDialog} disabled={reverseDirectSaleLoyalty.isPending}>إلغاء</Button>
            </div>
            <div className="mt-4 space-y-3">
              {returnSale.items.map((item, lineIndex) => {
                const alreadyReturned = getReturnedQuantity(returnSale, lineIndex);
                const remaining = getReturnableQuantity(returnSale, lineIndex);
                const pointsPerUnit = getItemLoyaltyPoints(item);
                return (
                  <div key={`${returnSale.id}-${lineIndex}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-900">{item.productName}</p>
                        <p className="text-sm text-slate-600">{item.selectedUnitType} · سعر الوحدة {(item.unitPrice || 0).toFixed(2)} ج.م</p>
                        <p className="mt-1 text-xs text-slate-500">المباع: {item.quantity} · المرتجع سابقًا: {alreadyReturned} · المتاح للإرجاع: {remaining}</p>
                      </div>
                      <div className="w-36">
                        <label className="mb-1 block text-xs font-bold text-slate-700">كمية المرتجع</label>
                        <input
                          type="number"
                          min="0"
                          max={remaining}
                          step="1"
                          value={returnQuantities[lineIndex] || ""}
                          onChange={event => setReturnQuantities(current => ({ ...current, [lineIndex]: event.target.value }))}
                          disabled={remaining <= 0 || reverseDirectSaleLoyalty.isPending}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-center font-bold outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-200"
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-amber-700">سيتم عكس {pointsPerUnit} نقطة لكل وحدة من هذا الصنف.</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-black">مهم قبل الحفظ</p>
              <p className="mt-1 leading-6">سيُعاد المخزون تلقائيًا، وتُخصم نقاط الأصناف المرتجعة من نفس ملف العميل، ويتحدث تقرير الربحية. لا يمكن تسجيل كمية أكبر من الكمية المتبقية.</p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={closeReturnDialog} disabled={reverseDirectSaleLoyalty.isPending}>إلغاء</Button>
              <Button onClick={handleReturnSale} disabled={reverseDirectSaleLoyalty.isPending} className="bg-amber-600 text-white hover:bg-amber-700">
                <RotateCcw className="ml-2 h-4 w-4" />
                {reverseDirectSaleLoyalty.isPending ? "جاري حفظ المرتجع..." : "تأكيد المرتجع"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
