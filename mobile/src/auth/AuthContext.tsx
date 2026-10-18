import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, currentRefreshToken, loadTokens, setSessionExpiredHandler, setTokens } from '../lib/api';
import { clearSavedData } from '../lib/offlineCache';
import { clearMyOutbox } from '../lib/outbox';
import { unregisterPush } from '../lib/push';
import { readJson, removeJson, writeJson } from '../lib/store';

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  employeeCode?: string | null;
  /** Signed in with a temporary password — must choose their own before using the CRM. */
  mustChangePassword: boolean;
  permissions: string[];
  branch?: { id: string; code: string; name: string } | null;
  department?: { id: string; code: string; name: string } | null;
  designation?: { id: string; code: string; name: string; level: number } | null;
  reportingManager?: { id: string; fullName: string } | null;
  userRoles?: Array<{ role: { id: string; name: string } }>;
}

interface AuthValue {
  user: CurrentUser | null;
  /** True until the stored session (if any) has been checked on app start. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  hasPermission: (code: string) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);
/** The signed-in user as last seen, so the app can open without a network. */
const ME_FILE = 'me';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const me = await api.get<CurrentUser>('/auth/me');
      writeJson(ME_FILE, me);
      setUser(me);
    } catch (err) {
      // No network: carry on as the user who was signed in last time, with the data saved on the phone. Anything else
      // (the session was ended, the account disabled) means signing in again.
      setUser(err instanceof ApiError && err.status === 0 ? await readJson<CurrentUser>(ME_FILE) : null);
    }
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      removeJson(ME_FILE);
      clearSavedData(qc);
    });
    void (async () => {
      if (await loadTokens()) await loadMe();
      setLoading(false);
    })();
    return () => setSessionExpiredHandler(null);
  }, [loadMe, qc]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', { email: email.trim(), password });
      await setTokens(tokens);
      clearSavedData(qc);
      const me = await api.get<CurrentUser>('/auth/me');
      writeJson(ME_FILE, me);
      setUser(me);
    },
    [qc],
  );

  const logout = useCallback(async () => {
    const refreshToken = currentRefreshToken();
    await unregisterPush();
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // Signing out locally must work even when the server can't be reached.
    }
    await setTokens(null);
    removeJson(ME_FILE);
    clearMyOutbox();
    clearSavedData(qc);
    setUser(null);
  }, [qc]);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, logout, reload: loadMe, hasPermission: (code) => user?.permissions.includes(code) ?? false }),
    [user, loading, login, logout, loadMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
