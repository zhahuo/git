export const NAV_MARGIN = 0.9;

export function pointClearOfBoxes(x, z, boxes, margin = NAV_MARGIN) {
  return !boxes.some((box) => x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin);
}

export function segmentClear(first, second, boxes, step = 0.5, margin = 0.45) {
  const distance = Math.hypot(second.x - first.x, second.z - first.z);
  const samples = Math.max(1, Math.ceil(distance / step));
  for (let index = 0; index <= samples; index += 1) {
    const ratio = index / samples;
    const x = first.x + (second.x - first.x) * ratio;
    const z = first.z + (second.z - first.z) * ratio;
    if (!pointClearOfBoxes(x, z, boxes, margin)) return false;
  }
  return true;
}

export function buildWaypointGraph(map, margin = 0.45) {
  const waypoints = map.waypoints;
  const adjacency = waypoints.map(() => []);
  for (let first = 0; first < waypoints.length; first += 1) {
    for (let second = first + 1; second < waypoints.length; second += 1) {
      if (segmentClear(waypoints[first], waypoints[second], map.boxes, 0.5, margin)) {
        adjacency[first].push(second);
        adjacency[second].push(first);
      }
    }
  }
  return adjacency;
}

export function nearestWaypoint(position, map) {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < map.waypoints.length; index += 1) {
    const distance = Math.hypot(map.waypoints[index].x - position.x, map.waypoints[index].z - position.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

export function waypointPath(position, target, map, margin = 0.45) {
  if (segmentClear(position, target, map.boxes, 0.5, margin)) return [];
  const adjacency = buildWaypointGraph(map, margin);
  const start = nearestWaypoint(position, map);
  const goal = nearestWaypoint(target, map);
  const queue = [start];
  const visited = new Set([start]);
  const parent = new Map([[start, null]]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === goal) break;
    for (const next of adjacency[current]) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      queue.push(next);
    }
  }
  const path = [];
  let cursor = goal;
  while (cursor !== null && cursor !== start && parent.has(cursor)) {
    path.unshift(cursor);
    cursor = parent.get(cursor);
  }
  if (path.length === 0) return [goal];
  return path;
}

export function nextWaypointToward(position, target, map, margin = 0.45) {
  const path = waypointPath(position, target, map, margin);
  if (path.length === 0) return null;
  return { index: path[0], x: map.waypoints[path[0]].x, z: map.waypoints[path[0]].z };
}

export function steerBotToward(bot, target, map, now, margin = 0.45) {
  const position = { x: bot.x, z: bot.z };
  const path = waypointPath(position, { x: target.x, z: target.z }, map, margin);
  let destination = target;
  if (path.length > 0) {
    let chosen = null;
    for (let hopIndex = path.length - 1; hopIndex >= 0; hopIndex -= 1) {
      const hop = map.waypoints[path[hopIndex]];
      if (!segmentClear(position, hop, map.boxes, 0.5, margin)) continue;
      chosen = hop;
      break;
    }
    if (!chosen) {
      const ordered = map.waypoints
        .map((waypoint) => ({ waypoint, distance: Math.hypot(waypoint.x - position.x, waypoint.z - position.z) }))
        .sort((first, second) => first.distance - second.distance);
      const clear = ordered.find(({ waypoint }) => segmentClear(position, waypoint, map.boxes, 0.5, margin));
      if (clear) chosen = clear.waypoint;
    }
    if (chosen) destination = chosen;
  }
  const dx = destination.x - position.x;
  const dz = destination.z - position.z;
  const distance = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  return { forward: distance > 1 ? 1 : 0, right: 0, yaw, sprint: distance > 14 };
}
