import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, CheckCircle2, Trash2, Loader2, ZapOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyReports, useResolveMyReport, useDeleteMyReport, type MyReport } from '@/hooks/useMyReports';
import { relativeTime } from '@/lib/format';
import { toast } from 'sonner';

/**
 * "Your reports" — shown at the top of the Feed tab. Lists the
 * current device's reports with actions:
 *   - Mark resolved ("Power's back")
 *   - Delete (soft delete, still counted on the leaderboard)
 *
 * Reports automatically disappear from active views 24h after
 * creation, but the list also shows recently-resolved/deleted
 * reports for a few days so the user can see what they did.
 */
export function MyReportsSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useMyReports();
  const resolve = useResolveMyReport();
  const del = useDeleteMyReport();

  const reports = data?.reports ?? [];
  const active = reports.filter((r) => r.status === 'active');
  const recent = reports.filter((r) => r.status !== 'active').slice(0, 3);

  if (isLoading) {
    return (
      <section className="space-y-1.5">
        <SectionHeading text={t('me.your_reports')} />
        <Skeleton className="h-[52px] w-full" />
      </section>
    );
  }

  if (active.length === 0 && recent.length === 0) return null;

  const onResolve = (id: string) => {
    resolve.mutate(id, {
      onSuccess: () => toast.success(t('me.resolved_ok')),
      onError: () => toast.error(t('common.error')),
    });
  };
  const onDelete = (id: string) => {
    del.mutate(id, {
      onSuccess: () => toast.success(t('me.deleted_ok')),
      onError: () => toast.error(t('common.error')),
    });
  };

  return (
    <section className="space-y-1.5">
      <SectionHeading text={t('me.your_reports')} />
      <div className="border-border overflow-hidden border">
        <AnimatePresence initial={false}>
          {active.map((r, idx) => (
            <motion.div
              key={r.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12, height: 0 }}
              transition={{ duration: 0.18 }}
            >
              <ReportRow
                r={r}
                isFirst={idx === 0}
                onResolve={() => onResolve(r.id)}
                onDelete={() => onDelete(r.id)}
                busy={resolve.isPending || del.isPending}
                t={t}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {recent.length > 0 && (
        <>
          <p className="text-muted-foreground mt-3 text-[10px] uppercase tracking-wider">
            {t('me.recent_history')}
          </p>
          <div className="border-border overflow-hidden border">
            {recent.map((r, idx) => (
              <HistoryRow key={r.id} r={r} isFirst={idx === 0} t={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SectionHeading({ text }: { text: string }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-wider">{text}</h3>
  );
}

function ReportRow({
  r,
  isFirst,
  onResolve,
  onDelete,
  busy,
  t,
}: {
  r: MyReport;
  isFirst: boolean;
  onResolve: () => void;
  onDelete: () => void;
  busy: boolean;
  t: (k: string) => string;
}) {
  const name = r.areaName ?? r.nearestPlace ?? `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`;
  return (
    <div className={isFirst ? '' : 'border-border border-t'}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="bg-red-500/10 text-red-500 flex h-7 w-7 shrink-0 items-center justify-center">
          <ZapOff className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight">{name}</p>
          <p className="text-muted-foreground flex items-center gap-1 text-[10px] leading-tight">
            <Clock className="h-3 w-3" />
            {relativeTime(r.reportedAt)}
            {r.confirmedBy > 1 && <span>· {r.confirmedBy} confirms</span>}
          </p>
        </div>
      </div>
      <div className="border-border flex gap-0 border-t">
        <button
          type="button"
          disabled={busy}
          onClick={onResolve}
          className="hover:bg-emerald-500/5 flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-bold text-emerald-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {t('me.power_back')}
        </button>
        <div className="border-border border-l" />
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="hover:bg-red-500/5 text-muted-foreground hover:text-red-600 flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-bold disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          {t('me.delete')}
        </button>
      </div>
    </div>
  );
}

function HistoryRow({
  r,
  isFirst,
  t,
}: {
  r: MyReport;
  isFirst: boolean;
  t: (k: string) => string;
}) {
  const name = r.areaName ?? r.nearestPlace ?? `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`;
  const isResolved = r.status === 'resolved';
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 ${isFirst ? '' : 'border-border border-t'}`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center ${
          isResolved ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
        }`}
      >
        {isResolved ? <CheckCircle2 className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium">{name}</p>
        <p className="text-muted-foreground text-[10px]">
          {isResolved ? t('me.marked_resolved') : t('me.deleted')} · {relativeTime(r.resolvedAt ?? r.reportedAt)}
        </p>
      </div>
    </div>
  );
}
