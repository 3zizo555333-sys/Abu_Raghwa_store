export type LedgerReward = {
  id: string;
  pointsRequired: number;
  rewardName: string;
  rewardDescription: string;
};

export type PointTransaction = {
  id: string;
  type: "earned" | "deduction" | "reset";
  points: number;
  description: string;
  createdAt: string;
};

export type LedgerEmployee = {
  id: string;
  name: string;
  currentPoints: number;
  rewards: LedgerReward[];
  claimedRewards: unknown[];
  createdDate: string;
  pointHistory?: PointTransaction[];
};

export type PointAdjustmentMeta = {
  type?: PointTransaction["type"];
  description?: string;
  createdAt?: string;
  transactionId?: string;
};

const normalizeEmployeeName = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase("ar")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[\s\-_]+/g, "");

const isSameEmployee = (item: Pick<LedgerEmployee, "id" | "name">, employee: { id: string; name: string }) => {
  if (item.id === employee.id) return true;
  const normalizedName = normalizeEmployeeName(employee.name);
  return Boolean(normalizedName) && normalizeEmployeeName(item.name) === normalizedName;
};

/** يعيد الرصيد إلى الصفر مع الحفاظ على جوائز العامل وسجله التاريخي. */
export const resetEmployeePoints = <T extends LedgerEmployee>(employee: T): T => ({
  ...employee,
  currentPoints: 0,
});

/** يرجع بطاقة النقاط نفسها حتى لو اختلف معرف العامل بين إدارة الموظفين ونظام النقاط. */
export const findPointsEmployee = <T extends Pick<LedgerEmployee, "id" | "name">>(
  employees: T[],
  employee: { id: string; name: string },
): T | undefined => employees.find(item => isSameEmployee(item, employee));

/**
 * يعدل الرصيد ويزامن أي بطاقات مكررة لنفس العامل بالمعرف أو الاسم المطبع.
 * هذا يمنع أن يتحدث سجل مخفي بينما تظل بطاقة لوحة الشرف على الرصيد القديم.
 */
export const adjustEmployeePoints = (
  employees: LedgerEmployee[],
  employee: { id: string; name: string },
  delta: number,
  meta: PointAdjustmentMeta = {},
): LedgerEmployee[] => {
  const safeDelta = Math.trunc(Number(delta) || 0);
  const matchingEmployees = employees.filter(item => isSameEmployee(item, employee));

  if (matchingEmployees.length === 0) {
    if (safeDelta <= 0) return employees;
    return [
      ...employees,
      {
        id: employee.id,
        name: employee.name || "موظف",
        currentPoints: safeDelta,
        rewards: [],
        claimedRewards: [],
        createdDate: new Date().toISOString(),
        pointHistory: [createTransaction(safeDelta, meta)],
      },
    ];
  }

  // عند وجود بطاقة قديمة وأخرى محدثة، نأخذ أعلى رصيد معروف ثم نكتب النتيجة في كل البطاقات المطابقة.
  const currentBalance = Math.max(...matchingEmployees.map(item => {
    const value = Number(item.currentPoints);
    return Number.isFinite(value) ? value : 0;
  }));
  const nextBalance = Math.max(0, currentBalance + safeDelta);
  const transaction = safeDelta === 0 ? undefined : createTransaction(safeDelta, meta);
  const matchingIds = new Set(matchingEmployees.map(item => item.id));

  return employees.map(item => {
    if (!matchingIds.has(item.id)) return item;
    return {
      ...item,
      currentPoints: nextBalance,
      ...(transaction ? { pointHistory: mergeTransaction(item.pointHistory, transaction) } : {}),
    };
  });
};

const createTransaction = (points: number, meta: PointAdjustmentMeta): PointTransaction => ({
  id: meta.transactionId || `points-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: meta.type || (points < 0 ? "deduction" : "earned"),
  points,
  description: meta.description || (points < 0 ? `تم خصم ${Math.abs(points)} نقطة` : `تم إضافة ${points} نقطة`),
  createdAt: meta.createdAt || new Date().toISOString(),
});

const mergeTransaction = (history: PointTransaction[] | undefined, transaction: PointTransaction) => [
  transaction,
  ...(history || []).filter(item => item.id !== transaction.id),
];
