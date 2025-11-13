document.addEventListener("DOMContentLoaded", () => {
  let POLL_MS = 4000;
  const MAX_POINTS = 25;
  let history = [];
  let prevData = {};
  let pollInterval = null;

  // ✅ Persist session start & update count
  let uptimeStart = parseInt(localStorage.getItem("uptimeStart")) || Date.now();
  localStorage.setItem("uptimeStart", uptimeStart);
  let totalUpdates = parseInt(localStorage.getItem("totalUpdates")) || 0;

  let missed = 0;
  let totalCadence = 0;
  let uptimeTimer = null;

  const themeBtn = document.getElementById("theme-btn");
  const infoBtn = document.getElementById("info-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const exportBtn = document.getElementById("export-btn");
  const led = document.getElementById("status-led");
  const statusText = document.getElementById("status-text");
  const overallQualityEl = document.getElementById("overall-quality");

  // === THEME TOGGLE ===
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");

  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    const isLight = document.body.classList.contains("light");
    themeBtn.textContent = isLight
      ? "Toggle Theme (Light)"
      : "Toggle Theme (Dark)";
    localStorage.setItem("theme", isLight ? "light" : "dark");
    updateChartColors();
  });

  // === FETCH JSON ===
  const getJSON = async (url) => {
    try {
      const res = await fetch(`${url}?ts=${Date.now()}`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return null;
    }
  };

  // === FORMAT TIME ===
  function formatUptime(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  // === UPTIME COUNTER ===
  function startUptimeCounter() {
    if (uptimeTimer) clearInterval(uptimeTimer);
    uptimeTimer = setInterval(() => {
      const elapsed = Date.now() - uptimeStart;
      document.getElementById("uptime").textContent = formatUptime(elapsed);
    }, 1000);
  }

  // === CHART COLOR HELPERS ===
  function getTextColor() {
    return document.body.classList.contains("light") ? "#222" : "#c5c6c7";
  }
  function getGridColor() {
    return document.body.classList.contains("light")
      ? "rgba(0,0,0,0.1)"
      : "rgba(255,255,255,0.05)";
  }

  // === CARD UPDATE ===
  function updateCard(id, val, statusId, trendId, deltaId, good, fair) {
    const valueEl = document.getElementById(id + "-val");
    const st = document.getElementById(statusId);
    const tr = document.getElementById(trendId);
    const dl = document.getElementById(deltaId);
    const card = valueEl?.closest(".card");
    if (!valueEl || !st || !tr || !dl || !card) return;

    const v = parseFloat(val);
    if (isNaN(v)) return;

    const prev = prevData[id];
    valueEl.textContent = v.toFixed(2);
    if (prev !== undefined) {
      const diff = v - prev;
      if (Math.abs(diff) < 0.01) {
        dl.textContent = "";
        tr.textContent = "⭯";
      } else if (diff > 0) {
        dl.textContent = `▲+${diff.toFixed(2)}`;
        tr.textContent = "🔼";
      } else {
        dl.textContent = `▼${diff.toFixed(2)}`;
        tr.textContent = "🔽";
      }
    }
    prevData[id] = v;

    const inRange = (x, [a, b]) => x >= a && x <= b;
    card.classList.remove("good", "fair", "poor");
    if (inRange(v, good)) {
      st.textContent = "Good";
      st.className = "status good";
      card.classList.add("good");
    } else if (inRange(v, fair)) {
      st.textContent = "Fair";
      st.className = "status fair";
      card.classList.add("fair");
    } else {
      st.textContent = "Poor";
      st.className = "status poor";
      card.classList.add("poor");
    }
  }

  // === CHART OPTIONS ===
  function chartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      elements: { point: { radius: 3 } },
      scales: {
        x: {
          type: "time",
          time: { unit: "minute" },
          ticks: { color: getTextColor() },
          grid: { color: getGridColor() },
        },
        y: { ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
      },
      plugins: { legend: { labels: { color: getTextColor() } } },
    };
  }

  // === BUILD CHARTS ===
  function buildCharts(historyData, current) {
    const smallCtx = document.getElementById("smallChart").getContext("2d");
    window.smallChart = new Chart(smallCtx, {
      type: "line",
      data: {
        datasets: [
          { label: "pH", data: [], borderColor: "#00FFFF", tension: 0.35 },
          { label: "Turbidity", data: [], borderColor: "#FF6B6B", tension: 0.35 },
          { label: "Temperature", data: [], borderColor: "#FFD166", tension: 0.35 },
        ],
      },
      options: chartOptions(),
    });

    const largeCtx = document.getElementById("largeChart").getContext("2d");
    window.largeChart = new Chart(largeCtx, {
      type: "line",
      data: {
        datasets: [
          { label: "TDS (ppm)", data: [], borderColor: "#45A29E", tension: 0.35 },
          { label: "Conductivity (µS/cm)", data: [], borderColor: "#8884FF", tension: 0.35 },
        ],
      },
      options: chartOptions(),
    });

    const barCtx = document.getElementById("barChart").getContext("2d");
    window.barChart = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: ["Turbidity", "pH", "Temp", "TDS", "Cond."],
        datasets: [
          { label: "Current / Ideal %", data: [], backgroundColor: "#45a29e" },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              color: getTextColor(),
              callback: (v) => v + "%",
            },
            grid: { color: getGridColor() },
            min: 0,
            max: 150,
          },
          y: { ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
        },
      },
    });

    const scatterCtx = document.getElementById("scatterChart").getContext("2d");
    window.scatterChart = new Chart(scatterCtx, {
      type: "scatter",
      data: {
        datasets: [
          { label: "TDS vs Conductivity", data: [], backgroundColor: "#66fcf1" },
        ],
      },
      options: chartOptions(),
    });

    history = historyData;
    applyHistory(history);
    applyCurrent(current);
  }

  function applyHistory(hist) {
    const toTime = (t) => new Date(t.timestamp);
    const recent = hist.slice(-MAX_POINTS);

    smallChart.data.datasets[0].data = recent.map((h) => ({ x: toTime(h), y: h.ph }));
    smallChart.data.datasets[1].data = recent.map((h) => ({ x: toTime(h), y: h.turbidity }));
    smallChart.data.datasets[2].data = recent.map((h) => ({ x: toTime(h), y: h.temperature }));
    largeChart.data.datasets[0].data = recent.map((h) => ({ x: toTime(h), y: h.tds }));
    largeChart.data.datasets[1].data = recent.map((h) => ({ x: toTime(h), y: h.conductivity }));
    scatterChart.data.datasets[0].data = recent.map((h) => ({ x: h.tds, y: h.conductivity }));

    smallChart.update("none");
    largeChart.update("none");
    scatterChart.update("none");
  }

  function applyCurrent(d) {
    updateCard("ph", d.ph, "ph-status", "ph-trend", "ph-delta", [6.5, 8.5], [5.5, 9.5]);
    updateCard("turbidity", d.turbidity, "turbidity-status", "turbidity-trend", "turbidity-delta", [0, 5], [5, 10]);
    updateCard("temperature", d.temperature, "temp-status", "temperature-trend", "temperature-delta", [20, 28], [10, 35]);
    updateCard("tds", d.tds, "tds-status", "tds-trend", "tds-delta", [0, 500], [500, 1000]);
    updateCard("conductivity", d.conductivity, "cond-status", "conductivity-trend", "conductivity-delta", [0, 1500], [1500, 3000]);

    const idealRanges = {
      turbidity: [0, 5],
      ph: [6.5, 8.5],
      temperature: [20, 28],
      tds: [0, 500],
      conductivity: [0, 1500],
    };

    const vals = [d.turbidity, d.ph, d.temperature, d.tds, d.conductivity];
    const ratios = Object.keys(idealRanges).map((k, i) => {
      const [lo, hi] = idealRanges[k];
      const val = vals[i];
      const mid = (lo + hi) / 2;
      const range = hi - lo;
      if (val < lo) return 100 + ((mid - val) / range) * 50;
      if (val > hi) return Math.max(0, 100 - ((val - hi) / range) * 50);
      return 100 - Math.abs(((val - mid) / range) * 100);
    });

    barChart.data.datasets[0].data = ratios;
    barChart.update("none");

    const overallScore = Math.min(150, ratios.reduce((a, b) => a + b, 0) / ratios.length);
    let condition = "Poor";
    if (overallScore >= 80) condition = "Good";
    else if (overallScore >= 50) condition = "Fair";

    overallQualityEl.textContent = `${overallScore.toFixed(1)} (${condition})`;
    overallQualityEl.className = "";
    overallQualityEl.classList.add(condition.toLowerCase());

    document.getElementById("last-updated").textContent = new Date().toLocaleTimeString();
    document.getElementById("data-count").textContent = smallChart.data.datasets[0].data.length;
  }

  // === POLL LOOP ===
async function pollLoop() {
  const curr = await getJSON("data/data.json");
  if (!curr) {
    missed++;
    led.className = "led led-red";
    statusText.textContent = "Error";
    return;
  }

  led.className = "led led-green";
  statusText.textContent = "Live";

  // ✅ Persistent counter that continues even through semi-refreshes
  let storedCount = Number(localStorage.getItem("totalUpdates")) || 0;
  storedCount += 1;
  localStorage.setItem("totalUpdates", storedCount);
  totalUpdates = storedCount;

  totalCadence += POLL_MS;

  history.push(curr);
  if (history.length > MAX_POINTS) history.shift();

  applyCurrent(curr);
  applyHistory(history);
}

// === INITIALIZE (fixed heartbeat) ===
(async () => {
  const hist = (await getJSON("data/history.json")) || [];
  const curr = (await getJSON("data/data.json")) || hist.at(-1);
  if (!curr) return;
  buildCharts(hist, curr);
  led.className = "led led-green";
  statusText.textContent = "Live";
  startUptimeCounter();

  // ✅ Heartbeat: keep counting updates persistently every poll interval
  const heartbeat = () => {
    pollLoop().catch(() => {});
  };
  heartbeat(); // run once immediately
  setInterval(heartbeat, POLL_MS);

  document.getElementById("poll-ms-foot").textContent = POLL_MS / 1000;
})();


  // === Update System Stats Live ===
  function updateSystemStatsUI() {
    const simulatedMemory = (Math.random() * 80 + 20).toFixed(1);
    const sysBox = document.querySelector(".system");
    sysBox.innerHTML = `
      <li><strong>Updates received:</strong> ${totalUpdates}</li>
      <li><strong>Average cadence:</strong> ${(totalCadence / Math.max(totalUpdates, 1)).toFixed(0)} ms</li>
      <li><strong>Session uptime:</strong> ${formatUptime(Date.now() - uptimeStart)}</li>
      <li><strong>Missed intervals:</strong> ${missed}</li>
      <li><strong>Memory usage (sim):</strong> ${simulatedMemory} MB</li>
    `;
  }
  setInterval(updateSystemStatsUI, 1000);

  // === INITIALIZE ===
  (async () => {
    const hist = (await getJSON("data/history.json")) || [];
    const curr = (await getJSON("data/data.json")) || hist.at(-1);
    if (!curr) return;
    buildCharts(hist, curr);
    led.className = "led led-green";
    statusText.textContent = "Live";
    pollInterval = setInterval(pollLoop, POLL_MS);
    startUptimeCounter();
    document.getElementById("poll-ms-foot").textContent = POLL_MS / 1000;
  })();

  // === MODALS ===
  const infoModal = document.getElementById("info-modal");
  const settingsModal = document.getElementById("settings-modal");
  infoBtn.onclick = () => (infoModal.style.display = "flex");
  document.querySelector('[data-close="info"]').onclick = () =>
    (infoModal.style.display = "none");
  settingsBtn.onclick = () => {
    document.getElementById("poll-ms").value = POLL_MS;
    settingsModal.style.display = "flex";
  };
  document.querySelector('[data-close="settings"]').onclick = () =>
    (settingsModal.style.display = "none");

  document.getElementById("settings-save").onclick = () => {
    const newPoll = parseInt(document.getElementById("poll-ms").value);
    if (!isNaN(newPoll) && newPoll >= 1000) {
      POLL_MS = newPoll;
      clearInterval(pollInterval);
      pollInterval = setInterval(pollLoop, POLL_MS);
      document.getElementById("poll-ms-foot").textContent = POLL_MS / 1000;
    }
    settingsModal.style.display = "none";
  };

  exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard_export_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  function updateChartColors() {
    const color = getTextColor();
    const grid = getGridColor();
    [smallChart, largeChart, scatterChart, barChart].forEach((chart) => {
      chart.options.scales.x.ticks.color = color;
      chart.options.scales.y.ticks.color = color;
      chart.options.scales.x.grid.color = grid;
      chart.options.scales.y.grid.color = grid;
      chart.update("none");
    });
  }
});
