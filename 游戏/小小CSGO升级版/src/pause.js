window.setupPauseMenu = () => {
  const pauseEl = document.getElementById('pause');
  if (!pauseEl) return;
  pauseEl.innerHTML = `
    <div class="pause-panel">
      <div class="t">已暂停</div>
      <button class="pause-btn pause-continue" type="button">继续</button>
      <button class="pause-btn pause-settings" type="button">设置</button>
      <button class="pause-btn pause-restart" type="button">重开本局</button>
      <button class="pause-btn pause-menu" type="button">回主菜单</button>
    </div>`;

  let panel = document.getElementById('settingsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'settingsPanel';
    panel.className = 'settings-panel';
    document.body.appendChild(panel);
  }

  const s = SettingsStore.get();
  panel.innerHTML = `
    <div class="settings-panel-inner">
      <div class="settings-title">设置</div>
      <label>音量 <input id="setVolume" type="range" min="0" max="100" value="${Math.round(s.volume*100)}"></label>
      <label>灵敏度 <input id="setSensitivity" type="range" min="20" max="300" step="5" value="${Math.round(s.sensitivity*100)}"></label>
      <label class="check"><input id="setInvert" type="checkbox" ${s.invertY?'checked':''}> 鼠标垂直反转</label>
      <label>画质
        <select id="setQuality">
          <option value="low" ${s.quality==='low'?'selected':''}>低</option>
          <option value="medium" ${s.quality==='medium'?'selected':''}>中</option>
          <option value="high" ${s.quality==='high'?'selected':''}>高</option>
          <option value="ultra" ${s.quality==='ultra'?'selected':''}>极高</option>
        </select>
      </label>
      <label>分辨率缩放 <input id="setResolution" type="range" min="50" max="150" step="5" value="${Math.round(s.resolutionScale*100)}"></label>
      <label class="check"><input id="setParticles" type="checkbox" ${s.effects.particles?'checked':''}> 粒子特效</label>
      <label class="check"><input id="setBloom" type="checkbox" ${s.effects.bloom?'checked':''}> 光晕</label>
      <label class="check"><input id="setShadows" type="checkbox" ${s.effects.shadows?'checked':''}> 阴影</label>
      <label class="check"><input id="setMotionBlur" type="checkbox" ${s.effects.motionBlur?'checked':''}> 动态模糊</label>
      <div class="settings-actions">
        <button id="settingsClose" type="button">返回</button>
        <button id="settingsReset" type="button">恢复默认</button>
      </div>
    </div>`;

  const read = () => ({
    volume: Number(document.getElementById('setVolume').value) / 100,
    sensitivity: Number(document.getElementById('setSensitivity').value) / 100,
    invertY: document.getElementById('setInvert').checked,
    quality: document.getElementById('setQuality').value,
    resolutionScale: Number(document.getElementById('setResolution').value) / 100,
    effects: {
      particles: document.getElementById('setParticles').checked,
      bloom: document.getElementById('setBloom').checked,
      shadows: document.getElementById('setShadows').checked,
      motionBlur: document.getElementById('setMotionBlur').checked
    }
  });
  const apply = () => {
    const next = read();
    SettingsStore.set(next);
    if (window.__masterGain) window.__masterGain.gain.value = 0.85 * next.volume;
    if (window.applyQuality) window.applyQuality();
  };
  panel.querySelectorAll('input, select').forEach((el) => el.addEventListener('change', apply));
  panel.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', apply));
  document.getElementById('settingsClose').addEventListener('click', () => {
    panel.classList.remove('on');
    pauseEl.classList.add('on');
  });
  document.getElementById('settingsReset').addEventListener('click', () => {
    SettingsStore.reset();
    if (window.__masterGain) window.__masterGain.gain.value = 0.85 * SettingsStore.get().volume;
    if (window.applyQuality) window.applyQuality();
    if (window.setupPauseMenu) window.setupPauseMenu();
  });

  pauseEl.querySelector('.pause-continue').addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.SFX && window.SFX.init) window.SFX.init();
    if (window.requestLock) window.requestLock();
  });
  pauseEl.querySelector('.pause-settings').addEventListener('click', (e) => {
    e.stopPropagation();
    pauseEl.classList.remove('on');
    panel.classList.add('on');
  });
  pauseEl.querySelector('.pause-restart').addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.restart) window.restart(); else location.reload();
  });
  pauseEl.querySelector('.pause-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    location.reload();
  });
};