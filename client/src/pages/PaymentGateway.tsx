import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, CreditCard } from "lucide-react";
import { useLocation } from "wouter";

const providers = [
  { id: "fawry", name: "Fawry", icon: "💳", description: "محفظة رقمية وتحويل أموال" },
  { id: "paymob", name: "Paymob", icon: "📱", description: "بوابة دفع متعددة الخيارات" },
  { id: "stripe", name: "Stripe", icon: "💰", description: "بوابة دفع عالمية" },
] as const;

export default function PaymentGateway() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">بوابات الدفع</h1>
            <p className="text-gray-600 mt-1">تكاملات الدفع الإلكتروني</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/settings")} className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> العودة
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card className="bg-amber-50 border-amber-200 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="w-5 h-5" /> الدفع الإلكتروني غير مهيأ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-amber-900">
            <p>لا يوجد تكامل فعلي مع مزود دفع في هذا الإصدار؛ لذلك لن تُقبل مدفوعات إلكترونية من هذه الشاشة.</p>
            <p>لا تُدخل مفاتيح API أو Secret هنا. يجب أن تُدار أسرار المزود خادميًا بعد إعداد موثوق وتكامل معتمد.</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map(provider => (
            <Card key={provider.id} className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-4xl mb-2" aria-hidden="true">{provider.icon}</div>
                    <CardTitle>{provider.name}</CardTitle>
                    <CardDescription>{provider.description}</CardDescription>
                  </div>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">غير مهيأ</span>
                </div>
              </CardHeader>
              <CardContent>
                <Button disabled className="w-full" aria-label={`إعداد ${provider.name} غير متاح`}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  يتطلب تكاملًا خادميًا
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
