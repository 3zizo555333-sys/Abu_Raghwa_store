import { SocialMediaIntegration } from '@/components/SocialMediaIntegration';
import { Card } from '@/components/ui/card';

export default function SocialMedia() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">تواصل معنا</h1>
          <p className="text-gray-600">
            تابعنا على وسائل التواصل الاجتماعي أو تواصل معنا مباشرة
          </p>
        </div>

        <SocialMediaIntegration
          whatsapp="+201234567890"
          facebook="https://facebook.com/aburagwa"
          instagram="https://instagram.com/aburagwa"
          email="info@aburagwa.com"
          phone="+201234567890"
          message="مرحبا! أنا أستخدم تطبيق أبو رغوة لإدارة محلي"
        />

        {/* Contact Information */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">معلومات الاتصال</h3>
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold">الهاتف:</span>
                <br />
                +20 123 456 7890
              </p>
              <p>
                <span className="font-semibold">البريد الإلكتروني:</span>
                <br />
                info@aburagwa.com
              </p>
              <p>
                <span className="font-semibold">الموقع:</span>
                <br />
                القاهرة، مصر
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">ساعات العمل</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">السبت - الخميس:</span>
                <br />
                9:00 صباحًا - 10:00 مساءً
              </p>
              <p>
                <span className="font-semibold">الجمعة:</span>
                <br />
                3:00 مساءً - 10:00 مساءً
              </p>
            </div>
          </Card>
        </div>

        {/* Social Media Stats */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">تابعنا على وسائل التواصل</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-500">50K+</p>
              <p className="text-sm text-gray-600">متابعي WhatsApp</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">100K+</p>
              <p className="text-sm text-gray-600">متابعي Facebook</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-pink-500">75K+</p>
              <p className="text-sm text-gray-600">متابعي Instagram</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-500">1K+</p>
              <p className="text-sm text-gray-600">رسائل بريد يومية</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-500">24/7</p>
              <p className="text-sm text-gray-600">دعم فني</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
