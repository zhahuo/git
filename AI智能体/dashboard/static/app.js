(function () {
  "use strict";

  var LIMIT = 50;
  var charts = {};

  function el(id) {
    return document.getElementById(id);
  }

  function api(name, arg) {
    if (typeof window.pywebview === "undefined" || !window.pywebview.api) {
      return Promise.reject(new Error("pywebview 未连接"));
    }
    var fn = window.pywebview.api[name];
    if (typeof fn !== "function") {
      return Promise.reject(new Error("接口不存在: " + name));
    }
    return Promise.resolve(arg === undefined ? fn() : fn(arg)).then(function (raw) {
      if (typeof raw === "string") {
        return JSON.parse(raw);
      }
      return raw;
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
    if (["warn", "warning", "暂停", "paused", "idle"].indexOf(s) >= 0) return "warn";
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

  document.addEventListener("DOMContentLoaded", function () {
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
    setInterval(refresh, 1000);
  });
})();
