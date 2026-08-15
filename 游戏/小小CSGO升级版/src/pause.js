/* V4-暂停菜单
 * 独立加载：<script src="src/pause.js"></script>
 * 由 V4Pause.init(options) 接入；不依赖框架，不持有游戏循环。
 */
(function (root) {
  'use strict';

  var api = {};
  var state = { open: false, installed: false, options: {} };
  var pauseEl, menuEl, statusEl;

  var defaults = {
    getState: function () { return root.G || {}; },
    canPause: function () {
      var game = state.options.getState();
      return !!(game.started && !game.over);
    },
    setRunning: function (running) {
      var game = state.options.getState();
      game.paused = !running;
      game.running = running;
    },
    continueGame: function () {
      if (typeof root.requestLock === 'function') root.requestLock();
      else state.options.setRunning(true);
    },
    restart: function () {
      if (typeof root.restart === 'function') root.restart();
    },
    openSettings: function () {
      if (root.V4Settings && typeof root.V4Settings.open === 'function') root.V4Settings.open();
      else root.dispatchEvent(new CustomEvent('v4:open-settings'));
    },
    mainMenu: function () {
      var game = state.options.getState();
      game.running = false;
      game.paused = false;
      game.started = false;
      if (root.document.pointerLockElement && root.document.exitPointerLock) root.document.exitPointerLock();
      var hud = root.document.getElementById('hud');
      var start = root.document.getElementById('startScreen');
      var end = root.document.getElementById('endScreen');
      if (hud) hud.classList.remove('on');
      if (end) end.classList.add('hide');
      if (start) start.classList.remove('hide');
    }
  };

  function node(tag, props, text) {
    var el = root.document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === 'dataset') {
        Object.keys(props[key]).forEach(function (dataKey) {
          el.dataset[dataKey] = props[key][dataKey];
        });
      } else {
        el[key] = props[key];
      }
    });
    if (text) el.textContent = text;
    return el;
  }

  function ensureStyles() {
    if (root.document.getElementById('v4PauseStyles')) return;
    var style = node('style', { id: 'v4PauseStyles' });
    style.textContent = [
      '#v4PauseMenu{position:absolute;inset:0;display:none;align-items:center;justify-content:center;',
      'z-index:20;background:rgba(3,5,7,.82);backdrop-filter:blur(3px);}',
      '#v4PauseMenu.on{display:flex;}',
      '#v4PauseMenu .v4p-panel{width:min(430px,calc(100vw - 36px));padding:34px 34px 28px;',
      'border:1px solid rgba(223,230,236,.18);background:linear-gradient(180deg,rgba(12,17,22,.96),rgba(5,8,11,.96));',
      'box-shadow:0 20px 70px rgba(0,0,0,.52);}',
      '#v4PauseMenu .v4p-kicker{font:600 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.28em;color:rgba(223,230,236,.48);}',
      '#v4PauseMenu h2{margin:12px 0 6px;color:#dfe6ec;font:800 32px/1.1 "Segoe UI",Arial,sans-serif;letter-spacing:.18em;}',
      '#v4PauseMenu .v4p-status{min-height:18px;margin-bottom:22px;color:rgba(223,230,236,.52);font:11px/1.4 "Segoe UI",Arial,sans-serif;}',
      '#v4PauseMenu .v4p-actions{display:grid;gap:8px;}',
      '#v4PauseMenu button{width:100%;padding:13px 15px;text-align:left;cursor:pointer;color:#dfe6ec;',
      'font:700 12px/1 "Segoe UI",Arial,sans-serif;letter-spacing:.16em;background:rgba(223,230,236,.045);',
      'border:1px solid rgba(223,230,236,.16);transition:background .16s,border-color .16s,color .16s;}',
      '#v4PauseMenu button:hover,#v4PauseMenu button:focus-visible{outline:none;color:#fff;background:rgba(255,179,64,.14);border-color:rgba(255,179,64,.62);}',
      '#v4PauseMenu button[data-action="continue"]{color:#ffb340;border-color:rgba(255,179,64,.45);}',
      '#v4PauseMenu .v4p-foot{margin-top:20px;color:rgba(223,230,236,.36);font:10px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.12em;}'
    ].join('');
    root.document.head.appendChild(style);
  }

  function build() {
    ensureStyles();
    pauseEl = root.document.getElementById('pause');
    if (!pauseEl) {
      pauseEl = node('div', { id: 'pause' });
      root.document.body.appendChild(pauseEl);
    }
    pauseEl.classList.remove('on');
    pauseEl.innerHTML = '';
    menuEl = node('div', { id: 'v4PauseMenu', className: 'v4p-menu' });
    var panel = node('section', { className: 'v4p-panel', role: 'dialog', ariaLabel: '暂停菜单' });
    panel.appendChild(node('div', { className: 'v4p-kicker' }, '小小CSGO // 任务控制'));
    panel.appendChild(node('h2', {}, '已暂停'));
    statusEl = node('div', { className: 'v4p-status' }, '游戏与计时已冻结');
    panel.appendChild(statusEl);
    var actions = node('div', { className: 'v4p-actions' });
    [['continue', '继续游戏'], ['settings', '设置'], ['restart', '重开本局'], ['main-menu', '回主菜单']].forEach(function (item) {
      var button = node('button', { type: 'button', dataset: { action: item[0] } }, item[1]);
      button.addEventListener('click', function () { handle(item[0]); });
      actions.appendChild(button);
    });
    panel.appendChild(actions);
    panel.appendChild(node('div', { className: 'v4p-foot' }, 'ESC 继续 / 暂停'));
    menuEl.appendChild(panel);
    pauseEl.appendChild(menuEl);
    state.installed = true;
  }

  function handle(action) {
    if (action === 'continue') return api.close();
    if (action === 'settings') return state.options.openSettings();
    if (action === 'restart') { api.close(false); state.options.restart(); return; }
    if (action === 'main-menu') { api.close(false); state.options.mainMenu(); }
  }

  api.open = function () {
    if (!state.installed || !state.options.canPause()) return false;
    state.options.setRunning(false);
    state.open = true;
    menuEl.classList.add('on');
    if (pauseEl) pauseEl.classList.add('on');
    if (root.document.pointerLockElement && root.document.exitPointerLock) root.document.exitPointerLock();
    var first = menuEl.querySelector('button');
    if (first) first.focus();
    return true;
  };

  api.close = function (resume) {
    if (!state.open) return false;
    state.open = false;
    menuEl.classList.remove('on');
    if (pauseEl) pauseEl.classList.remove('on');
    if (resume !== false) state.options.continueGame();
    return true;
  };

  api.toggle = function () { return state.open ? api.close() : api.open(); };
  api.isOpen = function () { return state.open; };
  api.init = function (options) {
    state.options = Object.assign({}, defaults, options || {});
    build();
    root.document.addEventListener('keydown', function (event) {
      if (event.code !== 'Escape' || event.repeat) return;
      if (!state.options.canPause() && !state.open) return;
      event.preventDefault();
      api.toggle();
    });
    return api;
  };

  root.V4Pause = api;
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { api.init(); });
  else api.init();
}(window));
