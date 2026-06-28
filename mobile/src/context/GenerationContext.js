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
    AsyncStorage.getItem(KEY).then((val) => {
      if (val && GENERATIONS[val]) setGenerationId(val);
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
