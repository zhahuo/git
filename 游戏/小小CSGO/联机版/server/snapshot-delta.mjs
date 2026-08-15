function changedFields(previous, next, excluded = new Set()) {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => !excluded.has(key) && JSON.stringify(previous[key]) !== JSON.stringify(value)));
}

export function createSnapshotDelta(previous, next) {
  if (!previous || previous.roomId !== next.roomId || !Number.isInteger(previous.snapshotSeq)) return null;
  const previousPlayers = new Map(previous.players.map((player) => [player.id, player]));
  const nextPlayers = new Map(next.players.map((player) => [player.id, player]));
  const players = [...nextPlayers.values()].flatMap((player) => {
    const before = previousPlayers.get(player.id);
    const patch = before ? changedFields(before, player) : player;
    return Object.keys(patch).length > 0 ? [{ id: player.id, ...patch }] : [];
  });
  const removedPlayerIds = [...previousPlayers.keys()].filter((id) => !nextPlayers.has(id));
  return {
    type: 'snapshotDelta',
    protocolVersion: 1,
    roomId: next.roomId,
    baseSnapshotSeq: previous.snapshotSeq,
    snapshotSeq: next.snapshotSeq,
    state: changedFields(previous, next, new Set(['type', 'protocolVersion', 'roomId', 'snapshotSeq', 'players'])),
    players,
    removedPlayerIds,
  };
}

export function applySnapshotDelta(previous, delta) {
  if (!previous || delta?.type !== 'snapshotDelta' || delta.roomId !== previous.roomId || delta.baseSnapshotSeq !== previous.snapshotSeq || !Number.isInteger(delta.snapshotSeq) || delta.snapshotSeq <= previous.snapshotSeq) return null;
  const players = new Map(previous.players.map((player) => [player.id, player]));
  for (const id of delta.removedPlayerIds ?? []) players.delete(id);
  for (const patch of delta.players ?? []) {
    if (typeof patch?.id !== 'string') return null;
    players.set(patch.id, { ...players.get(patch.id), ...patch });
  }
  return { ...previous, ...delta.state, snapshotSeq: delta.snapshotSeq, players: [...players.values()] };
}
