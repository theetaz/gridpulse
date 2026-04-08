import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Users } from 'lucide-react';
import { usePresenceStore } from '@/stores/presenceStore';

/**
 * Floats at the top center of the map showing the live count of
 * users currently connected to the realtime WebSocket. Fades in
 * once we've actually received a presence event from the Durable
 * Object (hidden until then to avoid a "0 online" flash).
 */
export function PresencePill() {
  const { t } = useTranslation();
  const count = usePresenceStore((s) => s.onlineCount);

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="presence-pill"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="border-border bg-background/90 pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 border px-2.5 py-1 shadow-sm backdrop-blur"
        >
          <span className="relative flex h-1.5 w-1.5 items-center justify-center">
            <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <Users className="text-muted-foreground h-3 w-3" />
          <span className="text-[11px] font-bold tabular-nums">
            {count === 1 ? t('map.presence_one') : t('map.presence_other', { count })}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
