import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'zh-CN' | 'en-US';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

// 简单的翻译字典
const translations = {
  'zh-CN': {
    'dashboard': '仪表板',
    'projects': '项目管理',
    'servers': '服务器管理',
    'logs': '日志查看',
    'settings': '系统设置',
    'logout': '退出登录',
    'login': '登录',
    'username': '用户名',
    'password': '密码',
    'welcome': '欢迎使用自动化部署系统',
  },
  'en-US': {
    'dashboard': 'Dashboard',
    'projects': 'Projects',
    'servers': 'Servers',
    'logs': 'Logs',
    'settings': 'Settings',
    'logout': 'Logout',
    'login': 'Login',
    'username': 'Username',
    'password': 'Password',
    'welcome': 'Welcome to Auto Deploy System',
  },
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh-CN');

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations['zh-CN']] || key;
  };

  const value: LanguageContextType = {
    language,
    setLanguage,
    t,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
