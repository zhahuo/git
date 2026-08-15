/*
 * Authoritative domination control-point state machine.
 * Modeled on the classic arena-shooter domination rules researched on GitHub
 * (Xonotic domination.qc: unclaimed points, team capture, contested stalls).
 */

export const DOMINATION_POINT_RADIUS = 3.2;
export const DOMINATION_CAPTURE_MS = 3000;
export const DOMINATION_DECAY_MS = 6000;
export const DOMINATION_SCORE_TICK_MS = 1000;

function inBounds(bounds, x, z) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function createDominationState(points) {
  return points.map((point) => ({
    id: point.id,
    x: point.x,
    z: point.z,
    radius: point.radius ?? DOMINATION_POINT_RADIUS,
    team: null,
    progress: 0,
  }));
}

export function validateControlPoints(points, map) {
  const problems = [];
  if (!Array.isArray(points) || points.length === 0) problems.push('controlPoints');
  if (Array.isArray(points)) {
    const ids = new Set();
    for (const point of points) {
      if (!point || typeof point.id !== 'string' || point.id.length < 1 || point.id.length > 24 || ids.has(point.id)) { problems.push('controlPointId'); break; }
      ids.add(point.id);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || !map?.bounds || !inBounds(map.bounds, point.x, point.z)) { problems.push('controlPointOutsideBounds'); break; }
      if (point.radius !== undefined && (!Number.isFinite(point.radius) || point.radius < 2 || point.radius > 6)) { problems.push('controlPointRadius'); break; }
      if (Array.isArray(map?.boxes) && map.boxes.some((box) => point.x > box.minX - 0.4 && point.x < box.maxX + 0.4 && point.z > box.minZ - 0.4 && point.z < box.maxZ + 0.4)) { problems.push('controlPointInCollider'); break; }
    }
    if (problems.length === 0) {
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          if (Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z) < 8) { problems.push('controlPointsTooClose'); break; }
        }
        if (problems.length > 0) break;
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

export function resolveDominationContacts(domination, players, deltaMs, now = 0) {
  const events = [];
  const livePlayers = players.filter((player) => player?.alive && player?.connected && !player?.spectator);
  for (const point of domination) {
    const present = livePlayers.filter((player) => Math.hypot(player.x - point.x, player.z - point.z) <= point.radius);
    const teams = [...new Set(present.map((player) => player.team).filter((team) => team === 'ct' || team === 't'))];
    if (teams.length === 1) {
      const team = teams[0];
      if (point.team === null) {
        point.progress = Math.min(100, point.progress + (100 / DOMINATION_CAPTURE_MS) * deltaMs);
        if (point.progress >= 100) {
          point.progress = 100;
          point.team = team;
          events.push({ type: 'domination', kind: 'captured', pointId: point.id, team });
        }
      } else if (point.team === team) {
        point.progress = 100;
      } else {
        point.progress = Math.max(0, point.progress - (100 / DOMINATION_CAPTURE_MS) * deltaMs);
        if (point.progress <= 0) {
          point.progress = 0;
          point.team = null;
          events.push({ type: 'domination', kind: 'neutralized', pointId: point.id, team: null });
        }
      }
    } else if (teams.length === 0 && point.team === null) {
      point.progress = Math.max(0, point.progress - (100 / DOMINATION_DECAY_MS) * deltaMs);
    } else if (teams.length > 1) {
      // Contested: no progress in either direction.
    }
  }
  return events;
}

export function dominationSnapshot(domination) {
  return domination.map((point) => ({ id: point.id, x: point.x, z: point.z, radius: point.radius, team: point.team, progress: Math.round(point.progress * 10) / 10 }));
}

export function tickDominationScore(domination, teamScores, accumulator, deltaMs) {
  accumulator.value += deltaMs;
  let scored = false;
  while (accumulator.value >= DOMINATION_SCORE_TICK_MS) {
    accumulator.value -= DOMINATION_SCORE_TICK_MS;
    for (const point of domination) {
      if (point.team) teamScores[point.team] += 1;
    }
    scored = true;
  }
  return scored;
}
