import { browserState } from "@/lib/browserState";
import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Share2, Printer, RotateCw, Settings, Download, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import QRCode from "qrcode";

interface Product {
  id: string;
  name: string;
  wholesalePricePerUnit: number;
  retailPrice: number;
  bulkPrice?: number;
  quantity: number;
  category: string;
  bulkProfitPercent?: number;
}

interface Recipe {
  id: string;
  name: string;
  totalCost: number;
  salePrice: number;
  profitPercent?: number;
}

interface SmartOffer {
  id: string;
  type: string;
  strategy: string;
  items: Array<{ id: string; name: string; wholesalePrice: number; salePrice: number; quantity?: number }>;
  totalWholesalePrice: number;
  totalSalePrice: number;
  offerPrice: number;
  discount: number;
  profitMargin: number;
  description: string;
  startDate: string;
  endDate: string;
  qrCode?: string;
}

const OFFER_TYPES = ["يومي", "أسبوعي", "شهري", "موسمي", "مناسبة", "مخصص"];

const OFFER_STRATEGIES = [
  "خصم على قطعة",
  "خصم على منتجين",
  "خصم على مجموعة",
  "اشتري كمية وخذ هدية",
  "جركن + كيلو صابون هدية",
  "هدية عند شراء مبلغ معين",
  "خصم عند شراء مبلغ معين",
  "باكدج",
  "خصم على فئة",
  "تصفية مخزون",
  "عرض عميل مميز",
  "عرض موسمي"
];

export default function Offers() {
  const [, navigate] = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [offerType, setOfferType] = useState("يومي");
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [minProfitMargin, setMinProfitMargin] = useState("10");
  const [currentOffer, setCurrentOffer] = useState<SmartOffer | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [generatedOffers, setGeneratedOffers] = useState<SmartOffer[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProducts();
    loadRecipes();
  }, []);

  const loadProducts = () => {
    const saved = browserState.get("abu_raghwa_products");
    if (saved) setProducts(JSON.parse(saved));
  };

  const loadRecipes = () => {
    const saved = browserState.get("abu_raghwa_recipes");
    if (saved) setRecipes(JSON.parse(saved));
  };

  const generateSmartOffer = () => {
    if (selectedStrategies.length === 0) {
      toast.error("اختر استراتيجية واحدة على الأقل");
      return;
    }

    if (products.length === 0 && recipes.length === 0) {
      toast.error("لا توجد منتجات أو تركيبات");
      return;
    }

    const minMargin = parseFloat(minProfitMargin) || 10;
    const allItems = [
      ...products.map(p => ({ ...p, type: "product" })),
      ...recipes.map(r => ({ ...r, type: "recipe" }))
    ];

    // اختيار عشوائي من 1-3 منتجات/تركيبات
    const itemCount = Math.floor(Math.random() * 3) + 1;
    const selectedItems = [];
    for (let i = 0; i < itemCount && i < allItems.length; i++) {
      const randomIdx = Math.floor(Math.random() * allItems.length);
      selectedItems.push(allItems[randomIdx]);
    }

    const strategy = selectedStrategies[Math.floor(Math.random() * selectedStrategies.length)];
    const totalWholesalePrice = selectedItems.reduce((sum, item: any) => {
      return sum + (item.wholesalePricePerUnit || item.totalCost || 0);
    }, 0);
    const totalSalePrice = selectedItems.reduce((sum, item: any) => {
      return sum + (item.retailPrice || item.salePrice || 0);
    }, 0);

    // حساب الخصم بناءً على الاستراتيجية
    let discountPercent = 0;
    let offerPrice = totalSalePrice;

    if (strategy.includes("خصم")) {
      discountPercent = Math.floor(Math.random() * 15) + 5;
      offerPrice = totalSalePrice * (1 - discountPercent / 100);
    } else if (strategy.includes("هدية")) {
      discountPercent = Math.floor(Math.random() * 20) + 10;
      offerPrice = totalSalePrice * (1 - discountPercent / 100);
    }

    const profitMargin = ((offerPrice - totalWholesalePrice) / totalWholesalePrice) * 100;

    // التحقق من أن الربح لا يقل عن الحد الأدنى
    if (profitMargin < minMargin) {
      return generateSmartOffer(); // إعادة المحاولة
    }

    const now = new Date();
    const startDate = now.toLocaleDateString("ar-EG");
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("ar-EG");

    const offer: SmartOffer = {
      id: Date.now().toString(),
      type: offerType,
      strategy,
      items: selectedItems.map((item: any) => ({
        id: item.id,
        name: item.name,
        wholesalePrice: item.wholesalePricePerUnit || item.totalCost || 0,
        salePrice: item.retailPrice || item.salePrice || 0,
        quantity: item.quantity || 1
      })),
      totalWholesalePrice,
      totalSalePrice,
      offerPrice: Math.round(offerPrice * 100) / 100,
      discount: discountPercent,
      profitMargin: Math.round(profitMargin * 100) / 100,
      description: `${strategy} - توفير ${discountPercent}%`,
      startDate,
      endDate
    };

    setGeneratedOffers([...generatedOffers, offer]);
    setCurrentOffer(offer);
    generateQRCode(offer);
  };

  const generateQRCode = async (offer: SmartOffer) => {
    try {
      const qrData = `عرض: ${offer.description}\nالسعر: ${offer.offerPrice} ج.م\nالتوفير: ${offer.discount}%`;
      const qrUrl = await QRCode.toDataURL(qrData);
      setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error("خطأ في إنشاء QR Code:", error);
    }
  };

  const handleSpin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    
    setTimeout(() => {
      generateSmartOffer();
      setIsSpinning(false);
    }, 2000);
  };

  const handlePrint = () => {
    if (!currentOffer) {
      toast.error("لا يوجد عرض لطباعته");
      return;
    }

    const printContent = `
      <div style="text-align: center; font-family: Arial, sans-serif; padding: 20px;">
        <h1 style="font-size: 24px; margin: 10px 0;">أبو رغوة</h1>
        <p style="font-size: 16px; margin: 5px 0;">أصل الرغوة في مصر</p>
        <hr style="margin: 10px 0;">
        <h2 style="font-size: 20px; margin: 10px 0;">${currentOffer.description}</h2>
        <p style="font-size: 14px;">السعر: <strong>${currentOffer.offerPrice} ج.م</strong></p>
        <p style="font-size: 14px;">التوفير: <strong>${currentOffer.discount}%</strong></p>
        <p style="font-size: 14px;">الربح: <strong>${currentOffer.profitMargin}%</strong></p>
        ${qrCodeUrl ? `<img src="${qrCodeUrl}" style="width: 150px; height: 150px; margin: 10px 0;">` : ''}
        <p style="font-size: 12px; margin-top: 10px;">📞 01069035599</p>
        <hr style="margin: 10px 0;">
        <p style="font-size: 14px; font-weight: bold;">هنسيب علامة في بيتك</p>
      </div>
    `;

    const newWindow = window.open("", "", "width=600,height=800");
    if (newWindow) {
      newWindow.document.write(printContent);
      newWindow.document.close();
      newWindow.print();
    }
  };

  const handleShare = (platform: string) => {
    if (!currentOffer) {
      toast.error("لا يوجد عرض لمشاركته");
      return;
    }

    const text = `🎉 عرض حصري من أبو رغوة!\n${currentOffer.description}\nالسعر: ${currentOffer.offerPrice} ج.م\nتوفير: ${currentOffer.discount}%\n📞 01069035599`;

    const urls: { [key: string]: string } = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`,
      telegram: `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    };

    if (urls[platform]) {
      window.open(urls[platform], "_blank");
      toast.success(`تم المشاركة على ${platform}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800">🎯 العروض الذكية</h1>
            <p className="text-gray-600 mt-1">نظام توليد العروض بالذكاء الاصطناعي</p>
          </div>
          <Button 
            onClick={() => navigate('/dashboard')}
            variant="outline"
            className="bg-gray-600 hover:bg-gray-700 text-white"
          >
            <ArrowLeft size={20} className="mr-2" />
            العودة
          </Button>
        </div>

        {/* Settings Card */}
        <Card className="mb-6 border-2 border-purple-200">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
            <CardTitle className="flex items-center gap-2">
              <Settings size={24} />
              إعدادات العروض
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">نوع العرض</label>
                <select 
                  value={offerType}
                  onChange={(e) => setOfferType(e.target.value)}
                  className="w-full border-2 border-purple-300 rounded-lg p-2 focus:outline-none focus:border-purple-600"
                >
                  {OFFER_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">حد الربح الأدنى (%)</label>
                <Input 
                  type="number"
                  value={minProfitMargin}
                  onChange={(e) => setMinProfitMargin(e.target.value)}
                  placeholder="10"
                  className="border-2 border-purple-300"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">الاستراتيجيات</label>
                <select 
                  multiple
                  value={selectedStrategies}
                  onChange={(e) => setSelectedStrategies(Array.from(e.target.selectedOptions, option => option.value))}
                  className="w-full border-2 border-purple-300 rounded-lg p-2 focus:outline-none focus:border-purple-600 h-24"
                >
                  {OFFER_STRATEGIES.map(strategy => (
                    <option key={strategy} value={strategy}>{strategy}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button 
              onClick={handleSpin}
              disabled={isSpinning}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-6 text-lg font-bold"
            >
              <RotateCw size={24} className={`mr-2 ${isSpinning ? 'animate-spin' : ''}`} />
              {isSpinning ? 'جاري التدوير...' : 'تدوير العروض'}
            </Button>
          </CardContent>
        </Card>

        {/* Current Offer Display */}
        {currentOffer && (
          <Card className="mb-6 border-2 border-green-200 shadow-xl">
            <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
              <CardTitle>🎁 العرض الحالي</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-blue-600 font-semibold">الاستراتيجية</p>
                  <p className="text-lg font-bold text-blue-700">{currentOffer.strategy}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-xs text-green-600 font-semibold">السعر الأصلي</p>
                  <p className="text-lg font-bold text-green-700">{currentOffer.totalSalePrice.toFixed(2)} ج.م</p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-xs text-orange-600 font-semibold">سعر العرض</p>
                  <p className="text-lg font-bold text-orange-700">{currentOffer.offerPrice.toFixed(2)} ج.م</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-xs text-red-600 font-semibold">الخصم</p>
                  <p className="text-lg font-bold text-red-700">{currentOffer.discount}%</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-xs text-purple-600 font-semibold">هامش الربح</p>
                  <p className="text-lg font-bold text-purple-700">{currentOffer.profitMargin.toFixed(2)}%</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-xs text-indigo-600 font-semibold">التكلفة الإجمالية</p>
                  <p className="text-lg font-bold text-indigo-700">{currentOffer.totalWholesalePrice.toFixed(2)} ج.م</p>
                </div>
                <div className="bg-cyan-50 p-4 rounded-lg">
                  <p className="text-xs text-cyan-600 font-semibold">التوفير</p>
                  <p className="text-lg font-bold text-cyan-700">{(currentOffer.totalSalePrice - currentOffer.offerPrice).toFixed(2)} ج.م</p>
                </div>
              </div>

              {qrCodeUrl && (
                <div className="flex justify-center">
                  <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32 border-2 border-gray-300 rounded-lg p-2" />
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={handlePrint}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Printer size={20} className="mr-2" />
                  طباعة البون
                </Button>
                <Button 
                  onClick={() => handleShare('whatsapp')}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Share2 size={20} className="mr-2" />
                  واتساب
                </Button>
                <Button 
                  onClick={() => handleShare('facebook')}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                >
                  <Share2 size={20} className="mr-2" />
                  فيسبوك
                </Button>
                <Button 
                  onClick={() => handleShare('telegram')}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white"
                >
                  <Share2 size={20} className="mr-2" />
                  تيليجرام
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated Offers History */}
        {generatedOffers.length > 0 && (
          <Card className="border-2 border-gray-200">
            <CardHeader className="bg-gradient-to-r from-gray-600 to-gray-700 text-white">
              <CardTitle>📋 سجل العروض ({generatedOffers.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {generatedOffers.map(offer => (
                  <div key={offer.id} className="border-2 border-gray-300 rounded-lg p-4 hover:shadow-lg transition">
                    <h4 className="font-bold text-lg mb-2">{offer.strategy}</h4>
                    <p className="text-sm text-gray-600 mb-2">{offer.description}</p>
                    <div className="space-y-1 text-sm">
                      <p><strong>السعر:</strong> {offer.offerPrice.toFixed(2)} ج.م</p>
                      <p><strong>الخصم:</strong> {offer.discount}%</p>
                      <p><strong>الربح:</strong> {offer.profitMargin.toFixed(2)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
