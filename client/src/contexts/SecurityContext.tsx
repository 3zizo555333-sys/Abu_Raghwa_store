import React, { createContext, useContext } from "react";
import { useStaffAccess } from "@/hooks/useStaffAccess";

export interface SecurityContextType {
  isManagerLoggedIn: boolean;
  managerEmail: string;
  /** Compatibility guard only; identity is already authenticated by Supabase. */
  loginManager: (email: string) => boolean;
  /** There is no secondary client-side manager session to sign out from. */
  logoutManager: () => void;
  getPasswordStatus: (section: string) => boolean;
  checkPassword: (section: string, password: string) => boolean;
  setPassword: (section: string, password: string) => void;
  isPasswordEnabled: (section: string) => boolean;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useStaffAccess();
  const isManagerLoggedIn = Boolean(user?.role === "manager" && user.isApproved && !user.isBlocked);
  const managerEmail = isManagerLoggedIn ? user?.email ?? "" : "";

  const value: SecurityContextType = {
    isManagerLoggedIn,
    managerEmail,
    loginManager: email => Boolean(isManagerLoggedIn && email.trim().toLowerCase() === managerEmail.toLowerCase()),
    logoutManager: () => undefined,
    // Client-side section passwords were stored as plaintext and could not
    // enforce authorization. Supabase Auth/RLS and role gates are authoritative.
    getPasswordStatus: () => false,
    checkPassword: () => true,
    isPasswordEnabled: () => false,
    setPassword: () => { throw new Error("كلمات مرور الأقسام غير مدعومة؛ استخدم صلاحيات Supabase."); },
  };

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) throw new Error("useSecurity must be used within SecurityProvider");
  return context;
};
