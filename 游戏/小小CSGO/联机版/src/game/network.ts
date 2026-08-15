import type { GameMode, NetworkPlayer, NetworkSnapshot } from './store';

type Snapshot = NetworkSnapshot & { type: 'snapshot' };
type SnapshotDelta = { type: 'snapshotDelta'; protocolVersion: 1; roomId: string; baseSnapshotSeq: number; snapshotSeq: number; state: Partial<Omit<Snapshot, 'players' | 'snapshotSeq'>>; players: Array<Partial<NetworkPlayer> & { id: string }>; removedPlayerIds: string[] };
type Welcome = { type: 'welcome'; id: string; resumeToken?: string };
type Combat = { type: 'combat'; kind: 'hit' | 'elimination' | 'blocked' | 'killstreak' | 'shot'; attackerId: string; targetId?: string; damage?: number; streak?: number; reason?: 'cover'; x?: number; z?: number; reward?: { kind: 'armor' | 'ammo' | 'weapon'; amount?: number; armor?: number; ammo?: number; weaponName?: string; tier?: number; scoreBonus?: number }; eventSeq?: number };
          type ShotAck = { type: 'shotAck'; shotSeq: number; ok: boolean; reason: 'duplicate' | 'clock' | 'cooldown' | 'ammo' | 'state' | 'rate' | 'suspended' | 'safeZone' | 'miss' | 'blocked' | 'protected' | 'hit' | 'elimination'; targetId?: string; damage?: number };
type Pong = { type: 'pong'; id: number; serverAt?: number };
type Chat = { type: 'chat'; senderId: string; text: string; scope?: 'team' };
type Pickup = { type: 'pickup'; pickupId: string; playerId: string; kind: 'health' | 'ammo' };
export type FlagEvent = { type: 'flagPickup' | 'flagDrop' | 'flagReturn' | 'flagCapture'; flagTeam: 'ct' | 't'; playerId: string | null; playerTeam: string | null; x?: number; z?: number; teamScores?: { ct: number; t: number }; captures?: number; reason?: 'timeout' | 'leave' | 'touch' };
export type RankedResult = { winner: boolean; rating: number; band: string; delta: number };
type Ack = { type: 'ack'; requestSeq: number; action: string; ok: boolean; reason?: string; ready?: boolean };
type Journal = { type: 'journal'; fromSeq: number; latestSeq: number; events: Array<Combat | Pickup | FlagEvent | { type: 'roundOver' | 'matchOver'; eventSeq?: number }> };
type RankedResultMessage = { type: 'rankedResult'; winner: boolean; rating: number; band: string; delta: number };
type ServerMessage = Snapshot | SnapshotDelta | Welcome | Combat | ShotAck | Pong | Chat | Pickup | FlagEvent | Ack | Journal | RankedResultMessage;
type Status = 'online' | 'error' | 'reconnecting';
type JoinHandlers = { onSnapshot: (snapshot: Snapshot) => void; onStatus: (status: Status, id?: string) => void; onCombat: (event: Combat) => void; onPing: (pingMs: number) => void; onChat: (message: Chat) => void; onPickup: (message: Pickup) => void; onFlagEvent?: (event: FlagEvent) => void; onRankedResult?: (result: RankedResult) => void };

export function isCompatibleSnapshot(message: Partial<Snapshot>) {
  const version = message.protocolVersion ?? 0;
  return version <= 1 && Array.isArray(message.players) && message.players.length <= 12 && typeof message.roomId === 'string';
}

export function isNewCombatEvent(previousSeq: number, eventSeq?: number) {
  return eventSeq === undefined || eventSeq > previousSeq;
}

export function hasSnapshotGap(previousSeq: number, nextSeq: number) {
  return previousSeq > 0 && nextSeq > previousSeq + 1;
}

export function applySnapshotDelta(previous: Snapshot | null, delta: SnapshotDelta): Snapshot | null {
  if (!previous || previous.roomId !== delta.roomId || previous.snapshotSeq !== delta.baseSnapshotSeq || delta.snapshotSeq <= previous.snapshotSeq) return null;
  const players = new Map(previous.players.map((player) => [player.id, player]));
  for (const id of delta.removedPlayerIds) players.delete(id);
  for (const patch of delta.players) players.set(patch.id, { ...players.get(patch.id), ...patch } as NetworkPlayer);
  if (players.size > 12) return null;
  return { ...previous, ...delta.state, type: 'snapshot', protocolVersion: 1, snapshotSeq: delta.snapshotSeq, players: [...players.values()] };
}

export class MatchClient {
  private socket: WebSocket | null = null;
  private mode: GameMode | null = null;
  private handlers: JoinHandlers | null = null;
  private retryTimer: number | null = null;
  private retryCount = 0;
  private leaving = false;
  private selfId: string | null = null;
  private resumeToken: string | null = null;
  private latestInputAck = 0;
  private shotSequence = 0;
  private requestSequence = 0;
  private connectionGeneration = 0;
  private latestSnapshotSeq = 0;
  private latestSnapshot: Snapshot | null = null;
  private staleSnapshotCount = 0;
  private syncRequestCount = 0;
  private syncInFlight = false;
  private urlMapOverride: string | null | undefined;
  private urlSpectatorOverride: boolean | undefined;
  private urlRoomOverride: string | null | undefined;
  private urlJoinOverride: string | null | undefined;
  private syncResetTimer: number | null = null;
  private requestAcks = new Map<number, Ack>();
  private shotAcks = new Map<number, ShotAck>();
  private journalRequestCount = 0;
  private latestCombatEventSeq = 0;
  private pingTimer: number | null = null;
  private pingStarted = new Map<number, { performanceAt: number; epochAt: number }>();
  private serverClockOffsetMs: number | null = null;

  join(mode: GameMode, onSnapshot: (snapshot: Snapshot) => void, onStatus: (status: Status, id?: string) => void, onCombat: (event: Combat) => void, onPing: (pingMs: number) => void, onChat: (message: Chat) => void, onPickup: (message: Pickup) => void, requestedMap?: string | null, requestedSpectator?: boolean, requestedRoom?: string | null, requestedJoin?: string | null, onRankedResult?: (result: RankedResult) => void, onFlagEvent?: (event: FlagEvent) => void) {
    this.leave();
    this.mode = mode;
    this.urlMapOverride = requestedMap;
    this.urlSpectatorOverride = requestedSpectator;
    this.urlRoomOverride = requestedRoom;
    this.urlJoinOverride = requestedJoin;
    this.handlers = { onSnapshot, onStatus, onCombat, onPing, onChat, onPickup, onRankedResult, onFlagEvent };
    this.retryCount = 0;
    this.leaving = false;
    this.open();
  }

  private open() {
    const mode = this.mode;
    const handlers = this.handlers;
    if (!mode || !handlers || this.leaving) return;
    const generation = ++this.connectionGeneration;
    this.latestSnapshotSeq = 0;
    this.latestCombatEventSeq = 0;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const name = localStorage.getItem('strikezone.callsign') ?? '';
    const resume = this.resumeToken ? `&resume=${encodeURIComponent(this.resumeToken)}` : '';
    const requestedMap = this.urlMapOverride === undefined ? new URLSearchParams(window.location.search).get('map') : this.urlMapOverride;
    const mapQuery = requestedMap ? `&map=${encodeURIComponent(requestedMap)}` : '';
    const requestedRoom = this.urlRoomOverride === undefined ? new URLSearchParams(window.location.search).get('room') : this.urlRoomOverride;
    const roomQuery = requestedRoom ? `&room=${encodeURIComponent(requestedRoom)}` : '';
    const requestedJoin = this.urlJoinOverride === undefined ? new URLSearchParams(window.location.search).get('join') : this.urlJoinOverride;
    const joinQuery = requestedJoin ? `&join=${encodeURIComponent(requestedJoin)}` : '';
    const spectatorActive = this.urlSpectatorOverride ?? (new URLSearchParams(window.location.search).get('spectator') === '1');
    const spectatorQuery = spectatorActive ? '&spectator=1' : '';
    const socket = new WebSocket(`${protocol}//${window.location.hostname}:2567/?mode=${mode}&name=${encodeURIComponent(name)}&delta=1${mapQuery}${spectatorQuery}${roomQuery}${joinQuery}${resume}`);
    this.socket = socket;
    socket.onmessage = (event) => {
      if (this.socket !== socket || generation !== this.connectionGeneration) return;
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'welcome') { this.retryCount = 0; this.selfId = message.id; if (typeof message.resumeToken === 'string') this.resumeToken = message.resumeToken; handlers.onStatus('online', message.id); this.startPing(); this.requestJournal(0); }
      if (message.type === 'snapshot') {
        if (!isCompatibleSnapshot(message)) { this.staleSnapshotCount += 1; return; }
        const version = Number.isFinite(message.protocolVersion) ? message.protocolVersion : 0;
        const sequence = Number.isFinite(message.snapshotSeq) ? message.snapshotSeq : 0;
        if (version > 1 || sequence <= this.latestSnapshotSeq) { this.staleSnapshotCount += 1; return; }
        if (hasSnapshotGap(this.latestSnapshotSeq, sequence)) this.requestSync();
        this.latestSnapshotSeq = sequence;
        this.latestSnapshot = message;
        this.resolveSyncRequest();
        const self = message.players.find((player) => player.id === this.selfId);
        if (self) this.latestInputAck = self.ack;
        handlers.onSnapshot(message);
      }
      if (message.type === 'snapshotDelta') {
        const snapshot = applySnapshotDelta(this.latestSnapshot, message);
        if (!snapshot) { this.staleSnapshotCount += 1; this.requestSync(); return; }
        this.latestSnapshotSeq = snapshot.snapshotSeq;
        this.latestSnapshot = snapshot;
        const self = snapshot.players.find((player) => player.id === this.selfId);
        if (self) this.latestInputAck = self.ack;
        handlers.onSnapshot(snapshot);
      }
      if (message.type === 'combat') {
        this.applyCombatEvent(message, handlers);
      }
      if (message.type === 'pong') {
        const started = this.pingStarted.get(message.id);
        if (started !== undefined) {
          this.pingStarted.delete(message.id);
          const roundTripMs = performance.now() - started.performanceAt;
          if (typeof message.serverAt === 'number' && Number.isFinite(message.serverAt)) {
            const measuredOffset = message.serverAt - (started.epochAt + roundTripMs / 2);
            this.serverClockOffsetMs = this.serverClockOffsetMs === null ? measuredOffset : this.serverClockOffsetMs * 0.75 + measuredOffset * 0.25;
          }
          handlers.onPing(Math.round(roundTripMs));
        }
      }
      if (message.type === 'chat') handlers.onChat(message);
      if (message.type === 'pickup') handlers.onPickup(message);
      if (message.type === 'flagPickup' || message.type === 'flagDrop' || message.type === 'flagReturn' || message.type === 'flagCapture') handlers.onFlagEvent?.(message);
      if (message.type === 'rankedResult') handlers.onRankedResult?.({ winner: message.winner === true, rating: message.rating ?? 0, band: message.band ?? 'standard', delta: message.delta ?? 0 });
      if (message.type === 'ack') this.requestAcks.set(message.requestSeq, message);
      if (message.type === 'shotAck') this.shotAcks.set(message.shotSeq, message);
      if (message.type === 'journal') {
        for (const event of message.events) {
          if (event.type === 'combat') this.applyCombatEvent(event, handlers);
          if (event.type === 'pickup') handlers.onPickup(event);
          if (event.type === 'flagPickup' || event.type === 'flagDrop' || event.type === 'flagReturn' || event.type === 'flagCapture') handlers.onFlagEvent?.(event);
        }
      }
    };
    socket.onerror = () => { if (!this.leaving) handlers.onStatus('error'); };
    socket.onclose = () => {
      if (this.leaving || this.socket !== socket) return;
      this.socket = null;
      if (this.retryCount >= 3) { handlers.onStatus('error'); return; }
      this.retryCount += 1;
      handlers.onStatus('reconnecting');
      this.retryTimer = window.setTimeout(() => this.open(), 1000 * this.retryCount);
    };
  }

  sendInput(input: { forward: number; right: number; yaw: number; sprint: boolean; seq: number }) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'input', ...input }));
  }

  fire(yaw: number, shotAt = Date.now()) { const shotSeq = ++this.shotSequence; if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'fire', yaw, shotAt: shotAt + (this.serverClockOffsetMs ?? 0), shotSeq })); return shotSeq; }

  getServerClockOffset() { return this.serverClockOffsetMs; }
  getSelfId() { return this.selfId; }
  getInputAck() { return this.latestInputAck; }
  getStaleSnapshotCount() { return this.staleSnapshotCount; }
  getSyncRequestCount() { return this.syncRequestCount; }
  getRequestAck(requestSeq: number) { return this.requestAcks.get(requestSeq) ?? null; }
  getShotAck(shotSeq: number) { return this.shotAcks.get(shotSeq) ?? null; }
  getJournalRequestCount() { return this.journalRequestCount; }

  requestJournal(fromSeq: number) { if (this.socket?.readyState === WebSocket.OPEN) { this.journalRequestCount += 1; this.socket.send(JSON.stringify({ type: 'journal', fromSeq })); } }

  private applyCombatEvent(message: Combat, handlers: JoinHandlers) {
    if (!isNewCombatEvent(this.latestCombatEventSeq, message.eventSeq)) return;
    if (typeof message.eventSeq === 'number') this.latestCombatEventSeq = message.eventSeq;
    handlers.onCombat(message);
  }

  requestSync() {
    if (this.syncInFlight || this.socket?.readyState !== WebSocket.OPEN) return;
    this.syncInFlight = true;
    this.syncRequestCount += 1;
    this.socket.send(JSON.stringify({ type: 'sync' }));
    this.syncResetTimer = window.setTimeout(() => { this.syncInFlight = false; this.syncResetTimer = null; }, 1000);
  }

  private resolveSyncRequest() {
    this.syncInFlight = false;
    if (this.syncResetTimer !== null) window.clearTimeout(this.syncResetTimer);
    this.syncResetTimer = null;
  }

  private nextRequest() { return ++this.requestSequence; }
  reload() { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'reload', requestSeq: this.nextRequest() })); }
  setReady(ready: boolean) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'ready', ready, requestSeq: this.nextRequest() })); }
  chat(text: string, scope?: 'team') { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(scope ? { type: 'chat', text, scope } : { type: 'chat', text })); }
  pickup(id: string) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'pickup', id, requestSeq: this.nextRequest() })); }
  pickupWeapon(id: string) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'weapon', id, requestSeq: this.nextRequest() })); }
  equip(tier: number) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'equip', tier, requestSeq: this.nextRequest() })); }

  private startPing() {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    const ping = () => { const id = Date.now(); this.pingStarted.set(id, { performanceAt: performance.now(), epochAt: id }); if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'ping', id })); };
    ping();
    this.pingTimer = window.setInterval(ping, 2000);
  }

  disconnectForTest() {
    this.handlers?.onStatus('reconnecting');
    this.socket?.close();
    if (this.retryTimer === null && this.mode) {
      this.retryCount = Math.max(1, this.retryCount);
      this.retryTimer = window.setTimeout(() => this.open(), 1000);
    }
  }

  leave() {
    this.leaving = true;
    this.connectionGeneration += 1;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    this.pingStarted.clear();
    this.serverClockOffsetMs = null;
    this.selfId = null;
    this.resumeToken = null;
    this.latestInputAck = 0;
    this.shotSequence = 0;
    this.requestSequence = 0;
    this.latestSnapshotSeq = 0;
    this.latestSnapshot = null;
    this.staleSnapshotCount = 0;
    this.latestCombatEventSeq = 0;
    this.requestAcks.clear();
    this.shotAcks.clear();
    this.journalRequestCount = 0;
    this.syncRequestCount = 0;
    this.resolveSyncRequest();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.mode = null;
    this.handlers = null;
  }
}

export const matchClient = new MatchClient();
if (typeof window !== 'undefined') (window as typeof window & { __strikeZoneMatchClient?: MatchClient }).__strikeZoneMatchClient = matchClient;
