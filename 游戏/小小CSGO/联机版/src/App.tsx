import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Eye, Flag, Gauge, Headphones, MapPin, Radio, RotateCcw, ScrollText, Shield, Sparkles, Target, Users, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Arena } from './game/Arena';
import { rankedLobby } from './game/lobby';
import { mapDefinitionById } from './game/mapRegistry';
import { matchClient } from './game/network';
import { colliderToRadar, mapOutlineToRadar, worldToRadar } from './game/radar';
import { nextFollowTarget, type GameMode, useGameStore } from './game/store';
import { gameAudio } from './game/audio';
import { translate, useTranslate, type MessageKey } from './game/i18n';
import { ReleaseNotes } from './ui/ReleaseNotes';
import { LanguageSwitcher } from './ui/LanguageSwitcher';
import { SettingsPanel } from './ui/SettingsPanel';

const modes: { id: GameMode; titleKey: MessageKey; subtitleKey: MessageKey; players: string; icon: typeof Target }[] = [
  { id: 'free-for-all', titleKey: 'mode.ffa.title', subtitleKey: 'mode.ffa.subtitle', players: '01 - 08', icon: Crosshair },
  { id: 'team-deathmatch', titleKey: 'mode.tdm.title', subtitleKey: 'mode.tdm.subtitle', players: '02 - 10', icon: Users },
  { id: 'survival', titleKey: 'mode.survival.title', subtitleKey: 'mode.survival.subtitle', players: '01 - 04', icon: Shield },
  { id: 'gun-game', titleKey: 'mode.gun-game.title', subtitleKey: 'mode.gun-game.subtitle', players: '01 - 08', icon: Sparkles },
  { id: 'ctf', titleKey: 'mode.ctf.title', subtitleKey: 'mode.ctf.subtitle', players: '02 - 10', icon: Flag },
  { id: 'domination', titleKey: 'mode.domination.title', subtitleKey: 'mode.domination.subtitle', players: '02 - 10', icon: MapPin },
];

function connectMatch(mode: GameMode, requestedMap?: string | null, requestedSpectator?: boolean, requestedRoom?: string | null, requestedJoin?: string | null) {
  const setNetwork = useGameStore.getState().setNetwork;
  const urlSpectator = new URLSearchParams(window.location.search).get('spectator') === '1';
  const spectator = requestedSpectator ?? urlSpectator;
  useGameStore.getState().setSpectator(spectator);
  setNetwork('connecting', [], null);
  matchClient.join(mode,
    (snapshot) => {
      const before = useGameStore.getState();
      const wasLive = before.roomPhase === 'live';
      const wasEnded = before.roomStatus === 'ended';
      const beforeSelf = before.networkPlayers.find((player) => player.id === before.selfId);
      useGameStore.getState().applySnapshot(snapshot);
      const after = useGameStore.getState();
      if (!wasLive && after.roomPhase === 'live') gameAudio.playUi('matchStart');
      if (!wasEnded && after.roomStatus === 'ended') gameAudio.playUi('matchEnd');
      const afterSelf = after.networkPlayers.find((player) => player.id === after.selfId);
      if (beforeSelf && !beforeSelf.alive && afterSelf?.alive) gameAudio.playUi('respawn');
    },
    (status, id) => { setNetwork(status, undefined, id); if (status === 'online') matchClient.setReady(true); },
    (event) => {
      const store = useGameStore.getState();
      if (event.kind === 'elimination') store.addKillFeed({ id: Date.now(), attackerId: event.attackerId, targetId: event.targetId ?? event.attackerId });
      if (event.kind === 'hit' && event.attackerId === store.selfId) { gameAudio.playFeedback('hit'); store.markHit('hit'); }
      if (event.kind === 'hit' && event.targetId === store.selfId) gameAudio.playFeedback('damaged');
      if (event.kind === 'shot' && event.attackerId !== store.selfId && event.x !== undefined && event.z !== undefined) gameAudio.playPositional('shot', event.x, event.z);
      if (event.kind === 'elimination' && event.attackerId === store.selfId) { gameAudio.playFeedback('kill'); store.markHit('kill'); }
      if (event.kind === 'elimination' && event.targetId && event.targetId !== store.selfId) {
        const target = store.networkPlayers.find((player) => player.id === event.targetId);
        if (target) gameAudio.playPositional('elimination', target.x, target.z);
      }
      if (event.kind === 'killstreak' && event.attackerId === store.selfId && event.reward) {
        gameAudio.playFeedback('killstreak');
        const rewardLabel = event.reward.kind === 'armor' ? `ARMOR +${event.reward.amount ?? 25}` : event.reward.kind === 'ammo' ? 'AMMO REFILL' : `WEAPON ${event.reward.weaponName ?? 'UPGRADE'}`;
        const scoreSuffix = event.reward.scoreBonus ? ` · +${event.reward.scoreBonus} PTS` : '';
        store.addKillstreakFeed({ id: Date.now(), streak: event.streak ?? 0, kind: event.reward.kind, label: rewardLabel });
        useGameStore.setState({ notice: `KILLSTREAK REWARD / ${rewardLabel}${scoreSuffix}` });
      }
      if (event.kind === 'elimination' && store.spectator && event.targetId === store.followId) store.advanceFollow(event.targetId);
      if (event.kind === 'blocked' && event.attackerId === store.selfId) useGameStore.setState({ notice: 'SHOT BLOCKED BY COVER' });
      if (event.targetId === store.selfId) useGameStore.setState({ notice: event.kind === 'elimination' ? translate('notice.eliminated') : translate('notice.damaged', { damage: event.damage ?? 0 }) });
      if (event.attackerId === store.selfId) useGameStore.setState({ notice: event.kind === 'elimination' ? translate('notice.targetCleared') : translate('notice.hitConfirmed', { damage: event.damage ?? 0 }) });
    },
    (pingMs) => useGameStore.getState().setPing(pingMs),
    (message) => useGameStore.getState().addChat({ id: Date.now(), senderId: message.senderId, text: message.text, ...(message.scope ? { scope: message.scope } : {}) }),
    (message) => {
      const store = useGameStore.getState();
      const pickup = store.pickups.find((entry) => entry.id === message.pickupId) ?? store.weaponPickups.find((entry) => entry.id === message.pickupId);
      if (pickup) gameAudio.playPositional('pickup', pickup.x, pickup.z);
      useGameStore.setState({ notice: `${message.kind.toUpperCase()} PICKUP CONFIRMED` });
    },
    requestedMap,
    spectator,
    requestedRoom,
    requestedJoin,
    (result) => useGameStore.getState().setRankedResult(result),
    (event) => {
      const store = useGameStore.getState();
      const label = event.flagTeam.toUpperCase();
      const names = new Map(store.networkPlayers.map((player) => [player.id, player.name]));
      const playerName = event.playerId ? names.get(event.playerId) ?? 'UNKNOWN' : 'SYSTEM';
      store.addFlagFeed({ id: Date.now(), kind: event.type, flagTeam: event.flagTeam, playerName, reason: event.reason });
      if (event.type === 'flagDrop' && event.x !== undefined && event.z !== undefined) gameAudio.playPositional('flagDrop', event.x, event.z);
      if (event.type === 'flagCapture') useGameStore.setState({ notice: `${label} FLAG CAPTURED / CT ${event.teamScores?.ct ?? store.teamScores.ct} : T ${event.teamScores?.t ?? store.teamScores.t}` });
      else if (event.type === 'flagPickup') useGameStore.setState({ notice: `${label} FLAG TAKEN` });
      else if (event.type === 'flagDrop') useGameStore.setState({ notice: `${label} FLAG DROPPED` });
      else if (event.type === 'flagReturn') useGameStore.setState({ notice: `${label} FLAG RETURNED${event.reason === 'timeout' ? ' (TIMEOUT)' : event.reason === 'leave' ? ' (CARRIER LEFT)' : ''}` });
    },
  );
}

type SpectateRoom = { id: string; mode: string; mapId: string; players: number; connectedPlayers: number; spectators: number; spectatorSlots?: number; status: string };

function ModeTerminal() {
  const [notesOpen, setNotesOpen] = useState(false);
  const [spectateRooms, setSpectateRooms] = useState<SpectateRoom[] | null>(null);
  const [spectateLoading, setSpectateLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ rating: number; band: string; wins: number; losses: number }>>([]);
  const [ctfBoard, setCtfBoard] = useState<{ rooms: number; captures: { ct: number; t: number }; pickups: { ct: number; t: number }; returns: { ct: number; t: number }; leaders: Array<{ team: string; captures: number; pickups: number; returns: number }> } | null>(null);
  const [rewardBoard, setRewardBoard] = useState<{ granted: number; armor: number; ammo: number; weapon: number; score: number } | null>(null);
  const mode = useGameStore((state) => state.mode);
  const setMode = useGameStore((state) => state.setMode);
  const start = useGameStore((state) => state.start);
  const queueQueued = useGameStore((state) => state.queueQueued);
  const queueWaiting = useGameStore((state) => state.queueWaiting);
  const queueBand = useGameStore((state) => state.queueBand);
  const t = useTranslate();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`http://${window.location.hostname}:2567/`);
        const health = await response.json() as { ranking?: { leaderboard?: Array<{ rating: number; band: string; wins: number; losses: number }> }; ctf?: { rooms: number; captures: { ct: number; t: number }; pickups: { ct: number; t: number }; returns: { ct: number; t: number }; leaders: Array<{ team: string; captures: number; pickups: number; returns: number }> }; rewards?: { granted: number; armor: number; ammo: number; weapon: number; score: number } };
        if (!cancelled) setLeaderboard(health.ranking?.leaderboard?.slice(0, 5) ?? []);
        if (!cancelled && health.ctf) setCtfBoard(health.ctf);
        if (!cancelled && health.rewards) setRewardBoard(health.rewards);
      } catch { /* optional terminal preview */ }
    })();
    return () => { cancelled = true; rankedLobby.close(); };
  }, []);
  useEffect(() => {
    if (mode !== 'ctf') return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`http://${window.location.hostname}:2567/`);
          const health = await response.json() as { ctf?: { rooms: number; captures: { ct: number; t: number }; pickups: { ct: number; t: number }; returns: { ct: number; t: number }; leaders: Array<{ team: string; captures: number; pickups: number; returns: number }> } };
          if (health.ctf) setCtfBoard(health.ctf);
        } catch { /* keep last board */ }
      })();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [mode]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`http://${window.location.hostname}:2567/`);
          const health = await response.json() as { rewards?: { granted: number; armor: number; ammo: number; weapon: number; score: number } };
          if (health.rewards) setRewardBoard(health.rewards);
        } catch { /* keep last board */ }
      })();
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);
  const joinRankedQueue = () => {
    if (queueQueued) return;
    rankedLobby.open({
      onStatus: (status) => useGameStore.getState().setQueueStatus(status),
      onMatch: (match) => {
        rankedLobby.close();
        useGameStore.getState().setQueueStatus({ queued: false, waiting: 0, rating: useGameStore.getState().queueRating, band: useGameStore.getState().queueBand });
        start();
        connectMatch(match.mode as GameMode, match.mapId, false, match.roomId, match.joinToken);
      },
    });
    rankedLobby.queue();
  };
  const cancelRankedQueue = () => {
    rankedLobby.cancel();
    useGameStore.getState().setQueueStatus({ queued: false, waiting: 0, rating: useGameStore.getState().queueRating, band: useGameStore.getState().queueBand });
  };
  const launch = () => {
    start();
    const selectedMode = useGameStore.getState().mode;
    connectMatch(selectedMode);
  };
  const loadSpectateRooms = async (): Promise<SpectateRoom[] | null> => {
    try {
      const response = await fetch(`http://${window.location.hostname}:2567/`);
      const health = await response.json() as { rooms?: SpectateRoom[] };
      const selectedMode = useGameStore.getState().mode;
      return (health.rooms ?? []).filter((room) => room.mode === selectedMode && room.status === 'live' && room.connectedPlayers > 0 && room.spectators < (room.spectatorSlots ?? 8));
    } catch {
      return null;
    }
  };
  const spectate = async () => {
    setSpectateLoading(true);
    setSpectateRooms(null);
    const rooms = await loadSpectateRooms();
    if (rooms === null || rooms.length === 0) {
      setSpectateLoading(false);
      start();
      connectMatch(useGameStore.getState().mode, undefined, true);
      return;
    }
    setSpectateRooms(rooms);
    setSpectateLoading(false);
  };
  const refreshSpectateRooms = async () => {
    const rooms = await loadSpectateRooms();
    if (rooms !== null) setSpectateRooms(rooms);
  };
  const pickerOpen = spectateRooms !== null;
  useEffect(() => {
    if (!pickerOpen) return;
    const timer = window.setInterval(() => { void refreshSpectateRooms(); }, 5000);
    return () => window.clearInterval(timer);
  }, [pickerOpen]);
  const joinSpectateRoom = (roomId: string) => {
    setSpectateRooms(null);
    start();
    connectMatch(useGameStore.getState().mode, undefined, true, roomId);
  };
  return <section className="terminal" aria-label={t('terminal.title')}>
    <header className="terminal-header"><div><span className="eyebrow">小小CSGO</span><h1>{t('terminal.title')}</h1></div><div className="terminal-actions"><LanguageSwitcher /><button className="notes-trigger" onClick={() => setNotesOpen(true)}><ScrollText size={15} /> {t('terminal.changelog')}</button><div className="online"><span className="status-dot" /> {t('terminal.online')}</div></div></header>
    <div className="terminal-layout">
      <div className="mode-list"><p className="section-label">{t('terminal.deployModes')}</p>{modes.map(({ id, titleKey, subtitleKey, players, icon: Icon }) => <button className={`mode-option ${mode === id ? 'selected' : ''}`} key={id} onClick={() => setMode(id)}><Icon size={20} strokeWidth={1.75} /><span><strong>{t(titleKey)}</strong><small>{t(subtitleKey)}</small></span><em>{players}</em></button>)}</div>
      <div className="briefing"><div className="arena-mark"><Target size={48} strokeWidth={1.15} /></div><p className="eyebrow">MAP POOL / STRIKE // CROSSFIRE // RUSTYARD</p><h2>{t(modes.find((item) => item.id === mode)?.titleKey ?? 'mode.ffa.title')}</h2><p>{t('terminal.briefing')}</p><div className="briefing-data"><span><Gauge size={16} /> {t('terminal.fpsTarget')}</span><span><Radio size={16} /> {t('terminal.networkReady')}</span><span><Headphones size={16} /> {t('terminal.audioReserved')}</span></div><div className="deploy-row"><button className="deploy" onClick={launch}><Crosshair size={19} /> {t('terminal.enterTraining')}</button><button className="spectate" aria-label="SPECTATE" onClick={spectate}><Eye size={18} /> {t('terminal.spectate')}{spectateLoading ? '…' : ''}</button></div>{spectateRooms && <div className="spectate-picker" role="dialog" aria-modal="true" aria-label="SELECT SPECTATE ROOM" data-testid="spectate-picker"><header><div><span className="eyebrow">LIVE ROOMS / SPECTATE</span><h3>{t('terminal.chooseRoom')}</h3></div><div className="spectate-actions"><button className="spectate-refresh" aria-label="REFRESH ROOMS" onClick={() => { void refreshSpectateRooms(); }}><RotateCcw size={13} /> {t('terminal.refresh')}</button><button className="spectate-close" aria-label="CLOSE SPECTATE PICKER" onClick={() => setSpectateRooms(null)}><X size={15} /></button></div></header><div className="spectate-room-list">{spectateRooms.length === 0 ? <p className="spectate-empty">{t('terminal.noLiveRooms')}</p> : spectateRooms.map((room) => <button className="spectate-room" key={room.id} data-testid={`spectate-room-${room.id}`} onClick={() => joinSpectateRoom(room.id)}><strong>{room.mode.toUpperCase()}</strong><span>MAP / {room.mapId.toUpperCase()}</span><em>{t('terminal.spectateRoomLine', { players: room.connectedPlayers, spectators: room.spectators, capacity: room.spectatorSlots ?? 8 })}</em></button>)}</div><button className="spectate-direct" onClick={() => { setSpectateRooms(null); start(); connectMatch(useGameStore.getState().mode, undefined, true); }}>{t('terminal.spectateDirect')}</button></div>}<div className="ranked-lobby" data-testid="ranked-lobby"><header><div><span className="eyebrow">RANKED DUEL / 1V1</span><h3>{t('terminal.rankedDuel')}</h3></div><em className="ranked-band">{queueBand ? queueBand.toUpperCase() : 'STANDARD'}</em></header><p>{t('terminal.rankedBlurb')}</p><div className="ranked-actions">{queueQueued ? <button className="ranked-cancel" data-testid="ranked-cancel" onClick={cancelRankedQueue}>{t('terminal.rankedCancel')}</button> : <button className="ranked-queue" data-testid="ranked-queue" onClick={joinRankedQueue}>{t('terminal.rankedQueue')}</button>}</div><div className="ranked-status" data-testid="ranked-status">{queueQueued ? t('terminal.rankedQueued', { waiting: queueWaiting, band: queueBand?.toUpperCase() ?? 'STANDARD' }) : t('terminal.rankedNotQueued')}</div><div className="ranked-leaderboard" data-testid="ranked-leaderboard">{leaderboard.length === 0 ? <span className="ranked-empty">{t('terminal.noLeaderboard')}</span> : leaderboard.map((entry, index) => <div className="ranked-row" key={`${entry.rating}-${index}`}><span>#{index + 1}</span><em>{entry.band.toUpperCase()}</em><strong>{entry.rating}</strong></div>)}</div></div>{mode === 'ctf' && ctfBoard && <div className="ctf-board" data-testid="ctf-board"><header><div><span className="eyebrow">CAPTURE THE FLAG / LIVE STATS</span><h3>{t('terminal.ctfStats')}</h3></div><em>{t('terminal.activeRooms', { count: ctfBoard.rooms })}</em></header><div className="ctf-totals"><span><strong>CT</strong>{t('terminal.ctfScoreLine', { score: ctfBoard.captures.ct, pickups: ctfBoard.pickups.ct })}</span><span><strong>T</strong>{t('terminal.ctfScoreLine', { score: ctfBoard.captures.t, pickups: ctfBoard.pickups.t })}</span></div><div className="ctf-leaders">{ctfBoard.leaders.length === 0 ? <span className="ranked-empty">{t('terminal.noCtfStats')}</span> : ctfBoard.leaders.map((entry, index) => <div className="ctf-leader-row" key={`${entry.team}-${index}`}><span>#{index + 1}</span><em>{entry.team.toUpperCase()}</em><strong>{t('terminal.ctfLeaderLine', { captures: entry.captures, pickups: entry.pickups, returns: entry.returns })}</strong></div>)}</div></div>}</div>
    {rewardBoard && <div className="reward-ledger" data-testid="reward-ledger"><header><div><span className="eyebrow">KILLSTREAK / REWARD LEDGER</span><h3>{t('terminal.rewardLedger')}</h3></div><em>GRANTED {rewardBoard.granted}</em></header><div className="reward-totals"><span><strong>{rewardBoard.armor}</strong> {t('terminal.armorLabel')}</span><span><strong>{rewardBoard.ammo}</strong> {t('terminal.ammoLabel')}</span><span><strong>{rewardBoard.weapon}</strong> {t('terminal.weaponLabel')}</span><span><strong>{rewardBoard.score}</strong> PTS</span></div></div>}
    </div>
    <footer><span>BUILD 0.1.0 // PROTOTYPE</span><span>MIT / APACHE-2.0 DEPENDENCIES</span></footer>
    <ReleaseNotes open={notesOpen} onClose={() => setNotesOpen(false)} />
  </section>;
}

function ReadyButton() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const players = useGameStore((state) => state.networkPlayers);
  const self = players.find((player) => player.id === selfId);
  if (!running || !self) return null;
  const readyCount = players.filter((player) => player.ready).length;
  return <button className="ready-toggle" aria-label="READY STATUS" onClick={() => matchClient.setReady(!self.ready)}>{self.ready ? `READY ${readyCount}/${players.length}` : `NOT READY ${readyCount}/${players.length}`}</button>;
}

function WeaponBadge() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const weaponName = useGameStore((state) => state.networkPlayers.find((player) => player.id === selfId)?.weaponName ?? 'VX-9');
  return running ? <div className="weapon-badge" data-testid="weapon-name">{weaponName}</div> : null;
}

function WaveBadge() {
  const running = useGameStore((state) => state.running);
  const mode = useGameStore((state) => state.roomMode);
  const wave = useGameStore((state) => state.wave);
  const remaining = useGameStore((state) => state.survivalRemaining);
  return running && mode === 'survival' ? <div className="wave-badge" data-testid="wave-status">WAVE {wave} / {remaining} LEFT</div> : null;
}

function CtfFlagBadge() {
  const running = useGameStore((state) => state.running);
  const mode = useGameStore((state) => state.roomMode);
  const flags = useGameStore((state) => state.flags);
  const teamScores = useGameStore((state) => state.teamScores);
  const scoreLimit = useGameStore((state) => state.scoreLimit);
  const flagReturnMs = useGameStore((state) => state.flagReturnMs);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running || mode !== 'ctf') return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running, mode]);
  if (!running || mode !== 'ctf' || !flags) return null;
  const status = (team: 'ct' | 't') => {
    const flag = flags[team];
    if (!flag) return '?';
    if (flag.holder) return 'CARRIED';
    if (flag.dropAt > 0) {
      const remaining = Math.max(0, Math.ceil((flag.dropAt + (flagReturnMs ?? 30000) - now) / 1000));
      return `RETURN ${remaining}s`;
    }
    return 'HOME';
  };
  return <div className="ctf-badge" data-testid="ctf-status">FLAG CT {status('ct')} / T {status('t')} · CT {teamScores.ct} : {teamScores.t} T · FIRST TO {scoreLimit || 3}</div>;
}

function CarryingFlagBadge() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const flags = useGameStore((state) => state.flags);
  if (!running || !flags) return null;
  const carried = flags.t.holder === selfId ? 'T' : flags.ct.holder === selfId ? 'CT' : null;
  return carried ? <div className="carrying-badge" data-testid="carrying-flag">CARRYING {carried} FLAG</div> : null;
}

function FlagFeed() {
  const running = useGameStore((state) => state.running);
  const mode = useGameStore((state) => state.roomMode);
  const flagFeed = useGameStore((state) => state.flagFeed) ?? [];
  if (!running || mode !== 'ctf' || flagFeed.length === 0) return null;
  const label = (kind: string) => kind === 'flagPickup' ? 'TOOK' : kind === 'flagDrop' ? 'DROPPED' : kind === 'flagReturn' ? 'RETURNED' : 'CAPTURED';
  return <div className="flag-feed" data-testid="flag-feed" aria-label="FLAG FEED">{flagFeed.slice(-4).map((entry) => <div key={entry.id}><strong>{entry.flagTeam.toUpperCase()}</strong><span>{entry.playerName} {label(entry.kind)}</span></div>)}</div>;
}

function CtfCommandBar() {
  const running = useGameStore((state) => state.running);
  const mode = useGameStore((state) => state.roomMode);
  if (!running || mode !== 'ctf') return null;
  const commands = [
    { label: 'PUSH', text: 'PUSH THE ENEMY FLAG' },
    { label: 'DEFEND', text: 'DEFEND OUR FLAG' },
    { label: 'RETURN', text: 'RETURN OUR FLAG' },
    { label: 'HOLD', text: 'HOLD POSITIONS' },
  ];
  return <div className="ctf-commands" data-testid="ctf-commands" aria-label="CTF QUICK COMMANDS">{commands.map((command) => <button key={command.label} onClick={() => matchClient.chat(command.text, 'team')}>{command.label}</button>)}</div>;
}

function RespawnBanner() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const self = useGameStore((state) => state.networkPlayers.find((player) => player.id === selfId));
  return running && self && !self.alive ? <div className="respawn-banner" data-testid="respawn-status">RESPAWN {Math.max(0, self.respawnIn / 1000).toFixed(1)}</div> : null;
}

function PingBadge() {
  const running = useGameStore((state) => state.running);
  const ping = useGameStore((state) => state.pingMs);
  return running && ping !== null ? <div className="ping-badge" data-testid="ping-status">PING {ping}MS</div> : null;
}

function StreakBadge() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const streak = useGameStore((state) => state.networkPlayers.find((player) => player.id === selfId)?.streak ?? 0);
  return running && streak > 0 ? <div className="streak-badge" data-testid="streak-status">STREAK {streak}</div> : null;
}

function KillstreakFeed() {
  const running = useGameStore((state) => state.running);
  const entries = useGameStore((state) => state.killstreakFeed);
  if (!running || entries.length === 0) return null;
  return <div className="killstreak-feed" aria-label="KILLSTREAK REWARDS">{entries.slice(-3).map((entry) => <div key={entry.id} data-testid={`killstreak-${entry.streak}`}><strong>{entry.streak} STREAK</strong><span>{entry.label}</span></div>)}</div>;
}

function HitMarker() {
  const running = useGameStore((state) => state.running);
  const hitMarkerAt = useGameStore((state) => state.hitMarkerAt);
  const hitMarkerKind = useGameStore((state) => state.hitMarkerKind);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (hitMarkerAt <= 0) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 130);
    return () => window.clearTimeout(timer);
  }, [hitMarkerAt]);
  if (!running || !visible) return null;
  return <div className={`hit-marker ${hitMarkerKind === 'kill' ? 'kill' : ''}`} data-testid="hit-marker" />;
}

function FpsBadge() {
  const running = useGameStore((state) => state.running);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!running) return;
    let frames = 0; let started = performance.now(); let frame = 0;
    const tick = (now: number) => { frames += 1; if (now - started >= 500) { setFps(Math.round(frames * 1000 / (now - started))); frames = 0; started = now; } frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  return running && fps > 0 ? <div className="fps-badge" data-testid="fps-status">FPS {fps}</div> : null;
}

function MatchLifecycleBadge() {
  const running = useGameStore((state) => state.running);
  const phase = useGameStore((state) => state.roomPhase);
  const countdownAt = useGameStore((state) => state.countdownAt);
  const endsAt = useGameStore((state) => state.matchEndsAt);
  const ready = useGameStore((state) => state.readyPlayers);
  const required = useGameStore((state) => state.requiredReady);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(timer); }, [running]);
  if (!running) return null;
  const seconds = phase === 'countdown' ? Math.max(0, Math.ceil((countdownAt - now) / 1000)) : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const label = phase === 'waiting' ? `READY ${ready}/${required}` : phase === 'countdown' ? `START ${seconds}` : phase === 'live' ? `TIME ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'MATCH OVER';
  return <div className="match-lifecycle-badge" data-testid="match-lifecycle">{label}</div>;
}

function RoundBadge() {
  const running = useGameStore((state) => state.running);
  const mode = useGameStore((state) => state.roomMode);
  const phase = useGameStore((state) => state.roomPhase);
  const round = useGameStore((state) => state.round);
  const roundWins = useGameStore((state) => state.roundWins);
  const roundEndsAt = useGameStore((state) => state.roundEndsAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(timer); }, [running]);
  if (!running || mode !== 'team-deathmatch') return null;
  const breakSeconds = roundEndsAt > now ? Math.ceil((roundEndsAt - now) / 1000) : 0;
  const label = phase === 'countdown' && roundEndsAt > 0 ? `ROUND ${round} BREAK ${breakSeconds}` : `ROUND ${round} / CT ${roundWins.ct} : ${roundWins.t} T`;
  return <div className="round-badge" data-testid="round-status">{label}</div>;
}

function RankedResultPanel() {
  const ranked = useGameStore((state) => state.roomRanked);
  const status = useGameStore((state) => state.roomStatus);
  const result = useGameStore((state) => state.rankedResult);
  const t = useTranslate();
  if (!ranked || status !== 'ended' || !result) return null;
  return <div className="ranked-result" role="dialog" aria-label={t('ranked.title')} data-testid="ranked-result"><div className="ranked-result-panel"><span className="eyebrow">RANKED DUEL / SETTLED</span><h2>{result.winner ? t('ranked.victory') : t('ranked.defeat')}</h2><p data-testid="ranked-delta">{t('ranked.ratingLine', { delta: `${result.delta >= 0 ? '+' : ''}${result.delta}`, rating: result.rating })}</p><strong>BAND / {result.band.toUpperCase()}</strong><button className="deploy" onClick={() => useGameStore.getState().setRankedResult(null)}>{t('ranked.continue')}</button></div></div>;
}

function SeriesResultBadge() {
  const status = useGameStore((state) => state.roomStatus);
  const mode = useGameStore((state) => state.roomMode);
  const round = useGameStore((state) => state.round);
  const wins = useGameStore((state) => state.roundWins);
  if (status !== 'ended' || mode !== 'team-deathmatch') return null;
  return <div className="series-result" data-testid="series-result">ROUND {round} COMPLETE / CT {wins.ct} : {wins.t} T</div>;
}

function SpectatorBadge() {
  const running = useGameStore((state) => state.running);
  const spectator = useGameStore((state) => state.spectator);
  const followId = useGameStore((state) => state.followId);
  const players = useGameStore((state) => state.networkPlayers);
  const cycleFollow = useGameStore((state) => state.cycleFollow);
  const roomPhase = useGameStore((state) => state.roomPhase);
  const spectators = useGameStore((state) => state.spectators);
  const t = useTranslate();
  if (!running || !spectator) return null;
  const follow = players.find((player) => player.id === followId);
  return <div className="spectating" data-testid="spectating"><span>{t('hud.spectating')}</span><strong>{follow?.name ?? '…'}</strong><em data-testid="spectator-phase">{roomPhase.toUpperCase()} / {t('hud.spectatorCount', { count: spectators })}</em><button aria-label="CYCLE TARGET" onClick={cycleFollow}>{t('hud.switch')}</button></div>;
}

function PickupPanel() {
  const running = useGameStore((state) => state.running);
  const pickups = useGameStore((state) => state.pickups);
  if (!running || pickups.length === 0) return null;
  return <div className="pickup-panel" aria-label="SUPPLY POINTS">{pickups.map((pickup) => <button key={pickup.id} disabled={!pickup.available} onClick={() => matchClient.pickup(pickup.id)}>{pickup.available ? (pickup.value ? `${pickup.kind.toUpperCase()} ${pickup.value}` : pickup.kind.toUpperCase()) : `${Math.ceil((pickup.respawnIn ?? 0) / 1000)}s`}</button>)}</div>;
}

function WeaponPickupPanel() {
  const running = useGameStore((state) => state.running);
  const weaponPickups = useGameStore((state) => state.weaponPickups);
  const roomMode = useGameStore((state) => state.roomMode);
  if (!running || weaponPickups.length === 0 || roomMode === 'gun-game') return null;
  return <div className="pickup-panel weapon-panel" aria-label="WEAPON POINTS">{weaponPickups.map((pickup) => <button key={pickup.id} disabled={!pickup.available} onClick={() => matchClient.pickupWeapon(pickup.id)}>{pickup.available ? pickup.weapon : 'RESPAWNING'}</button>)}</div>;
}

function ArmorBadge() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const players = useGameStore((state) => state.networkPlayers);
  const self = players.find((player) => player.id === selfId);
  const t = useTranslate();
  if (!running || !self || (self.armor ?? 0) <= 0) return null;
  return <div className="armor-badge" data-testid="armor-badge">{t('hud.armorValue', { value: self.armor ?? 0 })}</div>;
}

function LoadoutPanel() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const mode = useGameStore((state) => state.roomMode);
  const self = useGameStore((state) => state.networkPlayers.find((player) => player.id === selfId));
  if (!running || mode !== 'gun-game' || !self) return null;
  return <div className="loadout-panel" aria-label="LOADOUT">{['VX-9', 'RAPTOR', 'HAMMER'].map((name, tier) => <button key={name} disabled={tier > self.weaponTier} className={self.weaponName === name ? 'active' : ''} onClick={() => matchClient.equip(tier)}>{name}</button>)}</div>;
}

function Radar() {
  const running = useGameStore((state) => state.running);
  const selfId = useGameStore((state) => state.selfId);
  const mapId = useGameStore((state) => state.mapId);
  const players = useGameStore((state) => state.networkPlayers);
  const flags = useGameStore((state) => state.flags);
  const domination = useGameStore((state) => state.domination);
  if (!running || players.length === 0) return null;
  const map = mapDefinitionById(mapId ?? 'strike');
  const outline = mapOutlineToRadar(map);
  const cover = map.boxes.map((box) => colliderToRadar(box, map));
  return <div className="radar" aria-label="RADAR" data-map={map.id}><span className="radar-cross horizontal" /><span className="radar-cross vertical" /><i className="radar-outline" style={{ left: `${outline.leftPct}%`, top: `${outline.topPct}%`, width: `${outline.widthPct}%`, height: `${outline.heightPct}%` }} />{cover.map((rect, index) => <i className="radar-cover" key={index} style={{ left: `${rect.leftPct}%`, top: `${rect.topPct}%`, width: `${rect.widthPct}%`, height: `${rect.heightPct}%` }} />)}{flags && (['ct', 't'] as const).map((team) => { const flag = flags[team]; if (!flag) return null; const point = worldToRadar(flag.x, flag.z, map); return <i className={`radar-flag ${team}`} key={team} data-testid={`radar-flag-${team}`} style={{ left: `${Math.round(point.leftPct)}%`, top: `${Math.round(point.topPct)}%` }} aria-label={`${team.toUpperCase()} FLAG`} />; })}{players.map((player) => {
    const point = worldToRadar(player.x, player.z, map);
    return <i className={`radar-dot ${player.id === selfId ? 'self' : 'remote'}`} key={player.id} style={{ left: `${Math.round(point.leftPct)}%`, top: `${Math.round(point.topPct)}%` }} aria-label={player.id === selfId ? 'SELF' : 'REMOTE PLAYER'} />;
  })}</div>;
}

function ChatBox() {
  const running = useGameStore((state) => state.running);
  const messages = useGameStore((state) => state.chatMessages);
  const players = useGameStore((state) => state.networkPlayers);
  const roomMode = useGameStore((state) => state.roomMode);
  const selfId = useGameStore((state) => state.selfId);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'all' | 'team'>('all');
  if (!running) return null;
  const names = new Map(players.map((player) => [player.id, player.name]));
  const selfPlayer = players.find((player) => player.id === selfId);
  const teamMode = (roomMode === 'ctf' || roomMode === 'team-deathmatch') && selfPlayer?.team !== 'solo';
  const submit = (event: FormEvent) => { event.preventDefault(); const value = text.trim(); if (!value) return; matchClient.chat(value, scope === 'team' ? 'team' : undefined); setText(''); };
  return <div className="chat-box" aria-label="CHAT"><div className="chat-messages">{messages.slice(-5).map((message) => <div key={message.id}><strong>{message.scope === 'team' ? `[T] ${names.get(message.senderId) ?? 'UNKNOWN'}` : names.get(message.senderId) ?? 'UNKNOWN'}</strong><span>{message.text}</span></div>)}</div><form onSubmit={submit}><input aria-label="CHAT MESSAGE" value={text} maxLength={120} onChange={(event) => setText(event.target.value)} placeholder="Message" /><button aria-label="SEND CHAT" type="submit">SEND</button></form>{teamMode && <button className="chat-scope" aria-label="CHAT SCOPE" data-testid="chat-scope" onClick={() => setScope(scope === 'team' ? 'all' : 'team')}>{scope === 'team' ? 'TEAM' : 'ALL'}</button>}</div>;
}

function TouchControls() {
  const running = useGameStore((state) => state.running);
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches), []);
  if (!running || !touch) return null;
  const hold = (code: string, active: boolean) => window.dispatchEvent(new KeyboardEvent(active ? 'keydown' : 'keyup', { code, bubbles: true }));
  const fire = () => document.querySelector<HTMLCanvasElement>('#arena-canvas canvas')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return <div className="touch-controls" aria-label="TOUCH CONTROLS">
    <div className="touch-pad"><button aria-label="MOVE FORWARD" onPointerDown={() => hold('KeyW', true)} onPointerUp={() => hold('KeyW', false)}><ArrowUp size={19} /></button><div><button aria-label="MOVE LEFT" onPointerDown={() => hold('KeyA', true)} onPointerUp={() => hold('KeyA', false)}><ArrowLeft size={19} /></button><button aria-label="MOVE BACK" onPointerDown={() => hold('KeyS', true)} onPointerUp={() => hold('KeyS', false)}><ArrowDown size={19} /></button><button aria-label="MOVE RIGHT" onPointerDown={() => hold('KeyD', true)} onPointerUp={() => hold('KeyD', false)}><ArrowRight size={19} /></button></div></div>
    <div className="touch-actions"><button className="touch-fire" aria-label="FIRE" onPointerDown={fire}><Crosshair size={24} /></button><button aria-label="RELOAD" onPointerDown={() => { hold('KeyR', true); hold('KeyR', false); }}><RotateCcw size={18} /></button></div>
  </div>;
}

function Hud() {
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const { health, ammo, score, kills, hits, notice, stop, networkStatus, networkPlayers, selfId, roomStatus, roomPhase, roomMode, winner, teamScores, scoreLimit, round, roundWins, killFeed, nextMapId, spectator, followId, spectators, mapId } = useGameStore();
  const t = useTranslate();
  const names = new Map(networkPlayers.map((player) => [player.id, player.name]));
  const feedName = (id: string) => names.get(id) ?? 'UNKNOWN';
  const toggleScoreboard = (event: KeyboardEvent) => {
    if (event.code !== 'Tab') return;
    event.preventDefault();
    setScoreboardOpen(event.type === 'keydown');
  };
  useEffect(() => { window.addEventListener('keydown', toggleScoreboard); window.addEventListener('keyup', toggleScoreboard); return () => { window.removeEventListener('keydown', toggleScoreboard); window.removeEventListener('keyup', toggleScoreboard); }; });
  const leave = () => { matchClient.leave(); stop(); };
  const restart = () => { const selectedMode = useGameStore.getState().mode; useGameStore.getState().start(); connectMatch(selectedMode, null); };
  const modeLabel = roomMode === 'team-deathmatch' ? 'TDM' : roomMode === 'ctf' ? 'CTF' : roomMode === 'free-for-all' ? 'FFA' : roomMode?.toUpperCase() ?? 'LOCAL';
  const selfPlayer = networkPlayers.find((player) => player.id === selfId);
  const readyCount = networkPlayers.filter((player) => player.ready).length;
  const toggleReady = () => matchClient.setReady(!selfPlayer?.ready);
  const connectionText = roomStatus === 'ended' ? `MATCH OVER / ${winner?.toUpperCase() ?? 'DRAW'}` : networkStatus === 'online' && roomPhase === 'waiting' ? `${modeLabel} WAITING ${networkPlayers.length}` : networkStatus === 'online' && roomPhase === 'countdown' ? `${modeLabel} STARTING` : networkStatus === 'online' ? `${modeLabel} LIVE ${networkPlayers.length}${teamScores.ct || teamScores.t ? ` / CT ${teamScores.ct} : T ${teamScores.t}` : ''}` : networkStatus === 'reconnecting' ? 'RECONNECTING' : networkStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE TRAINING';
  return <><div className="hud-top"><div className="wordmark">小小CSGO</div><div className="signal"><span className="status-dot" /> {connectionText}</div><button className="exit" onClick={leave}>{t('hud.exit')}</button></div><div className="kill-feed">{killFeed.map((entry) => <div key={entry.id}><strong>{feedName(entry.attackerId)}</strong><span> ✕ </span>{feedName(entry.targetId)}</div>)}</div><div className="reticle"><i /><b /><i /><b /></div><div className="combat-notice">{notice}</div>{(selfPlayer?.shieldMs ?? 0) > 0 && <div className="spawn-shield" data-testid="spawn-shield">SPAWN SHIELD {((selfPlayer?.shieldMs ?? 0) / 1000).toFixed(1)}s</div>}<div className="hud-bottom"><div className="health"><span>{t('hud.health')}</span><strong>{health}</strong><div><i /></div></div><div className="score"><span>{t('hud.hits', { hits })}</span><strong>{score.toString().padStart(5, '0')}</strong><small>{t('hud.kills', { kills })}</small></div><div className="ammo"><span>{t('hud.trainingRifle')}</span><strong>{ammo}<small>/ 30</small></strong><em>{t('hud.reloadKey')}</em></div></div><div className="controls">{t('hud.move')} <span /> {t('hud.aim')} <span /> {t('hud.fire')} <span /> {t('hud.sprint')} <span /> {t('hud.scoreboardKey')}</div>{scoreboardOpen && <div className="scoreboard" role="dialog" aria-label={t('hud.scoreboard')}><div className="scoreboard-panel"><header><span className="eyebrow">ROOM / {roomMode?.toUpperCase()}</span><h2>{t('hud.scoreboard')}</h2><strong>CT {teamScores.ct} : {teamScores.t} T{(roomMode === 'ctf' || roomMode === 'domination') ? ` · FIRST TO ${scoreLimit || 3}` : ''}</strong></header>{spectator && <div className="scoreboard-meta" data-testid="spectator-board-meta">{t('hud.spectateMeta', { spectators, map: (mapId ?? 'strike').toUpperCase(), phase: roomPhase.toUpperCase() })}</div>}<div className="scoreboard-rows">{[...networkPlayers].sort((a, b) => b.kills - a.kills).map((player) => <div className={`scoreboard-row ${spectator ? 'selectable' : ''} ${spectator && player.id === followId ? 'followed' : ''}`} key={player.id} onClick={spectator ? () => useGameStore.getState().setFollowId(player.id) : undefined}><span className={`team-chip ${player.team}`}>{player.team.toUpperCase()}</span><b>{player.name}</b><span>{player.kills} K / {player.deaths} D{roomMode === 'ctf' ? ` / ${player.captures} C` : ''}</span><i>{spectator ? (player.id === followId ? t('hud.following') : t('hud.clickFollow')) : (player.id === useGameStore.getState().selfId ? 'YOU' : '')}</i></div>)}</div></div></div>}{roomStatus === 'ended' && <div className="match-over" role="dialog" aria-label={t('hud.matchOver')}><div className="match-over-panel"><span className="eyebrow">MATCH COMPLETE / {roomMode?.toUpperCase()}</span><h2>{t('hud.matchOver')}</h2><p>{winner ? t('hud.teamWins', { team: winner.toUpperCase() }) : t('hud.draw')}</p><strong>CT {teamScores.ct} : {teamScores.t} T</strong><p className="next-map" data-testid="next-map">NEXT MAP / {nextMapId?.toUpperCase()}</p><div><button className="deploy" onClick={restart}><Crosshair size={18} /> {t('hud.playAgain')}</button><button className="exit match-over-exit" onClick={leave}>{t('hud.backToTerminal')}</button></div></div></div>}</>;
}

export default function App() {
  const running = useGameStore((state) => state.running);
  const spectator = useGameStore((state) => state.spectator);
  const followId = useGameStore((state) => state.followId);
  const players = useGameStore((state) => state.networkPlayers);
  useEffect(() => {
    if (!spectator) return;
    const followed = players.find((player) => player.id === followId);
    if (followId && followed && !followed.alive && followed.respawnIn > 0) {
      useGameStore.getState().advanceFollow(followId);
      return;
    }
    if (followId && !followed) {
      useGameStore.getState().advanceFollow(followId);
      return;
    }
    if (!followId) useGameStore.getState().setFollowId(nextFollowTarget(players, null));
  }, [spectator, followId, players]);
  return <main className={running ? 'game-shell active' : 'game-shell'}><Arena />{running ? <Hud /> : <ModeTerminal />}<ReadyButton /><WeaponBadge /><ArmorBadge /><WaveBadge /><CtfFlagBadge /><CarryingFlagBadge /><FlagFeed /><CtfCommandBar /><RespawnBanner /><PingBadge /><StreakBadge /><KillstreakFeed /><HitMarker /><FpsBadge /><MatchLifecycleBadge /><RoundBadge /><SeriesResultBadge /><SpectatorBadge /><RankedResultPanel /><PickupPanel /><WeaponPickupPanel /><LoadoutPanel /><Radar /><ChatBox /><TouchControls />{!running && <SettingsPanel />}</main>;
}
