import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { ZapOff, ArrowRight } from 'lucide-react';
import { useMyReports } from '@/hooks/useMyReports';
import { useAppStore } from '@/stores/appStore';

/**
 * A subtle pulsing strip on the Home tab that reminds the user they
 * have unresolved reports. Tapping it jumps to the Feed tab where
 * they can resolve or delete each one.
 *
 * Hidden when the user has no active reports — we don't want to add
 * noise for people who haven't contributed anything yet.
 */
export function ActiveReportsBanner() {
  const { t } = useTranslation();
  const { data } = useMyReports();
  const setTab = useAppStore((s) => s.setTab);

  const active = (data?.reports ?? []).filter((r) => r.status === 'active');
  const count = active.length;

  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.button
          key="active-banner"
          type="button"
          onClick={() => setTab('feed')}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="border-border relative flex w-full items-center gap-2.5 overflow-hidden border bg-red-500/5 px-3 py-2 text-left"
        >
          {/* Pulsing dot */}
          <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <ZapOff className="h-3.5 w-3.5 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold leading-tight">
              {count === 1
                ? t('home.you_have_one_active')
                : t('home.you_have_many_active', { count })}
            </p>
            <p className="text-muted-foreground truncate text-[10px] leading-tight">
              {t('home.tap_to_manage')}
            </p>
          </div>
          <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
