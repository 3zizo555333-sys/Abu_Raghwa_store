import { InvoiceManager } from '@/components/InvoiceManager';

export default function AdvancedInvoices() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">إدارة الفواتير</h1>
          <p className="text-gray-600">
            التقط الفواتير وحفظها وشاركها بسهولة
          </p>
        </div>

        <InvoiceManager />
      </div>
    </div>
  );
}
