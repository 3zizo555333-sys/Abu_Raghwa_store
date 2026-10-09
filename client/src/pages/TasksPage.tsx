import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

interface Task {
  id: string;
  title: string;
  employeeName: string;
  employeePhone: string;
  dueDate: string;
  status: "pending" | "in_progress" | "completed";
}

export default function TasksPage() {
  const [, navigate] = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    employeeName: "",
    employeePhone: "",
    dueDate: "",
  });

  const handleAddTask = () => {
    if (!formData.title || !formData.employeeName) return;
    const newTask: Task = {
      id: Date.now().toString(),
      title: formData.title,
      employeeName: formData.employeeName,
      employeePhone: formData.employeePhone,
      dueDate: formData.dueDate,
      status: "pending",
    };
    setTasks([newTask, ...tasks]);
    const message = `مهمة جديدة:\n${formData.title}\nالموعد: ${formData.dueDate}`;
    window.open(`https://wa.me/${formData.employeePhone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank");
    setFormData({ title: "", employeeName: "", employeePhone: "", dueDate: "" });
    setShowForm(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">المهمات اليومية</h1>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 ml-2" /> العودة
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Button onClick={() => setShowForm(!showForm)} className="mb-6 bg-blue-600">
          <Plus className="w-4 h-4 ml-2" /> إضافة مهمة جديدة
        </Button>
        {showForm && (
          <Card className="mb-6">
            <CardHeader><CardTitle>إضافة مهمة جديدة</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="عنوان المهمة" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="border rounded px-3 py-2 md:col-span-2" />
                <input type="text" placeholder="اسم الموظف" value={formData.employeeName} onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })} className="border rounded px-3 py-2" />
                <input type="tel" placeholder="رقم الواتساب" value={formData.employeePhone} onChange={(e) => setFormData({ ...formData, employeePhone: e.target.value })} className="border rounded px-3 py-2" />
                <input type="date" value={formData.dueDate} onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })} className="border rounded px-3 py-2 md:col-span-2" />
              </div>
              <Button onClick={handleAddTask} className="mt-4 bg-green-600 w-full">إضافة المهمة</Button>
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm text-gray-600">المهمة</p>
                    <p className="font-bold text-lg">{task.title}</p>
                  </div>
                  <span className={`px-3 py-1 rounded text-sm font-bold ${task.status === "completed" ? "bg-green-100 text-green-800" : task.status === "in_progress" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                    {task.status === "completed" ? "مكتملة" : task.status === "in_progress" ? "قيد التنفيذ" : "معلقة"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><p className="text-sm text-gray-600">الموظف</p><p className="font-bold">{task.employeeName}</p></div>
                  <div><p className="text-sm text-gray-600">الموعد</p><p className="font-bold">{task.dueDate}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
