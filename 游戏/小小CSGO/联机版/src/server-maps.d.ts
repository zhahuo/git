declare module '*/server/maps.mjs' {
  export type MapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
  export type MapCollider = { minX: number; maxX: number; minZ: number; maxZ: number };
  export type MapSpawn = { x: number; z: number };
  export type MapPickup = { id: string; kind: 'health' | 'ammo'; x: number; z: number };
  export type MapWaypoint = { x: number; z: number };
  export type MapCtfBase = { ct: MapSpawn; t: MapSpawn };
  export interface MapDefinition {
    id: string;
    name: string;
    bounds: MapBounds;
    boxes: MapCollider[];
    spawnSlots: MapSpawn[];
    ctfBase: MapCtfBase;
    pickups: MapPickup[];
    waypoints: MapWaypoint[];
  }
  export const MAPS: readonly MapDefinition[];
  export function mapById(id: string): MapDefinition;
  export function selectMap(index: number): MapDefinition;
}

declare module '*/server/geometry.mjs' {
  export const PLAYER_RADIUS: number;
  export const COLLISION_BOXES: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[];
  export function resolveMovement(
    player: { x: number; z: number },
    nextX: number,
    nextZ: number,
    boxes?: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[],
    radius?: number,
  ): { x: number; z: number };
}

declare module '*/server/ctf.mjs' {
  export const FLAG_PICKUP_RADIUS: number;
  export const FLAG_CAPTURE_RADIUS: number;
  export const FLAG_RETURN_RADIUS: number;
  export const CARRIER_SPEED_SCALE: number;
  export const DEFAULT_CTF_SCORE_LIMIT: number;
  export function carrierSpeed(baseSpeed: number, carrying: boolean): number;
}
