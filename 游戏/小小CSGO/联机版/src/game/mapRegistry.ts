import { PLAYER_RADIUS, resolveMovement } from '../../server/geometry.mjs';
import { MAPS, mapById } from '../../server/maps.mjs';

export type MapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type MapCollider = { minX: number; maxX: number; minZ: number; maxZ: number };
export type MapSpawn = { x: number; z: number };
export type MapPickup = { id: string; kind: 'health' | 'ammo'; x: number; z: number };
export type MapWaypoint = { x: number; z: number };
export type MapCtfBase = { ct: MapSpawn; t: MapSpawn };
export type MapDefinition = { id: string; name: string; bounds: MapBounds; boxes: MapCollider[]; spawnSlots: MapSpawn[]; ctfBase: MapCtfBase; pickups: MapPickup[]; waypoints: MapWaypoint[] };

export type SceneFloor = { centerX: number; centerZ: number; width: number; depth: number };
export type SceneCollider = { x: number; y: number; z: number; sx: number; sy: number; sz: number };

export const MAP_DEFINITIONS: readonly MapDefinition[] = MAPS;

export function mapDefinitionById(id: string): MapDefinition {
  return mapById(id);
}

export function floorGeometry(map: MapDefinition): SceneFloor {
  return {
    centerX: (map.bounds.minX + map.bounds.maxX) / 2,
    centerZ: (map.bounds.minZ + map.bounds.maxZ) / 2,
    width: map.bounds.maxX - map.bounds.minX,
    depth: map.bounds.maxZ - map.bounds.minZ,
  };
}

export function colliderToScene(box: MapCollider, height = 3): SceneCollider {
  return {
    x: (box.minX + box.maxX) / 2,
    y: height / 2,
    z: (box.minZ + box.maxZ) / 2,
    sx: box.maxX - box.minX,
    sy: height,
    sz: box.maxZ - box.minZ,
  };
}

export function clampToBounds(x: number, z: number, map: MapDefinition): { x: number; z: number } {
  return {
    x: Math.max(map.bounds.minX, Math.min(map.bounds.maxX, x)),
    z: Math.max(map.bounds.minZ, Math.min(map.bounds.maxZ, z)),
  };
}

export function resolveLocalCollision(
  position: { x: number; z: number },
  nextX: number,
  nextZ: number,
  map: MapDefinition,
): { x: number; z: number } {
  return resolveMovement(position, nextX, nextZ, map.boxes, PLAYER_RADIUS);
}
