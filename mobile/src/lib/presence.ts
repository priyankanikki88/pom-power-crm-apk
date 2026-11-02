import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from './api';

const PING_INTERVAL_MS = 45_000;

/**
 * "Still here" heartbeat while signed in, mirroring the web app's own usePresenceHeartbeat — but gated to the
 * foreground only. A browser tab staying open and a phone staying installed are different signals: without this
 * gate, a backgrounded (or killed-but-resumable) app would look perpetually "online", a materially more invasive
 * signal than the web version's own "tab open" semantics. Failures are swallowed — presence is a nice-to-have, never
 * something that should surface an error to the user.
 */
export function usePresencePing(enabled: boolean): void {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const ping = () => void api.post('/presence/ping', {}).catch(() => undefined);
    const start = () => {
      if (timer.current) return;
      ping();
      timer.current = setInterval(ping, PING_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer.current) return;
      clearInterval(timer.current);
      timer.current = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [enabled]);
}
