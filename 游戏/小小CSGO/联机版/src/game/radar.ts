import type { MapCollider, MapDefinition } from './mapRegistry';

export type RadarPoint = { leftPct: number; topPct: number };
export type RadarRect = RadarPoint & { widthPct: number; heightPct: number };

export function radarScale(map: MapDefinition): number {
  const width = map.bounds.maxX - map.bounds.minX;
  const depth = map.bounds.maxZ - map.bounds.minZ;
  return 100 / Math.max(width, depth);
}

export function worldToRadar(x: number, z: number, map: MapDefinition): RadarPoint {
  const scale = radarScale(map);
  const centerX = (map.bounds.minX + map.bounds.maxX) / 2;
  const centerZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
  return {
    leftPct: 50 + (x - centerX) * scale,
    topPct: 50 - (z - centerZ) * scale,
  };
}

export function colliderToRadar(box: MapCollider, map: MapDefinition): RadarRect {
  const first = worldToRadar(box.minX, box.minZ, map);
  const second = worldToRadar(box.maxX, box.maxZ, map);
  return {
    leftPct: Math.min(first.leftPct, second.leftPct),
    topPct: Math.min(first.topPct, second.topPct),
    widthPct: Math.abs(second.leftPct - first.leftPct),
    heightPct: Math.abs(second.topPct - first.topPct),
  };
}

export function mapOutlineToRadar(map: MapDefinition): RadarRect {
  const first = worldToRadar(map.bounds.minX, map.bounds.minZ, map);
  const second = worldToRadar(map.bounds.maxX, map.bounds.maxZ, map);
  return {
    leftPct: Math.min(first.leftPct, second.leftPct),
    topPct: Math.min(first.topPct, second.topPct),
    widthPct: Math.abs(second.leftPct - first.leftPct),
    heightPct: Math.abs(second.topPct - first.topPct),
  };
}
