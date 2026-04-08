import { Suspense } from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useAppStore } from '@/stores/appStore';
import { HomePage } from '@/pages/HomePage';
import { MapPage } from '@/pages/MapPage';
import { FeedPage } from '@/pages/FeedPage';
import { StatsPage } from '@/pages/StatsPage';
import { ReportSheet } from '@/components/outage/ReportSheet';
import { OutageDetailSheet } from '@/components/outage/OutageDetailSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';

export function AppShell() {
  const tab = useAppStore((s) => s.tab);

  return (
    <div className="bg-muted/40 flex min-h-svh w-full justify-center">
      {/* Mobile-first: cap content at ~480px on wider screens so the app
          keeps its phone-shaped layout on desktop. Everything inside
          still scales fluidly down to ~320px. */}
      <div className="bg-background text-foreground border-border relative flex min-h-svh w-full max-w-[480px] flex-col sm:border-x">
        <Header />
        <main className="flex-1 overflow-y-auto pb-20">
          <Suspense fallback={<ShellFallback />}>
            {tab === 'home' && <HomePage />}
            {tab === 'map' && <MapPage />}
            {tab === 'feed' && <FeedPage />}
            {tab === 'stats' && <StatsPage />}
          </Suspense>
        </main>
        <BottomNav />
        <ReportSheet />
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
