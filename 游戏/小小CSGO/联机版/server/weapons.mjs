import { GUN_GAME_WEAPONS, weaponMetrics } from './combat.mjs';

export const WEAPON_RULES = Object.freeze({
  minDamage: 1,
  maxDamage: 200,
  minFireRateMs: 50,
  maxFireRateMs: 2000,
  minRange: 10,
  maxRange: 200,
  minHitRadius: 0.1,
  maxHitRadius: 2,
  minMaxAmmo: 1,
  maxMaxAmmo: 200,
  minReloadMs: 200,
  maxReloadMs: 10000,
  minFalloffMin: 0.05,
  maxFalloffMin: 1,
});

export function validateWeaponDefinition(definition, rules = WEAPON_RULES) {
  const problems = [];
  if (!definition || typeof definition !== 'object' || typeof definition.name !== 'string' || definition.name.length < 1 || definition.name.length > 24) problems.push('name');
  if (!Number.isFinite(definition?.damage) || definition.damage < rules.minDamage || definition.damage > rules.maxDamage) problems.push('damage');
  if (!Number.isFinite(definition?.fireRate) || definition.fireRate < rules.minFireRateMs || definition.fireRate > rules.maxFireRateMs) problems.push('fireRate');
  if (!Number.isFinite(definition?.range) || definition.range < rules.minRange || definition.range > rules.maxRange) problems.push('range');
  if (!Number.isFinite(definition?.hitRadius) || definition.hitRadius < rules.minHitRadius || definition.hitRadius > rules.maxHitRadius) problems.push('hitRadius');
  if (!Number.isInteger(definition?.maxAmmo) || definition.maxAmmo < rules.minMaxAmmo || definition.maxAmmo > rules.maxMaxAmmo) problems.push('maxAmmo');
  if (!Number.isFinite(definition?.reloadTime) || definition.reloadTime < rules.minReloadMs || definition.reloadTime > rules.maxReloadMs) problems.push('reloadTime');
  if (!Number.isFinite(definition?.falloffStart) || !Number.isFinite(definition?.falloffEnd) || definition.falloffStart < 0 || definition.falloffEnd <= definition.falloffStart || definition.falloffEnd > definition.range) problems.push('falloff');
  if (!Number.isFinite(definition?.falloffMin) || definition.falloffMin < rules.minFalloffMin || definition.falloffMin > rules.maxFalloffMin) problems.push('falloffMin');
  return { ok: problems.length === 0, problems };
}

export function validateWeaponRegistry(definitions, rules = WEAPON_RULES) {
  if (!Array.isArray(definitions) || definitions.length === 0) return { ok: false, problems: ['empty'] };
  const problems = [];
  const seen = new Set();
  for (const definition of definitions) {
    const result = validateWeaponDefinition(definition, rules);
    if (!result.ok) problems.push(`${definition?.name ?? '?'}:${result.problems.join(',')}`);
    if (typeof definition?.name === 'string') {
      if (seen.has(definition.name)) problems.push(`duplicate:${definition.name}`);
      seen.add(definition.name);
    }
  }
  return { ok: problems.length === 0, problems };
}

export const WEAPON_REGISTRY = Object.freeze([...GUN_GAME_WEAPONS].map((weapon) => Object.freeze({ ...weapon })));

export function weaponMetricsSummary(definitions = WEAPON_REGISTRY) {
  return definitions.map((definition) => ({ name: definition.name, ...weaponMetrics(definition) }));
}

export const WEAPON_METRICS = Object.freeze(weaponMetricsSummary());

const registryCheck = validateWeaponRegistry(WEAPON_REGISTRY);
if (!registryCheck.ok) throw new Error(`invalid weapon registry: ${registryCheck.problems.join('; ')}`);
