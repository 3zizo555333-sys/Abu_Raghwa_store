import { browserState } from "@/lib/browserState";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Facebook, MessageCircle, Instagram, Mail, Phone, MapPin, Save, CreditCard, Users, MonitorPlay, Palette, Eye, Copy, ExternalLink, Scale } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ADMIN_EMAIL, SOCIAL_MEDIA, SHOP_INFO } from "@/const";
import { openSocialApp } from "@/lib/socialAppLinks";
import { useCloudState } from "@/lib/cloudSync";
import { DEFAULT_DISPLAY_SETTINGS, normalizeDisplaySettings, type DisplaySettings } from "@/lib/displaySettings";
import QRCode from "qrcode";
import { DEFAULT_SCALE_SETTINGS, normalizeScaleSettings, type ScaleSettings } from "@/lib/scaleSettings";
import { toast } from "sonner";

type DisplayProductOption = { id: string; name: string; catalogVisible?: boolean };
type DisplayOfferOption = { id?: string; title?: string; name?: string; isActivated?: boolean; active?: boolean };

export default function Settings() {
  const [, navigate] = useLocation();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [shopName, setShopName] = useState(SHOP_INFO.name);
  const [shopPhone, setShopPhone] = useState(SHOP_INFO.phone);
  const [shopEmail, setShopEmail] = useState(SHOP_INFO.email);
  const [shopAddress, setShopAddress] = useState(SHOP_INFO.address);
  const [whatsappNumber, setWhatsappNumber] = useState(SOCIAL_MEDIA.whatsapp.number);
  const [facebookPage, setFacebookPage] = useState(SOCIAL_MEDIA.facebook.page);
  const [instagramHandle, setInstagramHandle] = useState(SOCIAL_MEDIA.instagram.handle);
  const [adminEmail, setAdminEmail] = useState(ADMIN_EMAIL);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [displayCloudSettings, setDisplayCloudSettings] = useCloudState<DisplaySettings>("abu_raghwa_display_settings", DEFAULT_DISPLAY_SETTINGS);
  const [products] = useCloudState<DisplayProductOption[]>("abu_raghwa_products", []);
  const [offers] = useCloudState<DisplayOfferOption[]>("abu_raghwa_global_offers", []);
  const [scaleCloudSettings, setScaleCloudSettings] = useCloudState<ScaleSettings>("abu_raghwa_scale_settings", DEFAULT_SCALE_SETTINGS);
  const [scaleSettings, setScaleSettings] = useState<ScaleSettings>(DEFAULT_SCALE_SETTINGS);
  const [displayQr, setDisplayQr] = useState("");
  const displayUrl = typeof window === "undefined" ? "/customer-display" : `${window.location.origin}/customer-display`;
  // Legacy or mid-sync values must not crash the complete Settings page.
  // Keep the cloud value untouched and only use validated arrays for display.
  const productOptions = Array.isArray(products) ? products : [];
  const offerOptions = Array.isArray(offers) ? offers : [];

  useEffect(() => {
    try {
      const raw = browserState.get("abu_raghwa_current_user");
      setCurrentUser(raw ? JSON.parse(raw) : null);
    } catch {
      // A malformed legacy session must not prevent Settings from opening.
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    setDisplaySettings(normalizeDisplaySettings(displayCloudSettings));
  }, [displayCloudSettings]);

  useEffect(() => {
    setScaleSettings(normalizeScaleSettings(scaleCloudSettings));
  }, [scaleCloudSettings]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(displayUrl, { width: 220, margin: 2, errorCorrectionLevel: "M" })
      .then(url => { if (!cancelled) setDisplayQr(url); })
      .catch(() => { if (!cancelled) setDisplayQr(""); });
    return () => { cancelled = true; };
  }, [displayUrl]);

  const handleSaveSettings = () => {
    // حفظ الإعدادات في browserState
    const settings = {
      shopName,
      shopPhone,
      shopEmail,
      shopAddress,
      whatsappNumber,
      facebookPage,
      instagramHandle,
      adminEmail
    };

    browserState.set("abu_raghwa_settings", JSON.stringify(settings));
    const nextDisplaySettings = normalizeDisplaySettings({ ...displaySettings, shopName, shopPhone });
    setDisplaySettings(nextDisplaySettings);
    setDisplayCloudSettings(nextDisplaySettings);
    setScaleCloudSettings(normalizeScaleSettings(scaleSettings));
    alert("تم حفظ الإعدادات بنجاح!");
  };

  const toggleDisplayId = (kind: "product" | "offer", id: string) => {
    setDisplaySettings(current => {
      const key = kind === "product" ? "selectedProductIds" : "selectedOfferIds";
      const selected = current[key];
      return { ...current, [key]: selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id] };
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">الإعدادات</h1>
            <p className="text-gray-600 mt-1">إدارة إعدادات التطبيق والمتجر</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Settings */}
          <div className="lg:col-span-2 space-y-8">
            {/* Shop Information */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  معلومات المتجر
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">اسم المتجر</label>
                  <Input
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="أبو رغوة"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">العنوان</label>
                  <Input
                    value={shopAddress}
                    onChange={(e) => setShopAddress(e.target.value)}
                    placeholder="القاهرة، مصر"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Phone className="w-4 h-4 inline mr-2" />
                      الهاتف
                    </label>
                    <Input
                      value={shopPhone}
                      onChange={(e) => setShopPhone(e.target.value)}
                      placeholder="01069035599"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Mail className="w-4 h-4 inline mr-2" />
                      البريد الإلكتروني
                    </label>
                    <Input
                      value={shopEmail}
                      onChange={(e) => setShopEmail(e.target.value)}
                      placeholder="info@aburagwa.com"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer display settings */}
            <Card className="border-0 border-t-4 border-orange-500 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MonitorPlay className="h-5 w-5 text-orange-600" />إعدادات شاشة العرض</CardTitle>
                <CardDescription>تحكم في الشاشة الثانية أو التلفزيون، وتحفظ هذه الإعدادات سحابيًا.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div><label className="mb-2 block text-sm font-medium">العنوان الرئيسي</label><Input value={displaySettings.title} onChange={e => setDisplaySettings(current => ({ ...current, title: e.target.value }))} placeholder="منتجاتنا وعروضنا" /></div>
                  <div><label className="mb-2 block text-sm font-medium">العنوان الفرعي</label><Input value={displaySettings.subtitle} onChange={e => setDisplaySettings(current => ({ ...current, subtitle: e.target.value }))} placeholder="اختيارات المحل" /></div>
                  <div><label className="mb-2 block text-sm font-medium">اسم المحل على الشاشة</label><Input value={displaySettings.shopName} onChange={e => setDisplaySettings(current => ({ ...current, shopName: e.target.value }))} placeholder="أبو رغوة" /></div>
                  <div><label className="mb-2 block text-sm font-medium">رقم المحل</label><Input value={displaySettings.shopPhone} onChange={e => setDisplaySettings(current => ({ ...current, shopPhone: e.target.value }))} placeholder="01000000000" /></div>
                  <div><label className="mb-2 block text-sm font-medium">مدة تبديل الصور بالثواني</label><Input type="number" min="5" max="300" value={displaySettings.rotationSeconds} onChange={e => setDisplaySettings(current => ({ ...current, rotationSeconds: Math.min(300, Math.max(5, Number(e.target.value) || 30)) }))} /><p className="mt-1 text-xs text-gray-500">مثال: 30 ثانية بين كل شاشة.</p></div>
                  <div><label className="mb-2 block text-sm font-medium">تصميم البطاقات</label><select value={displaySettings.cardStyle} onChange={e => setDisplaySettings(current => ({ ...current, cardStyle: e.target.value as DisplaySettings["cardStyle"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="glass">زجاجي عصري</option><option value="soft">ناعم</option><option value="solid">واضح وممتلئ</option></select></div>
                  <div><label className="mb-2 block text-sm font-medium">نمط الشاشة</label><select value={displaySettings.theme} onChange={e => setDisplaySettings(current => ({ ...current, theme: e.target.value as DisplaySettings["theme"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="warm">دافئ برتقالي</option><option value="dark">داكن</option><option value="light">فاتح</option></select></div>
                  <div className="flex items-center gap-4 rounded-xl border p-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={displaySettings.showPrices} onChange={e => setDisplaySettings(current => ({ ...current, showPrices: e.target.checked }))} />إظهار الأسعار</label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={displaySettings.enabled} onChange={e => setDisplaySettings(current => ({ ...current, enabled: e.target.checked }))} />تفعيل الشاشة</label></div>
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={displaySettings.showProducts} onChange={e => setDisplaySettings(current => ({ ...current, showProducts: e.target.checked }))} />عرض المنتجات</label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={displaySettings.showOffers} onChange={e => setDisplaySettings(current => ({ ...current, showOffers: e.target.checked }))} />عرض العروض</label></div>
                <div className="grid grid-cols-2 gap-4 rounded-xl border p-4"><label className="flex items-center gap-2 text-sm font-medium">اللون الرئيسي <input type="color" value={displaySettings.primaryColor} onChange={e => setDisplaySettings(current => ({ ...current, primaryColor: e.target.value }))} className="h-9 w-14 cursor-pointer rounded" /></label><label className="flex items-center gap-2 text-sm font-medium">لون السعر <input type="color" value={displaySettings.accentColor} onChange={e => setDisplaySettings(current => ({ ...current, accentColor: e.target.value }))} className="h-9 w-14 cursor-pointer rounded" /></label></div>
                <div><p className="mb-2 flex items-center gap-2 font-bold"><Eye className="h-4 w-4 text-orange-600" />اختيار المنتجات المعروضة <span className="text-xs font-normal text-gray-500">(دون اختيار = كل المنتجات)</span></p><div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">{productOptions.filter(product => product?.id && product.name).map(product => <label key={product.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={displaySettings.selectedProductIds.includes(String(product.id))} onChange={() => toggleDisplayId("product", String(product.id))} />{product.name}</label>)}{!productOptions.length && <p className="text-sm text-gray-500">لا توجد منتجات محملة الآن.</p>}</div></div>
                <div><p className="mb-2 flex items-center gap-2 font-bold"><Palette className="h-4 w-4 text-orange-600" />اختيار العروض المعروضة <span className="text-xs font-normal text-gray-500">(دون اختيار = كل العروض)</span></p><div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">{offerOptions.filter(offer => offer?.id && (offer.title || offer.name)).map(offer => <label key={String(offer.id)} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={displaySettings.selectedOfferIds.includes(String(offer.id))} onChange={() => toggleDisplayId("offer", String(offer.id))} />{offer.title || offer.name}</label>)}{!offerOptions.length && <p className="text-sm text-gray-500">لا توجد عروض محملة الآن.</p>}</div></div>
              </CardContent>
            </Card>

            {/* Display pairing */}
            <Card className="border-0 border-t-4 border-blue-500 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MonitorPlay className="h-5 w-5 text-blue-600" />طريقة ربط شاشة العرض</CardTitle>
                <CardDescription>افتح الرابط أو امسح QR من التلفزيون/الشاشة. اترك هذه الصفحة مفتوحة على الهاتف فقط أثناء الإعداد.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-600">1) صِل الهاتف والشاشة على نفس شبكة Wi‑Fi. 2) افتح الرابط التالي على متصفح الشاشة أو امسح الكود. 3) اضغط «ملء الشاشة» من صفحة العرض. بعد ذلك ستتحدث المنتجات والعروض تلقائيًا من السحابة.</p>
                  <div className="flex flex-wrap gap-2"><Input readOnly value={displayUrl} dir="ltr" className="min-w-[260px] flex-1" /><Button type="button" variant="outline" onClick={() => { void navigator.clipboard?.writeText(displayUrl); toast.success("تم نسخ رابط شاشة العرض"); }}><Copy className="ml-2 h-4 w-4" />نسخ الرابط</Button><Button type="button" onClick={() => window.open(displayUrl, "_blank", "noopener,noreferrer")} className="bg-blue-600 hover:bg-blue-700"><ExternalLink className="ml-2 h-4 w-4" />فتح شاشة العرض</Button></div>
                </div>
                {displayQr ? <img src={displayQr} alt="رمز QR لفتح شاشة العرض" className="h-44 w-44 rounded-xl border bg-white p-2" /> : <div className="grid h-44 w-44 place-items-center rounded-xl border bg-slate-50 text-center text-xs text-slate-500">جارٍ تجهيز QR</div>}
              </CardContent>
            </Card>

            {/* Scale settings */}
            <Card className="border-0 border-t-4 border-emerald-500 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5 text-emerald-600" />إعدادات الميزان</CardTitle>
                <CardDescription>هذه الإعدادات محفوظة سحابيًا. الاتصال الفعلي يعتمد على موديل الميزان؛ ميزان USB/Bluetooth الذي يعمل كلوحة مفاتيح يمكنه الكتابة مباشرة في خانة الباركود/الكمية.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium"><input type="checkbox" checked={scaleSettings.enabled} onChange={e => setScaleSettings(current => ({ ...current, enabled: e.target.checked }))} />تفعيل إعدادات الميزان</label>
                  <div><label className="mb-2 block text-sm font-medium">طريقة الاتصال</label><select value={scaleSettings.connectionMode} onChange={e => setScaleSettings(current => ({ ...current, connectionMode: e.target.value as ScaleSettings["connectionMode"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="manual">إدخال يدوي مؤقت</option><option value="keyboard">USB/Bluetooth كلوحة مفاتيح</option><option value="bluetooth">Bluetooth ميزان ذكي (حسب الموديل)</option><option value="usb">USB ميزان ذكي (حسب الموديل)</option></select></div>
                  <div><label className="mb-2 block text-sm font-medium">اسم الميزان/الموديل</label><Input value={scaleSettings.deviceName} onChange={e => setScaleSettings(current => ({ ...current, deviceName: e.target.value }))} placeholder="مثال: ميزان Digi SM-100" /></div>
                  <div><label className="mb-2 block text-sm font-medium">وحدة القراءة</label><select value={scaleSettings.unit} onChange={e => setScaleSettings(current => ({ ...current, unit: e.target.value as ScaleSettings["unit"] }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="kg">كيلوغرام</option><option value="g">جرام</option></select></div>
                  <div><label className="mb-2 block text-sm font-medium">عدد الخانات العشرية</label><Input type="number" min="0" max="6" step="1" value={scaleSettings.decimalPlaces} onChange={e => setScaleSettings(current => ({ ...current, decimalPlaces: Math.min(6, Math.max(0, Number(e.target.value) || 0)) }))} /></div>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">الحالة الحالية: <strong>{scaleSettings.connectionMode === "keyboard" ? "جاهز لميزان يرسل الأرقام كلوحة مفاتيح" : "الإدخال الحر من الكاشير متاح الآن"}</strong>. لن نخترع اتصالًا Bluetooth عامًا قبل معرفة موديل الميزان وبروتوكوله؛ عند تزويدنا بالموديل نضيف موصلًا مناسبًا وآمنًا.</div>
              </CardContent>
            </Card>

            {/* Social Media */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>وسائل التواصل الاجتماعي</CardTitle>
                <CardDescription>أضف روابط وسائل التواصل الخاصة بك</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    WhatsApp
                  </label>
                  <Input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="01069035599"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    الرابط: https://wa.me/{whatsappNumber}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <Facebook className="w-4 h-4 text-blue-600" />
                    Facebook
                  </label>
                  <Input
                    value={facebookPage}
                    onChange={(e) => setFacebookPage(e.target.value)}
                    placeholder="https://www.facebook.com/aburagwa"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-pink-600" />
                    Instagram
                  </label>
                  <Input
                    value={instagramHandle}
                    onChange={(e) => setInstagramHandle(e.target.value)}
                    placeholder="aburagwa"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    الرابط: https://www.instagram.com/{instagramHandle}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Admin Settings */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>إعدادات المدير</CardTitle>
                <CardDescription>معلومات المدير الرئيسي</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">بريد المدير الإلكتروني</label>
                  <Input
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="manager@example.com"
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    هذا هو بريد المدير الرئيسي للنظام
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <Button
              onClick={handleSaveSettings}
              className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2 py-6 text-lg"
            >
              <Save className="w-5 h-5" />
              حفظ جميع الإعدادات
            </Button>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <Card className="border-0 shadow-sm bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg">WhatsApp</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => openSocialApp("whatsapp", whatsappNumber)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  فتح WhatsApp
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg">Facebook</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => openSocialApp("facebook", facebookPage)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                >
                  <Facebook className="w-4 h-4" />
                  فتح Facebook
                </Button>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-pink-50">
              <CardHeader>
                <CardTitle className="text-lg">Instagram</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => openSocialApp("instagram", instagramHandle)}
                  className="w-full bg-pink-600 hover:bg-pink-700 text-white flex items-center justify-center gap-2"
                >
                  <Instagram className="w-4 h-4" />
                  فتح Instagram
                </Button>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="border-0 shadow-sm bg-amber-50">
              <CardHeader>
                <CardTitle className="text-sm">ملاحظات مهمة</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-amber-800 space-y-2">
                <p>• تأكد من صحة جميع البيانات</p>
                <p>• سيتم استخدام هذه البيانات في الفواتير والعروض</p>
                <p>• يمكن تغيير الإعدادات في أي وقت</p>
              </CardContent>
            </Card>

            {/* Additional Services */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>خدمات إضافية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => navigate("/email-notifications")}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  الإشعارات البريدية
                </Button>
                <Button
                  onClick={() => navigate("/payment-gateway")}
                  className="w-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  بوابات الدفع
                </Button>
                {currentUser?.role === "manager" && (
                  <Button
                    onClick={() => navigate("/user-management")}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    إدارة المستخدمين
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
