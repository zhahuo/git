(function () {
  "use strict";

  var LIMIT = 50;
  var DEBUG_LIMIT = 80;
  var charts = {};
  var currentLogLevel = "";

  function el(id) {
    return document.getElementById(id);
  }

  function parseRaw(raw) {
    if (typeof raw === "string") {
      return JSON.parse(raw);
    }
    return raw;
  }

  function api(name, arg, extra) {
    if (
      typeof window.pywebview !== "undefined" &&
      window.pywebview.api &&
      typeof window.pywebview.api[name] === "function"
    ) {
      var fn = window.pywebview.api[name];
      if (name === "get_logs" || name === "get_bus_events") {
        return Promise.resolve(fn(arg === undefined ? null : arg, extra || null))
          .then(parseRaw);
      }
      return Promise.resolve(arg === undefined ? fn() : fn(arg)).then(parseRaw);
    }
    var params = [];
    if (arg !== undefined && arg !== null) {
      params.push("limit=" + encodeURIComponent(arg));
    }
    if (extra) {
      if (extra.level) params.push("level=" + encodeURIComponent(extra.level));
      if (extra.type) params.push("type=" + encodeURIComponent(extra.type));
    }
    var qs = params.length ? "?" + params.join("&") : "";
    return fetch("/api/" + name + qs).then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    });
  }

  function fmtTime(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  }

  function fmtNum(value) {
    var n = Number(value);
    if (!isFinite(n)) return "-";
    if (n >= 100000000) return (n / 100000000).toFixed(1) + "亿";
    if (n >= 10000) return (n / 10000).toFixed(1) + "万";
    return String(n);
  }

  function statusClass(status) {
    var s = String(status || "").toLowerCase();
    if (["ok", "success", "正常", "running", "run"].indexOf(s) >= 0) return "ok";
    if (["warn", "warning", "暂停", "paused", "idle", "疑似离线"].indexOf(s) >= 0) return "warn";
    if (["error", "fail", "失败", "异常", "stopped"].indexOf(s) >= 0) return "err";
    return "warn";
  }

  function renderSummary(summary) {
    if (!summary || summary.error) {
      el("statTokens").textContent = "-";
      el("statToday").textContent = "-";
      el("statMood").textContent = "-";
      el("statModule").textContent = "-";
      el("statCalls").textContent = "- 次调用";
      el("statMoodDim").textContent = "-";
      el("statStatus").textContent = "-";
      return;
    }
    el("statTokens").textContent = fmtNum(summary.total_tokens || 0);
    el("statToday").textContent = fmtNum(summary.today_conversations || 0);
    el("statMood").textContent = summary.mood || "未知";
    el("statModule").textContent = summary.module || "-";
    el("statCalls").textContent = summary.total_llm_calls + " 次调用";
    var dims = [];
    if (summary.valence !== null && summary.valence !== undefined) dims.push("V " + Number(summary.valence).toFixed(2));
    if (summary.arousal !== null && summary.arousal !== undefined) dims.push("A " + Number(summary.arousal).toFixed(2));
    if (summary.dominance !== null && summary.dominance !== undefined) dims.push("D " + Number(summary.dominance).toFixed(2));
    el("statMoodDim").textContent = dims.join(" / ") || "-";
    el("statStatus").textContent = summary.status || "未知";
    el("statStatus").className = "status " + statusClass(summary.status);
  }

  function chartBase(elId) {
    var node = el(elId);
    if (!node) return null;
    if (charts[elId]) {
      charts[elId].dispose();
    }
    charts[elId] = echarts.init(node);
    return charts[elId];
  }

  function renderTokenChart(rows) {
    var chart = chartBase("chartTokensEl");
    if (!chart) return;
    var data = (rows || []).slice().reverse().slice(-30);
    chart.setOption({
      grid: { left: 44, right: 8, top: 14, bottom: 22 },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: data.map(function (r) { return fmtTime(r.created_at); }),
        axisLabel: { color: "#93a1b1", fontSize: 9 },
        axisLine: { lineStyle: { color: "#2a333e" } }
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#232b34" } },
        axisLabel: { color: "#93a1b1", fontSize: 9 }
      },
      series: [
        { name: "总消耗", type: "bar", data: data.map(function (r) { return Number(r.total_tokens) || 0; }), barWidth: "55%", itemStyle: { color: "#4d8fe6" } },
        { name: "成功调用", type: "bar", data: data.map(function (r) { return r.ok ? (Number(r.total_tokens) || 0) : 0; }), barWidth: "30%", itemStyle: { color: "#45c88a" } }
      ]
    });
  }

  function renderEmotionChart(rows) {
    var chart = chartBase("chartEmotionsEl");
    if (!chart) return;
    var data = (rows || []).slice().reverse().slice(-30);
    chart.setOption({
      grid: { left: 36, right: 10, top: 16, bottom: 22 },
      tooltip: { trigger: "axis" },
      legend: { show: false },
      xAxis: {
        type: "category",
        data: data.map(function (r) { return fmtTime(r.created_at); }),
        axisLabel: { color: "#93a1b1", fontSize: 9 },
        axisLine: { lineStyle: { color: "#2a333e" } }
      },
      yAxis: {
        type: "value",
        min: -1,
        max: 1,
        splitLine: { lineStyle: { color: "#232b34" } },
        axisLabel: { color: "#93a1b1", fontSize: 9 }
      },
      series: [
        { name: "愉悦度", type: "line", smooth: true, showSymbol: false, data: data.map(function (r) { return Number(r.valence); }), lineStyle: { color: "#4d8fe6" }, itemStyle: { color: "#4d8fe6" } },
        { name: "激活度", type: "line", smooth: true, showSymbol: false, data: data.map(function (r) { return Number(r.arousal); }), lineStyle: { color: "#e0a53e" }, itemStyle: { color: "#e0a53e" } },
        { name: "支配度", type: "line", smooth: true, showSymbol: false, data: data.map(function (r) { return Number(r.dominance); }), lineStyle: { color: "#d9685c" }, itemStyle: { color: "#d9685c" } }
      ]
    });
  }

  function renderMemoryChart(rows) {
    var chart = chartBase("chartMemoryEl");
    if (!chart) return;
    var data = (rows || []).slice().reverse().slice(-30);
    chart.setOption({
      grid: { left: 40, right: 10, top: 16, bottom: 22 },
      tooltip: { trigger: "axis" },
      legend: { show: false },
      xAxis: {
        type: "category",
        data: data.map(function (r) { return fmtTime(r.created_at); }),
        axisLabel: { color: "#93a1b1", fontSize: 9 },
        axisLine: { lineStyle: { color: "#2a333e" } }
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: "#232b34" } },
        axisLabel: { color: "#93a1b1", fontSize: 9 }
      },
      series: [
        { name: "事实", type: "line", smooth: true, showSymbol: false, data: data.map(function (r) { return Number(r.facts); }), lineStyle: { color: "#35b6a1" }, itemStyle: { color: "#35b6a1" } },
        { name: "片段", type: "line", smooth: true, showSymbol: false, data: data.map(function (r) { return Number(r.episodes); }), lineStyle: { color: "#e0a53e" }, itemStyle: { color: "#e0a53e" } },
        { name: "对话", type: "line", smooth: true, showSymbol: false, data: data.map(function (r) { return Number(r.conversations); }), lineStyle: { color: "#4d8fe6" }, itemStyle: { color: "#4d8fe6" } }
      ]
    });
  }

  function renderConversations(rows) {
    var list = el("listConversations");
    el("convCount").textContent = (rows || []).length;
    list.innerHTML = "";
    if (!rows || rows.length === 0) {
      list.innerHTML = '<li class="empty">暂无对话记录</li>';
      return;
    }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      var time = document.createElement("span");
      time.className = "time";
      time.textContent = fmtTime(row.created_at);
      var who = document.createElement("span");
      who.className = "who";
      who.textContent = row.role === "user" ? (row.user_key || "用户") : "助手";
      var text = document.createElement("span");
      text.className = "text";
      text.textContent = row.content || "";
      li.appendChild(time);
      li.appendChild(who);
      li.appendChild(text);
      list.appendChild(li);
    });
  }

  function renderLlmCalls(rows) {
    var list = el("listLlm");
    el("llmCount").textContent = (rows || []).length;
    list.innerHTML = "";
    if (!rows || rows.length === 0) {
      list.innerHTML = '<li class="empty">暂无模型调用</li>';
      return;
    }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      var time = document.createElement("span");
      time.className = "time";
      time.textContent = fmtTime(row.created_at);
      var who = document.createElement("span");
      who.className = "who mono";
      who.textContent = row.model || "-";
      var text = document.createElement("span");
      text.className = "text mono";
      text.textContent = fmtNum(row.total_tokens) + " tok / " + fmtNum(row.latency_ms) + "ms";
      var status = document.createElement("span");
      status.className = "status " + (row.ok ? "ok" : "err");
      status.textContent = row.ok ? "OK" : "FAIL";
      li.appendChild(time);
      li.appendChild(who);
      li.appendChild(text);
      li.appendChild(status);
      list.appendChild(li);
    });
  }

  function renderPublishTasks(rows) {
    var list = el("listPublish");
    el("pubCount").textContent = (rows || []).length;
    list.innerHTML = "";
    if (!rows || rows.length === 0) {
      list.innerHTML = '<li class="empty">暂无发布任务</li>';
      return;
    }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      var time = document.createElement("span");
      time.className = "time";
      time.textContent = fmtTime(row.created_at);
      var who = document.createElement("span");
      who.className = "who";
      who.textContent = row.platform || "-";
      var text = document.createElement("span");
      text.className = "text";
      text.textContent = row.title || "-";
      var status = document.createElement("span");
      status.className = "status " + statusClass(row.status);
      status.textContent = row.status || "未知";
      li.appendChild(time);
      li.appendChild(who);
      li.appendChild(text);
      li.appendChild(status);
      list.appendChild(li);
    });
  }

  function renderLogs(rows) {
    var list = el("listLogs");
    list.innerHTML = "";
    if (!rows || rows.length === 0) {
      list.innerHTML = '<li class="empty">暂无日志</li>';
      return;
    }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "log-row";
      var time = document.createElement("span");
      time.className = "time";
      time.textContent = fmtTime(row.created_at);
      var level = document.createElement("span");
      level.className = "status " + statusClass(row.level === "WARNING" ? "warn" : row.level === "ERROR" ? "err" : "ok");
      level.textContent = row.level || "-";
      var logger = document.createElement("span");
      logger.className = "who mono";
      logger.textContent = (row.logger || "-").split(".").pop();
      var message = document.createElement("span");
      message.className = "text";
      message.textContent = row.message || "";
      li.appendChild(time);
      li.appendChild(level);
      li.appendChild(logger);
      li.appendChild(message);
      list.appendChild(li);
    });
  }

  function renderBusEvents(rows) {
    var list = el("listEvents");
    el("eventCount").textContent = (rows || []).length;
    list.innerHTML = "";
    if (!rows || rows.length === 0) {
      list.innerHTML = '<li class="empty">暂无事件</li>';
      return;
    }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "log-row";
      var time = document.createElement("span");
      time.className = "time";
      time.textContent = fmtTime(row.created_at);
      var type = document.createElement("span");
      type.className = "status ok";
      type.textContent = row.event_type || "-";
      var payload = document.createElement("span");
      payload.className = "text mono";
      var parsed = null;
      try {
        parsed = JSON.parse(row.payload_json || "{}");
      } catch (err) {
        parsed = {};
      }
      var raw = JSON.stringify(parsed);
      payload.textContent = raw.length > 160 ? raw.slice(0, 160) + "..." : raw;
      li.appendChild(time);
      li.appendChild(type);
      li.appendChild(payload);
      list.appendChild(li);
    });
  }

  function renderModuleStatuses(rows) {
    var box = el("moduleStatuses");
    box.innerHTML = "";
    if (!rows || rows.length === 0) {
      box.innerHTML = '<div class="empty">暂无模块状态</div>';
      return;
    }
    rows.forEach(function (row) {
      var item = document.createElement("div");
      item.className = "module-item";
      var stale = false;
      var time = new Date(row.created_at);
      if (!isNaN(time.getTime()) && Date.now() - time.getTime() > 90000) {
        stale = true;
      }
      var label = stale ? "疑似离线" : row.status || "未知";
      var name = document.createElement("div");
      name.className = "module-name mono";
      name.textContent = row.module || "-";
      var status = document.createElement("div");
      status.className = "status " + (stale ? "warn" : statusClass(row.status));
      status.textContent = label;
      var detail = document.createElement("div");
      detail.className = "module-detail";
      detail.textContent = (row.detail || "") + " · " + fmtTime(row.created_at);
      item.appendChild(name);
      item.appendChild(status);
      item.appendChild(detail);
      box.appendChild(item);
    });
  }

  function renderConfig(config) {
    var list = el("configList");
    list.innerHTML = "";
    if (!config || Object.keys(config).length === 0) {
      list.innerHTML = '<div class="empty">暂无配置</div>';
      return;
    }
    var pairs = [
      ["名称", config.name],
      ["模型", config.model],
      ["接口", config.base_url],
      ["API Key", config.api_key],
      ["Telegram", config.telegram_token],
      ["搜索服务", config.search_provider],
      ["搜索 Key", config.search_api_key],
      ["微信启用", config.wechat_enabled ? "是" : "否"],
      ["微信演示", config.wechat_dry_run ? "是" : "否"],
      ["微信白名单", config.wechat_allowed_chats || "空"],
      ["抖音 Key", config.douyin_client_key],
      ["抖音 Secret", config.douyin_client_secret],
      ["TikTok Key", config.tiktok_client_key],
      ["TikTok Secret", config.tiktok_client_secret],
      ["演示模式", config.dry_run ? "是" : "否"],
      ["数据目录", config.data_dir],
      ["犹豫区间", config.thinking_delay_min + " ~ " + config.thinking_delay_max + "s"],
      ["分段回复", config.multi_reply_enabled ? "是" : "否"],
      ["已启用模块", (config.enabled_modules || []).join(", ")]
    ];
    pairs.forEach(function (pair) {
      var dt = document.createElement("dt");
      dt.textContent = pair[0];
      var dd = document.createElement("dd");
      dd.textContent = String(pair[1] === undefined || pair[1] === null ? "" : pair[1]);
      list.appendChild(dt);
      list.appendChild(dd);
    });
  }

  function setConn(ok, message) {
    var state = el("connState");
    state.textContent = ok ? "已连接" : "离线";
    state.className = "conn-state " + (ok ? "ok" : "err");
    if (message) {
      el("updatedAt").textContent = message;
    }
  }

  function refresh() {
    api("get_summary")
      .then(renderSummary)
      .then(function () {
        return api("get_conversations", LIMIT);
      })
      .then(renderConversations)
      .then(function () {
        return api("get_llm_calls", LIMIT);
      })
      .then(renderLlmCalls)
      .then(function () {
        return api("get_emotions", LIMIT);
      })
      .then(renderEmotionChart)
      .then(function () {
        return api("get_memory_stats", LIMIT);
      })
      .then(renderMemoryChart)
      .then(function () {
        return api("get_publish_tasks", LIMIT);
      })
      .then(renderPublishTasks)
      .then(function () {
        return api("get_llm_calls", 100);
      })
      .then(renderTokenChart)
      .then(function () {
        setConn(true, "更新于 " + new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      })
      .catch(function (err) {
        setConn(false, String(err && err.message ? err.message : err));
      });
  }

  function refreshDebug() {
    api("get_logs", DEBUG_LIMIT, { level: currentLogLevel })
      .then(renderLogs)
      .then(function () {
        return api("get_bus_events", DEBUG_LIMIT);
      })
      .then(renderBusEvents)
      .then(function () {
        return api("get_module_statuses");
      })
      .then(renderModuleStatuses)
      .then(function () {
        return api("get_config");
      })
      .then(renderConfig)
      .catch(function (err) {
        setConn(false, String(err && err.message ? err.message : err));
      });
  }

  function switchView(name) {
    document.querySelectorAll(".view").forEach(function (view) {
      view.classList.toggle("active", view.id === "view" + name.charAt(0).toUpperCase() + name.slice(1));
    });
    document.querySelectorAll(".app-tab").forEach(function (tab) {
      tab.classList.toggle("active", tab.getAttribute("data-view") === name);
    });
    if (name === "debug") {
      refreshDebug();
    } else {
      Object.keys(charts).forEach(function (key) {
        if (charts[key]) charts[key].resize();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".app-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        switchView(tab.getAttribute("data-view"));
      });
    });

    document.querySelectorAll("#logLevels .seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentLogLevel = btn.getAttribute("data-level") || "";
        document.querySelectorAll("#logLevels .seg-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        refreshDebug();
      });
    });

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var name = tab.getAttribute("data-tab");
        var panelId = "chart" + name.charAt(0).toUpperCase() + name.slice(1);
        var chartId = panelId + "El";
        document.querySelectorAll(".tab").forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        document.querySelectorAll(".chart-panel").forEach(function (p) {
          p.classList.toggle("active", p.id === panelId);
        });
        if (charts[chartId]) {
          charts[chartId].resize();
        }
      });
    });

    refresh();
    refreshDebug();
    setInterval(refresh, 1000);
    setInterval(refreshDebug, 3000);
  });
})();
