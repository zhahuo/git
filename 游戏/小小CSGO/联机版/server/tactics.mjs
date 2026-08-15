export function squadFormationPoint(target, slotIndex, squadSize, radius = 9) {
  if (squadSize <= 1) return { x: target.x, z: target.z };
  const safeSize = Math.max(1, Math.floor(squadSize));
  const angle = (Math.max(0, Math.floor(slotIndex)) / safeSize) * Math.PI * 2 + Math.PI / 2;
  return { x: target.x + Math.cos(angle) * radius, z: target.z + Math.sin(angle) * radius };
}

export function tacticalDestination(bot, target, squadSize, preferredRange = 13, minRange = 7) {
  const distance = Math.hypot(target.x - bot.x, target.z - bot.z);
  const formation = squadFormationPoint(target, bot.botSpawnSlot ?? 0, squadSize, 9);
  if (distance < minRange) {
    const dx = bot.x - target.x;
    const dz = bot.z - target.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: bot.x + (dx / length) * 6, z: bot.z + (dz / length) * 6 };
  }
  if (distance > preferredRange) return formation;
  const formationDistance = Math.hypot(formation.x - bot.x, formation.z - bot.z);
  return formationDistance > 3 ? formation : { x: target.x, z: target.z };
}

export function squadSpread(positions) {
  let closest = Infinity;
  for (let first = 0; first < positions.length; first += 1) {
    for (let second = first + 1; second < positions.length; second += 1) {
      closest = Math.min(closest, Math.hypot(positions[first].x - positions[second].x, positions[first].z - positions[second].z));
    }
  }
  return positions.length < 2 ? Infinity : closest;
}
