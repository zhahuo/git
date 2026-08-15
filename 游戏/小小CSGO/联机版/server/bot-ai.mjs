import { resolveHitscan } from './combat.mjs';
import { steerBotToward } from './navigation.mjs';
import { tacticalDestination } from './tactics.mjs';

function distanceSquared(first, second) {
  const x = first.x - second.x;
  const z = first.z - second.z;
  return x * x + z * z;
}

export function selectBotTarget(bot, players, canDamage = () => true) {
  return [...players.values()]
    .filter((player) => player.id !== bot.id && player.alive && player.connected && !player.bot && !player.spectator && canDamage(bot, player))
    .sort((first, second) => distanceSquared(bot, first) - distanceSquared(bot, second))[0] ?? null;
}

export function botAimError(bot, target, now) {
  const distance = Math.hypot(target.x - bot.x, target.z - bot.z);
  const base = 0.025 + distance / 700;
  const wobble = Math.sin((now + bot.botOffset * 37) / 1300) * 0.018;
  return Math.max(0.008, Math.min(0.14, base + wobble));
}

export function shotYawForBot(bot, target, now, error = botAimError(bot, target, now)) {
  const exact = Math.atan2(-(target.x - bot.x), -(target.z - bot.z));
  const direction = Math.sin((now + bot.botOffset * 13) / 700) >= 0 ? 1 : -1;
  return exact + direction * error;
}

export function botBurstState(bot, now, burstSize = 4, pauseMs = 550) {
  const fireRate = Math.max(1, bot.weapon.def.fireRate);
  const burstStart = bot.burstStart ?? 0;
  const burstUntil = bot.burstUntil ?? 0;
  if (now >= burstUntil) return { shouldFire: true, burstStart: now, burstUntil: now + fireRate * burstSize + pauseMs };
  const shotIndex = Math.floor((now - burstStart) / fireRate);
  return { shouldFire: shotIndex < burstSize, burstStart, burstUntil };
}

export function decideBotInput(bot, target, now, map = null, squadSize = 1, preferredRange = 13) {
  if (!target) return { forward: 0, right: 0, yaw: bot.yaw, sprint: false };
  const destination = tacticalDestination(bot, target, squadSize, preferredRange);
  if (map) return steerBotToward(bot, destination, map, now);
  const dx = destination.x - bot.x;
  const dz = destination.z - bot.z;
  const distance = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  const strafe = distance < 14 ? Math.sin((now + bot.botOffset) / 700) * 0.65 : 0;
  return { forward: distance > 2 ? 1 : 0, right: strafe, yaw, sprint: distance > 14 };
}

export function updateBotTargetState(previousTargetId, target, now, reactionMs) {
  const targetId = target?.id ?? null;
  if (targetId !== previousTargetId) return { targetId, attackAt: targetId ? now + reactionMs : 0, changed: true };
  return { targetId, attackAt: 0, changed: false };
}

export function selectBotDecisionBatch(players, cursor, limit) {
  const bots = [...players.values()].filter((player) => player.bot && player.alive && player.connected).sort((first, second) => first.id.localeCompare(second.id));
  if (bots.length === 0 || limit <= 0) return { bots: [], nextCursor: 0, deferred: 0 };
  const start = ((cursor % bots.length) + bots.length) % bots.length;
  const count = Math.min(Math.floor(limit), bots.length);
  const selected = Array.from({ length: count }, (_, index) => bots[(start + index) % bots.length]);
  return { bots: selected, nextCursor: (start + count) % bots.length, deferred: bots.length - count };
}

// The server owns bot weapons as well as their aim. A bot may only fire through
// the same hitscan and cover test used by a connected player.
export function decideBotCombat(bot, target, players, now, canDamage = () => true, obstacles = []) {
  if (!target || !bot.alive || !target.alive) return 'idle';
  if (bot.weapon.ammo === 0) return now >= bot.weapon.reloadUntil ? 'reload' : 'idle';
  if (!bot.weapon.canShoot(now)) return 'idle';
  const burst = botBurstState(bot, now);
  if (!burst.shouldFire) return 'idle';
  const resolution = resolveHitscan(bot, players, canDamage, obstacles);
  return resolution.target?.id === target.id ? 'fire' : 'idle';
}
