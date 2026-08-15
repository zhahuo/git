import { RotateCcw, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { gameAudio } from '../game/audio';
import { LANGUAGES, useLanguageStore, useTranslate } from '../game/i18n';

const STORAGE_KEY = 'strikezone.sensitivity';
const CALLSIGN_KEY = 'strikezone.callsign';
const DEFAULT_SENSITIVITY = 1;

function readSensitivity() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) return DEFAULT_SENSITIVITY;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.min(2, Math.max(0.25, value)) : DEFAULT_SENSITIVITY;
}

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [callsign, setCallsign] = useState('OPERATOR');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const t = useTranslate();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  useEffect(() => { setSensitivity(readSensitivity()); setCallsign(localStorage.getItem(CALLSIGN_KEY) ?? 'OPERATOR'); setAudioEnabled(gameAudio.isEnabled()); }, [open]);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.code === 'Escape') setOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [open]);
  const update = (value: number) => { setSensitivity(value); localStorage.setItem(STORAGE_KEY, value.toFixed(2)); };
  const reset = () => update(DEFAULT_SENSITIVITY);
  const toggleAudio = () => { const next = !gameAudio.isEnabled(); gameAudio.setEnabled(next); setAudioEnabled(next); };
  return <>
    <button className="settings-trigger" aria-label="OPEN SETTINGS" title="Open settings" onClick={() => setOpen(true)}><Settings size={15} /> SETTINGS</button>
    {open && <div className="settings-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside className="settings-panel" role="dialog" aria-label="SETTINGS">
        <header><div><span className="eyebrow">SYSTEM / CONTROL</span><h2>SETTINGS</h2></div><button className="notes-close" aria-label="CLOSE SETTINGS" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <label className="setting-row" htmlFor="sensitivity"><span><strong>{t('settings.sensitivity')}</strong><small>{t('settings.sensitivityHint')}</small></span><output>{sensitivity.toFixed(2)}</output></label>
        <input id="sensitivity" className="sensitivity-slider" type="range" min="0.25" max="2" step="0.05" value={sensitivity} onChange={(event) => update(Number(event.target.value))} />
        <label className="setting-row callsign-row" htmlFor="callsign"><span><strong>{t('settings.callsign')}</strong><small>{t('settings.callsignHint')}</small></span></label>
        <input id="callsign" className="callsign-input" aria-label="CALL SIGN" value={callsign} maxLength={16} pattern="[A-Za-z0-9_-]{3,16}" onChange={(event) => { const value = event.target.value.replace(/[^A-Za-z0-9_-]/g, ''); setCallsign(value); localStorage.setItem(CALLSIGN_KEY, value); }} />
        <div className="setting-row callsign-row"><span><strong>{t('settings.language')}</strong><small>{t('settings.languageHint')}</small></span></div>
        <div className="language-row" id="language" role="group" aria-label="LANGUAGE">{LANGUAGES.map((entry) => <button key={entry.id} className={entry.id === language ? 'active' : ''} aria-pressed={entry.id === language} onClick={() => setLanguage(entry.id)}>{entry.label}</button>)}</div>
        <button className="settings-reset" data-testid="audio-toggle" onClick={toggleAudio}>{audioEnabled ? t('settings.audioOn') : t('settings.audioOff')}</button>
        <button className="settings-reset" onClick={reset}><RotateCcw size={14} /> {t('settings.reset')}</button>
      </aside>
    </div>}
  </>;
}
