document.addEventListener("DOMContentLoaded", () => {
  // --- CONFIGURATION ---
  const SUPABASE_URL = "https://xvozkyiqntxxlpyjrhou.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_hb5yY-uexT9_qjEieYtxuw_ghy70fks"; 

  // Initialize Supabase
  if (!window.supabase) {
    console.error("CRITICAL: Supabase library not loaded.");
    return;
  }
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let POLL_MS = 4000;
  const MAX_POINTS = 25;
  let prevData = {};
  let chartsReady = false;
  let lastChartTimestamp = 0; 

  // State
  let uptimeStart = parseInt(localStorage.getItem("uptimeStart")) || Date.now();
  localStorage.setItem("uptimeStart", uptimeStart);
  let totalUpdates = parseInt(localStorage.getItem("totalUpdates")) || 0;
  let missed = 0;
  let totalCadence = 0;
  let uptimeTimer = null;

  // Safe UI Helpers
  const getEl = (id) => document.getElementById(id);
  const safeSetText = (id, text) => {
    const el = getEl(id);
    if (el) el.textContent = text;
  };

  // UI References
  const themeBtn = getEl("theme-btn");
  const infoBtn = getEl("info-btn");
  const settingsBtn = getEl("settings-btn");
  const exportBtn = getEl("export-btn");
  const led = getEl("status-led");
  const overallQualityEl = getEl("overall-quality");

  // === THEME LOGIC ===
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") document.body.classList.add("light");

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      document.body.classList.toggle("light");
      const isLight = document.body.classList.contains("light");
      themeBtn.textContent = isLight ? "Toggle Theme (Light)" : "Toggle Theme (Dark)";
      localStorage.setItem("theme", isLight ? "light" : "dark");
      updateChartColors();
    });
  }

  // === UPTIME COUNTER ===
  function formatUptime(ms) {
    let s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function startUptimeCounter() {
    if (uptimeTimer) clearInterval(uptimeTimer);
    uptimeTimer = setInterval(() => {
      safeSetText("uptime", formatUptime(Date.now() - uptimeStart));
    }, 1000);
  }

  // === ANIMATION HELPER ===
  function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const value = progress * (end - start) + start;
      obj.textContent = value.toFixed(2);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  // === CHART CONFIG ===
  function getTextColor() {
    return document.body.classList.contains("light") ? "#222" : "#c5c6c7";
  }
  function getGridColor() {
    return document.body.classList.contains("light") ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.05)";
  }

  function commonChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      // FIX: Duration is 2000ms (2s). This allows the line to finish drawing
      // completely and "rest" for 2s before the next update (4s) arrives.
      animation: {
        duration: 2000, 
        easing: 'linear' 
      },
      elements: { 
        point: { radius: 3 },
        line: { spanGaps: true } // FIX: Prevents invisible lines if data gaps occur
      },
      scales: {
        x: {
          ticks: { color: getTextColor(), maxRotation: 0, autoSkip: true },
          grid: { color: getGridColor() }
        },
        y: {
          ticks: { color: getTextColor() },
          grid: { color: getGridColor() }
        }
      },
      plugins: { legend: { labels: { color: getTextColor() } } }
    };
  }

  // === BUILD CHARTS ===
  function buildCharts(historyData) {
    if (typeof Chart === 'undefined') {
      console.warn("Chart.js not loaded. Skipping charts.");
      return;
    }

    const getCtx = (id) => {
      const c = getEl(id);
      return c ? c.getContext("2d") : null;
    };

    const smallCtx = getCtx("smallChart");
    const largeCtx = getCtx("largeChart");
    const barCtx = getCtx("barChart");
    const scatterCtx = getCtx("scatterChart");

    if (!smallCtx || !largeCtx || !barCtx || !scatterCtx) return;

    // Fix: Force clear old charts to prevent "Canvas in use" errors
    [smallCtx, largeCtx, barCtx, scatterCtx].forEach(ctx => {
       const existing = Chart.getChart(ctx.canvas);
       if (existing) existing.destroy();
    });

    try {
      window.smallChart = new Chart(smallCtx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            { label: "pH", data: [], borderColor: "#00FFFF", tension: 0.3 },
            { label: "Turbidity", data: [], borderColor: "#FF6B6B", tension: 0.3 },
            { label: "Temperature", data: [], borderColor: "#FFD166", tension: 0.3 }
          ]
        },
        options: commonChartOptions()
      });

      window.largeChart = new Chart(largeCtx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            { label: "TDS", data: [], borderColor: "#45A29E", tension: 0.3 },
            { label: "Conductivity", data: [], borderColor: "#8884FF", tension: 0.3 }
          ]
        },
        options: commonChartOptions()
      });

      window.barChart = new Chart(barCtx, {
        type: "bar",
        data: {
          labels: ["Turbidity", "pH", "Temp", "TDS", "Cond."],
          datasets: [{ label: "% Ideal", data: [], backgroundColor: "#45a29e" }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 2000 },
          scales: {
            x: {
              min: 0, max: 150,
              ticks: { color: getTextColor() },
              grid: { color: getGridColor() }
            },
            y: { ticks: { color: getTextColor() } }
          }
        }
      });

      const scatterOpts = commonChartOptions();
      scatterOpts.scales.x = { 
        type: 'linear', 
        ticks: { color: getTextColor() }, 
        grid: { color: getGridColor() } 
      };

      window.scatterChart = new Chart(scatterCtx, {
        type: "scatter",
        data: {
          datasets: [{ label: "TDS vs Cond", data: [], backgroundColor: "#66fcf1" }]
        },
        options: scatterOpts
      });

      chartsReady = true;
      lastChartTimestamp = 0; 
      updateChartData(historyData);

    } catch (err) {
      console.error("Error building charts:", err);
      chartsReady = false;
    }
  }

  // === SMART CHART UPDATE ===
  function updateChartData(hist) {
    if (!chartsReady || !window.smallChart) return;

    try {
        const sortedHist = [...hist].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
        const newPoints = sortedHist.filter(p => new Date(p.timestamp).getTime() > lastChartTimestamp);

        if (newPoints.length === 0) return;

        newPoints.forEach(pt => {
            const tObj = new Date(pt.timestamp);
            const t = tObj.getTime();
            const label = tObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Push Data
            window.smallChart.data.labels.push(label);
            window.smallChart.data.datasets[0].data.push(pt.ph);
            window.smallChart.data.datasets[1].data.push(pt.turbidity);
            window.smallChart.data.datasets[2].data.push(pt.temperature);

            window.largeChart.data.labels.push(label);
            window.largeChart.data.datasets[0].data.push(pt.tds);
            window.largeChart.data.datasets[1].data.push(pt.conductivity);

            window.scatterChart.data.datasets[0].data.push({ x: pt.tds, y: pt.conductivity });

            lastChartTimestamp = t;
        });

        // Slide window
        while (window.smallChart.data.labels.length > MAX_POINTS) {
            window.smallChart.data.labels.shift();
            window.smallChart.data.datasets.forEach(ds => ds.data.shift());
            window.largeChart.data.labels.shift();
            window.largeChart.data.datasets.forEach(ds => ds.data.shift());
            window.scatterChart.data.datasets.forEach(ds => ds.data.shift());
        }

        window.smallChart.update();
        window.largeChart.update();
        window.scatterChart.update();

    } catch (err) {
        console.warn("Chart update failed:", err);
    }
  }

  // === CARD & BAR UPDATE ===
  function applyCurrent(d) {
    if (!d) return;
    
    updateCard("ph", d.ph, "ph-status", "ph-trend", "ph-delta", [6.5, 8.5], [5.5, 9.5]);
    updateCard("turbidity", d.turbidity, "turbidity-status", "turbidity-trend", "turbidity-delta", [0, 5], [5, 10]);
    updateCard("temperature", d.temperature, "temp-status", "temperature-trend", "temperature-delta", [20, 28], [10, 35]);
    updateCard("tds", d.tds, "tds-status", "tds-trend", "tds-delta", [0, 500], [500, 1000]);
    updateCard("conductivity", d.conductivity, "cond-status", "conductivity-trend", "conductivity-delta", [0, 1500], [1500, 3000]);

    const idealRanges = {
      turbidity: [0, 5], ph: [6.5, 8.5], temperature: [20, 28], tds: [0, 500], conductivity: [0, 1500]
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

    if (chartsReady && window.barChart) {
      try {
        window.barChart.data.datasets[0].data = ratios;
        window.barChart.update();
      } catch(e) { console.warn("Bar chart update failed"); }
    }

    const overallScore = Math.min(150, ratios.reduce((a, b) => a + b, 0) / ratios.length);
    let condition = "Poor";
    if (overallScore >= 80) condition = "Good";
    else if (overallScore >= 50) condition = "Fair";

    if (overallQualityEl) {
      overallQualityEl.textContent = `${overallScore.toFixed(1)} (${condition})`;
      overallQualityEl.className = "";
      overallQualityEl.classList.add(condition.toLowerCase());
    }

    safeSetText("last-updated", new Date().toLocaleTimeString());
    const count = (chartsReady && window.smallChart?.data?.labels?.length) || 0;
    safeSetText("data-count", count);
  }

  function updateCard(id, val, statusId, trendId, deltaId, good, fair) {
    const valueEl = getEl(id + "-val");
    const st = getEl(statusId);
    const tr = getEl(trendId);
    const dl = getEl(deltaId);
    const card = valueEl?.closest(".card");

    if (!valueEl || !st || !tr || !dl || !card) return;

    const v = parseFloat(val);
    if (isNaN(v)) return;

    const prev = prevData[id];
    const currentVal = parseFloat(valueEl.textContent) || 0;
    
    // Animate number over 1000ms
    animateValue(valueEl, currentVal, v, 1000);

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
    st.classList.remove("good", "fair", "poor");

    if (inRange(v, good)) {
      st.textContent = "Good";
      st.classList.add("good");
      card.classList.add("good");
    } else if (inRange(v, fair)) {
      st.textContent = "Fair";
      st.classList.add("fair");
      card.classList.add("fair");
    } else {
      st.textContent = "Poor";
      st.classList.add("poor");
      card.classList.add("poor");
    }
  }

  // === FETCH LOOP ===
  async function fetchLiveData() {
    let { data: historyData, error } = await supabase
      .from('water_readings')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(MAX_POINTS);
      
    if (error) {
      console.error("Supabase error:", error);
      if(led) led.className = "led led-red";
      safeSetText("status-text", "Error");
      missed++;
      return;
    }

    if(led) led.className = "led led-green";
    safeSetText("status-text", "Live");

    let storedCount = Number(localStorage.getItem("totalUpdates")) || 0;
    storedCount += 1;
    localStorage.setItem("totalUpdates", storedCount);
    totalUpdates = storedCount;
    totalCadence += POLL_MS;

    const current = historyData && historyData.length > 0 ? historyData[0] : null;

    if (current) applyCurrent(current);
    
    if (historyData && historyData.length > 0) {
      if (!chartsReady) {
        buildCharts(historyData);
      } else {
        updateChartData(historyData);
      }
    }
  }

  // === INIT ===
  (async () => {
    await fetchLiveData();
    startUptimeCounter();
    setInterval(fetchLiveData, POLL_MS);
  })();

  // === SYSTEM STATS ===
  setInterval(() => {
    const sysBox = document.querySelector(".system");
    if(sysBox) {
      sysBox.innerHTML = `
        <li><strong>Updates received:</strong> ${totalUpdates}</li>
        <li><strong>Average cadence:</strong> ${(totalCadence / Math.max(totalUpdates, 1)).toFixed(0)} ms</li>
        <li><strong>Session uptime:</strong> ${formatUptime(Date.now() - uptimeStart)}</li>
        <li><strong>Missed intervals:</strong> ${missed}</li>
        <li><strong>Memory usage (sim):</strong> ${(Math.random()*20 + 70).toFixed(1)} MB</li>
      `;
    }
  }, 1000);

  // === COLORS UPDATE ===
  function updateChartColors() {
    if (!chartsReady || !window.smallChart) return;
    const c = getTextColor();
    const g = getGridColor();
    [window.smallChart, window.largeChart, window.barChart, window.scatterChart].forEach(ch => {
      if (ch) {
        if(ch.options.scales.x) {
            ch.options.scales.x.ticks.color = c;
            ch.options.scales.x.grid.color = g;
        }
        if(ch.options.scales.y) {
            ch.options.scales.y.ticks.color = c;
            ch.options.scales.y.grid.color = g;
        }
        ch.update();
      }
    });
  }

  // === EXPORT CSV ===
  if(exportBtn) {
    exportBtn.onclick = async () => {
      const { data } = await supabase.from('water_readings').select('*').order('timestamp', { ascending: true });
      if(!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  // === MODALS ===
  const setModal = getEl("settings-modal");
  if(settingsBtn && setModal) {
    settingsBtn.onclick = () => {
      getEl("poll-ms").value = POLL_MS;
      setModal.style.display = "flex";
    };
    getEl("settings-save").onclick = () => {
      const val = parseInt(getEl("poll-ms").value);
      if(val >= 1000) {
        POLL_MS = val;
      }
      setModal.style.display = "none";
    };
    document.querySelector('[data-close="settings"]').onclick = () => setModal.style.display = "none";
  }
  
  const infModal = getEl("info-modal");
  if(infoBtn && infModal) {
    infoBtn.onclick = () => infModal.style.display = "flex";
    document.querySelector('[data-close="info"]').onclick = () => infModal.style.display = "none";
  }
});