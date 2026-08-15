import { COLLISION_BOXES } from './geometry.mjs';
import { validateControlPoints } from './domination.mjs';

export const MAPS = Object.freeze([
  Object.freeze({
    id: 'strike',
    name: 'STRIKE',
    bounds: Object.freeze({ minX: -23, maxX: 23, minZ: -48, maxZ: 20 }),
    boxes: Object.freeze(COLLISION_BOXES.map((box) => Object.freeze({ ...box }))),
    spawnSlots: Object.freeze([{ x: -5, z: 10 }, { x: 5, z: 10 }, { x: -6.5, z: 7 }, { x: 6.5, z: 7 }, { x: 0, z: 13 }]),
    ctfBase: Object.freeze({ ct: Object.freeze({ x: -12, z: -38 }), t: Object.freeze({ x: 12, z: -38 }) }),
    pickups: Object.freeze([
      Object.freeze({ id: 'med-1', kind: 'health', x: -5, z: 10 }),
      Object.freeze({ id: 'ammo-1', kind: 'ammo', x: 12, z: -24 }),
      Object.freeze({ id: 'armor-1', kind: 'armor', x: -5, z: 12.5 }),
      Object.freeze({ id: 'mega-1', kind: 'health', value: 75, x: -5, z: 7.5 }),
    ]),
    weapons: Object.freeze([
      Object.freeze({ id: 'w1', weapon: 'RAPTOR', x: 12, z: -24 }),
      Object.freeze({ id: 'w2', weapon: 'HAMMER', x: -12, z: -24 }),
    ]),
    controlPoints: Object.freeze([
      Object.freeze({ id: 'A', x: -14, z: -24 }),
      Object.freeze({ id: 'B', x: 0, z: -28 }),
      Object.freeze({ id: 'C', x: 14, z: -24 }),
    ]),
    waypoints: Object.freeze([
      Object.freeze({ x: -5, z: 10 }), Object.freeze({ x: 5, z: 10 }), Object.freeze({ x: -14, z: 2 }),
      Object.freeze({ x: 14, z: 2 }), Object.freeze({ x: 0, z: -1 }), Object.freeze({ x: -18, z: -14 }),
      Object.freeze({ x: 18, z: -14 }), Object.freeze({ x: -14, z: -24 }), Object.freeze({ x: 14, z: -24 }),
      Object.freeze({ x: 0, z: -28 }), Object.freeze({ x: -14, z: -38 }), Object.freeze({ x: 14, z: -38 }),
      Object.freeze({ x: 0, z: -46 }),
    ]),
  }),
  Object.freeze({
    id: 'crossfire',
    name: 'CROSSFIRE',
    bounds: Object.freeze({ minX: -18, maxX: 18, minZ: -36, maxZ: 16 }),
    boxes: Object.freeze([
      Object.freeze({ minX: -3.5, maxX: 3.5, minZ: -8, maxZ: -6 }),
      Object.freeze({ minX: -3.5, maxX: 3.5, minZ: 2, maxZ: 4 }),
      Object.freeze({ minX: -9, maxX: -5, minZ: -5, maxZ: -4 }),
      Object.freeze({ minX: -12, maxX: -8, minZ: -20, maxZ: -19 }),
      Object.freeze({ minX: 8, maxX: 12, minZ: -20, maxZ: -19 }),
    ]),
    spawnSlots: Object.freeze([{ x: -12, z: 10 }, { x: 12, z: 10 }, { x: -13.5, z: 7 }, { x: 13.5, z: 7 }, { x: 0, z: 13 }]),
    ctfBase: Object.freeze({ ct: Object.freeze({ x: -12, z: -30 }), t: Object.freeze({ x: 12, z: -30 }) }),
    pickups: Object.freeze([
      Object.freeze({ id: 'med-1', kind: 'health', x: -12, z: 10 }),
      Object.freeze({ id: 'ammo-1', kind: 'ammo', x: 0, z: -20 }),
      Object.freeze({ id: 'armor-1', kind: 'armor', x: -12, z: 12.5 }),
      Object.freeze({ id: 'mega-1', kind: 'health', value: 75, x: -12, z: 7.5 }),
    ]),
    weapons: Object.freeze([
      Object.freeze({ id: 'w1', weapon: 'RAPTOR', x: 0, z: -20 }),
      Object.freeze({ id: 'w2', weapon: 'HAMMER', x: -12, z: 10 }),
    ]),
    controlPoints: Object.freeze([
      Object.freeze({ id: 'A', x: -12, z: -10 }),
      Object.freeze({ id: 'B', x: 0, z: 0 }),
      Object.freeze({ id: 'C', x: 12, z: -10 }),
    ]),
    waypoints: Object.freeze([
      Object.freeze({ x: -12, z: 10 }), Object.freeze({ x: 12, z: 10 }), Object.freeze({ x: 0, z: 12 }),
      Object.freeze({ x: 0, z: 0 }), Object.freeze({ x: 0, z: -10 }), Object.freeze({ x: -12, z: -10 }),
      Object.freeze({ x: 12, z: -10 }), Object.freeze({ x: 0, z: -20 }), Object.freeze({ x: -12, z: -30 }),
      Object.freeze({ x: 12, z: -30 }), Object.freeze({ x: 0, z: -30 }),
    ]),
  }),
  Object.freeze({
    id: 'rustyard',
    name: 'RUSTYARD',
    bounds: Object.freeze({ minX: -20, maxX: 20, minZ: -30, maxZ: 22 }),
    boxes: Object.freeze([
      Object.freeze({ minX: -18, maxX: -14, minZ: -27, maxZ: -24 }),
      Object.freeze({ minX: 14, maxX: 18, minZ: -27, maxZ: -24 }),
      Object.freeze({ minX: -14, maxX: -11, minZ: -20, maxZ: -18 }),
      Object.freeze({ minX: 11, maxX: 14, minZ: -20, maxZ: -18 }),
      Object.freeze({ minX: -9, maxX: -6, minZ: -10, maxZ: -6 }),
      Object.freeze({ minX: 6, maxX: 9, minZ: -10, maxZ: -6 }),
      Object.freeze({ minX: -1.5, maxX: 1.5, minZ: -16, maxZ: -12 }),
      Object.freeze({ minX: -1.5, maxX: 1.5, minZ: -5, maxZ: -1 }),
      Object.freeze({ minX: -14, maxX: -11, minZ: 8, maxZ: 11 }),
      Object.freeze({ minX: 11, maxX: 14, minZ: 8, maxZ: 11 }),
      Object.freeze({ minX: -18, maxX: -14, minZ: 16, maxZ: 19 }),
      Object.freeze({ minX: 14, maxX: 18, minZ: 16, maxZ: 19 }),
    ]),
    spawnSlots: Object.freeze([{ x: -18, z: 5 }, { x: 18, z: 5 }, { x: -6, z: -20 }, { x: 6, z: -20 }, { x: 0, z: 14 }]),
    ctfBase: Object.freeze({ ct: Object.freeze({ x: -7, z: -26 }), t: Object.freeze({ x: 7, z: 18 }) }),
    pickups: Object.freeze([
      Object.freeze({ id: 'med-1', kind: 'health', x: -18, z: 5 }),
      Object.freeze({ id: 'med-2', kind: 'health', x: 18, z: -20 }),
      Object.freeze({ id: 'ammo-1', kind: 'ammo', x: 0, z: -20 }),
      Object.freeze({ id: 'ammo-2', kind: 'ammo', x: 0, z: 5 }),
      Object.freeze({ id: 'armor-1', kind: 'armor', x: -18, z: 7.5 }),
      Object.freeze({ id: 'mega-1', kind: 'health', value: 75, x: -18, z: 2.5 }),
    ]),
    weapons: Object.freeze([
      Object.freeze({ id: 'w1', weapon: 'RAPTOR', x: 0, z: -20 }),
      Object.freeze({ id: 'w2', weapon: 'HAMMER', x: 0, z: 5 }),
    ]),
    controlPoints: Object.freeze([
      Object.freeze({ id: 'A', x: -12, z: -28 }),
      Object.freeze({ id: 'B', x: 0, z: -8 }),
      Object.freeze({ id: 'C', x: 12, z: -28 }),
    ]),
    waypoints: Object.freeze([
      Object.freeze({ x: -12, z: -28 }), Object.freeze({ x: 0, z: -28 }), Object.freeze({ x: 12, z: -28 }),
      Object.freeze({ x: -18, z: -20 }), Object.freeze({ x: -9, z: -20 }), Object.freeze({ x: 0, z: -20 }),
      Object.freeze({ x: 9, z: -20 }), Object.freeze({ x: 18, z: -20 }),
      Object.freeze({ x: -18, z: -8 }), Object.freeze({ x: -12, z: -8 }), Object.freeze({ x: 0, z: -8 }),
      Object.freeze({ x: 12, z: -8 }), Object.freeze({ x: 18, z: -8 }),
      Object.freeze({ x: -18, z: -2 }), Object.freeze({ x: -12, z: -2 }), Object.freeze({ x: -6, z: -2 }),
      Object.freeze({ x: 6, z: -2 }), Object.freeze({ x: 12, z: -2 }), Object.freeze({ x: 18, z: -2 }),
      Object.freeze({ x: -18, z: 5 }), Object.freeze({ x: -12, z: 5 }), Object.freeze({ x: -6, z: 5 }),
      Object.freeze({ x: 0, z: 5 }), Object.freeze({ x: 6, z: 5 }), Object.freeze({ x: 12, z: 5 }),
      Object.freeze({ x: 18, z: 5 }),
      Object.freeze({ x: -18, z: 14 }), Object.freeze({ x: -12, z: 14 }), Object.freeze({ x: -6, z: 14 }),
      Object.freeze({ x: 0, z: 14 }), Object.freeze({ x: 6, z: 14 }), Object.freeze({ x: 12, z: 14 }),
      Object.freeze({ x: 18, z: 14 }),
      Object.freeze({ x: -18, z: 21 }), Object.freeze({ x: 0, z: 21 }), Object.freeze({ x: 18, z: 21 }),
    ]),
  }),
]);

export const MAP_WEAPON_NAMES = Object.freeze(['VX-9', 'RAPTOR', 'HAMMER', 'SABER', 'TITAN']);

function inBounds(bounds, x, z) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function validateMap(map) {
  const problems = [];
  if (!map || typeof map.id !== 'string' || map.id.length < 1 || map.id.length > 24) problems.push('id');
  if (!map || typeof map.name !== 'string' || map.name.length < 1 || map.name.length > 24) problems.push('name');
  if (!map?.bounds || !Number.isFinite(map.bounds.minX) || !Number.isFinite(map.bounds.maxX) || !Number.isFinite(map.bounds.minZ) || !Number.isFinite(map.bounds.maxZ) || map.bounds.minX >= map.bounds.maxX || map.bounds.minZ >= map.bounds.maxZ) problems.push('bounds');
  if (!Array.isArray(map?.boxes) || map.boxes.length === 0) problems.push('boxes');
  if (Array.isArray(map?.boxes)) {
    for (const box of map.boxes) {
      if (!box || !Number.isFinite(box.minX) || !Number.isFinite(box.maxX) || !Number.isFinite(box.minZ) || !Number.isFinite(box.maxZ) || box.minX >= box.maxX || box.minZ >= box.maxZ) { problems.push('box'); break; }
      if (map.bounds && (box.minX < map.bounds.minX || box.maxX > map.bounds.maxX || box.minZ < map.bounds.minZ || box.maxZ > map.bounds.maxZ)) { problems.push('boxOutsideBounds'); break; }
    }
  }
  if (!Array.isArray(map?.spawnSlots) || map.spawnSlots.length === 0) problems.push('spawnSlots');
  if (Array.isArray(map?.spawnSlots)) {
    for (const slot of map.spawnSlots) {
      if (!slot || !Number.isFinite(slot.x) || !Number.isFinite(slot.z) || !map?.bounds || !inBounds(map.bounds, slot.x, slot.z)) { problems.push('spawnOutsideBounds'); break; }
    }
  }
  if (!map?.ctfBase || !map.ctfBase.ct || !map.ctfBase.t) problems.push('ctfBase');
  if (map?.ctfBase?.ct && map?.ctfBase?.t) {
    for (const team of ['ct', 't']) {
      const base = map.ctfBase[team];
      if (!base || !Number.isFinite(base.x) || !Number.isFinite(base.z) || !map?.bounds || !inBounds(map.bounds, base.x, base.z)) { problems.push('ctfBaseOutsideBounds'); break; }
    }
    if (problems.length === 0 && Math.hypot(map.ctfBase.ct.x - map.ctfBase.t.x, map.ctfBase.ct.z - map.ctfBase.t.z) < 12) problems.push('ctfBasesTooClose');
  }
  if (!Array.isArray(map?.pickups) || map.pickups.length === 0) problems.push('pickups');
  if (Array.isArray(map?.pickups)) {
    const ids = new Set();
    for (const pickup of map.pickups) {
      if (!pickup || typeof pickup.id !== 'string' || pickup.id.length < 1 || pickup.id.length > 24 || ids.has(pickup.id)) { problems.push('pickupId'); break; }
      ids.add(pickup.id);
      if (pickup.kind !== 'health' && pickup.kind !== 'ammo' && pickup.kind !== 'armor') { problems.push('pickupKind'); break; }
      if (pickup.value !== undefined && (!Number.isFinite(pickup.value) || pickup.value < 1 || pickup.value > 100)) { problems.push('pickupValue'); break; }
      if (!Number.isFinite(pickup.x) || !Number.isFinite(pickup.z) || !map?.bounds || !inBounds(map.bounds, pickup.x, pickup.z)) { problems.push('pickupOutsideBounds'); break; }
    }
  }
  if (!Array.isArray(map?.weapons) || map.weapons.length === 0) problems.push('weapons');
  if (Array.isArray(map?.weapons)) {
    const ids = new Set();
    for (const weapon of map.weapons) {
      if (!weapon || typeof weapon.id !== 'string' || weapon.id.length < 1 || weapon.id.length > 24 || ids.has(weapon.id)) { problems.push('weaponId'); break; }
      ids.add(weapon.id);
      if (!MAP_WEAPON_NAMES.includes(weapon.weapon)) { problems.push('weaponName'); break; }
      if (!Number.isFinite(weapon.x) || !Number.isFinite(weapon.z) || !map?.bounds || !inBounds(map.bounds, weapon.x, weapon.z)) { problems.push('weaponOutsideBounds'); break; }
    }
  }
  const controlPointCheck = validateControlPoints(map?.controlPoints, map);
  if (!controlPointCheck.ok) problems.push(...controlPointCheck.problems);
  if (!Array.isArray(map?.waypoints) || map.waypoints.length === 0) problems.push('waypoints');
  if (Array.isArray(map?.waypoints)) {
    for (const waypoint of map.waypoints) {
      if (!waypoint || !Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.z) || !map?.bounds || !inBounds(map.bounds, waypoint.x, waypoint.z)) { problems.push('waypointOutsideBounds'); break; }
      if (Array.isArray(map.boxes) && map.boxes.some((box) => waypoint.x > box.minX - 0.9 && waypoint.x < box.maxX + 0.9 && waypoint.z > box.minZ - 0.9 && waypoint.z < box.maxZ + 0.9)) { problems.push('waypointInCollider'); break; }
    }
  }
  return { ok: problems.length === 0, problems };
}

export function selectMap(index) {
  return MAPS[((index % MAPS.length) + MAPS.length) % MAPS.length];
}

export function mapById(id) {
  return MAPS.find((map) => map.id === id) ?? MAPS[0];
}

export function nextMapId(id) {
  const index = MAPS.findIndex((map) => map.id === id);
  return selectMap(index + 1).id;
}

export const MODE_MAP_POOLS = Object.freeze({
  'free-for-all': Object.freeze(MAPS.map((map) => map.id)),
  'team-deathmatch': Object.freeze(MAPS.map((map) => map.id)),
  'gun-game': Object.freeze(MAPS.map((map) => map.id)),
  'survival': Object.freeze(MAPS.map((map) => map.id)),
  'ctf': Object.freeze(MAPS.map((map) => map.id)),
  'domination': Object.freeze(MAPS.map((map) => map.id)),
  'ranked': Object.freeze(['strike']),
});

export function resolveMapPool(mode, overrideIds = null) {
  const base = MODE_MAP_POOLS[mode] ?? MODE_MAP_POOLS['free-for-all'];
  if (!Array.isArray(overrideIds) || overrideIds.length === 0) return base;
  const ids = overrideIds.filter((id) => MAPS.some((map) => map.id === id));
  return ids.length > 0 ? ids : base;
}

export function selectPoolMap(mode, index, pool = MODE_MAP_POOLS[mode] ?? MODE_MAP_POOLS['free-for-all']) {
  const normalized = pool.length > 0 ? pool : MODE_MAP_POOLS['free-for-all'];
  return normalized[((index % normalized.length) + normalized.length) % normalized.length];
}

export function nextPoolMapId(mode, id, pool = MODE_MAP_POOLS[mode] ?? MODE_MAP_POOLS['free-for-all']) {
  const normalized = pool.length > 0 ? pool : MODE_MAP_POOLS['free-for-all'];
  const index = normalized.indexOf(id);
  return normalized[(index + 1) % normalized.length];
}

export function resolveRequestedMap(mode, requestedId, pool = MODE_MAP_POOLS[mode] ?? MODE_MAP_POOLS['free-for-all']) {
  const normalized = pool.length > 0 ? pool : MODE_MAP_POOLS['free-for-all'];
  if (requestedId && normalized.includes(requestedId) && MAPS.some((map) => map.id === requestedId)) return requestedId;
  return null;
}

export const MAPS_VALID = MAPS.every((map) => validateMap(map).ok);
