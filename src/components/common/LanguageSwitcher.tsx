import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LANGS = ['en', 'si', 'ta'] as const;
const SHORT: Record<(typeof LANGS)[number], string> = {
  en: 'EN',
  si: 'සි',
  ta: 'த',
};

/**
 * Compact single-button language switcher. Tap cycles EN → සි → த → EN.
 *
 * This replaces the earlier 3-inline-button row that was squeezing the
 * header and truncating adjacent elements on real mobile devices.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'en') as (typeof LANGS)[number];

  const next = () => {
    const idx = LANGS.indexOf(current);
    const nextLang = LANGS[(idx + 1) % LANGS.length];
    void i18n.changeLanguage(nextLang);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0"
      onClick={next}
      aria-label={`Language: ${current.toUpperCase()}`}
    >
      <div className="relative">
        <Languages className="h-4 w-4" />
        <span className="text-primary absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold">
          {SHORT[current]}
        </span>
      </div>
    </Button>
  );
}
