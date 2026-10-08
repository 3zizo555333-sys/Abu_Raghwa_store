import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, CreditCard, DollarSign, Smartphone, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

interface PaymentGateway {
  id: string;
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
  apiKey?: string;
  secretKey?: string;
  fees: number;
}

export default function PaymentGateway() {
  const [, navigate] = useLocation();
  const [gateways, setGateways] = useState<PaymentGateway[]>([
    {
      id: "fawry",
      name: "Fawry",
      icon: "💳",
      description: "محفظة رقمية وتحويل أموال",
      enabled: false,
      fees: 1.5
    },
    {
      id: "paymob",
      name: "Paymob",
      icon: "📱",
      description: "بوابة دفع متعددة الخيارات",
      enabled: false,
      fees: 2.0
    },
    {
      id: "stripe",
      name: "Stripe",
      icon: "💰",
      description: "بوابة دفع عالمية",
      enabled: false,
      fees: 2.9
    }
  ]);

  const [selectedGateway, setSelectedGateway] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const toggleGateway = (id: string) => {
    setGateways(gateways.map(g =>
      g.id === id ? { ...g, enabled: !g.enabled } : g
    ));
  };

  const saveGatewayKeys = (id: string) => {
    if (!apiKey || !secretKey) {
      alert("الرجاء إدخال المفاتيح");
      return;
    }

    setGateways(gateways.map(g =>
      g.id === id ? { ...g, apiKey, secretKey } : g
    ));

    localStorage.setItem("abu_raghwa_payment_gateways", JSON.stringify(gateways));
    alert("تم حفظ المفاتيح بنجاح!");
    setSelectedGateway(null);
    setApiKey("");
    setSecretKey("");
  };

  const testPayment = (gatewayName: string) => {
    alert(`سيتم اختبار الدفع عبر ${gatewayName}\n\nملاحظة: في النسخة الحقيقية، سيتم إرسال طلب دفع حقيقي`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">بوابات الدفع</h1>
            <p className="text-gray-600 mt-1">إدارة طرق الدفع الإلكترونية</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Warning */}
        <Card className="bg-amber-50 border-amber-200 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="w-5 h-5" />
              ملاحظة أمان مهمة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-amber-800">
            <p>لا تشارك مفاتيح API الخاصة بك مع أحد. احفظها في مكان آمن وغير المفاتيح بانتظام.</p>
          </CardContent>
        </Card>

        {/* Payment Gateways Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {gateways.map((gateway) => (
            <Card key={gateway.id} className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-4xl mb-2">{gateway.icon}</div>
                    <CardTitle>{gateway.name}</CardTitle>
                    <CardDescription>{gateway.description}</CardDescription>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                    gateway.enabled
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {gateway.enabled ? "مفعل" : "معطل"}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">رسوم المعاملة</p>
                  <p className="text-xl font-bold text-gray-900">{gateway.fees}%</p>
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => setSelectedGateway(gateway.id)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    إدارة المفاتيح
                  </Button>
                  <Button
                    onClick={() => toggleGateway(gateway.id)}
                    variant={gateway.enabled ? "destructive" : "outline"}
                    className="w-full"
                  >
                    {gateway.enabled ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button
                    onClick={() => testPayment(gateway.name)}
                    variant="outline"
                    className="w-full"
                  >
                    اختبار الدفع
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* API Keys Configuration */}
        {selectedGateway && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>
                إدارة مفاتيح {gateways.find(g => g.id === selectedGateway)?.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="أدخل API Key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Secret Key</label>
                <Input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="أدخل Secret Key"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => saveGatewayKeys(selectedGateway)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  حفظ المفاتيح
                </Button>
                <Button
                  onClick={() => setSelectedGateway(null)}
                  variant="outline"
                  className="flex-1"
                >
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Statistics */}
        <Card className="border-0 shadow-sm mt-8">
          <CardHeader>
            <CardTitle>إحصائيات الدفع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">إجمالي المعاملات</p>
                <p className="text-3xl font-bold text-blue-600">0</p>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">إجمالي المبلغ</p>
                <p className="text-3xl font-bold text-green-600">0.00 ج.م</p>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">الرسوم المدفوعة</p>
                <p className="text-3xl font-bold text-purple-600">0.00 ج.م</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
