import { useLanguage } from '../contexts/LanguageContext';

export function useI18n() {
  const { language } = useLanguage();
  const isEnglish = language === 'en-US';

  const t = (zh: string, en: string): string => (isEnglish ? en : zh);

  return {
    language,
    isEnglish,
    t,
  };
}

