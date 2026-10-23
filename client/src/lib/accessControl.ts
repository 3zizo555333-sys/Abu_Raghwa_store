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

export const isManager = (user: AccessUser | undefined | null) => user?.role === "manager" || user?.role === "admin";

// Supervisors retain team-level access after PIN verification; admin and
// manager are both full-administration roles. Sellers remain restricted.
export const hasSupervisorAccess = (user: AccessUser | undefined | null) =>
  Boolean(user && (user.role === "manager" || user.role === "admin" || user.role === "supervisor"));

export const withUserAccess = (users: AccessUser[], userId: string, isBlocked: boolean) =>
  users.map(user => user.id === userId ? { ...user, isBlocked } : user);
