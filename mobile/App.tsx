import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { ApiError } from './src/lib/api';
import { createFilePersister, SAVED_DATA_MAX_AGE, shouldSaveQuery } from './src/lib/offlineCache';
import { flushOutbox, startOutbox } from './src/lib/outbox';
import { registerForPush } from './src/lib/push';
import { RootNavigator } from './src/navigation';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Kept as long as it may be shown without a network (it is still refreshed whenever the server can be reached).
      gcTime: SAVED_DATA_MAX_AGE,
      // A refused request (no permission, not found, bad input) will not succeed on a retry; a dropped connection might.
      retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
});
const persister = createFilePersister();

/**
 * Once the user is known: registers the phone for push notifications, and sends entries made without a network — now,
 * when the app comes back to the front, and every half minute.
 */
function OutboxRunner() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;
  useEffect(() => {
    void startOutbox(userId, qc);
    if (!userId) return;
    void registerForPush();
    const timer = setInterval(() => void flushOutbox(), 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushOutbox();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, qc]);
  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: SAVED_DATA_MAX_AGE, dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && shouldSaveQuery(q.queryKey) } }}>
        <AuthProvider>
          <StatusBar style="light" />
          <OutboxRunner />
          <RootNavigator />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
