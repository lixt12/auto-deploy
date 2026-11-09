import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const LANGUAGE_STORAGE_KEY = 'app_language';

export type AppLanguage = 'zh-CN' | 'en-US';

const isSupportedLanguage = (value: unknown): value is AppLanguage =>
  value === 'zh-CN' || value === 'en-US';

const getInitialLanguage = (): AppLanguage => {
  if (typeof window === 'undefined') {
    return 'zh-CN';
  }

  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(savedLanguage)) {
    return savedLanguage;
  }

  const browserLanguage = window.navigator.language || '';
  return browserLanguage.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'zh-CN' ? 'en-US' : 'zh-CN');
  };

  const value: LanguageContextType = {
    language,
    setLanguage,
    toggleLanguage,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
