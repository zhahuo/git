export type LobbyMatch = { roomId: string; mode: string; mapId: string; opponent: string; joinToken: string };
export type LobbyStatus = { queued: boolean; waiting: number; rating: number; band: string };

type LobbyHandlers = {
  onStatus: (status: LobbyStatus) => void;
  onMatch: (match: LobbyMatch) => void;
};

type LobbyServerMessage = { type: string; queued?: boolean; waiting?: number; rating?: number; band?: string; roomId?: string; mode?: string; mapId?: string; opponent?: string; joinToken?: string };

class RankedLobby {
  private socket: WebSocket | null = null;
  private handlers: LobbyHandlers | null = null;
  private requestSeq = 0;
  private pendingAction: 'queue' | 'cancel' | null = null;

  open(handlers: LobbyHandlers) {
    this.close();
    this.handlers = handlers;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const name = localStorage.getItem('strikezone.callsign') ?? '';
    const socket = new WebSocket(`${protocol}//${window.location.hostname}:2567/?lobby=1&mode=free-for-all&name=${encodeURIComponent(name)}`);
    this.socket = socket;
    socket.onopen = () => {
      if (this.pendingAction === 'queue') this.send({ type: 'queue', requestSeq: ++this.requestSeq });
      if (this.pendingAction === 'cancel') this.send({ type: 'queueCancel', requestSeq: ++this.requestSeq });
      this.pendingAction = null;
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as LobbyServerMessage;
      if (message.type === 'queueStatus') handlers.onStatus({ queued: message.queued === true, waiting: message.waiting ?? 0, rating: message.rating ?? 0, band: message.band ?? 'standard' });
      if (message.type === 'matchFound') handlers.onMatch({ roomId: message.roomId ?? '', mode: message.mode ?? 'free-for-all', mapId: message.mapId ?? 'strike', opponent: message.opponent ?? '', joinToken: message.joinToken ?? '' });
    };
  }

  queue() {
    this.pendingAction = this.socket?.readyState === WebSocket.OPEN ? null : 'queue';
    this.send({ type: 'queue', requestSeq: ++this.requestSeq });
  }

  cancel() {
    this.pendingAction = this.socket?.readyState === WebSocket.OPEN ? null : 'cancel';
    this.send({ type: 'queueCancel', requestSeq: ++this.requestSeq });
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private send(payload: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  close() {
    this.pendingAction = null;
    this.handlers = null;
    this.socket?.close();
    this.socket = null;
  }
}

export const rankedLobby = new RankedLobby();
