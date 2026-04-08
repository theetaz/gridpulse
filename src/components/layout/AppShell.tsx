import { Suspense } from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useAppStore } from '@/stores/appStore';
import { HomePage } from '@/pages/HomePage';
import { MapPage } from '@/pages/MapPage';
import { FeedPage } from '@/pages/FeedPage';
import { StatsPage } from '@/pages/StatsPage';
import { ReportPage } from '@/components/outage/ReportPage';
import { OutageDetailSheet } from '@/components/outage/OutageDetailSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';

export function AppShell() {
  const tab = useAppStore((s) => s.tab);

  return (
    <div className="bg-muted/40 flex h-dvh w-full justify-center overflow-hidden">
      {/* Mobile-first: cap content at ~480px on wider screens so the app
          keeps its phone-shaped layout on desktop. h-dvh gives us the
          dynamic viewport height so we track the browser's retracting
          toolbars on mobile scroll. */}
      <div className="bg-background text-foreground border-border relative flex h-dvh max-h-dvh w-full max-w-[480px] flex-col overflow-hidden sm:border-x">
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={<ShellFallback />}>
            {tab === 'home' && <HomePage />}
            {tab === 'map' && <MapPage />}
            {tab === 'feed' && <FeedPage />}
            {tab === 'stats' && <StatsPage />}
          </Suspense>
        </main>
        <BottomNav />
        <ReportPage />
        <OutageDetailSheet />
        <Toaster position="top-center" />
      </div>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
