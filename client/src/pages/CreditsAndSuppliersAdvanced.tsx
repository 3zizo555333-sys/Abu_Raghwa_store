import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, DollarSign, Users, Edit2, Check, Package, TrendingUp, TrendingDown, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import React, { useState, useEffect } from "react";
import { appendShopCreditTransaction, createShopCreditAccount, importLegacyShopCreditAccounts, listShopCreditAccounts, softDeleteShopCreditAccount, subscribeToShopCredits, type ShopCreditAccount } from "@/lib/supabase/shopCredits";
import { browserState } from "@/lib/browserState";
import { useStaffAccess } from "@/hooks/useStaffAccess";

interface Transaction {
  id: string;
  type: "payment" | "add" | "return"; // payment: دفع/قبض, add: إضافة بضاعة/شراء, return: استرجاع
  amount: number;
  description: string;
  date: string;
  notes?: string;
  balance: number; // الرصيد بعد العملية
}

interface Customer {
  id: string;
  name: string;
  balance: number; // موجب = مدين، سالب = دائن
  transactions: Transaction[];
  createdDate: string;
}

interface Supplier {
  id: string;
  name: string;
  balance: number; // موجب = مستحق للمورد، سالب = دين على المورد
  transactions: Transaction[];
  createdDate: string;
}

export default function CreditsAndSuppliersAdvanced() {
  const [, navigate] = useLocation();
  const { user } = useStaffAccess();
  const canEdit = user?.role !== "seller";
  const [activeTab, setActiveTab] = useState<"customers" | "suppliers">("customers");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    initialBalance: "",
    initialDetails: "",
    initialNotes: ""
  });
  const [transactionData, setTransactionData] = useState({
    type: "payment" as "payment" | "add" | "return",
    amount: "",
    description: "",
    notes: ""
  });

  const [isLoading, setIsLoading] = useState(true);
  const toView = (account: ShopCreditAccount): Customer | Supplier => {
    let runningBalance = 0;
    const transactions = [...account.transactions].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).map(entry => {
      runningBalance += Number(entry.balance_delta);
      const type: Transaction["type"] = entry.entry_type === "payment" ? "payment" : entry.entry_type === "return" || (entry.entry_type === "adjustment" && Number(entry.balance_delta) < 0) ? "return" : "add";
      return { id: entry.id, type, amount: Number(entry.amount), description: entry.description, date: entry.occurred_at, notes: entry.notes, balance: runningBalance };
    }).reverse();
    return { id: account.id, name: account.name, balance: account.balance, transactions, createdDate: account.created_at };
  };
  const reloadAccounts = async () => {
    const [cloudCustomers, cloudSuppliers] = await Promise.all([listShopCreditAccounts("customer"), listShopCreditAccounts("supplier")]);
    setCustomers(cloudCustomers.map(account => toView(account) as Customer));
    setSuppliers(cloudSuppliers.map(account => toView(account) as Supplier));
    return { cloudCustomers, cloudSuppliers };
  };

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    const initialize = async () => {
      try {
        await reloadAccounts();
        const legacyCustomersRaw = browserState.get("abu_raghwa_customers_advanced");
        const legacySuppliersRaw = browserState.get("abu_raghwa_suppliers_advanced");
        let legacyCustomers: unknown[] = [];
        let legacySuppliers: unknown[] = [];
        try { legacyCustomers = JSON.parse(legacyCustomersRaw || "[]"); legacySuppliers = JSON.parse(legacySuppliersRaw || "[]"); } catch { toast.error("تعذر قراءة بيانات الآجل القديمة؛ لم تُمسح من هذا الجهاز."); }
        if (canEdit && Array.isArray(legacyCustomers) && Array.isArray(legacySuppliers) && (legacyCustomers.length || legacySuppliers.length)) {
          try {
            const migration = await importLegacyShopCreditAccounts(legacyCustomers, legacySuppliers);
            if (migration.imported) {
              await reloadAccounts();
              browserState.remove("abu_raghwa_customers_advanced");
              browserState.remove("abu_raghwa_suppliers_advanced");
              toast.success("تم دمج سجل الآجل القديم في الدفتر السحابي.");
            }
          } catch (error) { toast.error(error instanceof Error ? `بقيت بيانات الآجل القديمة محفوظة محليًا: ${error.message}` : "تعذر نقل بيانات الآجل القديمة."); }
        }
        if (!active) return;
        unsubscribe = await subscribeToShopCredits(() => { void reloadAccounts().catch(error => toast.error(error instanceof Error ? error.message : "تعذر تحديث الحسابات.")); });
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "تعذر تحميل الآجل والموردين من Supabase.");
      } finally { if (active) setIsLoading(false); }
    };
    void initialize();
    return () => { active = false; if (unsubscribe) void unsubscribe(); };
  }, []);

  const handleAddAccount = async (partyType: "customer" | "supplier") => {
    if (!formData.name.trim()) {
      toast.error("❌ يرجى إدخال اسم العميل");
      return;
    }

    const initialBalance = Number(formData.initialBalance) || 0;
    if (!Number.isFinite(initialBalance) || Math.abs(initialBalance) > 999999999999) {
      toast.error("قيمة الرصيد الأولي غير صالحة.");
      return;
    }
    if (initialBalance !== 0 && !formData.initialDetails.trim()) {
      toast.error("اكتب ما الذي أخذه العميل أو سبب الرصيد الأولي");
      return;
    }
    try {
      await createShopCreditAccount({ partyType, name: formData.name, initialBalance, initialDescription: formData.initialDetails || "رصيد افتتاحي", notes: formData.initialNotes });
      await reloadAccounts();
      setFormData({ name: "", initialBalance: "", initialDetails: "", initialNotes: "" });
      setShowForm(false);
      toast.success(partyType === "customer" ? "تم حفظ حساب العميل سحابيًا." : "تم حفظ حساب المورد سحابيًا.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الحساب."); }
  };

  const handleAddCustomer = () => handleAddAccount("customer");
  const handleAddSupplier = () => handleAddAccount("supplier");

  const handleAddTransaction = async () => {
    if (!selectedId || !transactionData.amount || !transactionData.description.trim()) {
      toast.error("❌ يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    const amount = Number(transactionData.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999) { toast.error("أدخل مبلغًا موجبًا صالحًا."); return; }
    try {
      await appendShopCreditTransaction({
        accountId: selectedId,
        type: transactionData.type === "add" ? "purchase" : transactionData.type,
        amount,
        balanceDelta: transactionData.type === "add" ? amount : -amount,
        description: transactionData.description,
        notes: transactionData.notes,
      });
      await reloadAccounts();
      setTransactionData({ type: "payment", amount: "", description: "", notes: "" });
      setShowTransactionForm(false);
      setSelectedId(null);
      toast.success("تم حفظ الحركة السحابية.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الحركة."); }
  };

  const handleDeleteAccount = async (id: string, partyType: "customer" | "supplier") => {
      if (confirm("هل أنت متأكد من حذف هذا العميل؟")) {
      try { await softDeleteShopCreditAccount(id); await reloadAccounts(); toast.success(partyType === "customer" ? "تم أرشفة حساب العميل." : "تم أرشفة حساب المورد."); }
      catch (error) { toast.error(error instanceof Error ? error.message : "تعذر أرشفة الحساب."); }
    }
  };

  const handleDeleteCustomer = (id: string) => handleDeleteAccount(id, "customer");
  const handleDeleteSupplier = (id: string) => handleDeleteAccount(id, "supplier");

  const currentList = activeTab === "customers" ? customers : suppliers;
  const totalBalance = currentList.reduce((sum, item) => sum + item.balance, 0);

  const getTransactionTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      payment: activeTab === "customers" ? "قبض مبلغ" : "دفع مبلغ",
      add: activeTab === "customers" ? "إضافة بضاعة" : "شراء بضاعة",
      return: "استرجاع"
    };
    return labels[type] || type;
  };

  const getTransactionTypeColor = (type: string) => {
    const colors: { [key: string]: string } = {
      payment: "text-green-600 bg-green-50",
      add: "text-red-600 bg-red-50",
      return: "text-blue-600 bg-blue-50"
    };
    return colors[type] || "";
  };

  const getDetailsFieldLabel = () => {
    if (transactionData.type === "add") return activeTab === "customers" ? "ما الذي أخذه العميل؟" : "ما الذي أخذته من المورد؟";
    if (transactionData.type === "payment") return activeTab === "customers" ? "تفاصيل القبض أو الدفع" : "تفاصيل الدفعة وما تم دفعه مقابله";
    return "تفاصيل الاسترجاع";
  };

  const getDetailsPlaceholder = () => {
    if (transactionData.type === "add") return activeTab === "customers" ? "مثال: أخذ 3 جراكن كلور و2 كيس مسحوق بمبلغ 150" : "مثال: أخذت 10 جراكن صابون و5 علب معطر بمبلغ 150";
    if (transactionData.type === "payment") return activeTab === "customers" ? "مثال: دفع 50 جنيه يوم 24 أغسطس مقابل جزء من حسابه" : "مثال: دفعت 50 جنيه يوم 24 أغسطس مقابل فاتورة الصابون";
    return "اكتب الأصناف أو سبب الاسترجاع";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">الأجل والموردين</h1>
            <p className="text-gray-600 mt-1">إدارة الحركات المالية والمخزنية</p>
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
        {/* Tabs */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Button
            onClick={() => {
              setActiveTab("customers");
              setShowForm(false);
              setShowTransactionForm(false);
              setSelectedId(null);
            }}
            className={`py-6 text-lg font-semibold flex items-center justify-center gap-2 ${
              activeTab === "customers"
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-900"
            }`}
          >
            <Users className="w-5 h-5" />
            العملاء
          </Button>
          <Button
            onClick={() => {
              setActiveTab("suppliers");
              setShowForm(false);
              setShowTransactionForm(false);
              setSelectedId(null);
            }}
            className={`py-6 text-lg font-semibold flex items-center justify-center gap-2 ${
              activeTab === "suppliers"
                ? "bg-purple-600 hover:bg-purple-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-900"
            }`}
          >
            <Package className="w-5 h-5" />
            الموردين
          </Button>
        </div>

        {/* Summary Card */}
        <Card className="mb-8 border-0 shadow-md">
          <CardHeader>
            <CardTitle>ملخص الرصيد</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-gray-600 text-sm font-semibold">عدد {activeTab === "customers" ? "العملاء" : "الموردين"}</p>
                <p className="text-3xl font-bold text-blue-600">{currentList.length}</p>
              </div>
              <div className={`p-4 rounded-lg ${totalBalance > 0 ? "bg-red-50" : "bg-green-50"}`}>
                <p className="text-gray-600 text-sm font-semibold">إجمالي الرصيد</p>
                <p className={`text-3xl font-bold ${totalBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {Math.abs(totalBalance).toFixed(2)} ج.م
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-gray-600 text-sm font-semibold">الحالة</p>
                <p className="text-3xl font-bold text-purple-600">
                  {totalBalance > 0 ? (activeTab === "customers" ? "مدين" : "مستحق") : (activeTab === "customers" ? "دائن" : "دين")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add Button */}
        {canEdit && !showForm && !showTransactionForm && (
          <div className="mb-8 flex gap-3">
            <Button
              onClick={() => setShowForm(true)}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              إضافة {activeTab === "customers" ? "عميل" : "مورد"} جديد
            </Button>
          </div>
        )}

        {/* Add Form */}
        {canEdit && showForm && (
          <Card className="mb-8 border-0 shadow-md">
            <CardHeader>
              <CardTitle>إضافة {activeTab === "customers" ? "عميل" : "مورد"} جديد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">الاسم</label>
                  <Input
                    placeholder={`أدخل اسم ${activeTab === "customers" ? "العميل" : "المورد"}`}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">الرصيد الأولي (اختياري)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.initialBalance}
                    onChange={(e) => setFormData({ ...formData, initialBalance: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">{activeTab === "customers" ? "ما الذي أخذه العميل بهذا الرصيد؟" : "ما الذي أخذته من المورد بهذا الرصيد؟"}</label>
                  <textarea
                    placeholder={activeTab === "customers" ? "مثال: أخذ 3 جراكن و2 كيس مسحوق بمبلغ 150" : "مثال: أخذت صابون ومعطرات بمبلغ 150"}
                    value={formData.initialDetails}
                    onChange={(e) => setFormData({ ...formData, initialDetails: e.target.value })}
                    className="min-h-22 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-gray-500">تُطلب هذه التفاصيل إذا كتبت مبلغًا في الرصيد الأولي.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">ملاحظات افتتاحية (اختياري)</label>
                  <Input
                    placeholder="مثال: اتفاق دفع نهاية الشهر"
                    value={formData.initialNotes}
                    onChange={(e) => setFormData({ ...formData, initialNotes: e.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={activeTab === "customers" ? handleAddCustomer : handleAddSupplier}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    حفظ
                  </Button>
                  <Button
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ name: "", initialBalance: "", initialDetails: "", initialNotes: "" });
                    }}
                    variant="outline"
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* List */}
        <div className="space-y-4">
          {currentList.map((item) => (
            <Card key={item.id} className="border-0 shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{item.name}</CardTitle>
                    <CardDescription>
                      تم الإنشاء: {new Date(item.createdDate).toLocaleDateString("ar-EG")}
                    </CardDescription>
                  </div>
                  <div className={`text-right p-4 rounded-lg ${item.balance > 0 ? "bg-red-50" : "bg-green-50"}`}>
                    <p className="text-gray-600 text-sm font-semibold">الرصيد الحالي</p>
                    <p className={`text-2xl font-bold ${item.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                      {Math.abs(item.balance).toFixed(2)} ج.م
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {item.balance > 0 ? (activeTab === "customers" ? "مدين" : "مستحق") : (activeTab === "customers" ? "دائن" : "دين")}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Transactions */}
                {item.transactions.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      سجل الحركات ({item.transactions.length})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {item.transactions.map((transaction) => (
                        <div key={transaction.id} className={`p-3 rounded-lg ${getTransactionTypeColor(transaction.type)}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-semibold">{getTransactionTypeLabel(transaction.type)}</p>
                              <p className="mt-1 text-sm font-bold">التفاصيل: <span className="font-normal whitespace-pre-wrap">{transaction.description || "لم تُسجل تفاصيل لهذه الحركة"}</span></p>
                              {transaction.notes && <p className="text-xs mt-1">ملاحظات: {transaction.notes}</p>}
                            </div>
                            <div className="text-right">
                              <p className="font-bold">{transaction.amount.toFixed(2)} ج.م</p>
                              <p className="text-xs">الرصيد: {transaction.balance.toFixed(2)}</p>
                              <p className="text-xs mt-1">{new Date(transaction.date).toLocaleDateString("ar-EG")}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {canEdit && <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      setSelectedId(item.id);
                      setShowTransactionForm(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة حركة
                  </Button>
                  <Button
                    onClick={() => activeTab === "customers" ? handleDeleteCustomer(item.id) : handleDeleteSupplier(item.id)}
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    حذف
                  </Button>
                </div>}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Transaction Form Modal */}
        {canEdit && showTransactionForm && selectedId && (
          <Card className="fixed inset-0 m-4 max-w-2xl mx-auto my-auto border-0 shadow-2xl z-50 overflow-y-auto max-h-screen">
            <CardHeader>
              <CardTitle>إضافة حركة جديدة</CardTitle>
              <CardDescription>
                {activeTab === "customers" ? "العميل" : "المورد"}: {currentList.find(item => item.id === selectedId)?.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">نوع الحركة</label>
                  <select
                    value={transactionData.type}
                    onChange={(e) => setTransactionData({ ...transactionData, type: e.target.value as any })}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="payment">
                      {activeTab === "customers" ? "قبض مبلغ" : "دفع مبلغ"}
                    </option>
                    <option value="add">
                      {activeTab === "customers" ? "إضافة بضاعة" : "شراء بضاعة"}
                    </option>
                    <option value="return">استرجاع</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">المبلغ</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={transactionData.amount}
                    onChange={(e) => setTransactionData({ ...transactionData, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">{getDetailsFieldLabel()} *</label>
                  <textarea
                    placeholder={getDetailsPlaceholder()}
                    value={transactionData.description}
                    onChange={(e) => setTransactionData({ ...transactionData, description: e.target.value })}
                    className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">ملاحظات إضافية (اختياري)</label>
                  <Input
                    placeholder="أي ملاحظات إضافية"
                    value={transactionData.notes}
                    onChange={(e) => setTransactionData({ ...transactionData, notes: e.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleAddTransaction}
                    className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    تأكيد
                  </Button>
                  <Button
                    onClick={() => {
                      setShowTransactionForm(false);
                      setSelectedId(null);
                      setTransactionData({ type: "payment", amount: "", description: "", notes: "" });
                    }}
                    variant="outline"
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overlay */}
        {canEdit && showTransactionForm && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => {
              setShowTransactionForm(false);
              setSelectedId(null);
              setTransactionData({ type: "payment", amount: "", description: "", notes: "" });
            }}
          />
        )}
      </main>
    </div>
  );
}
