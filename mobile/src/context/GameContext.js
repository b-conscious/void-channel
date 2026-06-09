import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getRank, getNextRank } from '../data/generations';
import * as gameStore from '../store/gameStore';

const GameContext = createContext(null);

/**
 * XP rewards for contributions — these mirror backend/contributions.js
 * so we can show optimistic XP immediately.
 */
const XP_REWARDS = {
  cast: 10,
  director: 10,
  writer: 10,
  producer: 10,
  trivia: 15,
  context: 20,
  tag: 5,
  warning: 5,
  year: 10,
};

export function GameProvider({ children }) {
  const [xp, setXP] = useState(0);
  const [totalWatched, setTotalWatched] = useState(0);
  const [totalContributions, setTotalContributions] = useState(0);
  const [contributionsByType, setContributionsByType] = useState({});
  const [daysExploring, setDaysExploring] = useState(0);
  const [recentContributions, setRecentContributions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Refs to avoid stale closures
  const xpRef = useRef(0);

  useEffect(() => { xpRef.current = xp; }, [xp]);

  useEffect(() => {
    gameStore.loadGameState().then((state) => {
      setXP(state.xp);
      setTotalWatched(state.totalWatched);
      setTotalContributions(state.totalContributions);
      setContributionsByType(state.contributionsByType);
      setDaysExploring(state.daysExploring);
      setRecentContributions(state.recentContributions);
      xpRef.current = state.xp;
      setLoaded(true);
    });
  }, []);

  /**
   * Track a video watch. Minimal XP — watching discovers content,
   * but the real XP comes from contributing metadata.
   */
  const onWatchItem = useCallback(async (item, categoryId) => {
    if (!item) return { xpGained: 0 };

    const xpGained = 2; // small base XP for watching

    const newTotal = await gameStore.incrementWatched();
    setTotalWatched(newTotal);

    const nextXP = xpRef.current + xpGained;
    xpRef.current = nextXP;
    setXP(nextXP);
    await gameStore.saveXP(nextXP);

    return { xpGained };
  }, []);

  /**
   * Record a successful contribution — called after the backend confirms.
   * Awards XP and updates local contribution stats.
   */
  const onContribute = useCallback(async (fieldType, itemId, itemTitle) => {
    const xpGained = XP_REWARDS[fieldType] || 10;

    // Award XP
    const nextXP = xpRef.current + xpGained;
    xpRef.current = nextXP;
    setXP(nextXP);
    await gameStore.saveXP(nextXP);

    // Track contribution
    const stats = await gameStore.addContribution(fieldType, itemId, itemTitle);
    setTotalContributions(stats.total);
    setContributionsByType(stats.byType);
    setRecentContributions(stats.recent);

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
      totalWatched, daysExploring,
      totalContributions, contributionsByType, recentContributions,
      onWatchItem, onContribute, loaded,
      XP_REWARDS,
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
