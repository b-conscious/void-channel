import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getRank, getNextRank, getDailyBounties, checkBounty } from '../data/generations';
import * as gameStore from '../store/gameStore';

const GameContext = createContext(null);
const RARE_THRESHOLD = 5000;

export function GameProvider({ children }) {
  const [xp, setXP] = useState(0);
  const [rareUnearthed, setRareUnearthed] = useState([]);
  const [totalWatched, setTotalWatched] = useState(0);
  const [daysExploring, setDaysExploring] = useState(0);
  const [completedBounties, setCompletedBounties] = useState([]);
  const [streakCount, setStreakCount] = useState(0);
  const [streakBest, setStreakBest] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Refs to read latest values inside async handlers and avoid stale closure bugs
  const xpRef = useRef(0);
  const completedRef = useRef([]);

  useEffect(() => { xpRef.current = xp; }, [xp]);
  useEffect(() => { completedRef.current = completedBounties; }, [completedBounties]);

  // Recompute today's date once per day boundary by reading it at start of each action
  const today = new Date().toISOString().slice(0, 10);
  const bounties = useMemo(() => getDailyBounties(today), [today]);

  useEffect(() => {
    gameStore.loadGameState().then((state) => {
      setXP(state.xp);
      setRareUnearthed(state.rareUnearthed);
      setTotalWatched(state.totalWatched);
      setDaysExploring(state.daysExploring);
      setCompletedBounties(state.completedBounties);
      setStreakCount(state.streakCount);
      setStreakBest(state.streakBest);
      xpRef.current = state.xp;
      completedRef.current = state.completedBounties;
      setLoaded(true);
    });
  }, []);

  // Fired when user opens an item in the player
  const onWatchItem = useCallback(async (item, categoryId) => {
    if (!item) return { xpGained: 0 };

    let xpGained = 10; // base XP

    // 1. Increment total watched + unique day count
    const newTotal = await gameStore.incrementWatched();
    setTotalWatched(newTotal);

    // 2. Rare item discovery (only counts if downloads metadata is available AND below threshold)
    const downloads = typeof item.downloads === 'number' ? item.downloads : null;
    if (downloads !== null && downloads < RARE_THRESHOLD) {
      const { isNew, list } = await gameStore.addRareUnearthed(item.id);
      if (isNew) {
        xpGained += 25;
        setRareUnearthed(list);
      }
    }

    // 3. Rabbit Hole streak (only if categoryId is known)
    if (categoryId) {
      const { count, best } = await gameStore.updateStreak(categoryId);
      setStreakCount(count);
      setStreakBest(best);
      // Bonus XP every time streak hits a multiple of 3
      if (count >= 3 && count % 3 === 0) xpGained += 30;
    } else {
      // Unknown category — break the streak so streak only counts intentional dives
      const { count, best } = await gameStore.updateStreak(null);
      setStreakCount(count);
      setStreakBest(best);
    }

    // 4. Daily bounty completion — use ref so two simultaneous calls don't both miss
    const todayBounties = getDailyBounties(new Date().toISOString().slice(0, 10));
    for (const bounty of todayBounties) {
      if (completedRef.current.includes(bounty.id)) continue;
      if (checkBounty(bounty, item, categoryId)) {
        const updated = await gameStore.saveCompletedBounty(bounty.id);
        completedRef.current = updated;
        setCompletedBounties(updated);
        xpGained += bounty.xp;
      }
    }

    // 5. Award XP
    const nextXP = xpRef.current + xpGained;
    xpRef.current = nextXP;
    setXP(nextXP);
    await gameStore.saveXP(nextXP);

    return { xpGained };
  }, []);

  const rank = getRank(xp);
  const nextRank = getNextRank(xp);
  const xpInRank = xp - rank.minXP;
  const xpToNext = nextRank ? nextRank.minXP - rank.minXP : 1;
  const rankProgress = nextRank ? Math.min(1, xpInRank / xpToNext) : 1;

  return (
    <GameContext.Provider value={{
      xp, rank, nextRank, rankProgress, xpToNext, xpInRank,
      rareUnearthed,
      totalWatched, daysExploring,
      streakCount, streakBest,
      bounties, completedBounties,
      onWatchItem, loaded,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be inside GameProvider');
  return ctx;
}
