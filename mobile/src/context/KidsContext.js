// VOIDtv KIDS (B's ruling 2026-06-11): a hard gate, not a filter. When kidsMode is on the
// app asks the backend for the allowlist-only payload and REMOVES every unsafe surface
// (raw search, dial, snacks, 18+, donate, archivist, comments, related). Entering is one
// tap; LEAVING requires the parent gate, so a kid cannot tap their way back out.
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@void_kids_mode';
const KidsContext = createContext(null);

// The kids accent: sunny, unmistakable, nothing like the adult generations.
export const KIDS_ACCENT = '#ffd34d';

export function KidsProvider({ children }) {
  const [kidsMode, setKidsMode] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === '1') setKidsMode(true); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Parent PIN: a straight code the parent sets, not a math puzzle (B 2026-06-12). Stored
  // locally, lightly obscured (it is a child deterrent, not a vault). Web-first v1 prompt.
  const PIN_KEY = '@void_kids_pin';
  const getPin = () => { try { const v = localStorage.getItem(PIN_KEY); return v ? atob(v) : null; } catch (e) { return null; } };
  const setPin = (p) => { try { localStorage.setItem(PIN_KEY, btoa(p)); } catch (e) {} };

  const enterKids = useCallback(() => {
    // First time in: have the parent set the PIN that will unlock it later.
    if (Platform.OS === 'web' && !getPin()) {
      const p = window.prompt ? window.prompt('Set a parent PIN (4-8 digits) to lock Kids mode.\nYou will need it to leave.') : null;
      if (!p || !/^\d{4,8}$/.test(String(p).trim())) return; // no PIN set, do not enter
      setPin(String(p).trim());
    }
    setKidsMode(true);
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  }, []);

  const exitKids = useCallback(() => {
    const pin = getPin();
    if (!pin) { setKidsMode(false); AsyncStorage.setItem(KEY, '0').catch(() => {}); return true; } // no PIN ever set: not locked
    const entry = (Platform.OS === 'web' && window.prompt) ? window.prompt('Enter the parent PIN to leave Kids mode.') : null;
    if (entry != null && String(entry).trim() === pin) {
      setKidsMode(false);
      AsyncStorage.setItem(KEY, '0').catch(() => {});
      return true;
    }
    return false;
  }, []);

  return (
    <KidsContext.Provider value={{ kidsMode, kidsLoaded: loaded, enterKids, exitKids, kidsAccent: KIDS_ACCENT }}>
      {children}
    </KidsContext.Provider>
  );
}

export function useKids() {
  const ctx = useContext(KidsContext);
  if (!ctx) throw new Error('useKids must be inside KidsProvider');
  return ctx;
}
