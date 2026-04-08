import { Suspense, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AppShell } from '@/components/layout/AppShell';
import { installOfflineSync } from '@/lib/offlineQueue';
import { useRealtime } from '@/hooks/useRealtime';
import { toast } from 'sonner';
import '@/lib/i18n';

function RealtimeBridge() {
  useRealtime();
  return null;
}

export function App() {
  useEffect(() => {
    installOfflineSync(({ sent }) => {
      if (sent > 0) {
        toast.success(`Synced ${sent} report${sent === 1 ? '' : 's'}`);
        queryClient.invalidateQueries({ queryKey: ['outages'] });
      }
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge />
      <Suspense fallback={null}>
        <AppShell />
      </Suspense>
    </QueryClientProvider>
  );
}

export default App;
