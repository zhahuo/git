window.applyQuality = (opts = {}) => {
  const s = SettingsStore.get();
  const renderer = opts.renderer || window.__gameRenderer;
  if (!renderer) return;
  window.__gameRenderer = renderer;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const scale = Math.max(0.5, Math.min(2, s.resolutionScale));
  renderer.setPixelRatio(Math.max(0.5, dpr * scale));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !!s.effects.shadows;
  if (window.compMat && window.compMat.uniforms) {
    window.compMat.uniforms.bloom.value = s.effects.bloom ? 0.60 : 0;
  }
  if (window.PS_SPARK) window.PS_SPARK.pts.visible = !!s.effects.particles;
  if (window.PS_SOFT) window.PS_SOFT.pts.visible = !!s.effects.particles;
  if (typeof window.onQualityApplied === 'function') window.onQualityApplied(s);
};