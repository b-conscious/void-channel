import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GENERATIONS } from '../data/generations';

const KEY = '@void_generation';
const DEFAULT = 'void';

const GenerationContext = createContext(null);

export function GenerationProvider({ children }) {
  const [generationId, setGenerationId] = useState(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Signal mechanics removed: ONE 'void' identity. Do NOT restore a legacy stored generation
    // (boomer/millennial/genz). Reading it back flipped generationId AFTER first paint, which swapped
    // the wall onto that gen's STALE per-gen client cache from a past warm window (B 2026-06-28:
    // "rows show on load, then disappear" - the full void wall painted first, then collapsed to the
    // old gen's thin cache). Migrate any legacy value to 'void' and stay there.
    AsyncStorage.getItem(KEY).then((val) => {
      if (val && val !== 'void') AsyncStorage.setItem(KEY, 'void').catch(() => {});
      setLoaded(true);
    });
  }, []);

  const chooseGeneration = async (id) => {
    if (!GENERATIONS[id]) return;
    setGenerationId(id);
    await AsyncStorage.setItem(KEY, id);
  };

  const gen = GENERATIONS[generationId] || GENERATIONS[DEFAULT];

  return (
    <GenerationContext.Provider value={{ generationId, gen, chooseGeneration, loaded }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error('useGeneration must be inside GenerationProvider');
  return ctx;
}
