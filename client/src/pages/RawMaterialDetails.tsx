import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function RawMaterialDetails() {
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({
    description: "",
    usage: "",
    ratio: "",
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">تفاصيل الخامة</h1>
          <Button variant="outline" onClick={() => navigate("/materials")}>
            <ArrowLeft className="w-4 h-4 ml-2" /> العودة
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card>
          <CardHeader><CardTitle>تفاصيل الخامة</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2">النبذة</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="border rounded px-3 py-2 w-full" rows={4} placeholder="اكتب نبذة عن الخامة" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">الاستخدامات</label>
                <textarea value={formData.usage} onChange={(e) => setFormData({ ...formData, usage: e.target.value })} className="border rounded px-3 py-2 w-full" rows={4} placeholder="اكتب استخدامات الخامة" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">النسبة</label>
                <input type="text" value={formData.ratio} onChange={(e) => setFormData({ ...formData, ratio: e.target.value })} className="border rounded px-3 py-2 w-full" placeholder="اكتب نسبة الاستخدام" />
              </div>
              <Button className="w-full bg-green-600">حفظ التفاصيل</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
