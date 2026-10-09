import { AdvancedVoiceControl } from '@/components/AdvancedVoiceControl';
import { Card } from '@/components/ui/card';

export default function VoiceControlPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">التحكم الصوتي</h1>
          <p className="text-gray-600">
            استخدم أوامر صوتية بالعربية للتنقل والتحكم بالتطبيق
          </p>
        </div>

        <AdvancedVoiceControl />

        {/* Instructions */}
        <Card className="p-6 bg-blue-50 border-blue-200">
          <h3 className="text-lg font-semibold mb-4 text-blue-900">كيفية الاستخدام</h3>
          <div className="space-y-3 text-sm text-blue-800">
            <p>
              <span className="font-semibold">1. اضغط على زر "استمع"</span>
              <br />
              سيبدأ التطبيق بالاستماع لأوامرك الصوتية
            </p>
            <p>
              <span className="font-semibold">2. قل الأمر بوضوح</span>
              <br />
              مثل: "افتح المبيعات" أو "اذهب للفواتير"
            </p>
            <p>
              <span className="font-semibold">3. انتظر التأكيد</span>
              <br />
              سيقول التطبيق الأمر الذي تم تنفيذه
            </p>
            <p>
              <span className="font-semibold">4. استخدم زر "توقف"</span>
              <br />
              لإيقاف الاستماع في أي وقت
            </p>
          </div>
        </Card>

        {/* Tips */}
        <Card className="p-6 bg-green-50 border-green-200">
          <h3 className="text-lg font-semibold mb-4 text-green-900">نصائح مهمة</h3>
          <ul className="space-y-2 text-sm text-green-800 list-disc list-inside">
            <li>تأكد من تفعيل الميكروفون في متصفحك</li>
            <li>تحدث بوضوح وبسرعة معتدلة</li>
            <li>استخدم اللغة العربية الفصحى أو العامية المصرية</li>
            <li>إذا لم يتم التعرف على الأمر، حاول مرة أخرى</li>
            <li>يعمل بشكل أفضل في بيئة هادئة</li>
          </ul>
        </Card>

        {/* Browser Support */}
        <Card className="p-6 bg-yellow-50 border-yellow-200">
          <h3 className="text-lg font-semibold mb-4 text-yellow-900">دعم المتصفحات</h3>
          <p className="text-sm text-yellow-800 mb-3">
            يعمل التحكم الصوتي بشكل أفضل على:
          </p>
          <ul className="space-y-1 text-sm text-yellow-800 list-disc list-inside">
            <li>Google Chrome / Chromium</li>
            <li>Microsoft Edge</li>
            <li>Safari (على iOS 14.5+)</li>
            <li>Firefox (مع بعض القيود)</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
