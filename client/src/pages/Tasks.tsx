import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Award, Zap, Dices, ShieldAlert, MinusCircle, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCloudState } from "@/lib/cloudSync";
import { adjustEmployeePoints, findPointsEmployee } from "@/lib/pointsLedger";

interface PointsEmployee {
  id: string;
  name: string;
  currentPoints: number;
  rewards: Reward[];
  claimedRewards: any[];
  createdDate: string;
  pointHistory?: Array<{ id: string; type: "earned" | "deduction" | "reset"; points: number; description: string; createdAt: string }>;
}

interface Reward {
  id: string;
  pointsRequired: number;
  rewardName: string;
  rewardDescription: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  dueDate: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in-progress" | "completed";
  createdDate: string;
  pointsValue: number;
  pointsAwarded?: boolean;
}

interface Employee {
  id: string;
  name: string;
}

interface PenaltyRule {
  id: string;
  name: string;
  pointsDeducted: number;
  createdDate: string;
}

interface PenaltyLog {
  id: string;
  employeeId: string;
  employeeName: string;
  ruleName: string;
  pointsDeducted: number;
  date: string;
  description?: string;
}

export default function Tasks() {
  const [, navigate] = useLocation();
  const [tasks, setTasks] = useCloudState<Task[]>("abu_raghwa_tasks", []);
  const [employees] = useCloudState<Employee[]>("abu_raghwa_employees", []);
  const [pointsEmployees, setPointsEmployees] = useCloudState<PointsEmployee[]>("points_system_employees", []);
  const [penaltyRules, setPenaltyRules] = useCloudState<PenaltyRule[]>("abu_raghwa_penalty_rules", []);
  const [penaltyLogs, setPenaltyLogs] = useCloudState<PenaltyLog[]>("abu_raghwa_penalty_logs", []);
  const [showForm, setShowForm] = useState(false);
  const [showPenaltyForm, setShowPenaltyForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "in-progress" | "completed">("all");
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [showRandomizer, setShowRandomizer] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedPoints, setSelectedPoints] = useState(0);
  const [penaltyEmployeeId, setPenaltyEmployeeId] = useState("");
  const [newPenaltyName, setNewPenaltyName] = useState("");
  const [newPenaltyPoints, setNewPenaltyPoints] = useState("");
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assignedTo: "",
    dueDate: "",
    priority: "medium" as const,
    pointsValue: 0
  });

  const saveTasks = (updated: Task[]) => {
    setTasks(updated);
  };

  const savePointsEmployees = (updated: PointsEmployee[]) => {
    setPointsEmployees(updated);
  };

  // العداد العشوائي
  const spinRandomizer = () => {
    setIsSpinning(true);
    let spins = 0;
    const maxSpins = 30;
    
    const spinInterval = setInterval(() => {
      const randomPoints = Math.floor(Math.random() * 100) * 10 + 10; // 10, 20, 30... 1000
      setSelectedPoints(randomPoints);
      spins++;
      
      if (spins >= maxSpins) {
        clearInterval(spinInterval);
        setIsSpinning(false);
      }
    }, 50);
  };

  const handleAddTask = () => {
    if (!formData.title.trim() || !formData.assignedTo) {
      alert("الرجاء إدخال اسم المهمة واختيار الموظف");
      return;
    }

    if (formData.pointsValue <= 0) {
      alert("الرجاء تحديد عدد النقاط (استخدم العداد العشوائي)");
      return;
    }

    const assignedEmployee = employees.find(e => e.id === formData.assignedTo);
    if (!assignedEmployee) return;

    const newTask: Task = {
      id: Date.now().toString(),
      title: formData.title,
      description: formData.description,
      assignedTo: formData.assignedTo,
      assignedToName: assignedEmployee.name,
      dueDate: formData.dueDate,
      priority: formData.priority,
      status: "pending",
      createdDate: new Date().toLocaleDateString("ar-EG"),
      pointsValue: formData.pointsValue
    };

    saveTasks([...tasks, newTask]);
    setFormData({ 
      title: "", 
      description: "", 
      assignedTo: "", 
      dueDate: "", 
      priority: "medium",
      pointsValue: 0
    });
    setShowForm(false);
    setShowRandomizer(false);
    setSelectedPoints(0);
  };

  const handleUpdateStatus = (taskId: string, newStatus: Task["status"]) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // النقاط تُضاف مرة واحدة فقط عند الانتقال الفعلي إلى حالة مكتملة.
    const shouldAwardPoints = newStatus === "completed" && task.status !== "completed" && !task.pointsAwarded;
    if (shouldAwardPoints) {
      const updatedPointsEmployees = adjustEmployeePoints(
        pointsEmployees,
        { id: task.assignedTo, name: task.assignedToName },
        task.pointsValue,
        { type: "earned", description: `تم إضافة ${task.pointsValue} نقطة بسبب إكمال المهمة: ${task.title}`, transactionId: `task-${task.id}` },
      );
      savePointsEmployees(updatedPointsEmployees);
      setNotificationMessage(`✅ تم إضافة ${task.pointsValue} نقطة لـ ${task.assignedToName}`);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    }

    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, status: newStatus, pointsAwarded: t.pointsAwarded || shouldAwardPoints } : t
    );
    saveTasks(updated);
  };

  const handleAddPenaltyRule = () => {
    const pointsDeducted = Math.floor(Number(newPenaltyPoints));
    if (!newPenaltyName.trim() || !Number.isFinite(pointsDeducted) || pointsDeducted <= 0) {
      toast.error("اكتب اسم المخالفة وعدد نقاط الخصم، مثل: عدم تنظيف البضاعة — 20 نقطة");
      return;
    }
    setPenaltyRules([
      ...penaltyRules,
      { id: `penalty-${Date.now()}`, name: newPenaltyName.trim(), pointsDeducted, createdDate: new Date().toLocaleDateString("ar-EG") },
    ]);
    setNewPenaltyName("");
    setNewPenaltyPoints("");
    toast.success("تمت إضافة المخالفة؛ يمكنك تطبيقها على أي موظف.");
  };

  const handleDeletePenaltyRule = (rule: PenaltyRule) => {
    if (!confirm(`هل تريد حذف مخالفة «${rule.name}» من القائمة؟`)) return;
    setPenaltyRules(current => current.filter(item => item.id !== rule.id));
    toast.success("تم حذف المخالفة من القائمة.");
  };

  const handleDeletePenaltyLog = (logId: string) => {
    if (!confirm("هل تريد حذف سجل هذه المخالفة؟ لن يتغير رصيد العامل بسبب حذف السجل.")) return;
    setPenaltyLogs(current => current.filter(item => item.id !== logId));
    toast.success("تم حذف سجل المخالفة.");
  };

  const handleApplyPenalty = (rule: PenaltyRule) => {
    const employee = employees.find(item => item.id === penaltyEmployeeId);
    if (!employee) {
      toast.error("اختر الموظف أولاً لتطبيق خصم النقاط.");
      return;
    }
    const penaltyLogId = `penalty-log-${Date.now()}`;
    const description = `تم خصم ${rule.pointsDeducted} نقطة بسبب مخالفة: ${rule.name}`;
    const updatedPointsEmployees = adjustEmployeePoints(
      pointsEmployees,
      employee,
      -rule.pointsDeducted,
      { type: "deduction", description, transactionId: `penalty-${penaltyLogId}` },
    );
    savePointsEmployees(updatedPointsEmployees);
    setPenaltyLogs(current => [
      { id: penaltyLogId, employeeId: employee.id, employeeName: employee.name, ruleName: rule.name, pointsDeducted: rule.pointsDeducted, date: new Date().toLocaleString("ar-EG"), description },
      ...current,
    ]);
    const balance = findPointsEmployee(updatedPointsEmployees, employee)?.currentPoints ?? 0;
    toast.success(`تم خصم ${rule.pointsDeducted} نقطة من ${employee.name}. الرصيد الحالي: ${balance} نقطة.`);
  };

  const handleDelete = (id: string) => {
    if (confirm("هل تريد حذف هذه المهمة؟")) {
      saveTasks(tasks.filter(t => t.id !== id));
    }
  };

  const filteredTasks = filterStatus === "all"
    ? tasks
    : tasks.filter(t => t.status === filterStatus);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600 bg-red-50";
      case "medium":
        return "text-yellow-600 bg-yellow-50";
      case "low":
        return "text-green-600 bg-green-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "high":
        return "عالية";
      case "medium":
        return "متوسطة";
      case "low":
        return "منخفضة";
      default:
        return priority;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "قيد الانتظار";
      case "in-progress":
        return "قيد التنفيذ";
      case "completed":
        return "مكتملة";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notification */}
      {showNotification && (
        <div className="fixed top-4 right-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-4 rounded-lg shadow-2xl animate-bounce z-50">
          <p className="text-lg font-bold">{notificationMessage}</p>
        </div>
      )}

      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">إدارة المهام</h1>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 ml-2" /> العودة
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* أزرار الفلترة */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(["all", "pending", "in-progress", "completed"] as const).map(status => (
            <Button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={filterStatus === status ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 hover:bg-gray-400"}
            >
              {status === "all" ? "الكل" : getStatusLabel(status)}
            </Button>
          ))}
        </div>

        {/* إضافة المهام ولوحة المخالفات */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button onClick={() => setShowForm(!showForm)} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 ml-2" /> إضافة مهمة جديدة
          </Button>
          <Button onClick={() => setShowPenaltyForm(!showPenaltyForm)} className="bg-red-600 hover:bg-red-700 text-white">
            <ShieldAlert className="w-4 h-4 ml-2" /> مخالفات وخصم نقاط
          </Button>
        </div>

        {showPenaltyForm && (
          <Card className="mb-6 border-2 border-red-300 bg-red-50/40">
            <CardHeader>
              <CardTitle className="text-red-800 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" /> نظام المخالفات وخصم النقاط
              </CardTitle>
              <CardDescription>أضف المخالفة يدوياً وحدد نقاط الخصم، ثم اختر الموظف واضغط تطبيق الخصم. الرصيد يتحدّث في نظام النقاط فوراً.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_auto] gap-3 items-end bg-white p-3 rounded-xl border border-red-200">
                <div>
                  <label className="block text-sm font-semibold mb-1">اسم المخالفة</label>
                  <Input
                    value={newPenaltyName}
                    onChange={(event) => setNewPenaltyName(event.target.value)}
                    placeholder="مثال: ترك بامبرز على الأرض أو عدم تنظيف البضاعة"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">النقاط المخصومة</label>
                  <Input
                    type="number"
                    min="1"
                    value={newPenaltyPoints}
                    onChange={(event) => setNewPenaltyPoints(event.target.value)}
                    placeholder="مثال: 20"
                  />
                </div>
                <Button onClick={handleAddPenaltyRule} className="bg-red-600 hover:bg-red-700 text-white">
                  <Plus className="w-4 h-4 ml-1" /> إضافة مخالفة
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-sm font-semibold text-red-900 mb-1">الموظف الذي ستطبق عليه المخالفة</label>
                  <select
                    value={penaltyEmployeeId}
                    onChange={(event) => setPenaltyEmployeeId(event.target.value)}
                    className="w-full border border-red-200 rounded-lg px-3 py-2 bg-white font-semibold"
                  >
                    <option value="">اختر موظفاً</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>{employee.name}</option>
                    ))}
                  </select>
                </div>
                {penaltyEmployeeId && (
                  <div className="rounded-lg bg-white border border-red-200 px-3 py-2 text-sm text-red-800 font-bold">
                    الرصيد الحالي: {pointsEmployees.find(employee => employee.id === penaltyEmployeeId)?.currentPoints || 0} نقطة
                  </div>
                )}
              </div>

              {penaltyRules.length === 0 ? (
                <p className="text-center text-sm text-red-700 py-4">لا توجد مخالفات معرفة بعد. اكتب المخالفة وقيمة الخصم أعلاه.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {penaltyRules.map(rule => (
                    <div key={rule.id} className="bg-white border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900">{rule.name}</p>
                        <p className="text-sm font-black text-red-700">−{rule.pointsDeducted} نقطة</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleApplyPenalty(rule)} className="bg-red-600 hover:bg-red-700 text-white">
                          <MinusCircle className="w-4 h-4 ml-1" /> خصم
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeletePenaltyRule(rule)} className="border-red-200 text-red-700" aria-label={`حذف مخالفة ${rule.name}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {penaltyLogs.length > 0 && (
                <div className="pt-3 border-t border-red-200">
                  <p className="font-bold text-sm text-red-900 mb-2 flex items-center gap-1"><History className="w-4 h-4" /> آخر الخصومات</p>
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {penaltyLogs.slice(0, 8).map(log => (
                      <div key={log.id} className="text-xs bg-white p-2 rounded-lg border border-red-100 flex items-center justify-between gap-2">
                        <span><strong>{log.employeeName}</strong> — {log.description || `تم خصم ${log.pointsDeducted} نقطة بسبب مخالفة: ${log.ruleName}`}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-700">−{log.pointsDeducted} نقطة</span>
                          <Button size="icon" variant="ghost" onClick={() => handleDeletePenaltyLog(log.id)} className="h-7 w-7 text-red-700" aria-label="حذف سجل المخالفة"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* نموذج إضافة مهمة */}
        {showForm && (
          <Card className="mb-6 border-2 border-green-300">
            <CardHeader>
              <CardTitle>إضافة مهمة جديدة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">اسم المهمة</label>
                <Input
                  placeholder="مثال: تنظيف المحل"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">الموظف المسؤول</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">اختر موظفاً</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">الوصف</label>
                <Input
                  placeholder="وصف المهمة"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">الأولوية</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">تاريخ الاستحقاق</label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
              </div>

              {/* خانة النقاط مع العداد العشوائي */}
              <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-300">
                <label className="block text-sm font-semibold mb-3 flex items-center gap-2">
                  <Award size={16} className="text-purple-600" />
                  عدد النقط (استخدم العداد العشوائي)
                </label>

                {/* عرض النقاط المختارة */}
                <div className="mb-4 text-center">
                  <div className="text-4xl font-bold text-purple-600 mb-2">
                    {formData.pointsValue || "0"}
                  </div>
                  <p className="text-sm text-gray-600">النقاط المحددة للمهمة</p>
                </div>

                {/* العداد العشوائي */}
                {!showRandomizer ? (
                  <Button
                    onClick={() => setShowRandomizer(true)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 font-bold flex items-center justify-center gap-2"
                  >
                    <Dices size={20} />
                    اضغط لتحديد النقاط عشوائياً
                  </Button>
                ) : (
                  <div className="space-y-3">
                    {/* عرض الأرقام المتحركة */}
                    <div className="bg-white p-6 rounded-lg border-2 border-purple-300 text-center">
                      <div className="text-5xl font-bold text-purple-600 animate-pulse">
                        {selectedPoints}
                      </div>
                      <p className="text-sm text-gray-600 mt-2">نقطة</p>
                    </div>

                    {/* زر الدوران */}
                    <Button
                      onClick={spinRandomizer}
                      disabled={isSpinning}
                      className={`w-full py-3 font-bold flex items-center justify-center gap-2 ${
                        isSpinning
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-green-600 hover:bg-green-700 text-white"
                      }`}
                    >
                      <Dices size={20} />
                      {isSpinning ? "جاري الدوران..." : "اضغط للدوران"}
                    </Button>

                    {/* تأكيد النقاط */}
                    {!isSpinning && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setFormData({ ...formData, pointsValue: selectedPoints });
                            setShowRandomizer(false);
                          }}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 font-semibold"
                        >
                          ✓ تأكيد النقاط
                        </Button>
                        <Button
                          onClick={() => {
                            setShowRandomizer(false);
                            setSelectedPoints(0);
                          }}
                          className="flex-1 bg-gray-400 hover:bg-gray-500 text-white py-2 font-semibold"
                        >
                          ✕ إلغاء
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleAddTask} 
                  disabled={formData.pointsValue === 0}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                >
                  إضافة المهمة
                </Button>
                <Button onClick={() => setShowForm(false)} className="flex-1 bg-gray-400 hover:bg-gray-500">
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* قائمة المهام */}
        <div className="grid grid-cols-1 gap-4">
          {filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 text-lg">لا توجد مهام</p>
              </CardContent>
            </Card>
          ) : (
            filteredTasks.map(task => (
              <Card key={task.id} className="hover:shadow-lg transition">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{task.title}</h3>
                        <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded text-sm font-semibold flex items-center gap-1">
                          <Zap size={14} />
                          +{task.pointsValue} نقطة
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm mb-3">{task.description}</p>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className={`px-3 py-1 rounded text-sm font-semibold ${getPriorityColor(task.priority)}`}>
                          {getPriorityLabel(task.priority)}
                        </span>
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm font-semibold">
                          {task.assignedToName}
                        </span>
                        {task.dueDate && (
                          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-sm">
                            {task.dueDate}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-500">تم الإنشاء: {task.createdDate}</p>
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      <select
                        value={task.status}
                        onChange={(e) => handleUpdateStatus(task.id, e.target.value as Task["status"])}
                        className={`px-3 py-2 rounded font-semibold text-sm border-2 ${
                          task.status === "completed"
                            ? "bg-green-100 border-green-300 text-green-700"
                            : task.status === "in-progress"
                            ? "bg-yellow-100 border-yellow-300 text-yellow-700"
                            : "bg-gray-100 border-gray-300 text-gray-700"
                        }`}
                      >
                        <option value="pending">قيد الانتظار</option>
                        <option value="in-progress">قيد التنفيذ</option>
                        <option value="completed">مكتملة</option>
                      </select>

                      <Button
                        onClick={() => handleDelete(task.id)}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        <Trash2 className="w-4 h-4" /> حذف
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
