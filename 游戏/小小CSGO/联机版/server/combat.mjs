/*
 * Adapted from Weapon.ts in https://github.com/vkopitsa/browser-shooter
 * Copyright (c) 2026 Browser Shooter contributors. MIT License.
 * The original license is preserved in licenses/browser-shooter-MIT.txt.
 */

import { firstRayBlockDistance, isRayBlocked } from './geometry.mjs';

export const VX9 = { name: 'VX-9', damage: 25, fireRate: 100, maxAmmo: 30, range: 65, reloadTime: 1800, hitRadius: 0.72, falloffStart: 22, falloffEnd: 60, falloffMin: 0.4 };
export const RAPTOR = { name: 'RAPTOR', damage: 34, fireRate: 180, maxAmmo: 24, range: 72, reloadTime: 1600, hitRadius: 0.62, falloffStart: 26, falloffEnd: 68, falloffMin: 0.4 };
export const HAMMER = { name: 'HAMMER', damage: 70, fireRate: 520, maxAmmo: 8, range: 42, reloadTime: 1900, hitRadius: 1.05, falloffStart: 12, falloffEnd: 40, falloffMin: 0.5 };
export const SABER = { name: 'SABER', damage: 18, fireRate: 70, maxAmmo: 36, range: 45, reloadTime: 1400, hitRadius: 0.55, falloffStart: 14, falloffEnd: 42, falloffMin: 0.35 };
export const TITAN = { name: 'TITAN', damage: 95, fireRate: 800, maxAmmo: 5, range: 50, reloadTime: 2200, hitRadius: 1.25, falloffStart: 18, falloffEnd: 48, falloffMin: 0.6 };
export const GUN_GAME_WEAPONS = [VX9, RAPTOR, HAMMER, SABER, TITAN];
export const WEAPON_BY_NAME = Object.freeze(Object.fromEntries([VX9, RAPTOR, HAMMER, SABER, TITAN].map((weapon) => [weapon.name, weapon])));

export function advanceGunGameTier(currentTier, weaponCount) {
  return Math.min(Math.max(0, weaponCount - 1), currentTier + 1);
}

export function damageAtRange(definition, distance) {
  if (distance <= definition.falloffStart) return definition.damage;
  if (distance >= definition.falloffEnd) return Math.round(definition.damage * definition.falloffMin);
  const ratio = (distance - definition.falloffStart) / (definition.falloffEnd - definition.falloffStart);
  return Math.round(definition.damage * (definition.falloffMin + ratio * (1 - definition.falloffMin)));
}

export const ARMOR_MAX = 100;
export const ARMOR_ABSORPTION_RATIO = 0.6;
export const SHOT_EVENT_THROTTLE_MS = 120;

export function shotEventDue(lastAt, now, throttleMs = SHOT_EVENT_THROTTLE_MS) {
  return lastAt <= 0 || now - lastAt >= throttleMs;
}

export function applyArmorDamage(health, armor, damage, ratio = ARMOR_ABSORPTION_RATIO) {
  const armorPool = Math.max(0, armor);
  const absorbed = Math.min(armorPool, damage * ratio);
  const remaining = Math.max(0, damage - absorbed);
  return { health: Math.max(0, health - remaining), armor: Math.max(0, armorPool - absorbed), absorbed };
}

export function weaponMetrics(definition, targetHealth = 100) {
  const shotsToKill = Math.max(1, Math.ceil(targetHealth / definition.damage));
  const timeToKillMs = (shotsToKill - 1) * definition.fireRate;
  const damagePerSecond = Math.round((1000 / definition.fireRate) * definition.damage);
  const cycleMs = definition.maxAmmo * definition.fireRate + definition.reloadTime;
  const sustainedDamagePerSecond = Math.round((definition.damage * definition.maxAmmo / cycleMs) * 1000);
  return { shotsToKill, timeToKillMs, damagePerSecond, sustainedDamagePerSecond };
}

export class WeaponState {
  constructor(definition = VX9) {
    this.def = { ...definition };
    this.ammo = this.def.maxAmmo;
    this.fireUntil = 0;
    this.reloadUntil = 0;
  }

  canShoot(now) { return now >= this.fireUntil && now >= this.reloadUntil && this.ammo > 0; }

  shoot(now) {
    if (!this.canShoot(now)) return false;
    this.ammo -= 1;
    this.fireUntil = now + this.def.fireRate;
    return true;
  }

  reload(now) {
    if (now < this.reloadUntil || this.ammo === this.def.maxAmmo) return false;
    this.reloadUntil = now + this.def.reloadTime;
    return true;
  }

  update(now) {
    if (this.reloadUntil && now >= this.reloadUntil) {
      this.ammo = this.def.maxAmmo;
      this.reloadUntil = 0;
    }
  }

  refill() { this.ammo = this.def.maxAmmo; this.fireUntil = 0; this.reloadUntil = 0; }
}

// A 2D adaptation of Browser Shooter's player raycast: first target intersecting the server-side hit cylinder wins.
export function resolveHitscan(attacker, players, canDamage = () => true, obstacles = []) {
  const direction = { x: -Math.sin(attacker.yaw), z: -Math.cos(attacker.yaw) };
  let closest = null;
  let blocked = false;
  let shieldedTargetId = null;
  let shieldedDistance = Infinity;
  const firstBlock = firstRayBlockDistance({ x: attacker.x, z: attacker.z }, direction, obstacles);
  for (const target of players.values()) {
    if (target.id === attacker.id || !target.alive) continue;
    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    const distance = dx * direction.x + dz * direction.z;
    if (distance <= 0 || distance > attacker.weapon.def.range) continue;
    const perpendicular = Math.abs(dx * direction.z - dz * direction.x);
    if (perpendicular > attacker.weapon.def.hitRadius) continue;
    if (isRayBlocked({ x: attacker.x, z: attacker.z }, direction, distance, obstacles)) { blocked = true; continue; }
    if (!canDamage(attacker, target)) {
      if (distance < shieldedDistance) {
        shieldedDistance = distance;
        shieldedTargetId = target.id;
      }
      continue;
    }
    if (!closest || distance < closest.distance) closest = { target, distance };
  }
  return { target: closest?.target ?? null, distance: closest?.distance ?? null, blocked: blocked || (closest === null && firstBlock < attacker.weapon.def.range), shieldedTargetId };
}

export function findHitscanTarget(attacker, players, canDamage = () => true, obstacles = []) {
  return resolveHitscan(attacker, players, canDamage, obstacles).target;
}
