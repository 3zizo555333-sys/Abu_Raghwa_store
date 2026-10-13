import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useShopFeatureState } from "@/lib/supabase/featureState";

interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  employeePhone?: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in-progress" | "completed";
  createdDate: string;
  pointsValue: number;
}

export default function TasksPage() {
  const [, navigate] = useLocation();
  const [tasks, setTasks, isLoading, flushNow] = useShopFeatureState<Task[]>("abu_raghwa_tasks", []);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: "", employeeName: "", employeePhone: "", dueDate: "" });

  const handleAddTask = async () => {
    if (!formData.title.trim() || !formData.employeeName.trim()) return toast.error("اكتب عنوان المهمة واسم الموظف.");
    const newTask: Task = {
      id: crypto.randomUUID(), title: formData.title.trim(), description: "", assignedTo: "",
      assignedToName: formData.employeeName.trim(), employeePhone: formData.employeePhone.trim(),
      dueDate: formData.dueDate, priority: "medium", status: "pending", createdDate: new Date().toISOString(), pointsValue: 0,
    };
    setTasks(current => [newTask, ...current]);
    if (!await flushNow()) return;
    if (newTask.employeePhone) {
      const message = `مهمة جديدة:\n${newTask.title}\nالموعد: ${newTask.dueDate}`;
      window.open(`https://wa.me/${newTask.employeePhone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    }
    setFormData({ title: "", employeeName: "", employeePhone: "", dueDate: "" });
    setShowForm(false);
    toast.success("تم حفظ المهمة سحابيًا لكل أجهزة المتجر.");
  };

  const updateTaskStatus = async (taskId: string, status: Task["status"]) => {
    setTasks(current => current.map(task => task.id === taskId ? { ...task, status } : task));
    if (!await flushNow()) toast.error("تعذر تأكيد تحديث حالة المهمة في Supabase.");
  };

  const deleteTask = async (taskId: string) => {
    setTasks(current => current.filter(task => task.id !== taskId));
    if (!await flushNow()) toast.error("تعذر تأكيد حذف المهمة في Supabase.");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">المهمات اليومية</h1>
          <Button variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="w-4 h-4 ml-2" /> العودة</Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Button disabled={isLoading} onClick={() => setShowForm(!showForm)} className="mb-6 bg-blue-600"><Plus className="w-4 h-4 ml-2" /> إضافة مهمة جديدة</Button>
        {showForm && (
          <Card className="mb-6">
            <CardHeader><CardTitle>إضافة مهمة جديدة</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="عنوان المهمة" value={formData.title} onChange={event => setFormData({ ...formData, title: event.target.value })} className="border rounded px-3 py-2 md:col-span-2" />
                <input type="text" placeholder="اسم الموظف" value={formData.employeeName} onChange={event => setFormData({ ...formData, employeeName: event.target.value })} className="border rounded px-3 py-2" />
                <input type="tel" placeholder="رقم الواتساب (اختياري)" value={formData.employeePhone} onChange={event => setFormData({ ...formData, employeePhone: event.target.value })} className="border rounded px-3 py-2" />
                <input type="date" value={formData.dueDate} onChange={event => setFormData({ ...formData, dueDate: event.target.value })} className="border rounded px-3 py-2 md:col-span-2" />
              </div>
              <Button disabled={isLoading} onClick={() => void handleAddTask()} className="mt-4 bg-green-600 w-full">إضافة المهمة</Button>
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4">
          {tasks.map(task => (
            <Card key={task.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div><p className="text-sm text-gray-600">المهمة</p><p className="font-bold text-lg">{task.title}</p></div>
                  <div className="flex items-center gap-2">
                    <select value={task.status} onChange={event => void updateTaskStatus(task.id, event.target.value as Task["status"])} className="rounded border px-2 py-1 text-sm" disabled={isLoading}>
                      <option value="pending">معلقة</option><option value="in-progress">قيد التنفيذ</option><option value="completed">مكتملة</option>
                    </select>
                    <Button size="icon" variant="destructive" aria-label="حذف المهمة" disabled={isLoading} onClick={() => void deleteTask(task.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><p className="text-sm text-gray-600">الموظف</p><p className="font-bold">{task.assignedToName}</p></div>
                  <div><p className="text-sm text-gray-600">الموعد</p><p className="font-bold">{task.dueDate || "—"}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
