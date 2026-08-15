export const PLAYER_RADIUS = 0.45;

// Keep this list aligned with the fixed cover meshes in Arena.tsx.
export const COLLISION_BOXES = Object.freeze([
  Object.freeze({ minX: -10.5, maxX: -5.5, minZ: -5.5, maxZ: -4.5 }),
  Object.freeze({ minX: 6.5, maxX: 7.5, minZ: -13, maxZ: -7 }),
  Object.freeze({ minX: -16, maxX: -10, minZ: -20.5, maxZ: -19.5 }),
  Object.freeze({ minX: 7, maxX: 13, minZ: -25.5, maxZ: -24.5 }),
  Object.freeze({ minX: -0.5, maxX: 0.5, minZ: -38, maxZ: -30 }),
]);

export function resolveMovement(player, nextX, nextZ, boxes = COLLISION_BOXES, radius = PLAYER_RADIUS) {
  let resolvedX = nextX;
  let resolvedZ = nextZ;
  for (const box of boxes) {
    const minX = box.minX - radius;
    const maxX = box.maxX + radius;
    const minZ = box.minZ - radius;
    const maxZ = box.maxZ + radius;
    if (resolvedZ >= minZ && resolvedZ <= maxZ && resolvedX > minX && resolvedX < maxX) resolvedX = player.x <= minX ? minX : maxX;
  }
  for (const box of boxes) {
    const minX = box.minX - radius;
    const maxX = box.maxX + radius;
    const minZ = box.minZ - radius;
    const maxZ = box.maxZ + radius;
    if (resolvedX >= minX && resolvedX <= maxX && resolvedZ > minZ && resolvedZ < maxZ) resolvedZ = player.z <= minZ ? minZ : maxZ;
  }
  return { x: resolvedX, z: resolvedZ };
}

export function rayEntryDistance(origin, direction, box) {
  const axisEntry = (position, velocity, min, max) => {
    if (Math.abs(velocity) < 1e-8) return position >= min && position <= max ? -Infinity : Infinity;
    const first = (min - position) / velocity;
    const second = (max - position) / velocity;
    return Math.min(first, second);
  };
  const axisExit = (position, velocity, min, max) => {
    if (Math.abs(velocity) < 1e-8) return position >= min && position <= max ? Infinity : -Infinity;
    const first = (min - position) / velocity;
    const second = (max - position) / velocity;
    return Math.max(first, second);
  };
  const entry = Math.max(axisEntry(origin.x, direction.x, box.minX, box.maxX), axisEntry(origin.z, direction.z, box.minZ, box.maxZ));
  const exit = Math.min(axisExit(origin.x, direction.x, box.minX, box.maxX), axisExit(origin.z, direction.z, box.minZ, box.maxZ));
  return exit >= Math.max(0, entry) ? Math.max(0, entry) : null;
}

export function isRayBlocked(origin, direction, maxDistance, boxes = COLLISION_BOXES) {
  return firstRayBlockDistance(origin, direction, boxes) < maxDistance - 1e-4;
}

export function firstRayBlockDistance(origin, direction, boxes = COLLISION_BOXES) {
  let closest = Infinity;
  for (const box of boxes) {
    const entry = rayEntryDistance(origin, direction, box);
    if (entry !== null && entry < closest) closest = entry;
  }
  return closest;
}
