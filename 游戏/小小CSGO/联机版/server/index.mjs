import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { ARMOR_MAX, GUN_GAME_WEAPONS, SHOT_EVENT_THROTTLE_MS, WEAPON_BY_NAME, WeaponState, advanceGunGameTier, applyArmorDamage, damageAtRange, resolveHitscan, shotEventDue } from './combat.mjs';
import { applyKillstreakReward, killstreakRewardFor, killstreakRewardScore } from './killstreaks.mjs';
import { PLAYER_RADIUS, resolveMovement } from './geometry.mjs';
import { normalizeInboundMessage } from './protocol.mjs';
import { advanceFixedSteps } from './fixed-step.mjs';
import { botAimError, botBurstState, decideBotCombat, decideBotInput, selectBotDecisionBatch, selectBotTarget, shotYawForBot, updateBotTargetState } from './bot-ai.mjs';
import { createSnapshotDelta } from './snapshot-delta.mjs';
import { shouldDropOutbound } from './backpressure.mjs';
import { applyDuel, createRankingStore, getOrCreateRating, leaderboardSnapshot, rankingStats, restoreRanking, serializeRanking } from './ranking-service.mjs';
import { createMatchmakingQueue, dequeuePlayer, enqueuePlayer, findMatchPair, queueStats } from './matchmaking.mjs';
import { ratingBand } from './rating.mjs';
import { loadState, saveState } from './state-store.mjs';
import { WEAPON_METRICS } from './weapons.mjs';
import { MAPS, mapById, MODE_MAP_POOLS, nextPoolMapId, resolveMapPool, resolveRequestedMap, selectPoolMap } from './maps.mjs';
import { botsForWave, waveBotAimErrorScale, waveBotBurstSize, waveBotMaxHealth, waveBotReactionMs, waveBotWeapon } from './waves.mjs';
import { DEFAULT_CTF_SCORE_LIMIT, applyCapture, autoReturnDue, carrierSpeed, createCtfState, dropCarriedFlagSafe, flagHeldBy, flagsSnapshot, followHolders, resetFlags, resolveCtfContacts, returnFlag } from './ctf.mjs';
import { createDominationState, dominationSnapshot, resolveDominationContacts, tickDominationScore } from './domination.mjs';
import { cancelProtection, insideSafeZone, isProtected, spawnProtectionUntil } from './protection.mjs';

const port = Number(process.env.GAME_PORT ?? 2567);
const host = process.env.GAME_HOST ?? '127.0.0.1';
const stateDir = process.env.GAME_STATE_DIR || null;
const rawAutosaveMs = Number(process.env.GAME_AUTOSAVE_MS ?? 600000);
const autosaveIntervalMs = rawAutosaveMs > 0 ? Math.max(1000, Math.min(3600000, rawAutosaveMs)) : 0;
const allowedOrigins = (process.env.GAME_ORIGINS ?? '').split(',').map((origin) => origin.trim().toLowerCase()).filter(Boolean);
const shutdownGraceMs = Math.max(0, Math.min(10000, Number(process.env.GRACEFUL_SHUTDOWN_MS ?? 1500)));
const adminShutdownKey = process.env.GAME_ADMIN_SHUTDOWN_KEY ?? null;
const processStartedAt = Date.now();
const processState = { accepting: true, mode: 'running' };
const buildInfo = { buildId: process.env.BUILD_ID ?? 'local' };
const liveSockets = new Set();
let simulationTimer = null;
let shuttingDown = false;
const tickRate = 30;
const tickMs = 1000 / tickRate;
const maxCatchUpSteps = 4;
const survivalBotCount = Math.max(0, Math.min(4, Number(process.env.SURVIVAL_BOTS ?? 0)));
const botReactionMs = Math.max(100, Math.min(1000, Number(process.env.BOT_REACTION_MS ?? 250)));
const configuredBotDecisionsPerStep = Number(process.env.BOT_DECISIONS_PER_STEP ?? 2);
const botDecisionsPerStep = Number.isFinite(configuredBotDecisionsPerStep) ? Math.max(1, Math.min(4, Math.floor(configuredBotDecisionsPerStep))) : 2;
const maxShotHistoryMs = 2500;
const maxFutureShotMs = 150;
const inputTimeoutMs = 300;
const maxInputSeqJump = 120;
const inputWindowMs = 1000;
const maxInputsPerWindow = 45;
const inputAbuseWindowMs = 1000;
const inputAbuseThreshold = 30;
const inputThrottleMs = 1000;
const maxShotsPerSecond = Math.max(1, Math.min(120, Number(process.env.MAX_SHOTS_PER_SECOND ?? 25)));
const fireAbuseWindowMs = 1000;
const fireAbuseThreshold = 20;
const fireSuspensionMs = 2000;
const protocolVersion = 1;
const emptyRoomGraceMs = 30000;
const reconnectGraceMs = 15000;
const syncCooldownMs = 500;
const requestCacheSize = 32;
const journalCooldownMs = 500;
const journalSize = 64;
const maxMovementSlack = 1.5;
const maxInboundFrameBytes = 8192;
const maxInboundBufferedBytes = 16384;
const maxOutboundBacklogBytes = 65536;
const maxSnapshotBytes = 32768;
const spectatorCapacity = 8;
const configSummary = { tickRate, protocolVersion, roomCapacity: 8, spectatorCapacity, snapshotBudget: maxSnapshotBytes };
const clients = new Map();
const rooms = new Map();
const roomCounters = new Map();
const allocationStats = new Map();
const resumeSessions = new Map();
const simulationHealth = { steps: 0, droppedMs: 0, lastLagMs: 0 };
const connectionStats = { accepted: 0, closed: 0, slowDropped: 0 };
const rankingStore = createRankingStore();
const rankingLedger = { duelsSettled: 0 };
const matchmakingQueue = createMatchmakingQueue();
const persistenceState = { enabled: Boolean(stateDir), lastSavedAt: null, autoSaves: 0, saveFailures: 0, intervalMs: autosaveIntervalMs };
let autosaveTimer = null;
let simulatedAt = Date.now();
const MATCH_CONFIG = {
  minPlayers: Number(process.env.MATCH_MIN_PLAYERS ?? 1),
  countdownMs: Number(process.env.MATCH_COUNTDOWN_MS ?? 5000),
  durationMs: Number(process.env.MATCH_DURATION_MS ?? 600000),
  teamScoreLimit: Number(process.env.TEAM_SCORE_LIMIT ?? 20),
  ctfScoreLimit: Number(process.env.CTF_SCORE_LIMIT ?? DEFAULT_CTF_SCORE_LIMIT),
  dominationScoreLimit: Math.max(1, Math.min(500, Number(process.env.DOMINATION_SCORE_LIMIT ?? 100))),
  ctfFlagReturnMs: Math.max(1000, Math.min(120000, Number(process.env.CTF_FLAG_RETURN_MS ?? 30000))),
  roundsToWin: Number(process.env.ROUNDS_TO_WIN ?? 3),
  roundBreakMs: Number(process.env.ROUND_BREAK_MS ?? 3000),
  spawnProtectionMs: Math.max(0, Math.min(15000, Number(process.env.SPAWN_PROTECTION_MS ?? 1500))),
  baseSafeZoneRadius: Math.max(0, Math.min(30, Number(process.env.BASE_SAFE_ZONE_RADIUS ?? 7))),
};
const MODE_POOL_ENV_KEYS = {
  'free-for-all': 'MAP_POOL_FFA',
  'team-deathmatch': 'MAP_POOL_TDM',
  'gun-game': 'MAP_POOL_GUN_GAME',
  'survival': 'MAP_POOL_SURVIVAL',
  'ctf': 'MAP_POOL_CTF',
  'ranked': 'MAP_POOL_RANKED',
};
const configuredFixedMap = process.env.GAME_FIXED_MAP ?? null;
const fixedMapId = configuredFixedMap && MAPS.some((map) => map.id === configuredFixedMap) ? configuredFixedMap : null;
const maxRoomsPerMode = Math.max(0, Number(process.env.GAME_MAX_ROOMS_PER_MODE ?? 0));
function modePool(mode) {
  if (fixedMapId) return [fixedMapId];
  const envKey = MODE_POOL_ENV_KEYS[mode];
  const override = envKey && process.env[envKey] ? process.env[envKey].split(',').map((id) => id.trim()).filter(Boolean) : null;
  return resolveMapPool(mode, override);
}
function connectedHumanCount(room) {
  return [...room.players].filter((id) => {
    const player = clients.get(id);
    return player?.connected && !player.bot && !player.spectator;
  }).length;
}

function spectatorCount(room) {
  return [...room.players].filter((id) => clients.get(id)?.connected && clients.get(id)?.spectator).length;
}

function isSafeBotSpawn(room, candidate, excludedId = null) {
  const clearance = PLAYER_RADIUS + 0.35;
  const boxes = mapById(room.mapId).boxes;
  if (boxes.some((box) => candidate.x > box.minX - clearance && candidate.x < box.maxX + clearance && candidate.z > box.minZ - clearance && candidate.z < box.maxZ + clearance)) return false;
  return ![...room.players].some((id) => {
    const player = clients.get(id);
    return id !== excludedId && player?.connected && player.alive && Math.hypot(player.x - candidate.x, player.z - candidate.z) < 2.2;
  });
}

function selectBotSpawn(room, slotIndex, excludedId = null) {
  const slots = mapById(room.mapId).spawnSlots;
  const start = slotIndex % slots.length;
  for (let offset = 0; offset < slots.length; offset += 1) {
    const candidate = slots[(start + offset) % slots.length];
    if (isSafeBotSpawn(room, candidate, excludedId)) return candidate;
  }
  return slots[start];
}

function spawnSurvivalBots(room) {
  const target = botsForWave(room.wave, survivalBotCount);
  const existingBots = [...room.players].filter((id) => clients.get(id)?.bot).length;
  for (let index = existingBots; index < target; index += 1) {
    const id = `bot-${room.id}-${index + 1}`;
    const spawn = selectBotSpawn(room, index);
    const maxHealth = waveBotMaxHealth(room.wave);
    clients.set(id, { id, roomId: room.id, name: `DRONE-${index + 1}`, team: 'solo', bot: true, botOffset: index * 211, botSpawnSlot: index, botTargetId: null, botAttackAt: 0, burstStart: 0, burstUntil: 0, botReactionMs: waveBotReactionMs(room.wave), botAimScale: waveBotAimErrorScale(room.wave), botBurstSize: waveBotBurstSize(room.wave), ready: true, weaponTier: 0, streak: 0, rewardScore: 0, chatAt: 0, x: spawn.x, z: spawn.z, spawnX: spawn.x, spawnZ: spawn.z, yaw: 0, history: [], lastShotAt: 0, lastShotSeq: 0, lastShotEventAt: 0, lastSimAt: Date.now(), corrected: false, health: maxHealth, maxHealth, kills: 0, deaths: 0, alive: true, respawnAt: 0, weapon: new WeaponState(waveBotWeapon(room.wave)), input: { forward: 0, right: 0, yaw: 0, sprint: false, seq: 0, receivedAt: simulatedAt }, inputWindow: { startedAt: Date.now(), accepted: 0 }, socket: null, connected: true, reconnectUntil: 0 });
    room.players.add(id);
  }
  for (const id of room.players) {
    const bot = clients.get(id);
    if (!bot?.bot) continue;
    bot.maxHealth = waveBotMaxHealth(room.wave);
    bot.weapon = new WeaponState(waveBotWeapon(room.wave));
    bot.botReactionMs = waveBotReactionMs(room.wave);
    bot.botAimScale = waveBotAimErrorScale(room.wave);
    bot.botBurstSize = waveBotBurstSize(room.wave);
  }
}

function pickRoom(mode, requestedMapId = null, requestedRoomId = null, forSpectator = false, forceNew = false, allowAnyMap = false) {
  const pool = modePool(mode);
  const preferredMap = resolveRequestedMap(mode, requestedMapId, pool) ?? (allowAnyMap && requestedMapId && mapById(requestedMapId).id === requestedMapId ? requestedMapId : null);
  if (!forceNew) {
    for (const room of rooms.values()) {
      if (requestedRoomId && room.id === requestedRoomId && room.mode === mode && room.status === 'live' && (!forSpectator || spectatorCount(room) < spectatorCapacity)) {
        const stats = allocationStats.get(mode) ?? { created: 0, joined: 0 };
        stats.joined += 1;
        allocationStats.set(mode, stats);
        return room;
      }
      const matchesPreferredMap = !preferredMap || room.mapId === preferredMap;
      const connectedCount = connectedHumanCount(room);
      if (room.mode === mode && room.status === 'live' && !room.ranked && connectedCount > 0 && connectedCount < 8 && (!forSpectator || spectatorCount(room) < spectatorCapacity) && matchesPreferredMap) {
        const stats = allocationStats.get(mode) ?? { created: 0, joined: 0 };
        stats.joined += 1;
        allocationStats.set(mode, stats);
        return room;
      }
    }
  }
  if (maxRoomsPerMode > 0) {
    const liveRooms = [...rooms.values()].filter((room) => room.mode === mode && room.status === 'live');
    if (liveRooms.length >= maxRoomsPerMode) {
      const reusable = liveRooms.find((room) => !room.ranked && connectedHumanCount(room) < 8 && (!forSpectator || spectatorCount(room) < spectatorCapacity));
      if (reusable) {
        const stats = allocationStats.get(mode) ?? { created: 0, joined: 0 };
        stats.joined += 1;
        allocationStats.set(mode, stats);
        return reusable;
      }
      return null;
    }
  }
  const nextNumber = (roomCounters.get(mode) ?? 0) + 1;
  roomCounters.set(mode, nextNumber);
  const mapId = preferredMap ?? selectPoolMap(mode, nextNumber - 1, pool);
  const stats = allocationStats.get(mode) ?? { created: 0, joined: 0 };
  stats.created += 1;
  stats.joined += 1;
  allocationStats.set(mode, stats);
  const now = Date.now();
  const room = { id: `${mode}-${nextNumber}`, mode, mapId, nextMapId: nextPoolMapId(mode, mapId, pool), players: new Set(), status: 'live', phase: 'waiting', countdownAt: 0, startedAt: 0, endsAt: 0, snapshotSeq: 0, eventSeq: 0, journal: [], journalAt: 0, emptySince: null, round: 1, roundEndsAt: 0, roundWins: { ct: 0, t: 0 }, inputWindow: { startedAt: now, accepted: 0, throttled: 0 }, scoreLimit: mode === 'team-deathmatch' ? Math.max(1, MATCH_CONFIG.teamScoreLimit) : mode === 'ctf' ? Math.max(1, MATCH_CONFIG.ctfScoreLimit) : mode === 'domination' ? Math.max(1, MATCH_CONFIG.dominationScoreLimit) : 0, flagReturnMs: mode === 'ctf' ? MATCH_CONFIG.ctfFlagReturnMs : 0, wave: mode === 'survival' ? 1 : 0, survivalRemaining: mode === 'survival' ? Math.max(1, botsForWave(1, survivalBotCount)) : 0, pickups: mapById(mapId).pickups.map((pickup) => ({ ...pickup, available: true, respawnAt: 0 })), weaponPickups: mapById(mapId).weapons.map((weapon) => ({ ...weapon, available: true, respawnAt: 0 })), teamScores: { ct: 0, t: 0 }, flags: mode === 'ctf' ? createCtfState(mapById(mapId)) : null, domination: mode === 'domination' ? createDominationState(mapById(mapId).controlPoints) : null, dominationScoreAcc: mode === 'domination' ? { value: 0 } : null, shots: { accepted: 0, blocked: 0, miss: 0, aimSnaps: 0, protected: 0, safeZone: 0, rejected: { state: 0, duplicate: 0, clock: 0, cooldown: 0, ammo: 0, rate: 0, suspended: 0 } }, shotEvents: 0, movement: { corrections: 0 }, abuse: { fireSuspensions: 0, fireEscalations: 0, inputThrottles: 0, inputEscalations: 0 }, killstreaks: { granted: 0, armor: 0, ammo: 0, weapon: 0, score: 0 }, botDecisionCursor: 0, botStats: { shots: 0, hits: 0, eliminations: 0, deaths: 0, respawns: 0, targetChanges: 0, decisions: 0, deferredDecisions: 0 }, snapshotStats: { fullBytes: 0, deltaBytes: 0, deltaFrames: 0, fullFallbacks: 0, fullEncodes: 0, fullFrames: 0 }, snapshotBytes: 0, lastSnapshotFrame: null };
  rooms.set(room.id, room);
  if (mode === 'survival') spawnSurvivalBots(room);
  return room;
}

function createRankedDuelRoom(now) {
  const duelPool = modePool('ranked');
  const requestedDuelMap = process.env.DUEL_MAP ?? null;
  const duelMapId = resolveRequestedMap('ranked', requestedDuelMap, duelPool) ?? selectPoolMap('ranked', 0, duelPool);
  const room = pickRoom('free-for-all', duelMapId, null, false, true, true);
  room.ranked = true;
  room.duelKillLimit = Math.max(1, Math.min(50, Number(process.env.DUEL_KILL_LIMIT ?? 5)));
  room.duelWinnerId = null;
  room.joinTokens = [randomUUID(), randomUUID()];
  return room;
}

function finishRankedDuel(room, winner, now) {
  if (room.duelWinnerId) return;
  room.duelWinnerId = winner.id;
  room.status = 'ended';
  room.phase = 'ended';
  room.roundEndsAt = now;
  const loser = [...room.players].map((id) => clients.get(id)).find((player) => player && !player.bot && !player.spectator && player.id !== winner.id);
  if (loser) {
    const duel = applyDuel(rankingStore, winner.id, loser.id);
    rankingLedger.duelsSettled += 1;
    recordRoomEvent(room, { type: 'rankedResult', duelWinnerId: winner.id, winnerRating: duel.winner.rating, winnerDelta: duel.winner.delta, loserRating: duel.loser.rating, loserDelta: duel.loser.delta });
    writeMessage(winner.socket, { type: 'rankedResult', winner: true, rating: duel.winner.rating, band: duel.winner.band, delta: duel.winner.delta });
    writeMessage(loser.socket, { type: 'rankedResult', winner: false, rating: duel.loser.rating, band: duel.loser.band, delta: duel.loser.delta });
  }
  const event = recordRoomEvent(room, { type: 'matchOver', duelWinnerId: winner.id, teamScores: room.teamScores, round: room.round });
  broadcastRoom(room, event);
}

function resetRound(room, now) {
  room.round += 1;
  room.teamScores = { ct: 0, t: 0 };
  room.phase = 'live';
  room.countdownAt = 0;
  room.startedAt = now;
  room.endsAt = now + MATCH_CONFIG.durationMs;
  room.roundEndsAt = 0;
  room.winner = null;
  for (const id of room.players) {
    const player = clients.get(id);
    if (!player) continue;
    player.alive = true;
    player.health = 100;
    player.armor = 0;
    player.respawnAt = 0;
    player.x = player.spawnX;
    player.z = player.spawnZ;
    player.streak = 0;
    player.captures = 0;
    if (!player.bot) player.protectedUntil = spawnProtectionUntil(now, MATCH_CONFIG.spawnProtectionMs);
    if (room.mode === 'gun-game') { player.weaponTier = 0; player.weapon = new WeaponState(GUN_GAME_WEAPONS[0]); } else player.weapon.refill();
  }
  for (const pickup of room.pickups) { pickup.available = true; pickup.respawnAt = 0; }
  for (const weapon of room.weaponPickups) { weapon.available = true; weapon.respawnAt = 0; }
  if (room.flags) resetFlags(room.flags, mapById(room.mapId));
  room.killstreaks = { granted: 0, armor: 0, ammo: 0, weapon: 0, score: 0 };
  room.shotEvents = 0;
  if (room.domination) room.domination = createDominationState(mapById(room.mapId).controlPoints);
  if (room.dominationScoreAcc) room.dominationScoreAcc = { value: 0 };
}

function finishRound(room, winningTeam, now) {
  if (winningTeam === 'ct' || winningTeam === 't') room.roundWins[winningTeam] += 1;
  const complete = winningTeam !== null && room.roundWins[winningTeam] >= Math.max(1, MATCH_CONFIG.roundsToWin);
  if (complete) {
    room.status = 'ended';
    room.phase = 'ended';
    room.winner = winningTeam;
    room.roundEndsAt = now;
    if (room.mode === 'team-deathmatch' && (winningTeam === 'ct' || winningTeam === 't')) {
      const losingTeam = winningTeam === 'ct' ? 't' : 'ct';
      const teamPlayer = (team) => [...room.players].map((id) => clients.get(id)).filter((player) => player && !player.bot && player.team === team).sort((first, second) => second.kills - first.kills)[0];
      const winner = teamPlayer(winningTeam);
      const loser = teamPlayer(losingTeam);
      if (winner && loser && winner.id !== loser.id) {
        applyDuel(rankingStore, winner.id, loser.id);
        rankingLedger.duelsSettled += 1;
      }
    }
    const event = recordRoomEvent(room, { type: 'matchOver', winner: room.winner, teamScores: room.teamScores, round: room.round, roundWins: room.roundWins });
    broadcastRoom(room, event);
    return;
  }
  room.phase = MATCH_CONFIG.roundBreakMs > 0 ? 'countdown' : 'live';
  room.countdownAt = MATCH_CONFIG.roundBreakMs > 0 ? now + MATCH_CONFIG.roundBreakMs : now;
  room.roundEndsAt = MATCH_CONFIG.roundBreakMs > 0 ? room.countdownAt : now;
  if (MATCH_CONFIG.roundBreakMs === 0) resetRound(room, now);
  else { const event = recordRoomEvent(room, { type: 'roundOver', winner: winningTeam, round: room.round, roundWins: room.roundWins }); broadcastRoom(room, event); }
}

function rewindRoomPlayers(room, shooterId, shotAt) {
  return new Map([...room.players].map((id) => {
    const player = clients.get(id);
    if (!player || !player.connected) return [id, null];
    if (id === shooterId || player.history.length === 0) return [id, player];
    const historical = player.history.reduce((closest, sample) => Math.abs(sample.at - shotAt) < Math.abs(closest.at - shotAt) ? sample : closest);
    return [id, { ...player, x: historical.x, z: historical.z, yaw: historical.yaw }];
  }).filter((entry) => entry[1]));
}

function canDamageInRoom(room, attacker, victim, now = Date.now()) {
  if (victim.spectator) return false;
  if (isProtected(victim, now)) return false;
  return (room.mode !== 'team-deathmatch' && room.mode !== 'ctf') || attacker.team !== victim.team;
}

function resolveRoomShot(room, attacker, now, shotAt = now, yawOverride = null) {
  if (!attacker.alive || room.status !== 'live' || room.phase !== 'live') return { ok: false, reason: 'state' };
  if (!attacker.weapon.canShoot(now)) return { ok: false, reason: attacker.weapon.ammo > 0 ? 'cooldown' : 'ammo' };
  attacker.weapon.shoot(now);
  if (!attacker.bot) cancelProtection(attacker);
  if (attacker.bot) room.botStats.shots += 1;
  const roomPlayers = attacker.bot
    ? new Map([...room.players].map((id) => [id, clients.get(id)]).filter((entry) => entry[1]?.connected))
    : rewindRoomPlayers(room, attacker.id, shotAt);
  room.shots.accepted += 1;
  if (shotEventDue(attacker.lastShotEventAt ?? 0, now, SHOT_EVENT_THROTTLE_MS)) {
    attacker.lastShotEventAt = now;
    room.shotEvents += 1;
    broadcastRoom(room, { type: 'combat', kind: 'shot', attackerId: attacker.id, x: attacker.x, z: attacker.z });
  }
  const hitResolution = resolveHitscan(yawOverride === null ? attacker : { ...attacker, yaw: yawOverride }, roomPlayers, (shooter, victim) => canDamageInRoom(room, shooter, victim, now), mapById(room.mapId).boxes);
  const historicalTarget = hitResolution.target;
  if (!historicalTarget && hitResolution.shieldedTargetId) {
    const shielded = clients.get(hitResolution.shieldedTargetId);
    if (shielded && isProtected(shielded, now)) {
      room.shots.protected += 1;
      broadcastRoom(room, { type: 'combat', kind: 'protected', attackerId: attacker.id, targetId: shielded.id });
      return { ok: true, reason: 'protected', targetId: shielded.id, damage: 0 };
    }
  }
  const target = historicalTarget ? clients.get(historicalTarget.id) : null;
  if (!target) {
    if (hitResolution.blocked) {
      room.shots.blocked += 1;
      broadcastRoom(room, { type: 'combat', kind: 'blocked', attackerId: attacker.id, targetId: attacker.id, reason: 'cover' });
      return { ok: true, reason: 'blocked' };
    }
    room.shots.miss += 1;
    return { ok: true, reason: 'miss' };
  }
  const damage = damageAtRange(attacker.weapon.def, hitResolution.distance ?? attacker.weapon.def.range);
  const applied = applyArmorDamage(target.health, target.armor ?? 0, damage);
  target.armor = applied.armor;
  target.health = applied.health;
  if (target.health > 0) {
    if (attacker.bot) room.botStats.hits += 1;
    broadcastRoom(room, { type: 'combat', kind: 'hit', attackerId: attacker.id, targetId: target.id, damage, absorbed: applied.absorbed });
    return { ok: true, reason: 'hit', targetId: target.id, damage, absorbed: applied.absorbed };
  }
  target.alive = false;
  target.respawnAt = now + 3000;
  target.deaths += 1;
  target.streak = 0;
  const droppedFlag = room.flags && room.mode === 'ctf' ? dropCarriedFlagSafe(room.flags, target.id, { x: target.x, z: target.z }, mapById(room.mapId), now) : null;
  attacker.kills += 1;
  attacker.streak += 1;
  const killstreakReward = killstreakRewardFor(attacker.streak, room.mode);
  if (killstreakReward) {
    const reward = applyKillstreakReward(attacker, killstreakReward);
    const rewardScore = killstreakRewardScore(reward);
    attacker.rewardScore = (attacker.rewardScore ?? 0) + rewardScore;
    room.killstreaks.granted += 1;
    room.killstreaks[reward.kind] += 1;
    room.killstreaks.score += rewardScore;
    broadcastRoom(room, { type: 'combat', kind: 'killstreak', attackerId: attacker.id, targetId: target.id, streak: attacker.streak, reward: { ...reward, scoreBonus: rewardScore } });
  }
  if (attacker.bot) room.botStats.eliminations += 1;
  if (target.bot) room.botStats.deaths += 1;
  if (room.mode === 'gun-game') {
    attacker.weaponTier = advanceGunGameTier(attacker.weaponTier, GUN_GAME_WEAPONS.length);
    attacker.weapon = new WeaponState(GUN_GAME_WEAPONS[attacker.weaponTier]);
  }
  if (room.mode === 'team-deathmatch') {
    room.teamScores[attacker.team] += 1;
    if (room.teamScores[attacker.team] >= room.scoreLimit) finishRound(room, attacker.team, now);
  }
  if (droppedFlag) broadcastRoom(room, recordRoomEvent(room, { type: 'flagDrop', flagTeam: droppedFlag, playerId: target.id, playerTeam: target.team, x: target.x, z: target.z }));
  if (room.ranked && attacker.kills >= room.duelKillLimit) finishRankedDuel(room, attacker, now);
  if (room.mode === 'survival' && (survivalBotCount === 0 || target.bot)) {
    room.survivalRemaining = Math.max(0, room.survivalRemaining - 1);
    if (room.survivalRemaining === 0) {
      room.wave += 1;
      if (survivalBotCount > 0) {
        spawnSurvivalBots(room);
        room.survivalRemaining = botsForWave(room.wave, survivalBotCount);
      } else {
        room.survivalRemaining = Math.max(1, connectedHumanCount(room));
      }
      broadcastRoom(room, { type: 'waveAdvance', wave: room.wave });
    }
  }
  broadcastRoom(room, { type: 'combat', kind: 'elimination', attackerId: attacker.id, targetId: target.id, streak: attacker.streak });
  return { ok: true, reason: 'elimination', targetId: target.id, damage };
}

function removePlayer(id, room) {
  const player = clients.get(id);
  if (!player) return false;
  if (player.resumeToken) resumeSessions.delete(player.resumeToken);
  clients.delete(id);
  if (!room.players.delete(id)) return false;
  room.emptySince = room.players.size === 0 ? Date.now() : null;
  if (room.phase === 'countdown' && room.players.size < 1) { room.phase = 'waiting'; room.countdownAt = 0; room.roundEndsAt = 0; }
  broadcastRoom(room, snapshot(room));
  return true;
}

function issueResumeToken(player) {
  if (player.resumeToken) resumeSessions.delete(player.resumeToken);
  const token = randomUUID();
  player.resumeToken = token;
  player.reconnectUntil = 0;
  resumeSessions.set(token, player.id);
  return token;
}

function findResumePlayer(token, now) {
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const id = resumeSessions.get(token);
  const player = id ? clients.get(id) : null;
  if (!player || player.resumeToken !== token) {
    resumeSessions.delete(token);
    return null;
  }
  if (player.lobby) return null;
  if (player.connected) return null;
  if (player.reconnectUntil < now) { resumeSessions.delete(token); return null; }
  const room = rooms.get(player.roomId);
  if (!room || !room.players.has(player.id)) return null;
  return { player, room };
}

function detachPlayer(id, room, socket) {
  const player = clients.get(id);
  if (!player || player.socket !== socket || !player.connected) return false;
  const now = Date.now();
  if (room.mode === 'ctf' && room.flags && flagHeldBy(room.flags, id)) {
    const carried = flagHeldBy(room.flags, id);
    returnFlag(room.flags, carried);
    broadcastRoom(room, recordRoomEvent(room, { type: 'flagReturn', flagTeam: carried, playerId: id, playerTeam: player.team, reason: 'leave' }));
  }
  player.connected = false;
  player.socket = null;
  player.reconnectUntil = now + reconnectGraceMs;
  player.input = { ...player.input, forward: 0, right: 0, sprint: false, receivedAt: 0 };
  broadcastRoom(room, snapshot(room));
  return true;
}

function removeLobbyPlayer(id) {
  const player = clients.get(id);
  if (!player) return false;
  dequeuePlayer(matchmakingQueue, id);
  clients.delete(id);
  return true;
}

function acknowledgeRequest(player, requestSeq, action, ok, detail = {}) {
  if (!Number.isInteger(requestSeq)) return;
  player.requestCache ??= [];
  const existing = player.requestCache.find((entry) => entry.requestSeq === requestSeq);
  if (existing) { writeMessage(player.socket, existing.message); return; }
  const message = { type: 'ack', requestSeq, action, ok, ...detail };
  player.requestCache.push({ requestSeq, message });
  if (player.requestCache.length > requestCacheSize) player.requestCache.shift();
  writeMessage(player.socket, message);
}

function acknowledgeShot(player, shotSeq, ok, reason, detail = {}) {
  if (!Number.isInteger(shotSeq)) return;
  player.shotCache ??= [];
  const existing = player.shotCache.find((entry) => entry.shotSeq === shotSeq);
  if (existing) { writeMessage(player.socket, existing.message); return; }
  const message = { type: 'shotAck', shotSeq, ok, reason, ...detail };
  player.shotCache.push({ shotSeq, message });
  if (player.shotCache.length > requestCacheSize) player.shotCache.shift();
  writeMessage(player.socket, message);
}

function encodePayload(payload) {
  if (payload.length > 65535) throw new Error('outbound frame too large');
  const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([header, payload]);
}

function encode(message) {
  return encodePayload(Buffer.from(JSON.stringify(message)));
}

function writeMessage(socket, message) {
  return writeFrame(socket, encode(message));
}

function writeFrame(socket, frame) {
  if (socket.destroyed) return false;
  if (shouldDropOutbound(socket.writableLength, maxOutboundBacklogBytes)) { connectionStats.slowDropped += 1; socket.destroy(); return false; }
  socket.write(frame);
  return true;
}

function decodeFrames(buffer) {
  if (buffer.length > maxInboundBufferedBytes) throw new Error('inbound buffer exceeds limit');
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    if (!fin || (first & 0x70) !== 0 || opcode !== 0x1 || (second & 0x80) === 0) throw new Error('unsupported websocket frame');
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) throw new Error('64-bit payload lengths are not supported');
    if (length > maxInboundFrameBytes) throw new Error('inbound frame exceeds limit');
    const frameLength = headerLength + 4 + length;
    if (buffer.length - offset < frameLength) break;
    const maskOffset = offset + headerLength;
    const dataOffset = maskOffset + 4;
    const payload = Buffer.allocUnsafe(length);
    for (let index = 0; index < length; index += 1) payload[index] = buffer[dataOffset + index] ^ buffer[maskOffset + index % 4];
    messages.push(JSON.parse(payload.toString('utf8')));
    offset += frameLength;
  }
  return { messages, remaining: buffer.subarray(offset) };
}

function snapshot(room) {
  room.snapshotSeq += 1;
  const now = Date.now();
  const connectedPlayers = [...room.players].map((id) => clients.get(id)).filter((player) => player?.connected && !player.spectator);
  const readyPlayers = connectedPlayers.filter((player) => !player.bot && player.ready).length;
  const payload = {
    type: 'snapshot',
    protocolVersion,
    snapshotSeq: room.snapshotSeq,
    roomId: room.id,
    mapId: room.mapId,
    nextMapId: room.nextMapId,
    mode: room.mode,
    status: room.status,
    phase: room.phase,
    countdownAt: room.countdownAt,
    startsAt: room.startedAt,
    endsAt: room.endsAt,
    round: room.round,
    roundWins: room.roundWins,
    roundEndsAt: room.roundEndsAt,
    readyPlayers,
    requiredReady: Math.min(MATCH_CONFIG.minPlayers, connectedPlayers.filter((player) => !player.bot).length),
    pickups: room.pickups.map(({ respawnAt, ...pickup }) => ({ ...pickup, respawnIn: Math.max(0, respawnAt - now) })), weaponPickups: room.weaponPickups.map(({ respawnAt: _respawnAt, ...weapon }) => weapon),
    winner: room.winner,
    wave: room.wave,
    survivalRemaining: room.survivalRemaining,
    botCount: connectedPlayers.filter((player) => player.bot).length,
    aliveBotCount: connectedPlayers.filter((player) => player.bot && player.alive).length,
    spectators: spectatorCount(room),
    ranked: room.ranked === true,
    duelKillLimit: room.duelKillLimit ?? 0,
    duelWinnerId: room.duelWinnerId ?? null,
    teamScores: room.teamScores,
    scoreLimit: room.scoreLimit,
    flagReturnMs: room.flagReturnMs ?? 0,
    flags: room.flags ? flagsSnapshot(room.flags) : null,
    domination: room.domination ? dominationSnapshot(room.domination) : null,
    players: connectedPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      bot: Boolean(player.bot),
      ready: player.ready,
      weaponTier: player.weaponTier,
      streak: player.streak,
      rewardScore: player.rewardScore ?? 0,
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      health: player.health,
      armor: player.armor ?? 0,
      maxHealth: player.maxHealth ?? 100,
      kills: player.kills,
      deaths: player.deaths,
      captures: player.captures ?? 0,
      pickups: player.ctfLifetime?.pickups ?? 0,
      returns: player.ctfLifetime?.returns ?? 0,
      alive: player.alive,
      weaponName: player.weapon.def.name,
      respawnIn: Math.max(0, player.respawnAt - now),
      protected: isProtected(player, now),
      shieldMs: Math.max(0, (player.protectedUntil ?? 0) - now),
      ack: player.input.seq,
      inputAgeMs: Math.max(0, now - player.input.receivedAt),
      ammo: player.weapon.ammo,
      reloading: Boolean(player.weapon.reloadUntil),
      corrected: Boolean(player.corrected),
    })),
  };
  room.snapshotBytes = Buffer.byteLength(JSON.stringify(payload));
  if (room.snapshotBytes > maxSnapshotBytes) {
    payload.players = payload.players.map(({ inputAgeMs: _inputAgeMs, ...player }) => player);
    room.snapshotBytes = Buffer.byteLength(JSON.stringify(payload));
  }
  return payload;
}

function broadcastRoom(room, message) {
  const outbound = message.type === 'combat' && message.eventSeq === undefined ? recordRoomEvent(room, message) : message;
  if (outbound.type !== 'snapshot') {
    const frame = encode(outbound);
    for (const id of room.players) {
      const socket = clients.get(id)?.socket;
      if (socket && !socket.destroyed) writeFrame(socket, frame);
    }
    return;
  }
  const cachedFrame = room.lastSnapshotFrame;
  let fullFrame = cachedFrame?.seq === outbound.snapshotSeq ? cachedFrame.frame : null;
  const fullJson = JSON.stringify(outbound);
  const fullBytes = Buffer.byteLength(fullJson);
  if (!fullFrame) {
    fullFrame = encodePayload(Buffer.from(fullJson));
    room.lastSnapshotFrame = { seq: outbound.snapshotSeq, frame: fullFrame };
    room.snapshotStats.fullEncodes += 1;
  }
  for (const id of room.players) {
    const player = clients.get(id);
    const socket = player?.socket;
    if (socket && !socket.destroyed) {
      if (socket.writableLength > maxOutboundBacklogBytes) socket.destroy();
      else {
        const delta = outbound.type === 'snapshot' && player.supportsSnapshotDelta ? createSnapshotDelta(player.lastSnapshot, outbound) : null;
        const deltaBytes = delta ? Buffer.byteLength(JSON.stringify(delta)) : 0;
        const useDelta = delta !== null && deltaBytes < fullBytes;
        if (outbound.type === 'snapshot') {
          room.snapshotStats.fullBytes += useDelta ? 0 : fullBytes;
          room.snapshotStats.deltaBytes += useDelta ? deltaBytes : 0;
          room.snapshotStats.deltaFrames += useDelta ? 1 : 0;
          room.snapshotStats.fullFallbacks += delta !== null && !useDelta ? 1 : 0;
          room.snapshotStats.fullFrames += useDelta ? 0 : 1;
        }
        if (outbound.type === 'snapshot') player.lastSnapshot = outbound;
        writeFrame(socket, useDelta ? encode(delta) : fullFrame);
      }
    }
  }
}

function recordRoomEvent(room, message) {
  room.eventSeq += 1;
  const event = { ...message, eventSeq: room.eventSeq };
  room.journal.push(event);
  if (room.journal.length > journalSize) room.journal.shift();
  return event;
}

const httpServer = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/admin/shutdown') {
    if (!adminShutdownKey) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, reason: 'not found' }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => {
      if (body.length < 64) body += chunk.toString('utf8').slice(0, 64 - body.length);
    });
    request.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { parsed = null; }
      const provided = typeof parsed?.key === 'string' ? parsed.key : '';
      const expected = Buffer.from(adminShutdownKey);
      const candidate = Buffer.from(provided);
      const valid = candidate.length === expected.length && timingSafeEqual(candidate, expected);
      if (!valid) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, reason: 'unauthorized' }));
        return;
      }
      response.writeHead(202, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, draining: true }));
      beginGracefulShutdown('admin');
    });
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  const connectedPlayers = [...clients.values()].filter((player) => player.connected).length;
  const fairness = [...rooms.values()].reduce((acc, room) => {
    acc.shotsAccepted += room.shots.accepted;
    acc.shotsRejected += Object.values(room.shots.rejected).reduce((sum, count) => sum + count, 0);
    acc.aimSnaps += room.shots.aimSnaps;
    acc.corrections += room.movement.corrections;
    return acc;
  }, { shotsAccepted: 0, shotsRejected: 0, aimSnaps: 0, corrections: 0 });
  const abuse = [...rooms.values()].reduce((acc, room) => {
    acc.fireSuspensions += room.abuse.fireSuspensions;
    acc.fireEscalations += room.abuse.fireEscalations;
    acc.inputThrottles += room.abuse.inputThrottles;
    acc.inputEscalations += room.abuse.inputEscalations;
    if (room.abuse.fireSuspensions > 0 || room.abuse.inputThrottles > 0) acc.roomsUnderAbuse += 1;
    return acc;
  }, { fireSuspensions: 0, fireEscalations: 0, inputThrottles: 0, inputEscalations: 0, roomsUnderAbuse: 0 });
  const ctfSummary = (() => {
    const totals = { rooms: 0, captures: { ct: 0, t: 0 }, pickups: { ct: 0, t: 0 }, returns: { ct: 0, t: 0 } };
    const leaders = [];
    for (const room of rooms.values()) {
      if (room.mode !== 'ctf') continue;
      totals.rooms += 1;
      for (const id of room.players) {
        const p = clients.get(id);
        if (!p || p.team === 'solo') continue;
        const stats = p.ctfLifetime ?? { captures: 0, pickups: 0, returns: 0 };
        leaders.push({ team: p.team, captures: stats.captures, pickups: stats.pickups, returns: stats.returns });
        totals.captures[p.team] += stats.captures;
        totals.pickups[p.team] += stats.pickups;
        totals.returns[p.team] += stats.returns;
      }
    }
    leaders.sort((a, b) => b.captures - a.captures || b.pickups - a.pickups || b.returns - a.returns);
    return { ...totals, leaders: leaders.slice(0, 8) };
  })();
  const rewardsSummary = [...rooms.values()].reduce((acc, room) => {
    const stats = room.killstreaks ?? { granted: 0, armor: 0, ammo: 0, weapon: 0, score: 0 };
    acc.granted += stats.granted;
    acc.armor += stats.armor;
    acc.ammo += stats.ammo;
    acc.weapon += stats.weapon;
    acc.score += stats.score;
    return acc;
  }, { granted: 0, armor: 0, ammo: 0, weapon: 0, score: 0 });
  if (!response.writableEnded) response.end(JSON.stringify({ status: 'ok', build: buildInfo, config: { ...configSummary, spawnProtectionMs: MATCH_CONFIG.spawnProtectionMs, baseSafeZoneRadius: MATCH_CONFIG.baseSafeZoneRadius, maxRoomsPerMode, fixedMap: fixedMapId, dominationScoreLimit: MATCH_CONFIG.dominationScoreLimit }, process: { startedAt: processStartedAt, uptimeMs: Date.now() - processStartedAt, accepting: processState.accepting, mode: processState.mode }, security: { originPolicy: allowedOrigins.length > 0 ? 'allowlist' : 'open', origins: allowedOrigins }, persistence: persistenceState, connectionStats, fairness, abuse, weapons: WEAPON_METRICS, ranking: { ...rankingStats(rankingStore), duelsSettled: rankingLedger.duelsSettled, leaderboard: leaderboardSnapshot(rankingStore) }, matchmaking: queueStats(matchmakingQueue), ctf: ctfSummary, rewards: rewardsSummary, maps: MAPS.map((map) => ({ id: map.id, name: map.name, bounds: map.bounds, boxes: map.boxes, spawnSlots: map.spawnSlots, ctfBase: map.ctfBase ?? null, pickups: map.pickups, controlPoints: map.controlPoints ?? [] })), mapPools: Object.fromEntries(['free-for-all', 'team-deathmatch', 'gun-game', 'survival', 'ctf', 'domination', 'ranked'].map((m) => [m, modePool(m)])), allocation: [...allocationStats.entries()].map(([mode, stats]) => ({ mode, ...stats, activeRooms: [...rooms.values()].filter((room) => room.mode === mode).length, connectedHumans: [...rooms.values()].filter((room) => room.mode === mode).reduce((sum, room) => sum + connectedHumanCount(room), 0), capacity: 8 })), players: [...clients.values()].filter((entry) => entry.connected && !entry.lobby).length, lobbyPlayers: [...clients.values()].filter((entry) => entry.connected && entry.lobby).length, connectedPlayers, recoveringPlayers: clients.size - connectedPlayers, simulation: simulationHealth, rooms: [...rooms.values()].map((room) => ({ id: room.id, mode: room.mode, mapId: room.mapId, nextMapId: room.nextMapId, players: room.players.size, connectedPlayers: [...room.players].filter((id) => { const p = clients.get(id); return p?.connected && !p.spectator; }).length, spectators: spectatorCount(room), spectatorSlots: spectatorCapacity, ranked: room.ranked === true, duelKillLimit: room.duelKillLimit ?? 0, duelWinnerId: room.duelWinnerId ?? null, bots: [...room.players].filter((id) => clients.get(id)?.bot).length, aliveBots: [...room.players].filter((id) => clients.get(id)?.bot && clients.get(id)?.alive).length, status: room.status, phase: room.phase, endsAt: room.endsAt, emptySince: room.emptySince, snapshotSeq: room.snapshotSeq, wave: room.wave, scoreLimit: room.scoreLimit, flagReturnMs: room.flagReturnMs ?? 0, teamScores: room.teamScores, flags: room.flags ? flagsSnapshot(room.flags) : null, domination: room.domination ? dominationSnapshot(room.domination) : null, weaponPickups: room.weaponPickups.map(({ respawnAt: _respawnAt, ...weapon }) => weapon), fighters: [...room.players].map((id) => { const p = clients.get(id); return p ? { id: p.id, team: p.team, x: p.x, z: p.z, alive: Boolean(p.alive), bot: Boolean(p.bot), spectator: Boolean(p.spectator), captures: p.captures ?? 0, kills: p.kills, deaths: p.deaths, armor: p.armor ?? 0, rewardScore: p.rewardScore ?? 0, shieldMs: Math.max(0, (p.protectedUntil ?? 0) - Date.now()) } : null; }).filter(Boolean), inputsAccepted: room.inputWindow.accepted, inputThrottled: room.inputWindow.throttled, shots: room.shots, shotEvents: room.shotEvents, movement: room.movement, abuse: room.abuse, killstreaks: room.killstreaks, botStats: room.botStats, accuracy: room.botStats.shots > 0 ? Math.round((room.botStats.hits / room.botStats.shots) * 1000) / 10 : 0, botDifficulty: { wave: room.wave, reactionMs: waveBotReactionMs(room.wave), aimScale: waveBotAimErrorScale(room.wave), burstSize: waveBotBurstSize(room.wave) }, snapshotStats: room.snapshotStats, snapshotBytes: room.snapshotBytes, snapshotBudget: maxSnapshotBytes, safeZoneBlocks: room.shots.safeZone ?? 0, protectedShots: room.shots.protected ?? 0 })) }));
});

httpServer.on('connection', (socket) => {
  liveSockets.add(socket);
  socket.on('close', () => { liveSockets.delete(socket); connectionStats.closed += 1; });
});

httpServer.on('upgrade', (request, socket) => {
  if (request.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy();
  if (allowedOrigins.length > 0 && request.headers.origin && !allowedOrigins.includes(request.headers.origin.toLowerCase())) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const key = request.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  connectionStats.accepted += 1;
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const now = Date.now();
  const resumed = findResumePlayer(url.searchParams.get('resume'), now);
  let player;
  let room;
  let id;
  let mode = 'free-for-all';
  if (resumed) {
    ({ player, room } = resumed);
    mode = room.mode;
    id = player.id;
    player.socket = socket;
    player.connected = true;
    player.supportsSnapshotDelta = url.searchParams.get('delta') === '1';
    player.lastSnapshot = null;
    player.reconnectUntil = 0;
    player.lastSimAt = now;
    player.input = { ...player.input, forward: 0, right: 0, sprint: false, receivedAt: now };
  } else {
    const requestedMode = url.searchParams.get('mode');
    const requestedName = url.searchParams.get('name') ?? '';
    mode = ['free-for-all', 'team-deathmatch', 'survival', 'gun-game', 'ctf', 'domination'].includes(requestedMode ?? '') ? requestedMode : 'free-for-all';
    if (url.searchParams.get('lobby') === '1') {
      const name = /^[A-Za-z0-9_-]{3,16}$/.test(requestedName) ? requestedName : `OP-${clients.size + 1}`;
      id = randomUUID();
      room = null;
      player = { id, roomId: null, lobby: true, queued: false, name, team: 'solo', spectator: false, connected: true, socket, reconnectUntil: 0 };
      clients.set(id, player);
    } else {
      const requestedSpectator = url.searchParams.get('spectator') === '1';
      room = pickRoom(mode, url.searchParams.get('map'), url.searchParams.get('room'), requestedSpectator);
      if (!room) {
        socket.destroy();
        return;
      }
      if (room.ranked && !requestedSpectator) {
        const joinToken = url.searchParams.get('join');
        const tokenIndex = Array.isArray(room.joinTokens) ? room.joinTokens.indexOf(joinToken ?? '') : -1;
        if (tokenIndex === -1) {
          socket.destroy();
          return;
        }
        room.joinTokens.splice(tokenIndex, 1);
      }
      const index = room.players.size;
      const mapDef = mapById(room.mapId);
      const spawnSlots = mapDef.spawnSlots;
      const team = mode === 'team-deathmatch' || mode === 'ctf' || mode === 'domination' ? (index % 2 === 0 ? 'ct' : 't') : 'solo';
      let spawnX;
      let spawnZ;
      if (mode === 'ctf' && mapDef.ctfBase?.[team]) {
        const base = mapDef.ctfBase[team];
        const slotIndex = Math.floor(index / 2) % 3;
        const offset = (slotIndex - 1) * 1.8;
        spawnX = base.x + offset;
        spawnZ = base.z + 3;
      } else {
        const spawnSlot = spawnSlots[index % spawnSlots.length];
        spawnX = spawnSlot.x;
        spawnZ = spawnSlot.z;
      }
      const name = /^[A-Za-z0-9_-]{3,16}$/.test(requestedName) ? requestedName : `OP-${index + 1}`;
      id = randomUUID();
      player = { id, roomId: room.id, name, team, ready: !requestedSpectator, spectator: requestedSpectator, weaponTier: 0, streak: 0, rewardScore: 0, chatAt: 0, x: spawnX, z: spawnZ, spawnX, spawnZ, yaw: Math.PI, history: [], lastShotAt: 0, lastShotSeq: 0, lastShotEventAt: 0, lastSimAt: now, corrected: false, health: 100, armor: 0, kills: 0, deaths: 0, captures: 0, ctfLifetime: { captures: 0, pickups: 0, returns: 0 }, alive: true, respawnAt: 0, protectedUntil: !requestedSpectator ? spawnProtectionUntil(now, MATCH_CONFIG.spawnProtectionMs) : 0, weapon: new WeaponState(mode === 'gun-game' ? GUN_GAME_WEAPONS[0] : undefined), input: { forward: 0, right: 0, yaw: Math.PI, sprint: false, seq: 0, receivedAt: now }, inputWindow: { startedAt: now, accepted: 0 }, inputAbuse: { windowStartedAt: now, rejections: 0, throttledUntil: 0, escalation: 0 }, fireRateWindow: { startedAt: now, count: 0 }, fireAbuse: { windowStartedAt: now, rateRejections: 0, suspendedUntil: 0, escalation: 0 }, lastShotYaw: null, socket, connected: true, reconnectUntil: 0, supportsSnapshotDelta: url.searchParams.get('delta') === '1', lastSnapshot: null };
      clients.set(id, player);
      room.players.add(id);
    }
  }
  const resumeToken = issueResumeToken(player);
  writeMessage(socket, { type: 'welcome', id, name: player.name, roomId: room?.id ?? null, mode: room?.mode ?? mode, resumeToken });
  if (room) broadcastRoom(room, snapshot(room));

  let inboundBuffer = Buffer.alloc(0);
  socket.on('data', (buffer) => {
    try {
      inboundBuffer = Buffer.concat([inboundBuffer, buffer]);
      const decoded = decodeFrames(inboundBuffer);
      inboundBuffer = decoded.remaining;
      for (const rawMessage of decoded.messages) {
        const message = normalizeInboundMessage(rawMessage);
        if (!message) continue;
        const player = clients.get(id);
        if (!player || !player.connected || player.socket !== socket) return;
        if (player.lobby) {
          if (message.type === 'queue' || message.type === 'queueCancel') {
            if (message.type === 'queue') {
              if (!player.queued) {
                const rating = getOrCreateRating(rankingStore, player.id).rating;
                enqueuePlayer(matchmakingQueue, { id: player.id, rating }, Date.now());
                player.queued = true;
                writeMessage(socket, { type: 'queueStatus', queued: true, waiting: matchmakingQueue.size, rating, band: ratingBand(rating) });
              }
            } else {
              dequeuePlayer(matchmakingQueue, player.id);
              player.queued = false;
              writeMessage(socket, { type: 'queueStatus', queued: false, waiting: matchmakingQueue.size });
            }
            writeMessage(socket, { type: 'ack', requestSeq: message.requestSeq, action: message.type, ok: true });
          }
          continue;
        }
        if (message.type === 'queue' || message.type === 'queueCancel') {
          writeMessage(socket, { type: 'ack', requestSeq: message.requestSeq, action: message.type, ok: false, reason: 'lobby-only' });
          continue;
        }
        if (player.spectator && message.type !== 'ping' && message.type !== 'journal') continue;
      if (message.type === 'input') {
        const { forward, right, yaw, sprint, seq } = message;
        const now = Date.now();
        if (now - player.inputWindow.startedAt >= inputWindowMs) player.inputWindow = { startedAt: now, accepted: 0 };
        const inputAbuse = player.inputAbuse ?? (player.inputAbuse = { windowStartedAt: now, rejections: 0, throttledUntil: 0 });
        if (now < inputAbuse.throttledUntil) { room.inputWindow.throttled += 1; return; }
        if (now - inputAbuse.windowStartedAt >= inputAbuseWindowMs) { inputAbuse.windowStartedAt = now; inputAbuse.rejections = 0; }
        if (![forward, right, yaw, seq].every(Number.isFinite) || seq <= player.input.seq || seq - player.input.seq > maxInputSeqJump) return;
        if (player.inputWindow.accepted >= maxInputsPerWindow) {
          inputAbuse.rejections += 1;
          if (inputAbuse.rejections >= inputAbuseThreshold) {
            inputAbuse.escalation = Math.min(3, (inputAbuse.escalation ?? 0) + 1);
            inputAbuse.throttledUntil = now + inputThrottleMs * inputAbuse.escalation;
            room.abuse.inputThrottles += 1;
            if (inputAbuse.escalation > 1) room.abuse.inputEscalations += 1;
          }
          return;
        }
        player.inputWindow.accepted += 1;
        room.inputWindow.accepted += 1;
        player.input = { forward: Math.max(-1, Math.min(1, forward)), right: Math.max(-1, Math.min(1, right)), yaw, sprint: Boolean(sprint), seq, receivedAt: simulatedAt };
      }
      if (message.type === 'pickup' && player.alive && typeof message.id === 'string') {
        const pickup = room.pickups.find((item) => item.id === message.id);
        if (pickup?.available && Math.hypot(player.x - pickup.x, player.z - pickup.z) <= 2.5) {
          pickup.available = false;
          pickup.respawnAt = Date.now() + 10000;
          if (pickup.kind === 'health') player.health = Math.min(100, player.health + (pickup.value ?? 35));
          if (pickup.kind === 'ammo') player.weapon.refill();
          if (pickup.kind === 'armor') player.armor = Math.min(ARMOR_MAX, (player.armor ?? 0) + (pickup.value ?? 50));
          const pickupEvent = recordRoomEvent(room, { type: 'pickup', pickupId: pickup.id, playerId: player.id, kind: pickup.kind });
          broadcastRoom(room, pickupEvent);
          acknowledgeRequest(player, message.requestSeq, 'pickup', true, { pickupId: pickup.id, kind: pickup.kind });
        } else acknowledgeRequest(player, message.requestSeq, 'pickup', false, { reason: 'unavailable' });
      } else if (message.type === 'pickup') acknowledgeRequest(player, message.requestSeq, 'pickup', false, { reason: 'invalid' });
      if (message.type === 'weapon' && player.alive && typeof message.id === 'string' && room.mode !== 'gun-game') {
        const weaponPickup = room.weaponPickups.find((item) => item.id === message.id);
        const definition = weaponPickup ? WEAPON_BY_NAME[weaponPickup.weapon] : null;
        if (definition && weaponPickup.available && Math.hypot(player.x - weaponPickup.x, player.z - weaponPickup.z) <= 2.5) {
          weaponPickup.available = false;
          weaponPickup.respawnAt = Date.now() + 15000;
          player.weapon = new WeaponState(definition);
          player.weaponTier = Math.max(0, GUN_GAME_WEAPONS.findIndex((weapon) => weapon.name === definition.name));
          const weaponEvent = recordRoomEvent(room, { type: 'weaponPickup', weaponId: weaponPickup.id, weapon: definition.name, playerId: player.id });
          broadcastRoom(room, weaponEvent);
          acknowledgeRequest(player, message.requestSeq, 'weapon', true, { weaponId: weaponPickup.id, weapon: definition.name });
        } else acknowledgeRequest(player, message.requestSeq, 'weapon', false, { reason: weaponPickup ? 'unavailable' : 'invalid' });
      } else if (message.type === 'weapon') acknowledgeRequest(player, message.requestSeq, 'weapon', false, { reason: 'state' });
      if (message.type === 'equip' && room.mode === 'gun-game') {
        const valid = Number.isInteger(message.tier) && message.tier >= 0 && message.tier <= player.weaponTier;
        if (valid) player.weapon = new WeaponState(GUN_GAME_WEAPONS[message.tier]);
        acknowledgeRequest(player, message.requestSeq, 'equip', valid, { tier: valid ? message.tier : player.weaponTier });
      }
      if (message.type === 'reload') {
        const accepted = player.weapon.reload(Date.now());
        acknowledgeRequest(player, message.requestSeq, 'reload', accepted);
      }
      if (message.type === 'ready') {
        player.ready = Boolean(message.ready);
        acknowledgeRequest(player, message.requestSeq, 'ready', true, { ready: player.ready });
      }
      if (message.type === 'ping' && Number.isFinite(message.id)) writeMessage(socket, { type: 'pong', id: message.id, serverAt: Date.now() });
      if (message.type === 'sync') {
        const now = Date.now();
        if (now - player.syncAt >= syncCooldownMs) {
          player.syncAt = now;
          const synced = snapshot(room);
          player.lastSnapshot = synced;
          writeMessage(socket, synced);
        }
      }
      if (message.type === 'journal') {
        const now = Date.now();
        const fromSeq = Number.isInteger(message.fromSeq) ? message.fromSeq : 0;
        if (now - player.journalAt >= journalCooldownMs) {
          player.journalAt = now;
          const events = room.journal.filter((event) => event.eventSeq > fromSeq);
          writeMessage(socket, { type: 'journal', fromSeq, events, latestSeq: room.eventSeq });
        }
      }
      if (message.type === 'chat' && typeof message.text === 'string') {
        if (Date.now() - player.chatAt < 300) continue;
        player.chatAt = Date.now();
        const text = message.text.trim().slice(0, 160);
        if (text) {
          const teamScope = message.scope === 'team' && (room.mode === 'ctf' || room.mode === 'team-deathmatch') && (player.team === 'ct' || player.team === 't');
          const chatMessage = { type: 'chat', senderId: id, text, ...(teamScope ? { scope: 'team' } : {}) };
          if (teamScope) {
            for (const memberId of room.players) {
              const member = clients.get(memberId);
              if (member?.connected && member.team === player.team) writeMessage(member.socket, chatMessage);
            }
          } else {
            broadcastRoom(room, chatMessage);
          }
        }
      }
      if (message.type === 'fire' && (!player.alive || room.status !== 'live' || room.phase !== 'live' || !Number.isFinite(message.yaw))) {
        room.shots.rejected.state += 1;
        acknowledgeShot(player, Number.isInteger(message.shotSeq) ? message.shotSeq : player.lastShotSeq + 1, false, 'state');
      }
      if (message.type === 'fire' && player.alive && room.status === 'live' && room.phase === 'live' && Number.isFinite(message.yaw)) {
        const now = Date.now();
        const requestedShotSeq = Number.isInteger(message.shotSeq) ? message.shotSeq : player.lastShotSeq + 1;
        if (requestedShotSeq <= player.lastShotSeq) { room.shots.rejected.duplicate += 1; acknowledgeShot(player, requestedShotSeq, false, 'duplicate'); continue; }
        player.lastShotSeq = requestedShotSeq;
        const shotAt = Number.isFinite(message.shotAt) ? message.shotAt : now;
        if (shotAt < now - maxShotHistoryMs || shotAt > now + maxFutureShotMs) { room.shots.rejected.clock += 1; acknowledgeShot(player, requestedShotSeq, false, 'clock'); continue; }
        player.lastShotAt = Math.min(now, shotAt);
        player.yaw = message.yaw;
        const abuse = player.fireAbuse ?? (player.fireAbuse = { windowStartedAt: now, rateRejections: 0, suspendedUntil: 0 });
        if (now < abuse.suspendedUntil) { room.shots.rejected.suspended += 1; acknowledgeShot(player, requestedShotSeq, false, 'suspended'); continue; }
        if (now - abuse.windowStartedAt >= fireAbuseWindowMs) { abuse.windowStartedAt = now; abuse.rateRejections = 0; }
        const rateWindow = player.fireRateWindow ?? (player.fireRateWindow = { startedAt: now, count: 0 });
        if (now - rateWindow.startedAt >= 1000) { rateWindow.startedAt = now; rateWindow.count = 0; }
        if (rateWindow.count >= maxShotsPerSecond) {
          room.shots.rejected.rate += 1;
          abuse.rateRejections += 1;
          if (abuse.rateRejections >= fireAbuseThreshold) {
            abuse.escalation = Math.min(3, (abuse.escalation ?? 0) + 1);
            abuse.suspendedUntil = now + fireSuspensionMs * abuse.escalation;
            room.abuse.fireSuspensions += 1;
            if (abuse.escalation > 1) room.abuse.fireEscalations += 1;
          }
          acknowledgeShot(player, requestedShotSeq, false, 'rate');
          continue;
        }
        rateWindow.count += 1;
        if (room.mode === 'ctf' && insideSafeZone(player.x, player.z, mapById(room.mapId), MATCH_CONFIG.baseSafeZoneRadius)) {
          room.shots.safeZone += 1;
          acknowledgeShot(player, requestedShotSeq, false, 'safeZone');
          continue;
        }
        const result = resolveRoomShot(room, player, now, player.lastShotAt);
        if (!result.ok && result.reason in room.shots.rejected) room.shots.rejected[result.reason] += 1;
        if (result.ok) {
          if (player.lastShotYaw !== null) {
            const rawDiff = message.yaw - player.lastShotYaw;
            const wrapped = ((rawDiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            if (Math.abs(wrapped) > 0.6) room.shots.aimSnaps += 1;
          }
          player.lastShotYaw = message.yaw;
        }
        acknowledgeShot(player, requestedShotSeq, result.ok, result.reason, result.targetId ? { targetId: result.targetId, damage: result.damage } : {});
      }
      }
    } catch { socket.destroy(); }
  });
  socket.on('close', () => {
    if (player.lobby) removeLobbyPlayer(id); else detachPlayer(id, room, socket);
  });
  socket.on('error', () => { if (player.lobby) removeLobbyPlayer(id); else detachPlayer(id, room, socket); });
});

function simulateStep(now) {
  const matchPair = findMatchPair(matchmakingQueue, now);
  if (matchPair) {
    const first = clients.get(matchPair.first.id);
    const second = clients.get(matchPair.second.id);
    if (first?.connected && second?.connected && first.lobby && second.lobby) {
      const room = createRankedDuelRoom(now);
      first.queued = false;
      second.queued = false;
      writeMessage(first.socket, { type: 'matchFound', roomId: room.id, mode: 'free-for-all', mapId: room.mapId, opponent: second.name, joinToken: room.joinTokens[0] });
      writeMessage(second.socket, { type: 'matchFound', roomId: room.id, mode: 'free-for-all', mapId: room.mapId, opponent: first.name, joinToken: room.joinTokens[1] });
    } else {
      for (const entry of [matchPair.first, matchPair.second]) {
        const candidate = clients.get(entry.id);
        if (candidate?.connected && candidate.lobby) enqueuePlayer(matchmakingQueue, { id: candidate.id, rating: getOrCreateRating(rankingStore, candidate.id).rating }, now);
      }
    }
  }
  for (const player of [...clients.values()]) {
    if (!player.connected && player.reconnectUntil > 0 && now >= player.reconnectUntil) removePlayer(player.id, rooms.get(player.roomId));
  }
  for (const player of clients.values()) {
    if (!player.connected) continue;
    if (player.lobby) continue;
    player.corrected = false;
    const elapsedMs = tickMs;
    player.lastSimAt = now;
    player.weapon.update(now);
    if (!player.alive) {
      if (now < player.respawnAt) continue;
      const room = rooms.get(player.roomId);
      if (player.bot && (!room || connectedHumanCount(room) === 0)) continue;
      if (player.bot) {
        const spawn = selectBotSpawn(room, player.botSpawnSlot, player.id);
        player.spawnX = spawn.x;
        player.spawnZ = spawn.z;
      }
      player.alive = true;
      player.health = player.maxHealth ?? 100;
      player.armor = 0;
      player.x = player.spawnX;
      player.z = player.spawnZ;
      player.weapon.refill();
      if (!player.bot) player.protectedUntil = spawnProtectionUntil(now, MATCH_CONFIG.spawnProtectionMs);
      if (player.bot) { player.botTargetId = null; player.botAttackAt = 0; room.botStats.respawns += 1; }
    }
    const { forward: inputForward, right: inputRight, yaw, sprint } = player.input;
    const inputFresh = now >= player.input.receivedAt && now - player.input.receivedAt <= inputTimeoutMs;
    const forward = inputFresh ? inputForward : 0;
    const right = inputFresh ? inputRight : 0;
    const activeSprint = inputFresh && sprint;
    const length = Math.hypot(forward, right);
    if (length > 0) {
      const movementRoom = rooms.get(player.roomId);
      const carryingFlag = movementRoom?.mode === 'ctf' && movementRoom.flags ? flagHeldBy(movementRoom.flags, player.id) !== null : false;
      const speed = carrierSpeed(activeSprint ? 12 : 7, carryingFlag);
      const envelope = speed * elapsedMs / 1000 + maxMovementSlack / tickRate;
      const frame = Math.min(speed / tickRate, envelope) / Math.max(1, length);
      const nextX = player.x + (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * frame;
      const nextZ = player.z + (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * frame;
      const map = mapById(rooms.get(player.roomId)?.mapId);
      const resolved = resolveMovement(player, nextX, nextZ, map.boxes, PLAYER_RADIUS);
      const clampedX = Math.max(map.bounds.minX, Math.min(map.bounds.maxX, resolved.x));
      const clampedZ = Math.max(map.bounds.minZ, Math.min(map.bounds.maxZ, resolved.z));
      player.corrected = Math.abs(clampedX - nextX) > 0.001 || Math.abs(clampedZ - nextZ) > 0.001;
      if (player.corrected) {
        const movementRoom = rooms.get(player.roomId);
        if (movementRoom) movementRoom.movement.corrections += 1;
      }
      player.x = clampedX;
      player.z = clampedZ;
    }
    player.yaw = yaw;
    if (player.alive) {
      player.history.push({ at: now, x: player.x, z: player.z, yaw: player.yaw });
      if (player.history.length > 90) player.history.shift();
    }
  }
  for (const room of rooms.values()) {
    if (room.status === 'live' && room.phase === 'live') {
      const roomPlayers = new Map([...room.players].map((id) => [id, clients.get(id)]).filter((entry) => entry[1]?.connected));
      const batch = selectBotDecisionBatch(roomPlayers, room.botDecisionCursor, botDecisionsPerStep);
      room.botDecisionCursor = batch.nextCursor;
      room.botStats.decisions += batch.bots.length;
      room.botStats.deferredDecisions += batch.deferred;
      for (const bot of batch.bots) {
        const target = selectBotTarget(bot, roomPlayers, (attacker, victim) => canDamageInRoom(room, attacker, victim, now));
        const squadSize = [...room.players].filter((id) => clients.get(id)?.bot && clients.get(id)?.alive).length;
        const input = decideBotInput(bot, target, now, mapById(room.mapId), squadSize, 12);
        bot.input = { ...input, seq: bot.input.seq + 1, receivedAt: now };
        const targetState = updateBotTargetState(bot.botTargetId, target, now, bot.botReactionMs ?? botReactionMs);
        if (targetState.changed) {
          bot.botTargetId = targetState.targetId;
          bot.botAttackAt = targetState.attackAt;
          if (targetState.targetId) room.botStats.targetChanges += 1;
        }
        if (bot.botAttackAt > now) continue;
        const burst = botBurstState(bot, now, bot.botBurstSize ?? 4);
        bot.burstStart = burst.burstStart;
        bot.burstUntil = burst.burstUntil;
        const action = decideBotCombat(bot, target, roomPlayers, now, (attacker, victim) => canDamageInRoom(room, attacker, victim, now), mapById(room.mapId).boxes);
        if (action === 'reload') bot.weapon.reload(now);
        if (action === 'fire') resolveRoomShot(room, bot, now, now, target ? shotYawForBot(bot, target, now, botAimError(bot, target, now) * (bot.botAimScale ?? 1)) : null);
      }
    }
    if (room.mode === 'ctf' && room.flags && room.status === 'live' && room.phase === 'live') {
      const livePlayers = [...room.players].map((id) => clients.get(id)).filter((player) => player?.connected && !player.spectator);
      followHolders(room.flags, livePlayers);
      const contacts = resolveCtfContacts(room, room.flags, livePlayers);
      for (const contact of contacts) {
        if (room.status !== 'live') break;
        if (contact.type === 'capture') {
          applyCapture(room, room.flags, mapById(room.mapId), contact);
          const scorer = clients.get(contact.playerId);
          if (scorer) {
            scorer.captures = (scorer.captures ?? 0) + 1;
            scorer.ctfLifetime = { ...(scorer.ctfLifetime ?? { captures: 0, pickups: 0, returns: 0 }), captures: (scorer.ctfLifetime?.captures ?? 0) + 1 };
          }
          const event = recordRoomEvent(room, { type: 'flagCapture', flagTeam: contact.flagTeam, playerId: contact.playerId, playerTeam: contact.playerTeam, teamScores: { ...room.teamScores }, captures: scorer?.captures ?? 0 });
          broadcastRoom(room, event);
          if (room.teamScores[contact.playerTeam] >= room.scoreLimit) finishRound(room, contact.playerTeam, now);
        } else if (contact.type === 'pickup') {
          const picker = clients.get(contact.playerId);
          if (picker) picker.ctfLifetime = { ...(picker.ctfLifetime ?? { captures: 0, pickups: 0, returns: 0 }), pickups: (picker.ctfLifetime?.pickups ?? 0) + 1 };
          broadcastRoom(room, recordRoomEvent(room, { type: 'flagPickup', flagTeam: contact.flagTeam, playerId: contact.playerId, playerTeam: contact.playerTeam }));
        } else if (contact.type === 'return') {
          const returner = clients.get(contact.playerId);
          if (returner) returner.ctfLifetime = { ...(returner.ctfLifetime ?? { captures: 0, pickups: 0, returns: 0 }), returns: (returner.ctfLifetime?.returns ?? 0) + 1 };
          broadcastRoom(room, recordRoomEvent(room, { type: 'flagReturn', flagTeam: contact.flagTeam, playerId: contact.playerId, playerTeam: contact.playerTeam }));
        }
      }
      for (const flagTeam of ['ct', 't']) {
        if (autoReturnDue(room.flags, flagTeam, now, room.flagReturnMs)) {
          returnFlag(room.flags, flagTeam);
          broadcastRoom(room, recordRoomEvent(room, { type: 'flagReturn', flagTeam, playerId: null, playerTeam: null, reason: 'timeout' }));
        }
      }
    }
    if (room.mode === 'domination' && room.domination && room.status === 'live' && room.phase === 'live') {
      const livePlayers = [...room.players].map((id) => clients.get(id)).filter((player) => player?.connected && !player.spectator);
      for (const event of resolveDominationContacts(room.domination, livePlayers, tickMs, now)) {
        broadcastRoom(room, recordRoomEvent(room, event));
      }
      if (tickDominationScore(room.domination, room.teamScores, room.dominationScoreAcc, tickMs)) {
        if (room.teamScores.ct >= room.scoreLimit) finishRound(room, 'ct', now);
        else if (room.teamScores.t >= room.scoreLimit) finishRound(room, 't', now);
      }
    }
    const connectedCount = connectedHumanCount(room);
    if (connectedCount === 0) {
      if (room.emptySince === null) room.emptySince = now;
      if (now - room.emptySince >= emptyRoomGraceMs) { rooms.delete(room.id); continue; }
    } else room.emptySince = null;
    if (now - room.inputWindow.startedAt >= inputWindowMs) room.inputWindow = { startedAt: now, accepted: 0, throttled: room.inputWindow.throttled ?? 0 };
    for (const pickup of room.pickups) if (!pickup.available && now >= pickup.respawnAt) { pickup.available = true; pickup.respawnAt = 0; }
    for (const weapon of room.weaponPickups) if (!weapon.available && now >= weapon.respawnAt) { weapon.available = true; weapon.respawnAt = 0; }
        const readyPlayers = [...room.players].filter((id) => { const p = clients.get(id); return p?.connected && !p?.bot && !p?.spectator && p?.ready; }).length;
    const requiredReady = Math.min(MATCH_CONFIG.minPlayers, connectedCount);
    if (room.phase === 'waiting' && readyPlayers >= requiredReady && requiredReady > 0) {
      room.countdownAt = now + MATCH_CONFIG.countdownMs;
      room.phase = MATCH_CONFIG.countdownMs > 0 ? 'countdown' : 'live';
      if (room.phase === 'live') { room.startedAt = now; room.endsAt = now + MATCH_CONFIG.durationMs; }
    }
    if (room.phase === 'countdown' && readyPlayers < requiredReady) {
      room.phase = 'waiting';
      room.countdownAt = 0;
    }
    if (room.phase === 'countdown' && now >= room.countdownAt) {
      if (room.roundEndsAt > 0) resetRound(room, now);
      else { room.phase = 'live'; room.startedAt = now; room.endsAt = now + MATCH_CONFIG.durationMs; }
    }
    if (room.status === 'live' && room.phase === 'live' && now >= room.endsAt) {
      const timeoutWinner = room.teamScores.ct === room.teamScores.t ? null : room.teamScores.ct > room.teamScores.t ? 'ct' : 't';
      finishRound(room, timeoutWinner, now);
    }
    broadcastRoom(room, snapshot(room));
  }
}

let lastSimulationAt = simulatedAt;
let accumulatedSimulationMs = 0;
function runSimulation() {
  const now = Date.now();
  const elapsedMs = now - lastSimulationAt;
  lastSimulationAt = now;
  const next = advanceFixedSteps(accumulatedSimulationMs, elapsedMs, tickMs, maxCatchUpSteps);
  accumulatedSimulationMs = next.accumulatorMs;
  simulatedAt += next.droppedMs;
  simulationHealth.steps += next.steps;
  simulationHealth.droppedMs += next.droppedMs;
  simulationHealth.lastLagMs = Math.max(0, elapsedMs - tickMs);
  for (let step = 0; step < next.steps; step += 1) {
    simulatedAt += tickMs;
    simulateStep(simulatedAt);
  }
  simulationTimer = setTimeout(runSimulation, Math.max(1, Math.ceil(tickMs - accumulatedSimulationMs)));
}
simulationTimer = setTimeout(runSimulation, Math.ceil(tickMs));

if (!Number.isInteger(port) || port < 1 || port > 65535 || typeof host !== 'string' || host.length === 0) {
  console.error('小小CSGO invalid GAME_PORT or GAME_HOST configuration');
  process.exit(1);
}
httpServer.listen(port, host, () => console.log(`小小CSGO game server listening on ws://${host}:${port}`));

if (stateDir) {
  loadState(stateDir, 'ranking').then((data) => {
    if (data && restoreRanking(rankingStore, data)) {
      if (Number.isInteger(data.duelsSettled) && data.duelsSettled >= 0) rankingLedger.duelsSettled = data.duelsSettled;
      console.log('小小CSGO restored ranking state');
    }
  }).catch(() => {});
  if (autosaveIntervalMs > 0) {
    autosaveTimer = setInterval(async () => {
      try {
        await persistState();
        persistenceState.autoSaves += 1;
      } catch {
        persistenceState.saveFailures += 1;
      }
    }, autosaveIntervalMs);
  }
}

async function persistState() {
  if (!stateDir) return;
  await saveState(stateDir, 'ranking', serializeRanking(rankingStore, { duelsSettled: rankingLedger.duelsSettled }));
  persistenceState.lastSavedAt = Date.now();
}

function beginGracefulShutdown(source) {
  if (shuttingDown) return;
  shuttingDown = true;
  processState.accepting = false;
  processState.mode = 'draining';
  if (simulationTimer !== null) clearTimeout(simulationTimer);
  if (autosaveTimer !== null) clearInterval(autosaveTimer);
  console.log(`小小CSGO graceful shutdown started (${source})`);
  httpServer.close(() => { processState.mode = 'closed'; });
  if (stateDir) persistState().catch(() => {});
  setTimeout(() => {
    for (const socket of liveSockets) socket.destroy();
  }, shutdownGraceMs);
  setTimeout(() => process.exit(0), shutdownGraceMs + 1200);
}

process.on('SIGTERM', () => beginGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => beginGracefulShutdown('SIGINT'));
