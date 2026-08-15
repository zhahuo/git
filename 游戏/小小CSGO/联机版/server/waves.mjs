import { GUN_GAME_WEAPONS } from './combat.mjs';

export function botsForWave(wave, base, cap = 4) {
  const scaled = Math.max(0, Math.floor(base)) + Math.max(0, Math.floor((wave - 1) / 2));
  return Math.max(0, Math.min(cap, scaled));
}

export function waveBotMaxHealth(wave) {
  return Math.min(300, 100 + Math.max(0, wave - 1) * 25);
}

export function waveBotWeaponTier(wave) {
  return Math.min(GUN_GAME_WEAPONS.length - 1, Math.max(0, Math.floor((wave - 1) / 2)));
}

export function waveBotWeapon(wave) {
  return GUN_GAME_WEAPONS[waveBotWeaponTier(wave)];
}

export function advanceWave(state, base, cap = 4) {
  const wave = state.wave + 1;
  return { wave, remaining: botsForWave(wave, base, cap) };
}

export function waveBotReactionMs(wave, base = 250) {
  return Math.max(80, Math.round(base - Math.max(0, wave - 1) * 20));
}

export function waveBotAimErrorScale(wave) {
  return Math.max(0.45, 1 - Math.max(0, wave - 1) * 0.05);
}

export function waveBotBurstSize(wave, base = 4) {
  return Math.min(6, base + Math.floor(Math.max(0, wave - 1) / 3));
}
