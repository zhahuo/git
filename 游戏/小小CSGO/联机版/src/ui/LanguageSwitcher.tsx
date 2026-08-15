import { Languages } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, useLanguageStore } from '../game/i18n';

export function LanguageSwitcher() {
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const current = LANGUAGES.find((entry) => entry.id === language) ?? LANGUAGES[0];
  return <div className="language-switcher" ref={ref}>
    <button className="language-trigger" aria-label="LANGUAGE" title="LANGUAGE" onClick={() => setOpen((value) => !value)}><Languages size={15} /> {current.short}</button>
    {open && <div className="language-menu" role="menu" aria-label="LANGUAGE">{LANGUAGES.map((entry) => <button key={entry.id} role="menuitem" className={entry.id === language ? 'active' : ''} onClick={() => { setLanguage(entry.id); setOpen(false); }}>{entry.label}</button>)}</div>}
  </div>;
}
