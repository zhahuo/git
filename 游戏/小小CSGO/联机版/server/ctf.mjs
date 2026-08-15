export const FLAG_PICKUP_RADIUS = 1.8;
export const FLAG_CAPTURE_RADIUS = 2.4;
export const FLAG_RETURN_RADIUS = 2.0;
export const CARRIER_SPEED_SCALE = 0.72;
export const DEFAULT_CTF_SCORE_LIMIT = 3;

export function carrierSpeed(baseSpeed, carrying) {
  return carrying ? baseSpeed * CARRIER_SPEED_SCALE : baseSpeed;
}

export function enemyTeam(team) {
  return team === 'ct' ? 't' : team === 't' ? 'ct' : null;
}

export function createCtfState(map) {
  const base = (team) => {
    const point = map?.ctfBase?.[team] ?? { x: 0, z: 0 };
    return { holder: null, x: point.x, z: point.z, baseX: point.x, baseZ: point.z, dropAt: 0 };
  };
  return { ct: base('ct'), t: base('t') };
}

export function resetFlags(state, map) {
  const fresh = createCtfState(map);
  state.ct = fresh.ct;
  state.t = fresh.t;
  return state;
}

export function flagsSnapshot(state) {
  return {
    ct: { holder: state.ct.holder, x: state.ct.x, z: state.ct.z, baseX: state.ct.baseX, baseZ: state.ct.baseZ, dropAt: state.ct.dropAt ?? 0 },
    t: { holder: state.t.holder, x: state.t.x, z: state.t.z, baseX: state.t.baseX, baseZ: state.t.baseZ, dropAt: state.t.dropAt ?? 0 },
  };
}

export function flagHeldBy(state, playerId) {
  return state.ct.holder === playerId ? 'ct' : state.t.holder === playerId ? 't' : null;
}

export function carrierOf(state, flagTeam) {
  return state[flagTeam]?.holder ?? null;
}

export function followHolders(state, players) {
  const byId = new Map(players.map((player) => [player.id, player]));
  for (const team of ['ct', 't']) {
    const flag = state[team];
    if (flag.holder) {
      const holder = byId.get(flag.holder);
      if (holder) {
        flag.x = holder.x;
        flag.z = holder.z;
      }
    }
  }
  return state;
}

export function dropCarriedFlag(state, playerId, at = null, now = 0) {
  const carried = flagHeldBy(state, playerId);
  if (!carried) return null;
  const flag = state[carried];
  flag.holder = null;
  if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) {
    flag.x = at.x;
    flag.z = at.z;
    flag.dropAt = now;
  } else {
    flag.x = flag.baseX;
    flag.z = flag.baseZ;
    flag.dropAt = 0;
  }
  return carried;
}

export function dropCarriedFlagSafe(state, playerId, at, map, now = 0) {
  const carried = dropCarriedFlag(state, playerId, at, now);
  if (!carried) return null;
  const flag = state[carried];
  const insideCollider = map?.boxes?.some((box) => flag.x > box.minX - 0.2 && flag.x < box.maxX + 0.2 && flag.z > box.minZ - 0.2 && flag.z < box.maxZ + 0.2);
  const outsideBounds = !map?.bounds || flag.x < map.bounds.minX || flag.x > map.bounds.maxX || flag.z < map.bounds.minZ || flag.z > map.bounds.maxZ;
  if (insideCollider || outsideBounds) {
    flag.x = flag.baseX;
    flag.z = flag.baseZ;
    flag.dropAt = 0;
  }
  return carried;
}

export function returnFlag(state, flagTeam) {
  const flag = state[flagTeam];
  if (!flag) return false;
  flag.holder = null;
  flag.x = flag.baseX;
  flag.z = flag.baseZ;
  flag.dropAt = 0;
  return true;
}

export function autoReturnDue(state, team, now, returnMs) {
  const flag = state[team];
  if (!flag || flag.holder !== null || (flag.dropAt ?? 0) <= 0) return false;
  return now - flag.dropAt >= returnMs;
}

export function returnInMs(flag, now, returnMs) {
  if (!flag || flag.holder !== null || (flag.dropAt ?? 0) <= 0) return 0;
  return Math.max(0, flag.dropAt + returnMs - now);
}

export function resolveCtfContacts(room, state, players) {
  const actions = [];
  for (const player of players) {
    if (!player.alive || player.spectator || player.team === 'solo') continue;
    const enemy = enemyTeam(player.team);
    if (!enemy) continue;
    const enemyFlag = state[enemy];
    const ownFlag = state[player.team];
    // Return a dropped own flag by standing on it.
    const ownFlagDropped = ownFlag && ownFlag.holder === null && (ownFlag.x !== ownFlag.baseX || ownFlag.z !== ownFlag.baseZ);
    if (ownFlagDropped && Math.hypot(player.x - ownFlag.x, player.z - ownFlag.z) <= FLAG_RETURN_RADIUS) {
      returnFlag(state, player.team);
      actions.push({ type: 'return', flagTeam: player.team, playerId: player.id, playerTeam: player.team });
      continue;
    }
    const carried = flagHeldBy(state, player.id);
    if (carried === null && enemyFlag?.holder === null && Math.hypot(player.x - enemyFlag.x, player.z - enemyFlag.z) <= FLAG_PICKUP_RADIUS) {
      enemyFlag.holder = player.id;
      enemyFlag.x = player.x;
      enemyFlag.z = player.z;
      enemyFlag.dropAt = 0;
      actions.push({ type: 'pickup', flagTeam: enemy, playerId: player.id, playerTeam: player.team });
      continue;
    }
    if (carried === enemy && ownFlag) {
      const baseX = ownFlag.baseX;
      const baseZ = ownFlag.baseZ;
      const ownFlagHome = ownFlag.holder === null && ownFlag.x === ownFlag.baseX && ownFlag.z === ownFlag.baseZ;
      if (ownFlagHome && Math.hypot(player.x - baseX, player.z - baseZ) <= FLAG_CAPTURE_RADIUS) {
        actions.push({ type: 'capture', flagTeam: enemy, playerId: player.id, playerTeam: player.team });
      }
    }
  }
  return actions;
}

export function applyCapture(room, state, map, action) {
  room.teamScores[action.playerTeam] += 1;
  resetFlags(state, map);
  return action;
}
