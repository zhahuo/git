import { RATING_MAX, RATING_MIN, RATING_START, ratingBand, updateRating } from './rating.mjs';

export const RANKING_STATE_VERSION = 1;

export function createRankingStore() {
  return new Map();
}

export function getOrCreateRating(store, playerId) {
  let entry = store.get(playerId);
  if (!entry) {
    entry = { rating: RATING_START, wins: 0, losses: 0 };
    store.set(playerId, entry);
  }
  return entry;
}

export function applyDuel(store, winnerId, loserId, k = 32) {
  const winner = getOrCreateRating(store, winnerId);
  const loser = getOrCreateRating(store, loserId);
  const winnerRating = updateRating(winner.rating, loser.rating, 1, k);
  const loserRating = updateRating(loser.rating, winner.rating, 0, k);
  const result = {
    winner: { playerId: winnerId, rating: winnerRating, band: ratingBand(winnerRating), delta: winnerRating - winner.rating },
    loser: { playerId: loserId, rating: loserRating, band: ratingBand(loserRating), delta: loserRating - loser.rating },
  };
  winner.rating = winnerRating;
  winner.wins += 1;
  loser.rating = loserRating;
  loser.losses += 1;
  return result;
}

export function rankingStats(store) {
  const byBand = {};
  for (const entry of store.values()) {
    const band = ratingBand(entry.rating);
    byBand[band] = (byBand[band] ?? 0) + 1;
  }
  return { playersTracked: store.size, byBand };
}

export function leaderboardSnapshot(store, limit = 10) {
  const capped = Math.max(1, Math.min(50, limit));
  return [...store.entries()]
    .map(([, entry]) => ({ rating: entry.rating, band: ratingBand(entry.rating), wins: entry.wins, losses: entry.losses }))
    .sort((first, second) => second.rating - first.rating || second.wins - first.wins)
    .slice(0, capped);
}

export function serializeRanking(store, extra = {}) {
  return { version: RANKING_STATE_VERSION, ...extra, players: [...store.entries()].map(([playerId, entry]) => ({ id: playerId, ...entry })) };
}

export function restoreRanking(store, data) {
  if (!data || typeof data !== 'object' || data.version !== RANKING_STATE_VERSION || !Array.isArray(data.players)) return false;
  for (const player of data.players) {
    if (typeof player?.id !== 'string' || !Number.isFinite(player.rating) || !Number.isInteger(player.wins) || !Number.isInteger(player.losses)) return false;
    if (player.rating < RATING_MIN || player.rating > RATING_MAX || player.wins < 0 || player.losses < 0) return false;
    store.set(player.id, { rating: player.rating, wins: player.wins, losses: player.losses });
  }
  return true;
}
