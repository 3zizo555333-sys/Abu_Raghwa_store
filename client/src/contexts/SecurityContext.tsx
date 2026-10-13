import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import {
  FEATURE_LOCKS,
  isFeatureLockKey,
  listShopFeatureLocks,
  setShopFeatureLock,
  setShopFeatureLockPin,
  subscribeShopFeatureLocks,
  verifyShopFeatureLockPin,
  type FeatureLockKey,
  type FeatureLockRow,
  type FeaturePinScope,
} from "@/lib/supabase/featureLocks";

export interface SecurityContextType {
  isManagerLoggedIn: boolean;
  managerEmail: string;
  isLockSettingsLoading: boolean;
  isLockSettingsReady: boolean;
  lockSettingsError: string | null;
  featureLocks: FeatureLockRow[];
  /** Compatibility with legacy consumers; lock status is loaded from Supabase. */
  loginManager: (email: string) => boolean;
  logoutManager: () => void;
  getPasswordStatus: (section: string) => boolean;
  checkPassword: (section: string, pin: string) => Promise<boolean>;
  setPassword: (section: string, pin: string) => Promise<void>;
  isPasswordEnabled: (section: string) => boolean;
  setFeatureLockEnabled: (section: FeatureLockKey, enabled: boolean, pinScope: "shared" | "custom") => Promise<void>;
  setFeatureLockPin: (scope: FeaturePinScope, pin: string) => Promise<void>;
  refreshFeatureLocks: () => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "تعذر تحميل إعدادات قفل الميزات من السحابة.";
}

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, shopId, isLoading: staffLoading } = useStaffAccess();
  const [featureLocks, setFeatureLocks] = useState<FeatureLockRow[]>([]);
  const [isLockSettingsLoading, setIsLockSettingsLoading] = useState(true);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [lockSettingsError, setLockSettingsError] = useState<string | null>(null);
  const scopeKey = user && shopId ? `${user.id}:${shopId}` : null;

  const loadLocks = useCallback(async (expectedShopId: string, expectedScope: string) => {
    const rows = await listShopFeatureLocks(expectedShopId);
    const keys = new Set(rows.map(row => row.feature_key));
    if (FEATURE_LOCKS.some(feature => !keys.has(feature.key))) {
      throw new Error("إعدادات أقفال المتجر غير مكتملة في السحابة؛ تم إيقاف فتح الصفحات حتى اكتمال المزامنة.");
    }
    if (expectedScope !== scopeKey) return;
    setFeatureLocks(rows);
    setLoadedScope(expectedScope);
    setLockSettingsError(null);
  }, [scopeKey]);

  const refreshFeatureLocks = useCallback(async () => {
    if (!shopId || !scopeKey) return;
    setIsLockSettingsLoading(true);
    try {
      await loadLocks(shopId, scopeKey);
    } catch (error) {
      setLoadedScope(null);
      setLockSettingsError(getErrorMessage(error));
      throw error;
    } finally {
      setIsLockSettingsLoading(false);
    }
  }, [loadLocks, shopId, scopeKey]);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};
    if (!user || !shopId || !scopeKey) {
      setFeatureLocks([]);
      setLoadedScope(null);
      setLockSettingsError(null);
      setIsLockSettingsLoading(!staffLoading);
      return () => { active = false; };
    }

    setIsLockSettingsLoading(true);
    setLoadedScope(null);
    setLockSettingsError(null);
    const reload = async () => {
      try {
        const rows = await listShopFeatureLocks(shopId);
        const keys = new Set(rows.map(row => row.feature_key));
        if (FEATURE_LOCKS.some(feature => !keys.has(feature.key))) {
          throw new Error("إعدادات أقفال المتجر غير مكتملة في السحابة؛ تم إيقاف فتح الصفحات حتى اكتمال المزامنة.");
        }
        if (active) {
          setFeatureLocks(rows);
          setLoadedScope(scopeKey);
          setLockSettingsError(null);
        }
      } catch (error) {
        if (active) {
          setLoadedScope(null);
          setLockSettingsError(getErrorMessage(error));
        }
      } finally {
        if (active) setIsLockSettingsLoading(false);
      }
    };
    void reload();
    unsubscribe = subscribeShopFeatureLocks(shopId, () => { void reload(); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [shopId, scopeKey, staffLoading, user]);

  const setFeatureLockEnabled = useCallback(async (section: FeatureLockKey, enabled: boolean, pinScope: "shared" | "custom") => {
    if (!shopId) throw new Error("لم يتم تحديد المتجر النشط.");
    await setShopFeatureLock(shopId, section, enabled, pinScope);
    await refreshFeatureLocks();
  }, [refreshFeatureLocks, shopId]);

  const setFeatureLockPin = useCallback(async (scope: FeaturePinScope, pin: string) => {
    if (!shopId) throw new Error("لم يتم تحديد المتجر النشط.");
    await setShopFeatureLockPin(shopId, scope, pin);
    await refreshFeatureLocks();
  }, [refreshFeatureLocks, shopId]);

  const isPasswordEnabled = useCallback((section: string) =>
    featureLocks.some(lock => lock.feature_key === section && lock.enabled), [featureLocks]);

  const checkPassword = useCallback(async (section: string, pin: string) => {
    if (!isFeatureLockKey(section)) return true;
    if (!shopId) throw new Error("لم يتم تحديد المتجر النشط.");
    return verifyShopFeatureLockPin(shopId, section, pin);
  }, [shopId]);

  const setPassword = useCallback(async (section: string, pin: string) => {
    if (!isFeatureLockKey(section)) throw new Error("هذه الميزة لا تدعم قفل PIN.");
    await setFeatureLockPin(section, pin);
  }, [setFeatureLockPin]);

  const isManagerLoggedIn = Boolean(user?.role === "manager" && user.isApproved && !user.isBlocked);
  const managerEmail = isManagerLoggedIn ? user?.email ?? "" : "";
  const isLockSettingsReady = Boolean(scopeKey && loadedScope === scopeKey && !isLockSettingsLoading && !lockSettingsError);

  const value = useMemo<SecurityContextType>(() => ({
    isManagerLoggedIn,
    managerEmail,
    isLockSettingsLoading: isLockSettingsLoading || staffLoading,
    isLockSettingsReady,
    lockSettingsError,
    featureLocks,
    loginManager: email => Boolean(isManagerLoggedIn && email.trim().toLowerCase() === managerEmail.toLowerCase()),
    logoutManager: () => undefined,
    getPasswordStatus: isPasswordEnabled,
    checkPassword,
    setPassword,
    isPasswordEnabled,
    setFeatureLockEnabled,
    setFeatureLockPin,
    refreshFeatureLocks,
  }), [
    checkPassword,
    featureLocks,
    isLockSettingsLoading,
    isLockSettingsReady,
    isManagerLoggedIn,
    isPasswordEnabled,
    lockSettingsError,
    managerEmail,
    refreshFeatureLocks,
    setFeatureLockEnabled,
    setFeatureLockPin,
    setPassword,
    staffLoading,
  ]);

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) throw new Error("useSecurity must be used within SecurityProvider");
  return context;
};
