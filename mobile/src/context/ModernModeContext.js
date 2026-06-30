// VOIDtv MODERN MODE (B 2026-06-28): a content LENS, not a gate. When on, the wall asks the backend
// for `tier=modern` — a curated shows & movies set, recency-floored to 1990, so it reads as a current
// streaming catalog. Same skin, player, and search; just a cleaner content face. A plain toggle (no
// PIN): flip it on or off freely. The client cache is namespaced per mode so the two walls never mix.
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@void_mode';
const ModernContext = createContext(null);

export function ModernModeProvider({ children }) {
  // Modern is the DEFAULT face now (B 2026-06-28); Void is the opt-in toggle. Only drop to Void if
  // the user has explicitly chosen it before.
  const [modernMode, setModernMode] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === 'void') setModernMode(false); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const toggleModern = useCallback(() => {
    setModernMode((m) => {
      const next = !m;
      AsyncStorage.setItem(KEY, next ? 'modern' : 'void').catch(() => {});
      return next;
    });
  }, []);

  return (
    <ModernContext.Provider value={{ modernMode, modernLoaded: loaded, toggleModern }}>
      {children}
    </ModernContext.Provider>
  );
}

export function useModernMode() {
  const ctx = useContext(ModernContext);
  if (!ctx) throw new Error('useModernMode must be inside ModernModeProvider');
  return ctx;
}
