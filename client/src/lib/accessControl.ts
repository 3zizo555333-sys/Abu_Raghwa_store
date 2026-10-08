export type AccessUser = {
  id: string;
  email: string;
  name?: string;
  role: "manager" | "admin" | "supervisor" | "seller";
  createdDate: string;
  lastLogin: string;
  deviceIds: string[];
  isApproved: boolean;
  status?: "PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "pending" | "approved" | "active" | "suspended" | "missing" | "multiple";
  isBlocked?: boolean;
};

export const isUserAllowed = (user: AccessUser | undefined | null) =>
  Boolean(user && user.isApproved && !user.isBlocked);

export const isManager = (user: AccessUser | undefined | null) => user?.role === "manager";

// The database stores the supervisor choice as `admin` for backward
// compatibility. Supervisors have the manager's operational access; sellers
// remain restricted to selling screens.
export const hasSupervisorAccess = (user: AccessUser | undefined | null) =>
  Boolean(user && (user.role === "manager" || user.role === "admin" || user.role === "supervisor"));

export const withUserAccess = (users: AccessUser[], userId: string, isBlocked: boolean) =>
  users.map(user => user.id === userId ? { ...user, isBlocked } : user);
