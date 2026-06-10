/**
 * AuthContext — manages user session, token persistence, and cloud sync.
 *
 * Wraps the app. On mount, checks AsyncStorage for a persisted session.
 * When the user signs in, triggers a one-time cloud sync (push local data up,
 * pull cloud data down, merge with newest-wins strategy).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

const AuthContext = createContext(null);

const KEYS = {
  SESSION: '@void_session',     // { access_token, refresh_token, expires_at }
  USER: '@void_user',           // profile object
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // profile row or null
  const [session, setSession] = useState(null);      // { access_token, refresh_token, expires_at }
  const [loading, setLoading] = useState(true);      // true while restoring session
  const [syncing, setSyncing] = useState(false);
  const refreshTimer = useRef(null);

  const isAuthenticated = !!user && !!session;
  const isAnonymous = user?.is_anonymous === true;

  // ── Persist session ────────────────────────────────────────

  const persistSession = useCallback(async (sess, usr) => {
    try {
      if (sess) {
        await AsyncStorage.setItem(KEYS.SESSION, JSON.stringify(sess));
        api.setAuthToken(sess.access_token);
      } else {
        await AsyncStorage.removeItem(KEYS.SESSION);
        api.setAuthToken(null);
      }
      if (usr) {
        await AsyncStorage.setItem(KEYS.USER, JSON.stringify(usr));
      } else {
        await AsyncStorage.removeItem(KEYS.USER);
      }
    } catch (err) {
      console.warn('[auth] persist failed:', err);
    }
  }, []);

  // ── Token refresh ──────────────────────────────────────────

  const scheduleRefresh = useCallback((sess) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (!sess?.expires_at || !sess?.refresh_token) return;

    // Refresh 5 minutes before expiry
    const expiresMs = sess.expires_at * 1000;
    const refreshIn = Math.max(0, expiresMs - Date.now() - 5 * 60 * 1000);

    refreshTimer.current = setTimeout(async () => {
      try {
        const result = await api.refreshToken(sess.refresh_token);
        if (result.session) {
          setSession(result.session);
          api.setAuthToken(result.session.access_token);
          await AsyncStorage.setItem(KEYS.SESSION, JSON.stringify(result.session));
          scheduleRefresh(result.session);
        }
      } catch (err) {
        // If the refresh token is dead (401 / invalid), the only recovery is a fresh sign-in.
        // Clear the stale session SILENTLY and continue anonymously — don't nag a user who may
        // never have signed in, and stop sending a dead Bearer token on every request.
        const msg = String(err?.message || '');
        const isAuthFailure = /401|unauthor|refresh failed|sign in again|invalid/i.test(msg);
        if (isAuthFailure) {
          setSession(null);
          setUser(null);
          api.setAuthToken(null);
          try { await AsyncStorage.removeItem(KEYS.SESSION); } catch {}
          try { await AsyncStorage.removeItem(KEYS.USER); } catch {}
        }
        // Transient network error: keep the session and let the next scheduled refresh retry.
      }
    }, refreshIn);
  }, []);

  // ── Restore session on mount ───────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const [sessRaw, userRaw] = await Promise.all([
          AsyncStorage.getItem(KEYS.SESSION),
          AsyncStorage.getItem(KEYS.USER),
        ]);
        if (sessRaw) {
          const sess = JSON.parse(sessRaw);
          const usr = userRaw ? JSON.parse(userRaw) : null;
          setSession(sess);
          setUser(usr);
          api.setAuthToken(sess.access_token);
          scheduleRefresh(sess);
        }
      } catch (err) {
        console.warn('[auth] restore failed:', err);
      }
      setLoading(false);
    })();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh]);

  // ── Sign in ────────────────────────────────────────────────

  const signIn = useCallback(async (email, password) => {
    const result = await api.login(email, password);
    setUser(result.user);
    setSession(result.session);
    await persistSession(result.session, result.user);
    scheduleRefresh(result.session);
    return result;
  }, [persistSession, scheduleRefresh]);

  // ── Register ───────────────────────────────────────────────

  const register = useCallback(async (email, password, opts = {}) => {
    const result = await api.register(email, password, opts);
    setUser(result.user);
    setSession(result.session);
    await persistSession(result.session, result.user);
    scheduleRefresh(result.session);
    return result;
  }, [persistSession, scheduleRefresh]);

  // ── Sign out ───────────────────────────────────────────────

  const signOut = useCallback(async () => {
    setUser(null);
    setSession(null);
    await persistSession(null, null);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, [persistSession]);

  // ── Cloud sync ─────────────────────────────────────────────

  const syncToCloud = useCallback(async (localData) => {
    if (!isAuthenticated || syncing) return;
    setSyncing(true);
    try {
      const promises = [];
      if (localData.history?.length) {
        promises.push(api.syncHistory(localData.history));
      }
      if (localData.watchlist?.length) {
        promises.push(api.syncWatchlist(localData.watchlist));
      }
      if (localData.hearts?.length) {
        promises.push(api.syncHearts(localData.hearts));
      }
      if (localData.xp !== undefined) {
        promises.push(api.syncGame({ xp: localData.xp, rank: localData.rank, generation: localData.generation }));
      }
      await Promise.all(promises);
    } catch (err) {
      console.warn('[sync] push failed:', err);
    }
    setSyncing(false);
  }, [isAuthenticated, syncing]);

  const pullFromCloud = useCallback(async () => {
    if (!isAuthenticated) return null;
    setSyncing(true);
    try {
      const data = await api.syncPull();
      setSyncing(false);
      return data;
    } catch (err) {
      console.warn('[sync] pull failed:', err);
      setSyncing(false);
      return null;
    }
  }, [isAuthenticated]);

  // ── Update profile ─────────────────────────────────────────

  const updateProfile = useCallback(async (updates) => {
    const profile = await api.updateProfile(updates);
    setUser(profile);
    await AsyncStorage.setItem(KEYS.USER, JSON.stringify(profile));
    return profile;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, loading, syncing,
      isAuthenticated, isAnonymous,
      signIn, register, signOut,
      syncToCloud, pullFromCloud, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
