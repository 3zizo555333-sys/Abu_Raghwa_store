import { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, TrendingUp, Zap, Award, Target, Medal } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCloudState } from '@/lib/cloudSync';

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

interface EmployeeStats {
  id: string;
  name: string;
  currentPoints: number;
  totalRewardsClaimed: number;
  nextRewardPoints: number;
  nextRewardName: string;
  progressPercentage: number;
  createdDate: string;
  latestDeduction: string | null;
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const [employees] = useCloudState<Employee[]>('points_system_employees', []);
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'month' | 'week'>('all');

  useEffect(() => {
    calculateStats(employees);
  }, [employees]);

  const calculateStats = (employees: Employee[]) => {
    const statsArray = employees.map(emp => {
      const nextReward = emp.rewards.find(r => r.pointsRequired > emp.currentPoints);
      const nextRewardPoints = nextReward?.pointsRequired || 0;
      const nextRewardName = nextReward?.rewardName || 'لا توجد جوايز متبقية';
      
      let progressPercentage = 0;
      if (nextReward) {
        const previousReward = emp.rewards
          .filter(r => r.pointsRequired <= emp.currentPoints)
          .sort((a, b) => b.pointsRequired - a.pointsRequired)[0];
        
        const previousPoints = previousReward?.pointsRequired || 0;
        const range = nextRewardPoints - previousPoints;
        const current = emp.currentPoints - previousPoints;
        progressPercentage = Math.min((current / range) * 100, 100);
      } else {
        progressPercentage = 100;
      }

      return {
        id: emp.id,
        name: emp.name,
        currentPoints: emp.currentPoints,
        totalRewardsClaimed: emp.claimedRewards.length,
        nextRewardPoints,
        nextRewardName,
        progressPercentage,
        createdDate: emp.createdDate,
        latestDeduction: emp.pointHistory?.find(transaction => transaction.type === "deduction" && transaction.points < 0)?.description || null,
      };
    });

    // ترتيب حسب النقاط
    const sorted = statsArray.sort((a, b) => b.currentPoints - a.currentPoints);
    setStats(sorted);
  };

  const getMedalIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Medal size={24} className="text-yellow-500" />;
      case 2:
        return <Medal size={24} className="text-gray-400" />;
      case 3:
        return <Medal size={24} className="text-orange-600" />;
      default:
        return <span className="text-lg font-bold text-gray-600">{rank}</span>;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-100 to-yellow-50 border-2 border-yellow-400';
      case 2:
        return 'bg-gradient-to-r from-gray-100 to-gray-50 border-2 border-gray-400';
      case 3:
        return 'bg-gradient-to-r from-orange-100 to-orange-50 border-2 border-orange-400';
      default:
        return 'bg-white border border-gray-200';
    }
  };

  const getTopPerformers = () => {
    return stats.slice(0, 3);
  };

  const getTotalStats = () => {
    return {
      totalEmployees: employees.length,
      totalPointsDistributed: employees.reduce((sum, emp) => sum + emp.currentPoints, 0),
      totalRewardsClaimed: employees.reduce((sum, emp) => sum + emp.claimedRewards.length, 0),
      averagePoints: Math.round(employees.reduce((sum, emp) => sum + emp.currentPoints, 0) / (employees.length || 1))
    };
  };

  const topStats = getTotalStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-pink-600 text-white p-6 shadow-2xl">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Trophy size={40} className="animate-bounce" />
              لوحة الشرف
            </h1>
            <p className="text-purple-100 mt-2 text-lg">ترتيب الموظفين حسب النقاط والإنجازات</p>
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
        {/* الإحصائيات العامة */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">عدد الموظفين</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{topStats.totalEmployees}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <Zap size={24} className="text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">إجمالي النقاط</p>
                <p className="text-3xl font-bold text-purple-600 mt-2">{topStats.totalPointsDistributed}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <TrendingUp size={24} className="text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">الجوايز المستلمة</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{topStats.totalRewardsClaimed}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <Award size={24} className="text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-semibold">متوسط النقاط</p>
                <p className="text-3xl font-bold text-orange-600 mt-2">{topStats.averagePoints}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <Target size={24} className="text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* أفضل 3 موظفين */}
        {getTopPerformers().length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Trophy size={28} className="text-yellow-500" />
              أفضل الموظفين
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {getTopPerformers().map((emp, idx) => (
                <div
                  key={emp.id}
                  className={`rounded-xl shadow-xl p-6 transform hover:scale-105 transition ${getRankColor(idx + 1)}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/50">
                        {getMedalIcon(idx + 1)}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-gray-800">{emp.name}</h3>
                        <p className="text-sm text-gray-600">المركز #{idx + 1}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/50 p-3 rounded-lg mb-3">
                    <p className="text-gray-600 text-sm mb-1">النقاط الحالية</p>
                    <p className="text-3xl font-bold text-gray-800">{emp.currentPoints}</p>
                  </div>

                  {emp.latestDeduction && (
                    <div className="bg-red-50 border border-red-200 text-red-800 p-2 rounded-lg mb-3 text-sm">
                      <span className="font-bold">آخر خصم:</span> {emp.latestDeduction}
                    </div>
                  )}

                  <div className="flex gap-2 mb-3">
                    <div className="flex-1">
                      <p className="text-xs text-gray-600 mb-1">الجوايز المستلمة</p>
                      <p className="text-2xl font-bold text-green-600">{emp.totalRewardsClaimed}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-600 mb-1">التقدم</p>
                      <p className="text-2xl font-bold text-blue-600">{Math.round(emp.progressPercentage)}%</p>
                    </div>
                  </div>

                  <div className="bg-white/50 p-2 rounded text-center">
                    <p className="text-xs text-gray-600">الجائزة التالية</p>
                    <p className="text-sm font-semibold text-gray-800 truncate">{emp.nextRewardName}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* جدول الترتيب الكامل */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp size={28} />
              الترتيب الكامل
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700">المركز</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700">الموظف</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700">النقاط</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700">الجوايز</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700">التقدم</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700">الجائزة التالية</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-gray-700">آخر خصم</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((emp, idx) => (
                  <tr
                    key={emp.id}
                    className={`border-b transition hover:bg-gray-50 ${
                      idx < 3 ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        {idx < 3 ? (
                          getMedalIcon(idx + 1)
                        ) : (
                          <span className="text-lg font-bold text-gray-600">#{idx + 1}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-800">{emp.name}</p>
                      <p className="text-xs text-gray-500">منذ {emp.createdDate}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-bold">
                        {emp.currentPoints}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-bold">
                        {emp.totalRewardsClaimed}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                          style={{ width: `${emp.progressPercentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{Math.round(emp.progressPercentage)}%</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700 truncate">{emp.nextRewardName}</p>
                      {emp.nextRewardPoints > 0 && (
                        <p className="text-xs text-gray-500">
                          {emp.nextRewardPoints - emp.currentPoints} نقطة متبقية
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-red-700 max-w-xs">{emp.latestDeduction || "لا توجد خصومات"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stats.length === 0 && (
            <div className="text-center py-12">
              <Trophy size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500 text-lg">لا يوجد موظفين بعد</p>
            </div>
          )}
        </div>

        {/* نصائح للمنافسة */}
        <div className="mt-8 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl p-6 border-l-4 border-blue-600">
          <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Zap size={24} className="text-blue-600" />
            نصائح لتحسين الأداء
          </h3>
          <ul className="space-y-2 text-gray-700">
            <li>✅ أكمل المهام بنجاح لكسب نقاط إضافية</li>
            <li>✅ اجمع النقاط اللازمة للحصول على الجوايز</li>
            <li>✅ تنافس مع زملائك وحقق المركز الأول</li>
            <li>✅ كل جائزة تحصل عليها تزيد من سمعتك</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
