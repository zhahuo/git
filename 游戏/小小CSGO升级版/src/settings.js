window.SettingsStore = (() => {
  const KEY = 'xiaoxiaocsgo.v4.settings';
  const DEFAULTS = {
    volume: 0.8,
    sensitivity: 1,
    invertY: false,
    quality: 'high',
    resolutionScale: 1,
    effects: { particles: true, bloom: true, shadows: true, motionBlur: false }
  };
  function cloneDefault(){
    return { ...DEFAULTS, effects: { ...DEFAULTS.effects } };
  }
  function load(){
    const base = cloneDefault();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      return { ...base, ...parsed, effects: { ...base.effects, ...(parsed.effects || {}) } };
    } catch (e) { return base; }
  }
  let state = load();
  function save(){
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function get(){ return state; }
  function set(patch){
    state = { ...state, ...patch, effects: { ...state.effects, ...(patch.effects || {}) } };
    save();
    return state;
  }
  function reset(){
    state = cloneDefault();
    save();
    return state;
  }
  return { init(){ state = load(); }, get, set, reset, KEY };
})();