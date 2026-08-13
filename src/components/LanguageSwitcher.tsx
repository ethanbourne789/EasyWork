import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang = i18n.language;
  const isZh = currentLang.startsWith('zh');

  const toggleLanguage = () => {
    const newLang = isZh ? 'en-US' : 'zh-CN';
    i18n.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="gap-1.5"
      title={isZh ? 'Switch to English' : '切换到中文'}
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs">{isZh ? 'EN' : '中'}</span>
    </Button>
  );
}
