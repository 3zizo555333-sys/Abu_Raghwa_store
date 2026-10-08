import React, { createContext, useContext, useState, useEffect } from 'react';
import { useCloudState } from '@/lib/cloudSync';

export interface PasswordSettings {
  [key: string]: {
    enabled: boolean;
    password: string;
    lastModified: string;
  };
}

export interface SecurityContextType {
  isManagerLoggedIn: boolean;
  managerEmail: string;
  passwordSettings: PasswordSettings;
  loginManager: (email: string) => boolean;
  logoutManager: () => void;
  updatePasswordSettings: (settings: PasswordSettings) => void;
  getPasswordStatus: (section: string) => boolean;
  checkPassword: (section: string, password: string) => boolean;
  setPassword: (section: string, password: string) => void;
  isPasswordEnabled: (section: string) => boolean;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

const STORAGE_KEY = 'abu_raghwa_security_settings';
const MANAGER_SESSION_KEY = 'abu_raghwa_manager_session';

const getCurrentManagerEmail = () => {
  try {
    const current = JSON.parse(localStorage.getItem('abu_raghwa_current_user') || 'null');
    return current?.role === 'manager' && typeof current.email === 'string' ? current.email.toLowerCase() : '';
  } catch {
    return '';
  }
};

const DEFAULT_SECTIONS = [
  { id: 'general', label: 'الأمان العام' },
  { id: 'products', label: 'إدارة المنتجات' },
  { id: 'newsale', label: 'تسجيل مبيعة جديدة' },
  { id: 'viewreports', label: 'عرض التقارير' },
  { id: 'apartment', label: 'إدارة الشقة' },
  { id: 'materials', label: 'قائمة الخامات' },
  { id: 'compositions', label: 'قائمة التركيبات' },
  { id: 'employees', label: 'إدارة الموظفين' },
  { id: 'tasks', label: 'إدارة المهام' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'security', label: 'إدارة الأمان' },
  { id: 'expenses', label: 'إدارة المصاريف' },
  { id: 'invoices', label: 'تصوير الفواتير' },
  { id: 'inventory', label: 'إدارة المخزن' },
  { id: 'suppliers', label: 'الموردين والخامات' },
  { id: 'shortages', label: 'النواقص' },
  { id: 'sales', label: 'المبيعات' },
  { id: 'points', label: 'نظام النقط' },
  { id: 'leaderboard', label: 'لوحة الشرف' },
  { id: 'clients', label: 'العملاء' },
  { id: 'reports', label: 'التقارير' },
  { id: 'logs', label: 'السجل' },
];

const initializeDefaultSettings = (): PasswordSettings => {
  const settings: PasswordSettings = {};
  DEFAULT_SECTIONS.forEach(section => {
    settings[section.id] = {
      enabled: false,
      password: '',
      lastModified: new Date().toISOString()
    };
  });
  return settings;
};

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isManagerLoggedIn, setIsManagerLoggedIn] = useState(false);
  const [managerEmail, setManagerEmail] = useState('');
  const [passwordSettings, setPasswordSettingsState] = useCloudState<PasswordSettings>(STORAGE_KEY, initializeDefaultSettings());

  // تحقق من جلسة المدير عند تحميل التطبيق
  useEffect(() => {
    const savedSession = localStorage.getItem(MANAGER_SESSION_KEY);
    if (savedSession) {
      const session = JSON.parse(savedSession);
      if (session.email === getCurrentManagerEmail() && session.timestamp > Date.now() - 24 * 60 * 60 * 1000) {
        setIsManagerLoggedIn(true);
        setManagerEmail(session.email);
      } else {
        localStorage.removeItem(MANAGER_SESSION_KEY);
      }
    }
  }, []);

  const loginManager = (email: string): boolean => {
    if (email.trim().toLowerCase() === getCurrentManagerEmail()) {
      setIsManagerLoggedIn(true);
      setManagerEmail(email);
      localStorage.setItem(MANAGER_SESSION_KEY, JSON.stringify({
        email,
        timestamp: Date.now()
      }));
      return true;
    }
    return false;
  };

  const logoutManager = () => {
    setIsManagerLoggedIn(false);
    setManagerEmail('');
    localStorage.removeItem(MANAGER_SESSION_KEY);
  };

  const updatePasswordSettings = (settings: PasswordSettings) => {
    setPasswordSettingsState(settings);
  };

  const getPasswordStatus = (section: string): boolean => {
    return passwordSettings[section]?.enabled ?? false;
  };

  const checkPassword = (section: string, password: string): boolean => {
    const setting = passwordSettings[section];
    if (!setting || !setting.enabled) return true;
    return setting.password === password;
  };

  const setPassword = (section: string, password: string) => {
    const updated = {
      ...passwordSettings,
      [section]: {
        ...passwordSettings[section],
        password,
        lastModified: new Date().toISOString()
      }
    };
    updatePasswordSettings(updated);
  };

  const isPasswordEnabled = (section: string): boolean => {
    return passwordSettings[section]?.enabled ?? false;
  };

  return (
    <SecurityContext.Provider value={{
      isManagerLoggedIn,
      managerEmail,
      passwordSettings,
      loginManager,
      logoutManager,
      updatePasswordSettings,
      getPasswordStatus,
      checkPassword,
      setPassword,
      isPasswordEnabled
    }}>
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within SecurityProvider');
  }
  return context;
};
