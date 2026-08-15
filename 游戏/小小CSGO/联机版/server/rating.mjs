export const RATING_START = 1200;
export const RATING_MIN = 100;
export const RATING_MAX = 3000;
export const DEFAULT_K = 32;

export function expectedScore(first, second) {
  return 1 / (1 + 10 ** ((second - first) / 400));
}

export function updateRating(current, opponent, score, k = DEFAULT_K) {
  const expected = expectedScore(current, opponent);
  return Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(current + k * (score - expected))));
}

export function ratingBand(rating) {
  if (rating >= 2200) return 'elite';
  if (rating >= 1800) return 'veteran';
  if (rating >= 1500) return 'skilled';
  if (rating >= 1200) return 'standard';
  return 'recruit';
}
