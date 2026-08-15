/* 小小CSGO V3 布局模块
 * 独立交付：场景布局（掩体分布/高低差）、UI/HUD 布局、加载性能。
 * 本文件不修改 index.html、maps.js、i18n.js；接线由 V3-集成统一完成。
 */
(function (global) {
  'use strict';

  const V3Layout = {
    version: '1.0.0',
    name: 'V3-布局'
  };

  /* ---------------- 基础工具 ---------------- */
  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  const HALF_PI = Math.PI / 2;

  /* ---------------- 事件 ---------------- */
  const listeners = Object.create(null);

  function on(name, fn) {
    if (typeof fn !== 'function') return;
    (listeners[name] || (listeners[name] = [])).push(fn);
  }

  function emit(name, data) {
    const list = listeners[name];
    if (!list) return;
    for (const fn of list.slice()) {
      try {
        fn(data);
      } catch (err) {
        console.warn('[V3Layout] listener error', err);
      }
    }
  }

  /* ---------------- 场景布局数据 ---------------- */
  const HEIGHT_LEVELS = [
    { id: 'ground',       label: '地面',     y: 0 },
    { id: 'crateTop',     label: '货箱顶',   y: 1.25 },
    { id: 'containerTop', label: '集装箱顶', y: 2.85 },
    { id: 'deck',         label: '仓库二层', y: 4.42 },
    { id: 'stackedTop',   label: '叠箱顶',   y: 5.70 },
    { id: 'roof',         label: '仓库屋顶', y: 7.82 }
  ];

  const ZONES = [
    { id: 'spawn-yard',     label: '南侧出生点',       anchor: { x: 0, z: 24 },  heightLevel: 'ground' },
    { id: 'east-corridor',  label: '东侧集装箱走廊',   anchor: { x: 16, z: 0 },  heightLevel: 'containerTop' },
    { id: 'west-warehouse', label: '西侧仓库与狙击台', anchor: { x: -22, z: -4 }, heightLevel: 'deck' },
    { id: 'central-wreck',  label: '中央焚毁卡车',     anchor: { x: 0.5, z: -1.5 }, heightLevel: 'ground' },
    { id: 'north-barrier',  label: '北侧断墙',         anchor: { x: -8, z: -14 }, heightLevel: 'ground' },
    { id: 'guard-shack',    label: '东北岗亭',         anchor: { x: 25, z: -14 }, heightLevel: 'roof' }
  ];

  /* 新增掩体：优先填补中路、西侧入口和东侧空地，避免堵死现有巷道。 */
  const COVER_PATCHES = [
    /* 墩体只使用 0 / PI_2 两种朝向，保证与 index.html 的轴对齐碰撞盒一致 */
    { id: 'mid-bunker-a',   kind: 'barrier', x: -1.8,  z: -11.8, rotY: 0,       core: true  },
    { id: 'mid-bunker-b',   kind: 'barrier', x: 1.6,   z: -12.0, rotY: HALF_PI, core: true  },
    { id: 'mid-bunker-c',   kind: 'barrier', x: -0.6,  z: -15.2, rotY: 0,       core: true  },
    { id: 'west-approach',  kind: 'crate',   x: -20.5, z: -13.5, rotY: 0.35,   core: false },
    { id: 'west-yard-mid',  kind: 'crate',   x: -13.5, z: -10.5, rotY: 0.70,   core: false },
    { id: 'east-courtyard', kind: 'crate',   x: 8.5,   z: 7.5,   rotY: 0.90,   core: false },
    { id: 'ne-pocket',      kind: 'crate',   x: 23.5,  z: 12.0,  rotY: -0.40,  core: false }
  ];

  /* 新增高低差：两个叠箱高台 + 两处低矮可上平台，保留原巷道通行。 */
  const HEIGHT_PATCHES = [
    { id: 'west-perch',   kind: 'stackedContainer', x: -11,   z: -4,    rotY: HALF_PI, core: true  },
    { id: 'south-perch',  kind: 'stackedContainer', x: -4.5,  z: -21.5, rotY: HALF_PI, core: true  },
    { id: 'east-step',    kind: 'platform',         x: 22.6,  z: -6.8,  w: 1.6, h: 0.9, d: 1.6, core: false },
    { id: 'center-step',  kind: 'platform',         x: 4.2,   z: 11.2,  w: 1.8, h: 0.8, d: 1.4, core: false }
  ];

  const ROUTES = [
    { id: 'east-lane',       zone: 'east-corridor',  points: [[12.6, -19], [12.6, -9.4], [12.6, 0.2], [12.6, 9.8], [12.6, 19.4]] },
    { id: 'ramp-route',      zone: 'west-warehouse', points: [[-21.2, 15.2], [-21.2, 6.0], [-22, 0]] },
    { id: 'center-crossing', zone: 'central-wreck',  points: [[-20, -14], [0, -8], [20, -14]] }
  ];

  const scenePlan = {
    version: 1,
    bounds: { half: 30 },
    zones: ZONES,
    heightLevels: HEIGHT_LEVELS,
    routes: ROUTES,
    patches: {
      cover: COVER_PATCHES,
      height: HEIGHT_PATCHES
    }
  };

  /* ---------------- 性能档位 ---------------- */
  let tierCache = null;

  function tier() {
    if (tierCache) return tierCache;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const cores = (nav && nav.hardwareConcurrency) || 8;
    const memory = (nav && nav.deviceMemory) || 8;
    const mobile = !!(nav && /Android|iPhone|iPad|iPod|Mobile/.test(nav.userAgent || ''));
    tierCache = (cores <= 2 || (cores <= 4 && memory <= 4) || mobile) ? 'low' : 'high';
    return tierCache;
  }

  const performancePlan = {
    detect() {
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      return {
        tier: tier(),
        cores: (nav && nav.hardwareConcurrency) || 0,
        memoryGB: (nav && nav.deviceMemory) || 0,
        dpr: global.devicePixelRatio || 1,
        aspect: (global.innerWidth || 0) / Math.max(global.innerHeight || 1, 1),
        mobile: !!(nav && /Android|iPhone|iPad|iPod|Mobile/.test(nav.userAgent || ''))
      };
    },
    reduce() {
      const root = document.documentElement;
      if (root) root.classList.add('v3-layout-lowend');
      return V3Layout;
    },
    restore() {
      const root = document.documentElement;
      if (root && tier() !== 'low') root.classList.remove('v3-layout-lowend');
      return V3Layout;
    }
  };

  /* ---------------- 场景应用 ---------------- */
  let sceneApplied = false;

  function resolveMaterial(api, name) {
    if (api && api.materials && api.materials[name]) return api.materials[name];
    if (typeof MAT !== 'undefined' && MAT[name]) return MAT[name];
    return null;
  }

  function addBox(api, w, h, d, x, y, z, mat, opt) {
    if (api && typeof api.box === 'function') return api.box(w, h, d, x, y, z, mat, opt);
    if (typeof box === 'function') return box(w, h, d, x, y, z, mat, opt);
    return null;
  }

  /* api 可选：{ materials, box }。没有 api 时回退到 index.html 的全局 box/MAT。 */
  function applyScene(api, options) {
    if (sceneApplied) return V3Layout;
    options = options || {};
    const canBox = (api && typeof api.box === 'function') || typeof box === 'function';
    if (!canBox) {
      console.warn('[V3Layout] 场景接口未就绪，跳过 applyScene');
      return V3Layout;
    }
    const density = options.density || (tier() === 'low' ? 'core' : 'full');
    const coreOnly = density === 'core';
    const coverList = coreOnly ? COVER_PATCHES.filter(p => p.core !== false) : COVER_PATCHES;
    const heightList = coreOnly ? HEIGHT_PATCHES.filter(p => p.core !== false) : HEIGHT_PATCHES;
    let added = 0;

    for (const c of coverList) {
      if (c.kind === 'barrier') {
        const mat = resolveMaterial(api, 'concrete');
        if (!mat) continue;
        const rot = c.rotY || 0;
        const rotated = Math.abs(Math.cos(rot)) < 0.5;
        const w = rotated ? 0.55 : 2.5;
        const d = rotated ? 2.5 : 0.55;
        const m = addBox(api, w, 1.05, d, c.x, 0, c.z, mat, {
          rotY: rot,
          uvScale: [1, 0.5],
          map: '#4e555c'
        });
        if (m) added++;
      } else if (c.kind === 'crate') {
        const mat = resolveMaterial(api, 'crate');
        if (!mat) continue;
        const m = addBox(api, 1.25, 1.25, 1.25, c.x, 0, c.z, mat, {
          rotY: c.rotY,
          uvScale: [1, 1],
          map: '#4a4238'
        });
        if (m) added++;
      }
    }

    for (const h of heightList) {
      if (h.kind === 'stackedContainer') {
        const mat = resolveMaterial(api, 'container');
        if (!mat) continue;
        const rot = h.rotY || 0;
        const rotated = Math.abs(Math.cos(rot)) < 0.5;
        const w = rotated ? 9.0 : 2.7;
        const d = rotated ? 2.7 : 9.0;
        const m = addBox(api, w, 2.85, d, h.x, 2.85, h.z, mat, {
          rotY: rot,
          uvScale: [2.4, 1],
          map: '#5a6068'
        });
        if (m) added++;
      } else if (h.kind === 'platform') {
        const mat = resolveMaterial(api, 'concrete');
        if (!mat) continue;
        const m = addBox(api, h.w, h.h, h.d, h.x, 0, h.z, mat, {
          uvScale: [1, 0.5],
          map: '#4e555c'
        });
        if (m) added++;
      }
    }

    if (added > 0) sceneApplied = true;
    emit('sceneApplied', { added });
    return V3Layout;
  }

  /* 把布局补丁合并进 CSMaps 风格的地图数据，供 V3-集成在渲染前使用。
   * 与 applyScene 二选一：数据已包含补丁时不要再调用 applyScene 重复添加。 */
  function patchMapData(map, options) {
    if (!map || !Array.isArray(map.cover)) return map;
    if (map._v3LayoutPatched) return map;
    options = options || {};
    /* 补丁坐标针对 sector7 原图设计；新图需显式开启后再做布局复核 */
    const allMaps = options.allMaps === true;
    const targetId = options.targetId || 'sector7';
    if (!allMaps && map.id && map.id !== targetId) return map;
    const out = Object.assign({}, map, { cover: map.cover.slice() });
    const density = options.density || (tier() === 'low' ? 'core' : 'full');
    const coreOnly = density === 'core';
    const coverList = coreOnly ? COVER_PATCHES.filter(p => p.core !== false) : COVER_PATCHES;
    const heightList = coreOnly ? HEIGHT_PATCHES.filter(p => p.core !== false) : HEIGHT_PATCHES;

    for (const c of coverList) {
      if (c.kind === 'barrier') {
        out.cover.push({ shape: 'jersey', x: c.x, z: c.z, rotY: c.rotY });
      } else if (c.kind === 'crate') {
        out.cover.push({ shape: 'crate', x: c.x, y: 0, z: c.z, rotY: c.rotY });
      }
    }
    for (const h of heightList) {
      if (h.kind === 'stackedContainer') {
        out.cover.push({
          shape: 'container',
          x: h.x,
          y: 2.85,
          z: h.z,
          rotY: h.rotY || 0,
          color: '#8b9096'
        });
      } else if (h.kind === 'platform') {
        out.cover.push({
          shape: 'box',
          w: h.w,
          h: h.h,
          d: h.d,
          x: h.x,
          y: 0,
          z: h.z,
          mat: 'concrete',
          uvScale: [1, 0.5],
          minimap: { color: '#4e555c' }
        });
      }
    }
    Object.defineProperty(out, '_v3LayoutPatched', { value: true });
    emit('mapPatched', { mapId: out.id || '' });
    return out;
  }

  /* ---------------- UI / HUD 布局 ---------------- */
  const uiPlan = {
    baseGap: 26,
    compactWidth: 1120,
    denseWidth: 760,
    denseHeight: 620,
    mapSize: 172,
    safeArea: true
  };

  let uiApplied = false;
  let resizePending = false;

  function refreshViewportClasses() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.add('v3-layout');
    root.classList.remove('v3-layout-compact', 'v3-layout-dense', 'v3-layout-ultrawide');
    const w = global.innerWidth || 1280;
    const h = global.innerHeight || 720;
    const aspect = w / Math.max(h, 1);
    if (w <= uiPlan.denseWidth || h <= uiPlan.denseHeight) {
      root.classList.add('v3-layout-dense');
    } else if (w <= uiPlan.compactWidth || h <= 720) {
      root.classList.add('v3-layout-compact');
    }
    if (aspect >= 2.1) root.classList.add('v3-layout-ultrawide');
    if (tier() === 'low') root.classList.add('v3-layout-lowend');
  }

  function applyUI() {
    if (uiApplied) return V3Layout;
    refreshViewportClasses();
    loading.init();
    if (global.addEventListener) {
      global.addEventListener('resize', function onResize() {
        if (resizePending) return;
        resizePending = true;
        const done = function () {
          resizePending = false;
          refreshViewportClasses();
        };
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(done);
        } else {
          setTimeout(done, 16);
        }
      });
    }
    uiApplied = true;
    emit('uiApplied', {});
    return V3Layout;
  }

  function applyHUD(state) {
    const $ = function (id) { return document.getElementById(id); };
    if (state && typeof state === 'object') {
      const hp = $('hpNum');
      const ap = $('apNum');
      const hpFill = $('hpFill');
      const apFill = $('apFill');
      const mag = $('magNum');
      const res = $('resNum');
      const name = $('wname');
      const mode = $('wmode');
      if (hp && typeof state.hp === 'number') hp.textContent = String(Math.max(0, Math.round(state.hp)));
      if (ap && typeof state.armor === 'number') ap.textContent = String(Math.max(0, Math.round(state.armor)));
      if (hpFill && typeof state.hp === 'number') {
        hpFill.style.transform = 'scaleX(' + clamp(state.hp / 100, 0, 1) + ')';
        hpFill.classList.toggle('low', state.hp <= 30);
      }
      if (apFill && typeof state.armor === 'number') {
        apFill.style.transform = 'scaleX(' + clamp(state.armor / 50, 0, 1) + ')';
      }
      if (mag) mag.textContent = String(state.mag | 0);
      if (res) res.textContent = '/ ' + (state.res | 0);
      if (name && state.name) name.textContent = state.name;
      if (mode && state.mode) mode.textContent = state.mode;
    } else {
      try { if (typeof updateVitalsUI === 'function') updateVitalsUI(); } catch (e) { /* 忽略 */ }
      try { if (typeof updateAmmoUI === 'function') updateAmmoUI(); } catch (e) { /* 忽略 */ }
      try { if (typeof drawMinimap === 'function') drawMinimap(); } catch (e) { /* 忽略 */ }
    }
    return V3Layout;
  }

  /* ---------------- 加载性能 ---------------- */
  function defer(fn) {
    if (typeof global.requestIdleCallback === 'function') {
      try {
        global.requestIdleCallback(function () { fn(); }, { timeout: 800 });
        return;
      } catch (e) { /* 回退到 setTimeout */ }
    }
    setTimeout(fn, 0);
  }

  const loading = {
    _bar: null,

    init() {
      if (this._bar) return this;
      const boot = document.getElementById('boot');
      if (!boot || boot.classList.contains('hide')) {
        this.set(100);
        return this;
      }
      const bar = document.createElement('div');
      bar.id = 'v3BootBar';
      boot.appendChild(bar);
      this._bar = bar;
      this.set(4);
      if (typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(function () {
          if (boot.classList.contains('hide')) {
            loading.done();
            obs.disconnect();
          }
        });
        obs.observe(boot, { attributes: true, attributeFilter: ['class'] });
      }
      return this;
    },

    set(pct, label) {
      const root = document.documentElement;
      if (root && root.style) {
        root.style.setProperty('--v3-boot-progress', clamp((pct || 0) / 100, 0, 1).toFixed(3));
      }
      return this;
    },

    phase(name, pct) {
      return this.set(pct, name);
    },

    done() {
      this.set(100);
      if (this._bar) {
        const bar = this._bar;
        setTimeout(function () {
          if (bar.parentNode) bar.parentNode.removeChild(bar);
        }, 500);
      }
      return this;
    }
  };

  function optimizeLoading() {
    loading.init();
    const root = document.documentElement;
    if (root && tier() === 'low') root.classList.add('v3-layout-lowend');
    defer(function () { applyUI(); });
    return V3Layout;
  }

  /* ---------------- 自动就绪 ---------------- */
  let installed = false;

  function whenReady(cb, timeoutMs) {
    const ready = function () {
      return typeof box !== 'undefined' && typeof scene !== 'undefined' && typeof UI !== 'undefined';
    };
    if (ready()) {
      cb();
      return;
    }
    const limit = timeoutMs || 8000;
    const start = Date.now();
    const safety = setTimeout(function () {
      clearInterval(timer);
    }, limit + 100);
    const timer = setInterval(function () {
      if (ready() || Date.now() - start > limit) {
        clearInterval(timer);
        clearTimeout(safety);
        cb();
      }
    }, 60);
  }

  /* options：
   *   scene:true  应用场景补丁
   *   autoScene:true  在游戏全局就绪后自动调用 applyScene（推荐由集成在 spawnEnemies 前手动调用）
   *   ui:true  应用 UI/HUD 布局
   *   loading:true  启用加载进度条
   *   sceneApi:null  给 maps.js 等模块传入 { materials, box }
   *   density:'full'|'core'  low 设备自动降为 core
   */
  function install(options) {
    if (installed) return V3Layout;
    options = Object.assign({
      scene: true,
      ui: true,
      loading: true,
      autoScene: true,
      sceneApi: null,
      density: null
    }, options || {});
    if (options.loading) loading.init();
    if (options.ui) applyUI();
    if (options.scene && options.autoScene) {
      whenReady(function () {
        applyScene(options.sceneApi, { density: options.density });
      });
    }
    installed = true;
    emit('installed', { autoScene: options.autoScene });
    return V3Layout;
  }

  Object.assign(V3Layout, {
    version: '1.0.0',
    name: 'V3-布局',
    scenePlan: scenePlan,
    uiPlan: uiPlan,
    performance: performancePlan,
    loading: loading,
    applyScene: applyScene,
    patchMapData: patchMapData,
    applyUI: applyUI,
    applyHUD: applyHUD,
    optimizeLoading: optimizeLoading,
    install: install,
    getTier: tier,
    on: on,
    emit: emit
  });

  global.V3Layout = V3Layout;
  if (typeof module !== 'undefined' && module.exports) module.exports = V3Layout;
})(typeof window !== 'undefined' ? window : globalThis);
