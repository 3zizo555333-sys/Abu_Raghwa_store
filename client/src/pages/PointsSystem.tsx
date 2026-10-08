import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Award, TrendingUp, Gift, Zap } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCloudState } from '@/lib/cloudSync';
import { resetEmployeePoints } from '@/lib/pointsLedger';

interface Reward {
  id: string;
  pointsRequired: number;
  rewardName: string;
  rewardDescription: string;
}

interface Employee {
  id: string;
  name: string;
  currentPoints: number;
  rewards: Reward[];
  claimedRewards: Array<{ rewardName: string; pointsUsed: number; claimedDate: string }>;
  createdDate: string;
  pointHistory?: Array<{ id: string; type: "earned" | "deduction" | "reset"; points: number; description: string; createdAt: string }>;
}

export default function PointsSystem() {
  const [, navigate] = useLocation();
  const [employees, setEmployees] = useCloudState<Employee[]>('points_system_employees', []);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddReward, setShowAddReward] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  const [employeeForm, setEmployeeForm] = useState({ name: '' });
  const [rewardForm, setRewardForm] = useState({
    pointsRequired: 1000,
    rewardName: '',
    rewardDescription: ''
  });

  const saveEmployees = (updated: Employee[]) => {
    setEmployees(updated);
  };

  const handleAddEmployee = () => {
    if (!employeeForm.name.trim()) {
      alert('الرجاء إدخال اسم الموظف');
      return;
    }

    const newEmployee: Employee = {
      id: Date.now().toString(),
      name: employeeForm.name,
      currentPoints: 0,
      rewards: [],
      claimedRewards: [],
      createdDate: new Date().toLocaleDateString('ar-EG')
    };

    const updated = [...employees, newEmployee];
    saveEmployees(updated);
    setEmployeeForm({ name: '' });
    setShowAddEmployee(false);
    setSelectedEmployeeId(newEmployee.id);
  };

  const handleAddReward = () => {
    if (!selectedEmployeeId || !rewardForm.rewardName.trim() || rewardForm.pointsRequired <= 0) {
      alert('الرجاء ملء جميع الحقول بشكل صحيح');
      return;
    }

    const updated = employees.map(emp => {
      if (emp.id === selectedEmployeeId) {
        return {
          ...emp,
          rewards: [
            ...emp.rewards,
            {
              id: Date.now().toString(),
              pointsRequired: rewardForm.pointsRequired,
              rewardName: rewardForm.rewardName,
              rewardDescription: rewardForm.rewardDescription
            }
          ].sort((a, b) => a.pointsRequired - b.pointsRequired)
        };
      }
      return emp;
    });

    saveEmployees(updated);
    setRewardForm({ pointsRequired: 1000, rewardName: '', rewardDescription: '' });
    setShowAddReward(false);
  };

  const claimReward = (rewardId: string) => {
    const updated = employees.map(emp => {
      if (emp.id === selectedEmployeeId) {
        const reward = emp.rewards.find(r => r.id === rewardId);
        if (reward && emp.currentPoints >= reward.pointsRequired) {
          setNotificationMessage(`🎉 مبروك! لقد استحققت جائزة: ${reward.rewardName}`);
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), 4000);

          return {
            ...emp,
            currentPoints: emp.currentPoints - reward.pointsRequired,
            claimedRewards: [
              ...emp.claimedRewards,
              {
                rewardName: reward.rewardName,
                pointsUsed: reward.pointsRequired,
                claimedDate: new Date().toLocaleDateString('ar-EG')
              }
            ]
          };
        }
      }
      return emp;
    });

    saveEmployees(updated);
  };

  const deleteEmployee = (id: string) => {
    if (confirm('هل تريد حذف هذا الموظف وجميع بيانات نقاطه؟')) {
      saveEmployees(employees.filter(e => e.id !== id));
      setSelectedEmployeeId('');
    }
  };

  const resetPoints = (employeeId: string) => {
    const employee = employees.find(item => item.id === employeeId);
    if (!employee || !confirm(`هل تريد تصفير رصيد نقاط ${employee.name}؟ ستبقى الجوائز والسجلات محفوظة.`)) return;
    saveEmployees(employees.map(item => item.id === employeeId ? resetEmployeePoints(item) : item));
    setNotificationMessage(`تم تصفير نقاط ${employee.name} وبدء دورة جديدة.`);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3500);
  };

  const deleteReward = (rewardId: string) => {
    const updated = employees.map(emp => {
      if (emp.id === selectedEmployeeId) {
        return {
          ...emp,
          rewards: emp.rewards.filter(r => r.id !== rewardId)
        };
      }
      return emp;
    });

    saveEmployees(updated);
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const availableRewards = selectedEmployee?.rewards.filter(r => r.pointsRequired <= (selectedEmployee?.currentPoints || 0)) || [];
  const nextReward = selectedEmployee?.rewards.find(r => r.pointsRequired > (selectedEmployee?.currentPoints || 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      {/* Notification */}
      {showNotification && (
        <div className="fixed top-4 right-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-4 rounded-lg shadow-2xl animate-bounce z-50">
          <p className="text-lg font-bold">{notificationMessage}</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 shadow-lg">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Award size={32} />
              نظام النقط والمكافآت
            </h1>
            <p className="text-purple-100 mt-2">تتبع نقاط الموظفين والجوايز المستحقة</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition"
          >
            <ArrowLeft size={20} />
            العودة
          </button>
        </div>
      </div>

      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* قائمة الموظفين */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">👥 الموظفون</h2>
                <button
                  onClick={() => setShowAddEmployee(!showAddEmployee)}
                  className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg transition"
                >
                  <Plus size={20} />
                </button>
              </div>

              {/* نموذج إضافة موظف */}
              {showAddEmployee && (
                <div className="bg-purple-50 p-4 rounded-lg mb-6 space-y-3">
                  <input
                    type="text"
                    placeholder="اسم الموظف"
                    value={employeeForm.name}
                    onChange={(e) => setEmployeeForm({ name: e.target.value })}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                  <button
                    onClick={handleAddEmployee}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition font-semibold"
                  >
                    إضافة الموظف
                  </button>
                </div>
              )}

              {/* قائمة الموظفين */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {employees.map((emp) => (
                  <div
                    key={emp.id}
                    onClick={() => setSelectedEmployeeId(emp.id)}
                    className={`p-3 rounded-lg cursor-pointer transition ${
                      selectedEmployeeId === emp.id
                        ? 'bg-purple-100 border-2 border-purple-600'
                        : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800">{emp.name}</h3>
                        <p className="text-sm text-purple-600 font-semibold mt-1">
                          {emp.currentPoints} نقطة
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEmployee(emp.id);
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {employees.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    لا توجد موظفين بعد
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* المحتوى الرئيسي */}
          <div className="lg:col-span-3">
            {selectedEmployee ? (
              <div className="space-y-6">
                {/* بطاقة النقاط الرئيسية */}
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl shadow-lg p-8">
                  <div className="flex items-center justify-between gap-3 mb-6">
                    <h2 className="text-2xl font-bold">{selectedEmployee.name}</h2>
                    <button
                      onClick={() => resetPoints(selectedEmployee.id)}
                      className="bg-white/15 hover:bg-white/25 border border-white/40 text-white px-3 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      تصفير النقاط
                    </button>
                  </div>
                  
                  {/* عداد النقاط الرئيسي */}
                  <div className="mb-6">
                    <p className="text-purple-100 text-sm mb-2">النقاط الحالية</p>
                    <div className="text-6xl font-bold">{selectedEmployee.currentPoints}</div>
                  </div>

                  {/* التقدم نحو الجائزة التالية */}
                  {nextReward && (
                    <div className="bg-white/20 p-4 rounded-lg backdrop-blur">
                      <p className="text-purple-100 text-sm mb-2">التقدم نحو الجائزة التالية</p>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-semibold">{nextReward.rewardName}</span>
                        <span className="text-purple-100">{selectedEmployee.currentPoints} / {nextReward.pointsRequired}</span>
                      </div>
                      <div className="w-full bg-white/30 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-yellow-300 to-orange-400 h-3 rounded-full transition-all"
                          style={{ width: `${Math.min((selectedEmployee.currentPoints / nextReward.pointsRequired) * 100, 100)}%` }}
                        />
                      </div>
                      <p className="text-purple-100 text-xs mt-2">
                        {nextReward.pointsRequired - selectedEmployee.currentPoints} نقطة متبقية
                      </p>
                    </div>
                  )}
                </div>

                {/* الجوايز */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                      <Gift size={24} className="text-green-600" />
                      الجوايز
                    </h3>
                    <button
                      onClick={() => setShowAddReward(!showAddReward)}
                      className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg transition"
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  {/* نموذج إضافة جائزة */}
                  {showAddReward && (
                    <div className="bg-green-50 p-4 rounded-lg mb-6 space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">اسم الجائزة</label>
                        <input
                          type="text"
                          placeholder="مثال: تيشرت"
                          value={rewardForm.rewardName}
                          onChange={(e) => setRewardForm({ ...rewardForm, rewardName: e.target.value })}
                          className="w-full px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">النقاط المطلوبة</label>
                        <input
                          type="number"
                          placeholder="مثال: 1000"
                          value={rewardForm.pointsRequired || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRewardForm({ ...rewardForm, pointsRequired: val === '' ? 0 : parseInt(val) });
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '' || parseInt(e.target.value) === 0) {
                              setRewardForm({ ...rewardForm, pointsRequired: 1000 });
                            }
                          }}
                          className="w-full px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">الوصف</label>
                        <input
                          type="text"
                          placeholder="مثال: تيشرت أسود"
                          value={rewardForm.rewardDescription}
                          onChange={(e) => setRewardForm({ ...rewardForm, rewardDescription: e.target.value })}
                          className="w-full px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                        />
                      </div>
                      <button
                        onClick={handleAddReward}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition font-semibold"
                      >
                        إضافة الجائزة
                      </button>
                    </div>
                  )}

                  {/* الجوايز المتاحة */}
                  {availableRewards.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                        <Zap size={18} />
                        الجوايز المتاحة الآن:
                      </h4>
                      <div className="space-y-2">
                        {availableRewards.map(reward => (
                          <div key={reward.id} className="bg-green-50 p-4 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold text-gray-800">{reward.rewardName}</p>
                              <span className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold">
                                {reward.pointsRequired} نقطة
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-3">{reward.rewardDescription}</p>
                            <button
                              onClick={() => claimReward(reward.id)}
                              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded text-sm font-semibold transition"
                            >
                              استلام الجائزة
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* جميع الجوايز */}
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-3">جميع الجوايز المتاحة:</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedEmployee.rewards.length === 0 ? (
                        <p className="text-gray-500 text-sm">لم تضف أي جوايز بعد</p>
                      ) : (
                        selectedEmployee.rewards.map(reward => {
                          const isAvailable = reward.pointsRequired <= selectedEmployee.currentPoints;
                          const isClaimed = selectedEmployee.claimedRewards.some(r => r.rewardName === reward.rewardName);
                          
                          return (
                            <div 
                              key={reward.id} 
                              className={`p-3 rounded-lg flex items-center justify-between ${
                                isAvailable && !isClaimed
                                  ? 'bg-green-50 border-2 border-green-300'
                                  : isClaimed
                                  ? 'bg-blue-50 border-2 border-blue-300'
                                  : 'bg-gray-50 border border-gray-200'
                              }`}
                            >
                              <div className="flex-1">
                                <p className="font-semibold text-gray-800">{reward.rewardName}</p>
                                <p className="text-xs text-gray-600">{reward.rewardDescription}</p>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  isAvailable && !isClaimed
                                    ? 'bg-green-600 text-white'
                                    : isClaimed
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-300 text-gray-700'
                                }`}>
                                  {reward.pointsRequired}
                                </span>
                                <button
                                  onClick={() => deleteReward(reward.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* سجل حركات النقاط */}
                {selectedEmployee.pointHistory && selectedEmployee.pointHistory.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">📌 سجل حركات النقاط</h3>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {selectedEmployee.pointHistory.slice(0, 20).map((transaction) => (
                        <div key={transaction.id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${transaction.type === "deduction" ? "bg-red-50 border-red-200" : transaction.type === "reset" ? "bg-purple-50 border-purple-200" : "bg-green-50 border-green-200"}`}>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800">{transaction.description}</p>
                            <p className="text-xs text-gray-500">{new Date(transaction.createdAt).toLocaleString("ar-EG")}</p>
                          </div>
                          <span className={`shrink-0 px-3 py-1 rounded-full text-sm font-bold ${transaction.points < 0 ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
                            {transaction.points > 0 ? "+" : ""}{transaction.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* سجل الجوايز المستلمة */}
                {selectedEmployee.claimedRewards.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">📜 سجل الجوايز المستلمة</h3>
                    <div className="space-y-2">
                      {selectedEmployee.claimedRewards.map((claimed, idx) => (
                        <div key={idx} className="bg-blue-50 p-3 rounded-lg flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-800">{claimed.rewardName}</p>
                            <p className="text-xs text-gray-600">{claimed.claimedDate}</p>
                          </div>
                          <span className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-bold">
                            -{claimed.pointsUsed}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <Award size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 text-lg">اختر موظفاً لعرض نقاطه والجوايز المستحقة</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
