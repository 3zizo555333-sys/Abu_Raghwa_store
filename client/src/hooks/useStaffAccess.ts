import { useCloudState } from "@/lib/cloudSync";
import { useEffect, useState } from "react";
import type { AccessUser } from "@/lib/accessControl";

const USERS_KEY = "abu_raghwa_users";
const SESSION_KEY = "abu_raghwa_current_user";

export function useStaffAccess() {
  const [users] = useCloudState<AccessUser[]>(USERS_KEY, []);
  const readSessionUser = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) as AccessUser : null;
    } catch {
      return null;
    }
  };
  const [sessionUser, setSessionUser] = useState<AccessUser | null>(readSessionUser);
  useEffect(() => {
    const refresh = () => setSessionUser(readSessionUser());
    window.addEventListener("abu-staff-session-update", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("abu-staff-session-update", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // The server-validated session is authoritative; stale local lists must not
  // downgrade a newly promoted supervisor back to seller.
  const sessionEmail = sessionUser?.email;
  const user = sessionUser || users.find(candidate => candidate.email === sessionEmail);
  const isSeller = user?.role === "seller";
  const canViewSensitiveFinancials = user?.role === "manager" || user?.role === "admin";

  return { user, isSeller, canViewSensitiveFinancials };
}
