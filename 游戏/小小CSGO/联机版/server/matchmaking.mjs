import { ratingBand } from './rating.mjs';

export const MATCHMAKING_OPTIONS = Object.freeze({
  baseSpread: 150,
  widenAfterMs: 30000,
  fallbackSpread: 400,
});

export function createMatchmakingQueue() {
  return new Map();
}

export function enqueuePlayer(queue, player, now) {
  queue.set(player.id, { id: player.id, rating: player.rating, joinedAt: now });
}

export function dequeuePlayer(queue, id) {
  queue.delete(id);
}

function entrySpread(entry, now, options) {
  return now - entry.joinedAt >= options.widenAfterMs ? options.fallbackSpread : options.baseSpread;
}

export function findMatchPair(queue, now, options = MATCHMAKING_OPTIONS) {
  const entries = [...queue.values()].sort((first, second) => first.joinedAt - second.joinedAt);
  for (let first = 0; first < entries.length; first += 1) {
    for (let second = first + 1; second < entries.length; second += 1) {
      const spread = Math.min(entrySpread(entries[first], now, options), entrySpread(entries[second], now, options));
      if (Math.abs(entries[first].rating - entries[second].rating) <= spread) {
        const match = { first: entries[first], second: entries[second] };
        queue.delete(match.first.id);
        queue.delete(match.second.id);
        return match;
      }
    }
  }
  return null;
}

export function queueStats(queue) {
  const byBand = {};
  for (const entry of queue.values()) {
    const band = ratingBand(entry.rating);
    byBand[band] = (byBand[band] ?? 0) + 1;
  }
  return { waiting: queue.size, byBand };
}
