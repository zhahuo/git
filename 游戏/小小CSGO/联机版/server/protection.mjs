export const DEFAULT_SPAWN_PROTECTION_MS = 1500;
export const DEFAULT_BASE_SAFE_ZONE_RADIUS = 7;

export function spawnProtectionUntil(now, durationMs = DEFAULT_SPAWN_PROTECTION_MS) {
  return durationMs > 0 ? now + durationMs : 0;
}

export function shieldMs(player, now) {
  const until = player?.protectedUntil ?? 0;
  return Math.max(0, until - now);
}

export function isProtected(player, now) {
  return shieldMs(player, now) > 0;
}

export function cancelProtection(player) {
  if (player) player.protectedUntil = 0;
}

export function insideSafeZone(x, z, map, radius = DEFAULT_BASE_SAFE_ZONE_RADIUS) {
  if (radius <= 0 || !map?.ctfBase?.ct || !map?.ctfBase?.t) return false;
  return [map.ctfBase.ct, map.ctfBase.t].some((base) => Math.hypot(x - base.x, z - base.z) <= radius);
}
