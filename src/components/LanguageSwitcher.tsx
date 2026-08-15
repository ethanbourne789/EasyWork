import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';
import { setStoredLanguage, type Language } from '@/lib/storage';

export function LanguageSwitcher({ showLabel = false }: { showLabel?: boolean }) {
  const { t, i18n } = useTranslation();

  const currentLang = i18n.language;
  const isZh = currentLang.startsWith('zh');

  const toggleLanguage = () => {
    const newLang: Language = isZh ? 'en-US' : 'zh-CN';
    i18n.changeLanguage(newLang);
    setStoredLanguage(newLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="gap-1.5"
      title={isZh ? t('layout.switchToEnglish') : t('layout.switchToChinese')}
    >
      <Languages className="h-4 w-4" />
      {showLabel && <span className="text-xs">{isZh ? 'EN' : '中'}</span>}
    </Button>
  );
}
