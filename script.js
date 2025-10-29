document.addEventListener("DOMContentLoaded", () => {
  const POLL_MS = 4000;
  const MAX_POINTS = 30;
  let prevData = {};
  let history = [];

  /* === THEME TOGGLE === */
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");
  const themeBtn = document.getElementById("theme-btn");
  themeBtn.textContent = document.body.classList.contains("light")
    ? "Toggle Theme (Light)"
    : "Toggle Theme (Dark)";
  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    const isLight = document.body.classList.contains("light");
    themeBtn.textContent = isLight
      ? "Toggle Theme (Light)"
      : "Toggle Theme (Dark)";
    localStorage.setItem("theme", isLight ? "light" : "dark");
    updateChartColors();
  });

  /* === FETCH JSON === */
  const getJSON = async (url) => {
    try {
      const res = await fetch(`${url}?ts=${Date.now()}`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      console.warn(`⚠️ Could not load ${url}`);
      return null;
    }
  };

  /* === UPDATE CARD WITH DELTA (▲/▼) === */
  function updateCard(id, val, statusId, trendId, deltaId, good, fair) {
    const valueEl = document.getElementById(id + "-val");
    const st = document.getElementById(statusId);
    const tr = document.getElementById(trendId);
    const dl = document.getElementById(deltaId);
    if (!valueEl || !st || !tr || !dl) return;

    const v = parseFloat(val);
    if (isNaN(v)) {
      valueEl.textContent = "--";
      st.textContent = "--";
      tr.textContent = "";
      dl.textContent = "";
      dl.className = "delta";
      return;
    }

    // Smooth fade
    valueEl.style.opacity = 0.7;
    setTimeout(() => (valueEl.style.opacity = 1), 120);
    valueEl.textContent = v.toFixed(2);

    // Delta
    const prev = prevData[id];
    if (prev !== undefined) {
      const diff = v - prev;
      if (Math.abs(diff) < 0.005) {
        dl.textContent = "";
        dl.className = "delta";
      } else if (diff > 0) {
        dl.textContent = `▲+${diff.toFixed(2)}`;
        dl.className = "delta up";
      } else {
        dl.textContent = `▼${diff.toFixed(2)}`;
        dl.className = "delta down";
      }
    }
    prevData[id] = v;

    // Status
    const inRange = (x, [a, b]) => x >= a && x <= b;
    if (inRange(v, good)) {
      st.textContent = "Good";
      st.className = "status good";
    } else if (inRange(v, fair)) {
      st.textContent = "Fair";
      st.className = "status fair";
    } else {
      st.textContent = "Poor";
      st.className = "status poor";
    }

    // Trend arrow
    if (prev !== undefined) {
      if (v > prev) {
        tr.textContent = "🔼";
        tr.className = "trend up";
      } else if (v < prev) {
        tr.textContent = "🔽";
        tr.className = "trend down";
      } else {
        tr.textContent = "⭯";
        tr.className = "trend";
      }
    }
  }

  /* === SUMMARY BAR === */
  function updateSummary(current, hist) {
    const q = {
      ph: [6.5, 8.5],
      turbidity: [0, 5],
      temperature: [20, 28],
      tds: [0, 500],
      conductivity: [0, 1500],
    };
    let goodCount = 0, total = 0;
    for (const [k, [lo, hi]] of Object.entries(q)) {
      const v = current[k];
      if (v != null) {
        total++;
        if (v >= lo && v <= hi) goodCount++;
      }
    }
    const ratio = total ? goodCount / total : 0;
    const quality = document.getElementById("overall-quality");
    if (ratio >= 0.8) { quality.textContent = "Good"; quality.className = "good"; }
    else if (ratio >= 0.5) { quality.textContent = "Fair"; quality.className = "fair"; }
    else { quality.textContent = "Poor"; quality.className = "poor"; }

    document.getElementById("last-updated").textContent = new Date().toLocaleTimeString();
    document.getElementById("data-count").textContent = hist.length;
  }

  /* === COLOR HELPERS === */
  function getTextColor() {
    return document.body.classList.contains("light") ? "#222" : "#c5c6c7";
  }
  function getGridColor() {
    return document.body.classList.contains("light")
      ? "rgba(0,0,0,0.1)"
      : "rgba(255,255,255,0.05)";
  }

  /* === CHART OPTIONS === */
  function chartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      elements: {
        point: { radius: 3, hoverRadius: 5 }, // dots are visible
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "second" },
          ticks: { color: getTextColor() },
          grid: { color: getGridColor() },
        },
        y: {
          ticks: { color: getTextColor() },
          grid: { color: getGridColor() },
        },
      },
      plugins: { legend: { labels: { color: getTextColor() } } },
    };
  }

  /* === BUILD CHARTS === */
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
        animation: false,
        scales: {
          x: { ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
          y: { ticks: { color: getTextColor() }, grid: { color: getGridColor() } },
        },
        plugins: { legend: { labels: { color: getTextColor() } } },
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
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            title: { display: true, text: "TDS (ppm)", color: getTextColor() },
            ticks: { color: getTextColor() },
            grid: { color: getGridColor() },
          },
          y: {
            title: { display: true, text: "Conductivity (µS/cm)", color: getTextColor() },
            ticks: { color: getTextColor() },
            grid: { color: getGridColor() },
          },
        },
        plugins: { legend: { labels: { color: getTextColor() } } },
      },
    });

    history = historyData;
    applyHistory(history);
    applyCurrent(current);
  }

  /* === APPLY HISTORY (initial paint) === */
  function applyHistory(historyData) {
    const toTime = (s) => new Date(s.timestamp);
    const recent = historyData.slice(-MAX_POINTS);

    smallChart.data.datasets[0].data = recent.map(h => ({ x: toTime(h), y: h.ph }));
    smallChart.data.datasets[1].data = recent.map(h => ({ x: toTime(h), y: h.turbidity }));
    smallChart.data.datasets[2].data = recent.map(h => ({ x: toTime(h), y: h.temperature }));

    largeChart.data.datasets[0].data = recent.map(h => ({ x: toTime(h), y: h.tds }));
    largeChart.data.datasets[1].data = recent.map(h => ({ x: toTime(h), y: h.conductivity }));

    scatterChart.data.datasets[0].data = recent.map(h => ({ x: h.tds, y: h.conductivity }));

    smallChart.update("none");
    largeChart.update("none");
    scatterChart.update("none");
  }

  /* === APPLY CURRENT (cards + bar) === */
  function applyCurrent(d) {
    updateCard("ph", d.ph, "ph-status", "ph-trend", "ph-delta", [6.5, 8.5], [5.5, 9.5]);
    updateCard("turbidity", d.turbidity, "turbidity-status", "turbidity-trend", "turbidity-delta", [0, 5], [5, 10]);
    updateCard("temperature", d.temperature, "temp-status", "temperature-trend", "temperature-delta", [20, 28], [10, 35]);
    updateCard("tds", d.tds, "tds-status", "tds-trend", "tds-delta", [0, 500], [500, 1000]);
    updateCard("conductivity", d.conductivity, "cond-status", "conductivity-trend", "conductivity-delta", [0, 1500], [1500, 3000]);

    barChart.data.datasets[0].data = [
      (d.turbidity / 5) * 100,
      (d.ph / 7.5) * 100,
      (d.temperature / 25) * 100,
      (d.tds / 500) * 100,
      (d.conductivity / 1000) * 100,
    ];
    barChart.update("none");

    updateSummary(d, history);
  }

  /* === INITIALIZE === */
  (async () => {
    const historyData = (await getJSON("data/history.json")) || [];
    const current = (await getJSON("data/data.json")) || historyData.at(-1);
    if (!current) return console.warn("⚠️ No data yet — run update_data.py first");

    buildCharts(historyData, current);

    // Poll for live updates
    setInterval(async () => {
      const curr = await getJSON("data/data.json");
      if (!curr) return;

      history.push(curr);
      if (history.length > MAX_POINTS) history.shift();

      applyCurrent(curr);

      const now = new Date(curr.timestamp);

      // Append new points to charts
      smallChart.data.datasets[0].data.push({ x: now, y: curr.ph });
      smallChart.data.datasets[1].data.push({ x: now, y: curr.turbidity });
      smallChart.data.datasets[2].data.push({ x: now, y: curr.temperature });
      trimData(smallChart);

      largeChart.data.datasets[0].data.push({ x: now, y: curr.tds });
      largeChart.data.datasets[1].data.push({ x: now, y: curr.conductivity });
      trimData(largeChart);

      scatterChart.data.datasets[0].data.push({ x: curr.tds, y: curr.conductivity });
      trimData(scatterChart);

      smallChart.update("none");
      largeChart.update("none");
      scatterChart.update("none");
    }, POLL_MS);
  })();

  /* === Helper: Trim old data === */
  function trimData(chart) {
    chart.data.datasets.forEach((ds) => {
      while (ds.data.length > MAX_POINTS) ds.data.shift();
    });
  }

  /* === Update chart colors when theme changes === */
  function updateChartColors() {
    const color = getTextColor();
    const grid = getGridColor();
    [smallChart, largeChart, scatterChart, barChart].forEach((chart) => {
      chart.options.scales.x.ticks.color = color;
      chart.options.scales.y.ticks.color = color;
      chart.options.scales.x.grid.color = grid;
      chart.options.scales.y.grid.color = grid;
      if (chart.options.plugins.legend)
        chart.options.plugins.legend.labels.color = color;
      chart.update("none");
    });
  }

  /* === Info Modal === */
  const modal = document.getElementById("info-modal");
  const btn = document.getElementById("info-btn");
  const span = document.getElementsByClassName("close")[0];
  btn.onclick = () => (modal.style.display = "block");
  span.onclick = () => (modal.style.display = "none");
  window.onclick = (event) => {
    if (event.target == modal) modal.style.display = "none";
  };
});
