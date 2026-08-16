/* 小小CSGO V3 汉化模块 —— 国际化运行时
 * 默认语言：中文（zh）
 * 本文件只负责字典注册、查询、插值与 DOM 静态文案应用；
 * 页面接线由 V3-集成按 docs/模块笔记/V3-汉化.md 完成。
 */
(function (global) {
  'use strict';

  const DEFAULT_LOCALE = 'zh';
  const dicts = Object.create(null);
  const watchers = [];
  let current = DEFAULT_LOCALE;

  function register(lang, dict) {
    if (!lang || !dict || typeof dict !== 'object') return false;
    dicts[lang] = dict;
    return true;
  }

  function setLocale(lang) {
    if (!dicts[lang]) return false;
    if (current === lang) return true;
    current = lang;
    for (const fn of watchers) {
      try { fn(lang); } catch (e) { /* 监听器异常不能阻断切换 */ }
    }
    return true;
  }

  function resolve(lang, key) {
    const dict = dicts[lang];
    if (!dict) return undefined;
    let node = dict;
    for (const part of key.split('.')) {
      if (node == null || !Object.prototype.hasOwnProperty.call(node, part)) return undefined;
      node = node[part];
    }
    return node;
  }

  function get(key, locale) {
    const want = locale || current;
    let value = resolve(want, key);
    if (value === undefined && want !== DEFAULT_LOCALE) {
      value = resolve(DEFAULT_LOCALE, key);
    }
    return value === undefined ? key : value;
  }

  function interpolate(template, params) {
    if (!params || typeof template !== 'string') return template;
    return template.replace(/\{([^{}]+)\}/g, (match, name) => {
      const value = params[name];
      return value === undefined || value === null ? match : String(value);
    });
  }

  function t(key, params) {
    return interpolate(get(key), params);
  }

  function html(key, params) {
    return t(key, params);
  }

  function has(key) {
    return get(key) !== key;
  }

  function onChange(fn) {
    if (typeof fn === 'function') watchers.push(fn);
  }

  function localizeText(el, key, params) {
    if (el) el.textContent = t(key, params);
  }

  function localizeHtml(el, key, params) {
    if (el) el.innerHTML = t(key, params);
  }

  function applyStatic(root) {
    const scope = (root && root.querySelectorAll) ? root : document;
    const nodes = scope.querySelectorAll('[data-i18n]');
    for (const el of nodes) {
      const key = (el.getAttribute('data-i18n') || '').trim();
      if (!key) continue;
      let params = null;
      const raw = el.getAttribute('data-i18n-params');
      if (raw) {
        try { params = JSON.parse(raw); } catch (e) { params = null; }
      }
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = html(key, params);
      else el.textContent = t(key, params);
    }
  }

  const I18N = {
    version: '1.0.0',
    defaultLocale: DEFAULT_LOCALE,
    register,
    setLocale,
    getLocale: () => current,
    locales: () => Object.keys(dicts),
    get,
    t,
    html,
    has,
    onChange,
    localizeText,
    localizeHtml,
    applyStatic
  };

  /* 兼容语言包先于运行时加载的情况 */
  if (global.I18N_ZH) register(DEFAULT_LOCALE, global.I18N_ZH);

  global.I18N = I18N;
  if (typeof module !== 'undefined' && module.exports) module.exports = I18N;
})(typeof window !== 'undefined' ? window : globalThis);
