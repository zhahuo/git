import { create } from 'zustand';
import { translate } from './i18n';

export type GameMode = 'free-for-all' | 'team-deathmatch' | 'survival' | 'gun-game' | 'ctf' | 'domination';
export type NetworkStatus = 'offline' | 'connecting' | 'reconnecting' | 'online' | 'error';
export type NetworkPlayer = { id: string; name: string; team: 'ct' | 't' | 'solo'; bot: boolean; ready: boolean; weaponName: string; weaponTier: number; respawnIn: number; streak: number; rewardScore?: number; x: number; z: number; yaw: number; ack: number; inputAgeMs: number; corrected: boolean; health: number; maxHealth: number; ammo: number; kills: number; deaths: number; captures: number; alive: boolean; reloading: boolean; protected?: boolean; shieldMs?: number; armor?: number };
export type DominationPoint = { id: string; x: number; z: number; radius: number; team: 'ct' | 't' | null; progress: number };
export type NetworkSnapshot = { type?: 'snapshot'; protocolVersion: number; snapshotSeq: number; players: NetworkPlayer[]; roomId: string; mapId: string; nextMapId: string; spectators: number; mode: GameMode; status: 'live' | 'ended'; phase: 'waiting' | 'live' | 'countdown' | 'ended'; countdownAt: number; startsAt: number; endsAt: number; readyPlayers: number; requiredReady: number; winner: 'ct' | 't' | null; wave: number; survivalRemaining: number; teamScores: { ct: number; t: number }; scoreLimit: number; flagReturnMs: number; round: number; roundWins: { ct: number; t: number }; roundEndsAt: number; domination?: DominationPoint[] | null; ranked?: boolean };
export type RankedResultState = { winner: boolean; rating: number; band: string; delta: number };
export type KillFeedEntry = { id: number; attackerId: string; targetId: string };
export type KillstreakFeedEntry = { id: number; streak: number; kind: 'armor' | 'ammo' | 'weapon'; label: string };
export type FlagFeedEntry = { id: number; kind: 'flagPickup' | 'flagDrop' | 'flagReturn' | 'flagCapture'; flagTeam: 'ct' | 't'; playerName: string; reason?: string };
export type ChatMessage = { id: number; senderId: string; text: string; scope?: 'team' };
export type PickupState = { id: string; kind: 'health' | 'ammo' | 'armor'; x: number; z: number; available: boolean; value?: number; respawnIn?: number };
export type WeaponPickupState = { id: string; weapon: string; x: number; z: number; available: boolean };
export type NetworkSnapshotWithPickups = NetworkSnapshot & { pickups?: PickupState[]; weaponPickups?: WeaponPickupState[] };
export type FlagTeam = 'ct' | 't';
export type FlagState = { holder: string | null; x: number; z: number; baseX: number; baseZ: number; dropAt: number };
export type CtfFlags = { ct: FlagState; t: FlagState };

export function nextFollowTarget(players: NetworkPlayer[], afterId: string | null, excludeIds: ReadonlySet<string> = new Set()): string | null {
  const rotation = players.filter((player) => !player.bot).map((player) => player.id);
  const candidates = rotation.filter((id) => !excludeIds.has(id));
  if (candidates.length === 0) return null;
  if (afterId === null) return candidates[0];
  const afterIndex = rotation.indexOf(afterId);
  if (afterIndex === -1) return candidates[0];
  for (let step = 1; step <= rotation.length; step += 1) {
    const id = rotation[(afterIndex + step) % rotation.length];
    if (candidates.includes(id)) return id;
  }
  return candidates[0];
}

type GameStore = {
  mode: GameMode;
  running: boolean;
  health: number;
  ammo: number;
  score: number;
  kills: number;
  hits: number;
  notice: string;
  networkStatus: NetworkStatus;
  pingMs: number | null;
  networkPlayers: NetworkPlayer[];
  selfId: string | null;
  roomId: string | null;
  mapId: string | null;
  nextMapId: string | null;
  spectators: number;
  queueQueued: boolean;
  queueWaiting: number;
  queueRating: number | null;
  queueBand: string | null;
  roomRanked: boolean;
  rankedResult: RankedResultState | null;
  roomMode: GameMode | null;
  roomStatus: 'live' | 'ended';
  roomPhase: 'waiting' | 'countdown' | 'live' | 'ended';
  spectator: boolean;
  followId: string | null;
  countdownAt: number;
  matchEndsAt: number;
  roundEndsAt: number;
  round: number;
  roundWins: { ct: number; t: number };
  readyPlayers: number;
  requiredReady: number;
  winner: 'ct' | 't' | null;
  teamScores: { ct: number; t: number };
  scoreLimit?: number;
  flagReturnMs?: number;
  wave: number;
  survivalRemaining: number;
  killFeed: KillFeedEntry[];
  killstreakFeed: KillstreakFeedEntry[];
  hitMarkerAt: number;
  hitMarkerKind: 'hit' | 'kill' | null;
  flagFeed?: FlagFeedEntry[];
  chatMessages: ChatMessage[];
  pickups: PickupState[];
  weaponPickups: WeaponPickupState[];
  flags?: CtfFlags | null;
  domination: DominationPoint[];
  setMode: (mode: GameMode) => void;
  start: () => void;
  stop: () => void;
  fire: () => boolean;
  addHit: () => void;
  reload: () => void;
  setNetwork: (status: NetworkStatus, players?: NetworkPlayer[], selfId?: string | null) => void;
  setPing: (pingMs: number) => void;
  setSpectator: (spectator: boolean) => void;
  setQueueStatus: (status: { queued: boolean; waiting: number; rating: number | null; band: string | null }) => void;
  setRankedResult: (result: RankedResultState | null) => void;
  setFollowId: (followId: string | null) => void;
  cycleFollow: () => void;
  advanceFollow: (excludeId: string | null) => void;
  applySnapshot: (snapshot: NetworkSnapshot) => void;
  addKillFeed: (entry: KillFeedEntry) => void;
  addKillstreakFeed: (entry: KillstreakFeedEntry) => void;
  markHit: (kind: 'hit' | 'kill') => void;
  addFlagFeed: (entry: FlagFeedEntry) => void;
  addChat: (message: ChatMessage) => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  mode: 'free-for-all', running: false, health: 100, ammo: 30, score: 0, kills: 0, hits: 0, notice: translate('notice.chooseMode'), networkStatus: 'offline', pingMs: null, networkPlayers: [], selfId: null, roomId: null, mapId: null, nextMapId: null, spectators: 0, queueQueued: false, queueWaiting: 0, queueRating: null, queueBand: null, roomRanked: false, rankedResult: null, roomMode: null, roomStatus: 'live', roomPhase: 'waiting', spectator: false, followId: null, countdownAt: 0, matchEndsAt: 0, roundEndsAt: 0, round: 1, roundWins: { ct: 0, t: 0 }, readyPlayers: 0, requiredReady: 0, winner: null, wave: 0, survivalRemaining: 0, teamScores: { ct: 0, t: 0 }, killFeed: [], killstreakFeed: [], hitMarkerAt: 0, hitMarkerKind: null, chatMessages: [], pickups: [], weaponPickups: [], domination: [],
  setMode: (mode) => set({ mode }),
  start: () => set({ running: true, health: 100, ammo: 30, score: 0, kills: 0, hits: 0, notice: translate('notice.trainingDeployed'), followId: null, domination: [] }),
  stop: () => set({ running: false, notice: translate('notice.backToTerminal'), networkStatus: 'offline', pingMs: null, networkPlayers: [], selfId: null, roomId: null, mapId: null, nextMapId: null, spectators: 0, queueQueued: false, queueWaiting: 0, queueRating: null, queueBand: null, roomRanked: false, rankedResult: null, roomMode: null, roomStatus: 'live', roomPhase: 'waiting', spectator: false, followId: null, countdownAt: 0, matchEndsAt: 0, roundEndsAt: 0, round: 1, roundWins: { ct: 0, t: 0 }, readyPlayers: 0, requiredReady: 0, winner: null, wave: 0, survivalRemaining: 0, teamScores: { ct: 0, t: 0 }, killFeed: [], killstreakFeed: [], hitMarkerAt: 0, hitMarkerKind: null, chatMessages: [], pickups: [], weaponPickups: [], domination: [] }),
  fire: () => {
    if (get().ammo <= 0) return false;
    set((state) => ({ ammo: state.ammo - 1 }));
    return true;
  },
  addHit: () => set((state) => ({ hits: state.hits + 1, score: state.score + 100, kills: state.kills + 1, notice: translate('notice.targetConfirmed') })),
  reload: () => set({ ammo: 30, notice: translate('notice.reloaded') }),
  setNetwork: (networkStatus, networkPlayers, selfId) => set((state) => ({ networkStatus, networkPlayers: networkPlayers ?? state.networkPlayers, selfId: selfId ?? state.selfId })),
  setPing: (pingMs) => set({ pingMs }),
  setSpectator: (spectator) => set({ spectator }),
  setQueueStatus: (status) => set({ queueQueued: status.queued, queueWaiting: status.waiting, queueRating: status.rating, queueBand: status.band }),
  setRankedResult: (result) => set({ rankedResult: result }),
  setFollowId: (followId) => set({ followId }),
  cycleFollow: () => set((state) => ({ followId: nextFollowTarget(state.networkPlayers, state.followId) })),
  advanceFollow: (excludeId) => set((state) => ({ followId: nextFollowTarget(state.networkPlayers, excludeId ?? state.followId, excludeId ? new Set([excludeId]) : new Set()) })),
  applySnapshot: (snapshot) => set((state) => {
    const self = snapshot.players.find((player) => player.id === state.selfId);
    const lifecycle = { roomPhase: snapshot.phase, countdownAt: snapshot.countdownAt, matchEndsAt: snapshot.endsAt, roundEndsAt: snapshot.roundEndsAt, round: snapshot.round, roundWins: snapshot.roundWins, readyPlayers: snapshot.readyPlayers, requiredReady: snapshot.requiredReady, scoreLimit: snapshot.scoreLimit, flagReturnMs: snapshot.flagReturnMs };
    const pickups = (snapshot as NetworkSnapshotWithPickups).pickups ?? state.pickups;
    const weaponPickups = (snapshot as NetworkSnapshotWithPickups).weaponPickups ?? state.weaponPickups;
    const flags = (snapshot as NetworkSnapshotWithPickups & { flags?: CtfFlags | null }).flags ?? state.flags ?? null;
    return self ? { networkPlayers: snapshot.players, pickups, weaponPickups, flags, domination: snapshot.domination ?? state.domination, roomId: snapshot.roomId, mapId: snapshot.mapId, nextMapId: snapshot.nextMapId, spectators: snapshot.spectators, roomRanked: snapshot.ranked === true, roomMode: snapshot.mode, roomStatus: snapshot.status, winner: snapshot.winner, wave: snapshot.wave, survivalRemaining: snapshot.survivalRemaining, teamScores: snapshot.teamScores, ...lifecycle, health: self.health, ammo: self.ammo, kills: self.kills, score: self.kills * 100 + (self.rewardScore ?? 0) } : { networkPlayers: snapshot.players, pickups, weaponPickups, flags, domination: snapshot.domination ?? state.domination, roomId: snapshot.roomId, mapId: snapshot.mapId, nextMapId: snapshot.nextMapId, spectators: snapshot.spectators, roomRanked: snapshot.ranked === true, roomMode: snapshot.mode, roomStatus: snapshot.status, winner: snapshot.winner, wave: snapshot.wave, survivalRemaining: snapshot.survivalRemaining, teamScores: snapshot.teamScores, ...lifecycle };
  }),
  addKillFeed: (entry) => set((state) => ({ killFeed: [...state.killFeed, entry].slice(-5) })),
  addKillstreakFeed: (entry) => set((state) => ({ killstreakFeed: [...state.killstreakFeed, entry].slice(-3) })),
  markHit: (kind) => set({ hitMarkerAt: Date.now(), hitMarkerKind: kind }),
  addFlagFeed: (entry) => set((state) => ({ flagFeed: [...(state.flagFeed ?? []), entry].slice(-6) })),
  addChat: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message].slice(-12) })),
}));

if (typeof window !== 'undefined') (window as typeof window & { __strikeZoneStore?: typeof useGameStore }).__strikeZoneStore = useGameStore;
