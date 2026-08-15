/*
 * Killstreak reward cycle.
 * Inspired by community killstreak scripts researched on GitHub:
 * - Plutonium custom_killstreaks_rewards: reward tiers unlock at kill-count
 *   thresholds and the tier list loops after the final reward.
 * - FearX RedZone: tiered streak tables where each threshold grants a reward.
 */
import { ARMOR_MAX, GUN_GAME_WEAPONS, WeaponState } from './combat.mjs';

export const KILLSTREAK_INTERVAL = 3;
export const KILLSTREAK_REWARDS = Object.freeze([
  Object.freeze({ kind: 'armor', amount: 25, label: 'ARMOR +25' }),
  Object.freeze({ kind: 'ammo', label: 'AMMO REFILL' }),
  Object.freeze({ kind: 'weapon', label: 'WEAPON UPGRADE' }),
]);
export const KILLSTREAK_SCORE = Object.freeze({ armor: 50, ammo: 75, weapon: 150 });

export function killstreakRewardIndex(streak) {
  if (!Number.isInteger(streak) || streak <= 0) return null;
  if (streak % KILLSTREAK_INTERVAL !== 0) return null;
  return (Math.floor(streak / KILLSTREAK_INTERVAL) - 1) % KILLSTREAK_REWARDS.length;
}

export function killstreakRewardFor(streak, mode = 'free-for-all') {
  const index = killstreakRewardIndex(streak);
  if (index === null) return null;
  const reward = KILLSTREAK_REWARDS[index % KILLSTREAK_REWARDS.length];
  // Gun-game already progresses weapons on every kill, so its weapon slot
  // falls back to armor instead of doubling the progression.
  if (reward.kind === 'weapon' && mode === 'gun-game') return KILLSTREAK_REWARDS[0];
  return reward;
}

export function killstreakRewardScore(reward) {
  return KILLSTREAK_SCORE[reward.kind] ?? 50;
}

function weaponTierByName(name) {
  return GUN_GAME_WEAPONS.findIndex((weapon) => weapon.name === name);
}

export function applyKillstreakReward(player, reward) {
  if (reward.kind === 'armor') {
    const armor = Math.min(ARMOR_MAX, (player.armor ?? 0) + reward.amount);
    player.armor = armor;
    return { kind: 'armor', amount: reward.amount, armor };
  }
  if (reward.kind === 'ammo') {
    player.weapon.refill();
    return { kind: 'ammo', ammo: player.weapon.ammo, weaponName: player.weapon.def.name };
  }
  const currentTier = weaponTierByName(player.weapon.def.name);
  if (currentTier < 0 || currentTier >= GUN_GAME_WEAPONS.length - 1) {
    // Already at the top of the arsenal: grant armor instead of looping.
    const armor = Math.min(ARMOR_MAX, (player.armor ?? 0) + 25);
    player.armor = armor;
    return { kind: 'armor', amount: 25, armor };
  }
  const tier = currentTier + 1;
  const next = GUN_GAME_WEAPONS[tier];
  player.weapon = new WeaponState(next);
  player.weaponTier = tier;
  return { kind: 'weapon', weaponName: next.name, tier };
}
