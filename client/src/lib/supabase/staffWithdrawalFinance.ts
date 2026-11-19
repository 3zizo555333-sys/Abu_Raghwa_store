export type WithdrawalStatus = "pending" | "approved" | "rejected";
export type WithdrawalTransactionType = "withdrawal" | "expense";

export type StaffWithdrawalBalanceRow = {
  employee_id: string;
  amount: number;
  status: WithdrawalStatus;
};

export function calculateStaffWithdrawalBalance(
  employeeId: string,
  earnedAmount: number,
  withdrawals: StaffWithdrawalBalanceRow[],
) {
  const ownRows = withdrawals.filter(row => row.employee_id === employeeId);
  const approved = ownRows.filter(row => row.status === "approved").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pending = ownRows.filter(row => row.status === "pending").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const rejected = ownRows.filter(row => row.status === "rejected").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const withdrawalsTotal = approved + pending;
  return {
    approvedWithdrawals: approved,
    pendingWithdrawals: pending,
    rejectedWithdrawals: rejected,
    withdrawalsTotal,
    remainingAmount: Number(earnedAmount || 0) - withdrawalsTotal,
  };
}

export function requestedAtForDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("اختر تاريخاً صحيحاً للحركة.");
  const timestamp = Date.parse(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new Error("اختر تاريخاً صحيحاً للحركة.");
  return new Date(timestamp).toISOString();
}

export function transactionTypeLabel(type: WithdrawalTransactionType | null | undefined): string {
  return type === "expense" ? "مصروف" : "سحب";
}
