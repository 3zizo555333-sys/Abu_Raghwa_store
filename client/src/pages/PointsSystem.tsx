import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Award, Gift, Zap } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { applyStaffPointAdjustment, createStoreReward, deleteStoreReward, listStaffGamification, redeemStoreReward, subscribeToGamification, type GamificationEmployee, type StoreRewardRow } from "@/lib/supabase/gamification";
import { saveStaffEmployee, softDeleteStaffEmployee } from "@/lib/supabase/operations";
import { createLoyaltyMilestone, deleteLoyaltyMilestone, listLoyaltyExperienceSettings, saveReferralCampaign, uploadLoyaltyMilestoneImage, type LoyaltyMilestoneRow, type ReferralCampaignSettingsRow } from "@/lib/supabase/loyaltyExperience";

export default function PointsSystem() {
  const [, navigate] = useLocation();
  const [employees, setEmployees] = useState<GamificationEmployee[]>([]);
  const [rewards, setRewards] = useState<StoreRewardRow[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddReward, setShowAddReward] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [employeeForm, setEmployeeForm] = useState({ name: "" });
  const [rewardForm, setRewardForm] = useState({ pointsRequired: 1000, rewardName: "", rewardDescription: "", availableQuantity: 1 });
  const [milestones, setMilestones] = useState<LoyaltyMilestoneRow[]>([]);
  const [referralSettings, setReferralSettings] = useState<ReferralCampaignSettingsRow | null>(null);
  const [milestoneForm, setMilestoneForm] = useState({ pointsRequired: 100, rewardName: "", description: "", isMystery: false, rewardImageUrl: "" });
  const [referralForm, setReferralForm] = useState({ title: "شارك التوفير مع حبايبك واكسب نقاط مجانية!", messageTemplate: "ادعُ أصدقاءك للتسجيل في نظام ولاء أبو رغوة واكسب 50 نقطة عن كل صديق!", pointsPerFriend: 50, isActive: true });

  const load = async () => {
    setLoading(true);
    try {
      const data = await listStaffGamification();
      setEmployees(data.employees);
      setRewards(data.rewards);
      const experience = await listLoyaltyExperienceSettings();
      setMilestones(experience.milestones);
      setReferralSettings(experience.referral);
      if (experience.referral) setReferralForm({ title: experience.referral.title, messageTemplate: experience.referral.message_template, pointsPerFriend: experience.referral.points_per_friend, isActive: experience.referral.is_active });
      setSelectedEmployeeId(current => current || data.employees[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل النقاط والجوائز من السحابة.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    let unsubscribe: (() => Promise<unknown>) | undefined;
    void subscribeToGamification(() => { void load(); }).then(cleanup => { unsubscribe = cleanup; }).catch(() => undefined);
    return () => { if (unsubscribe) void unsubscribe(); };
  }, []);

  const selectedEmployee = employees.find(employee => employee.id === selectedEmployeeId);
  const availableRewards = useMemo(() => rewards.filter(reward => reward.available_quantity > 0 && reward.points_required <= (selectedEmployee?.currentPoints || 0)), [rewards, selectedEmployee]);
  const nextReward = useMemo(() => rewards.find(reward => reward.available_quantity > 0 && reward.points_required > (selectedEmployee?.currentPoints || 0)), [rewards, selectedEmployee]);

  const notify = (message: string) => {
    setNotificationMessage(message); setShowNotification(true); setTimeout(() => setShowNotification(false), 3500);
  };

  const handleAddEmployee = async () => {
    if (!employeeForm.name.trim()) { toast.error("الرجاء إدخال اسم الموظف"); return; }
    try {
      const row = await saveStaffEmployee({ name: employeeForm.name.trim(), phone: "", position: "", role: "seller", salary: 0, join_date: new Date().toISOString().slice(0, 10), is_active: true, metadata: {} });
      setEmployeeForm({ name: "" }); setShowAddEmployee(false); await load(); setSelectedEmployeeId(row.id); toast.success("تم حفظ الموظف سحابياً.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الموظف."); }
  };

  const handleAddReward = async () => {
    if (!rewardForm.rewardName.trim() || rewardForm.pointsRequired <= 0 || rewardForm.availableQuantity < 0) { toast.error("الرجاء ملء بيانات الجائزة بشكل صحيح"); return; }
    try {
      await createStoreReward({ title: rewardForm.rewardName, description: rewardForm.rewardDescription, pointsRequired: rewardForm.pointsRequired, availableQuantity: rewardForm.availableQuantity, icon: "🎁" });
      setRewardForm({ pointsRequired: 1000, rewardName: "", rewardDescription: "", availableQuantity: 1 }); setShowAddReward(false); await load(); toast.success("تم حفظ الجائزة في Supabase.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الجائزة سحابياً."); }
  };

  const handleSaveReferral = async () => {
    try { await saveReferralCampaign(referralForm); await load(); toast.success("تم حفظ حملة دعوة الأصدقاء سحابياً."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ الحملة."); }
  };
  const handleAddMilestone = async () => {
    if (!milestoneForm.rewardName.trim() || milestoneForm.pointsRequired <= 0) { toast.error("اكتب اسم الهدية وعدد النقاط."); return; }
    try { await createLoyaltyMilestone({ pointsRequired: milestoneForm.pointsRequired, rewardName: milestoneForm.rewardName, description: milestoneForm.description, isMystery: milestoneForm.isMystery, rewardImageUrl: milestoneForm.rewardImageUrl || null }); setMilestoneForm({ pointsRequired: 100, rewardName: "", description: "", isMystery: false, rewardImageUrl: "" }); await load(); toast.success("تم حفظ محطة الهدية سحابياً."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حفظ محطة الهدية."); }
  };
  const handleMilestoneImage = async (file: File) => {
    try { const url = await uploadLoyaltyMilestoneImage(file, crypto.randomUUID()); setMilestoneForm(current => ({ ...current, rewardImageUrl: url })); toast.success("تم رفع صورة الهدية."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر رفع صورة الهدية."); }
  };
  const handleDeleteMilestone = async (id: string) => {
    if (!confirm("هل تريد حذف محطة الهدية؟")) return;
    try { await deleteLoyaltyMilestone(id); await load(); toast.success("تم حذف محطة الهدية."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف المحطة."); }
  };
  const claimReward = async (reward: StoreRewardRow) => {
    if (!selectedEmployee) return;
    try { await redeemStoreReward(selectedEmployee.id, reward.id); await load(); notify(`🎉 تم تسجيل استلام الجائزة: ${reward.title}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر استلام الجائزة سحابياً."); }
  };

  const resetPoints = async () => {
    if (!selectedEmployee || selectedEmployee.currentPoints <= 0 || !confirm(`هل تريد تصفير رصيد نقاط ${selectedEmployee.name}؟`)) return;
    try { await applyStaffPointAdjustment({ employeeId: selectedEmployee.id, pointsDelta: -selectedEmployee.currentPoints, entryType: "reset", sourceId: `reset:${selectedEmployee.id}:${Date.now()}`, description: `تصفير رصيد نقاط ${selectedEmployee.name}` }); await load(); notify(`تم تصفير نقاط ${selectedEmployee.name}.`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تصفير النقاط سحابياً."); }
  };

  const deleteEmployee = async (employeeId: string) => {
    if (!confirm("هل تريد حذف هذا الموظف؟ ستبقى الحركات التاريخية محفوظة حتى حذف الموظف.")) return;
    try { await softDeleteStaffEmployee(employeeId); setSelectedEmployeeId(""); await load(); toast.success("تم حذف الموظف من الدليل السحابي."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الموظف."); }
  };

  const deleteReward = async (rewardId: string) => {
    if (!confirm("هل تريد حذف هذه الجائزة؟")) return;
    try { await deleteStoreReward(rewardId); await load(); toast.success("تم حذف الجائزة من السحابة."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذر حذف الجائزة."); }
  };

  return <div dir="rtl" className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
    {showNotification && <div className="fixed right-4 top-4 z-50 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-4 text-white shadow-2xl"><p className="font-bold">{notificationMessage}</p></div>}
    <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white shadow-lg"><div className="container flex items-center justify-between"><div><h1 className="flex items-center gap-2 text-3xl font-bold"><Award size={32} /> نظام النقاط والجوائز السحابي</h1><p className="mt-2 text-purple-100">الرصيد والخصومات والجوائز محفوظة في Supabase وتتحدث لحظياً</p></div><button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 hover:bg-white/30"><ArrowLeft size={20} /> العودة</button></div></div>
    <div className="container py-8">
      {loading && <p className="mb-4 rounded-xl bg-blue-50 p-3 text-blue-800">جارٍ تحميل بيانات النقاط...</p>}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Gift className="text-fuchsia-600" /> حملة دعوة الأصدقاء</h2>
          <div className="space-y-3">
            <input className="w-full rounded-lg border px-3 py-2" placeholder="عنوان الحملة" value={referralForm.title} onChange={e => setReferralForm({ ...referralForm, title: e.target.value })} />
            <textarea className="min-h-20 w-full rounded-lg border px-3 py-2" placeholder="نص الدعوة" value={referralForm.messageTemplate} onChange={e => setReferralForm({ ...referralForm, messageTemplate: e.target.value })} />
            <div className="flex items-center gap-3"><input type="number" min="0" className="w-32 rounded-lg border px-3 py-2" value={referralForm.pointsPerFriend} onChange={e => setReferralForm({ ...referralForm, pointsPerFriend: Number(e.target.value) })} /><span className="text-sm font-bold">نقطة لكل صديق</span><label className="mr-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={referralForm.isActive} onChange={e => setReferralForm({ ...referralForm, isActive: e.target.checked })} /> مفعّلة</label></div>
            <button onClick={() => void handleSaveReferral()} className="w-full rounded-lg bg-green-600 py-2 font-bold text-white">حفظ الحملة سحابياً</button>
          </div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Award size={20} className="text-fuchsia-600" /> محطات الهدايا وصور المكافآت</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><input type="number" min="1" className="rounded-lg border px-3 py-2" placeholder="النقاط" value={milestoneForm.pointsRequired} onChange={e => setMilestoneForm({ ...milestoneForm, pointsRequired: Number(e.target.value) })} /><input className="rounded-lg border px-3 py-2" placeholder="اسم الهدية" value={milestoneForm.rewardName} onChange={e => setMilestoneForm({ ...milestoneForm, rewardName: e.target.value })} /></div>
            <input className="w-full rounded-lg border px-3 py-2" placeholder="وصف اختياري" value={milestoneForm.description} onChange={e => setMilestoneForm({ ...milestoneForm, description: e.target.value })} />
            <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={milestoneForm.isMystery} onChange={e => setMilestoneForm({ ...milestoneForm, isMystery: e.target.checked })} /> هدية غامضة</label><label className="cursor-pointer rounded-lg border border-fuchsia-300 px-3 py-2 text-sm font-bold text-fuchsia-700">رفع صورة<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void handleMilestoneImage(file); }} /></label>{milestoneForm.rewardImageUrl && <span className="text-xs font-bold text-green-600">تم رفع الصورة</span>}</div>
            <button onClick={() => void handleAddMilestone()} className="w-full rounded-lg bg-fuchsia-600 py-2 font-bold text-white">إضافة محطة سحابية</button>
          </div>
          <div className="mt-4 space-y-2">{milestones.map(item => <div key={item.id} className="flex items-center justify-between rounded-lg border bg-slate-50 p-3"><div><p className="font-bold">{item.is_mystery ? "🎁 مفاجأة سرية" : item.reward_name}</p><p className="text-xs text-slate-500">{item.points_required} نقطة{item.reward_image_url ? " · صورة مرفوعة" : ""}</p></div><button onClick={() => void handleDeleteMilestone(item.id)} className="text-red-600"><Trash2 size={16} /></button></div>)}</div>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1"><div className="sticky top-8 rounded-xl bg-white p-6 shadow-lg"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-bold">👥 الموظفون</h2><button onClick={() => setShowAddEmployee(!showAddEmployee)} className="rounded-lg bg-purple-600 p-2 text-white"><Plus size={20} /></button></div>{showAddEmployee && <div className="mb-6 space-y-3 rounded-lg bg-purple-50 p-4"><input className="w-full rounded-lg border border-purple-300 px-3 py-2" placeholder="اسم الموظف" value={employeeForm.name} onChange={e => setEmployeeForm({ name: e.target.value })} /><button onClick={() => void handleAddEmployee()} className="w-full rounded-lg bg-purple-600 py-2 font-semibold text-white">حفظ الموظف</button></div>}<div className="max-h-96 space-y-2 overflow-y-auto">{employees.map(employee => <div key={employee.id} onClick={() => setSelectedEmployeeId(employee.id)} className={`cursor-pointer rounded-lg p-3 ${selectedEmployeeId === employee.id ? "border-2 border-purple-600 bg-purple-100" : "border border-gray-200 bg-gray-50"}`}><div className="flex items-start justify-between"><div><h3 className="font-bold">{employee.name}</h3><p className="mt-1 font-semibold text-purple-600">{employee.currentPoints} نقطة</p></div><button onClick={e => { e.stopPropagation(); void deleteEmployee(employee.id); }} className="text-red-600"><Trash2 size={16} /></button></div></div>)}{!employees.length && <p className="py-8 text-center text-gray-500">لا يوجد موظفون بعد</p>}</div></div></div>
        <div className="lg:col-span-3">{selectedEmployee ? <div className="space-y-6">
          <div className="rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 p-8 text-white shadow-lg"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-bold">{selectedEmployee.name}</h2><button onClick={() => void resetPoints()} className="rounded-lg border border-white/40 bg-white/15 px-3 py-2 text-sm">تصفير النقاط</button></div><p className="text-sm text-purple-100">النقاط الحالية</p><div className="text-6xl font-bold">{selectedEmployee.currentPoints}</div>{nextReward && <div className="mt-6 rounded-lg bg-white/20 p-4"><div className="mb-2 flex justify-between"><span className="font-semibold">{nextReward.title}</span><span>{selectedEmployee.currentPoints} / {nextReward.points_required}</span></div><div className="h-3 w-full rounded-full bg-white/30"><div className="h-3 rounded-full bg-gradient-to-r from-yellow-300 to-orange-400" style={{ width: `${Math.min(selectedEmployee.currentPoints / nextReward.points_required * 100, 100)}%` }} /></div><p className="mt-2 text-xs text-purple-100">فاضل لك {nextReward.points_required - selectedEmployee.currentPoints} نقطة وتستلم جائزة {nextReward.title}</p></div>}</div>
          <div className="rounded-xl bg-white p-6 shadow-lg"><div className="mb-6 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xl font-bold"><Gift size={24} className="text-green-600" /> الجوائز السحابية</h3><button onClick={() => setShowAddReward(!showAddReward)} className="rounded-lg bg-green-600 p-2 text-white"><Plus size={20} /></button></div>{showAddReward && <div className="mb-6 space-y-3 rounded-lg bg-green-50 p-4"><input className="w-full rounded border border-green-300 px-3 py-2" placeholder="اسم الجائزة" value={rewardForm.rewardName} onChange={e => setRewardForm({ ...rewardForm, rewardName: e.target.value })} /><input type="number" min="1" className="w-full rounded border border-green-300 px-3 py-2" placeholder="النقاط المطلوبة" value={rewardForm.pointsRequired} onChange={e => setRewardForm({ ...rewardForm, pointsRequired: Number(e.target.value) })} /><input type="number" min="0" className="w-full rounded border border-green-300 px-3 py-2" placeholder="الكمية المتاحة" value={rewardForm.availableQuantity} onChange={e => setRewardForm({ ...rewardForm, availableQuantity: Number(e.target.value) })} /><input className="w-full rounded border border-green-300 px-3 py-2" placeholder="الوصف" value={rewardForm.rewardDescription} onChange={e => setRewardForm({ ...rewardForm, rewardDescription: e.target.value })} /><button onClick={() => void handleAddReward()} className="w-full rounded bg-green-600 py-2 font-semibold text-white">إضافة الجائزة</button></div>}
            <div className="space-y-2">{rewards.length === 0 ? <p className="text-sm text-gray-500">لم تضف أي جوائز بعد.</p> : rewards.map(reward => { const available = reward.points_required <= selectedEmployee.currentPoints && reward.available_quantity > 0; return <div key={reward.id} className={`flex items-center justify-between gap-3 rounded-lg p-3 ${available ? "border-2 border-green-300 bg-green-50" : "border border-gray-200 bg-gray-50"}`}><div><p className="font-semibold">{reward.icon || "🎁"} {reward.title}</p><p className="text-xs text-gray-600">{reward.description || ""} · المتاح: {reward.available_quantity}</p></div><div className="flex items-center gap-2"><span className="rounded bg-purple-100 px-2 py-1 text-xs font-bold">{reward.points_required}</span>{available && <button onClick={() => void claimReward(reward)} className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white">استلام</button>}<button onClick={() => void deleteReward(reward.id)} className="text-red-600"><Trash2 size={16} /></button></div></div>; })}</div>
          </div>
          {selectedEmployee.pointHistory.length > 0 && <div className="rounded-xl bg-white p-6 shadow-lg"><h3 className="mb-4 text-xl font-bold">📌 سجل حركات النقاط</h3><div className="max-h-72 space-y-2 overflow-y-auto">{selectedEmployee.pointHistory.slice(0, 30).map(transaction => <div key={transaction.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${transaction.points < 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}><div><p className="font-semibold">{transaction.description}</p><p className="text-xs text-gray-500">{new Date(transaction.createdAt).toLocaleString("ar-EG")}</p></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${transaction.points < 0 ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>{transaction.points > 0 ? "+" : ""}{transaction.points}</span></div>)}</div></div>}
        </div> : <div className="rounded-xl bg-white p-12 text-center shadow-lg"><Award size={48} className="mx-auto mb-4 text-gray-400" /><p className="text-lg text-gray-500">اختر موظفاً لعرض نقاطه والجوائز المستحقة</p></div>}</div>
      </div>
    </div>
  </div>;
}
