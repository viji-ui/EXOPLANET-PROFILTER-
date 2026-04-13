/**
 * app.js — Exoplanet Personality Profiler
 * ─────────────────────────────────────────
 * Loads outputs/planet_data.json produced by nlp_pipeline.py
 * then renders:
 *   • Animated starfield
 *   • Stat cards
 *   • 6 Chart.js visualisations (sentiment, habitability, discovery, facilities, bubble)
 *   • Word clouds (positive / negative)
 *   • Top-10 table with click-to-search
 *   • Live planet search with autocomplete
 */

"use strict";

// ═══════════════════════════════════════════════════════════════
// 1. DATA FETCH
// ═══════════════════════════════════════════════════════════════
fetch("outputs/planet_data.json")
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(data => {
    document.getElementById("loading-state").style.display = "none";
    document.getElementById("main-content").style.display  = "block";

    initStarfield();
    renderStatCards(data);
    renderSentimentByMethod(data);
    renderSentimentDist(data);
    renderWordCloud("wc-pos", data.top_pos_words, POS_COLORS);
    renderWordCloud("wc-neg", data.top_neg_words, NEG_COLORS);
    renderHabitabilityPie(data);
    renderDiscoveryBar(data);
    renderFacilitySentiment(data);
    renderBubbleChart(data);
    renderTop10(data);
    initSearch(data);
  })
  .catch(err => {
    document.getElementById("loading-state").innerHTML =
      `<div style="color:#ff4466;font-family:'Space Mono',monospace;font-size:13px;text-align:center;padding:40px;">
        ⚠️ Could not load planet_data.json<br>
        <span style="opacity:0.5;font-size:10px;margin-top:8px;display:block;">
          Run <code>python nlp_pipeline.py</code> first, then serve from the project root.
        </span>
       </div>`;
    console.error("[app.js] Data load error:", err);
  });


// ═══════════════════════════════════════════════════════════════
// 2. CONSTANTS
// ═══════════════════════════════════════════════════════════════
const POS_COLORS = ["#39ff14","#00f5ff","#ffd700","#a0ffb0","#4fc3f7","#b89af0","#aaffaa","#ffdd88"];
const NEG_COLORS = ["#ff4466","#ff6b35","#ff8c69","#ff99bb","#ffaa66","#cc3355","#ff5577","#dd2244"];

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 900, easing: "easeOutQuart" },
  plugins: {
    legend: {
      labels: {
        color: "rgba(200,220,255,0.7)",
        font: { family: "'Space Mono'", size: 10 },
        boxWidth: 12,
        padding: 14,
      },
    },
    tooltip: {
      backgroundColor: "rgba(3,3,24,0.96)",
      borderColor: "rgba(0,245,255,0.3)",
      borderWidth: 1,
      titleFont: { family: "'Orbitron'", size: 11 },
      bodyFont:  { family: "'Space Mono'", size: 10 },
      titleColor: "#00f5ff",
      bodyColor:  "#8899cc",
      padding: 12,
    },
  },
};

function darkAxes(extra = {}) {
  const base = {
    ticks:  { color: "rgba(200,220,255,0.5)", font: { family: "'Space Mono'", size: 9 } },
    grid:   { color: "rgba(0,245,255,0.05)" },
    border: { color: "rgba(0,245,255,0.1)"  },
  };
  return {
    x: { ...base, ...(extra.x || {}) },
    y: { ...base, ...(extra.y || {}) },
  };
}


// ═══════════════════════════════════════════════════════════════
// 3. STARFIELD
// ═══════════════════════════════════════════════════════════════
function initStarfield() {
  const canvas = document.getElementById("starfield");
  const ctx    = canvas.getContext("2d");
  let stars    = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = Math.max(document.body.scrollHeight, window.innerHeight);
  }

  function makeStars() {
    resize();
    const count = Math.floor(canvas.width * canvas.height / 3000);
    stars = Array.from({ length: count }, () => ({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      r:     Math.random() * 1.4 + 0.2,
      alpha: Math.random() * 0.8 + 0.1,
      speed: Math.random() * 0.005 + 0.001,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Nebula glows
    [
      { x: 0.3, y: 0.2, r: 0.4, c: "rgba(75,0,130,0.04)"  },
      { x: 0.7, y: 0.7, r: 0.35, c: "rgba(0,80,100,0.05)" },
    ].forEach(n => {
      const g = ctx.createRadialGradient(
        canvas.width * n.x, canvas.height * n.y, 0,
        canvas.width * n.x, canvas.height * n.y, canvas.width * n.r
      );
      g.addColorStop(0, n.c);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    const t = Date.now() / 1000;
    stars.forEach(s => {
      const a = s.alpha * (0.5 + 0.5 * Math.sin(t * s.speed * 60 + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,220,255,${a})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  makeStars();
  draw();
  window.addEventListener("resize", makeStars);
}


// ═══════════════════════════════════════════════════════════════
// 4. STAT CARDS
// ═══════════════════════════════════════════════════════════════
function renderStatCards(data) {
  const pctPos = ((data.sent_counts["Positive"] || 0) / data.total * 100).toFixed(1);
  const pctHab = ((data.hab_counts["Potentially Habitable"] || 0) / data.total * 100).toFixed(1);
  const top1   = data.top10[0];

  const cards = [
    { icon: "🪐", val: data.total.toLocaleString(),           label: "Confirmed Planets",    sub: "NASA Archive"                               },
    { icon: "✨", val: pctPos + "%",                           label: "Positive Sentiment",   sub: data.sent_counts["Positive"] + " planets"    },
    { icon: "🌱", val: pctHab + "%",                           label: "Potentially Habitable",sub: data.hab_counts["Potentially Habitable"] + " planets" },
    { icon: "🏆", val: top1.name,                              label: "Most Promising",        sub: "combined score " + top1.combined_score      },
    { icon: "🔭", val: Object.keys(data.disc_counts).length,   label: "Discovery Methods",    sub: "techniques used"                            },
    { icon: "🏛️", val: data.top_fac.length + "+",             label: "Top Observatories",    sub: "by avg sentiment"                           },
  ];

  const grid = document.getElementById("stat-grid");
  cards.forEach((c, i) => {
    const d = document.createElement("div");
    d.className = "stat-card";
    d.style.animationDelay = (i * 0.1) + "s";
    d.innerHTML = `
      <div class="stat-icon">${c.icon}</div>
      <span class="stat-value">${c.val}</span>
      <div class="stat-label">${c.label}</div>
      <div class="stat-sub">${c.sub}</div>`;
    grid.appendChild(d);
  });
}


// ═══════════════════════════════════════════════════════════════
// 5. CHARTS
// ═══════════════════════════════════════════════════════════════

/* 5a. Sentiment by Discovery Method */
function renderSentimentByMethod(data) {
  const entries = Object.entries(data.method_avg_sent).sort((a, b) => b[1] - a[1]);
  const labels  = entries.map(([k]) =>
    k.replace("Transit Timing Variations", "TTV")
     .replace("Eclipse Timing Variations", "ETV")
     .replace("Orbital Brightness Modulation", "OBM")
     .replace("Pulsation Timing Variations", "PTV")
  );
  const vals    = entries.map(([, v]) => v);
  const colors  = vals.map(v => v > 0.3 ? "rgba(57,255,20,0.7)" : v > 0 ? "rgba(0,245,255,0.7)" : "rgba(255,68,102,0.7)");

  new Chart(document.getElementById("chart-method-sent"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Avg Compound Score",
        data: vals,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace("0.7", "1")),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: darkAxes({ y: { min: -1, max: 1 } }),
    },
  });
}

/* 5b. Sentiment Label Doughnut */
function renderSentimentDist(data) {
  const sc = data.sent_counts;
  new Chart(document.getElementById("chart-sent-dist"), {
    type: "doughnut",
    data: {
      labels: ["Positive", "Neutral", "Negative"],
      datasets: [{
        data: [sc["Positive"] || 0, sc["Neutral"] || 0, sc["Negative"] || 0],
        backgroundColor: ["rgba(57,255,20,0.7)", "rgba(0,245,255,0.5)", "rgba(255,68,102,0.7)"],
        borderColor: ["#39ff14", "#00f5ff", "#ff4466"],
        borderWidth: 1.5,
        hoverOffset: 8,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: "65%",
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { ...CHART_DEFAULTS.plugins.legend, position: "bottom" },
      },
    },
  });

  const pct = ((sc["Positive"] || 0) / (sc["Positive"] + sc["Neutral"] + sc["Negative"]) * 100).toFixed(1);
  document.getElementById("sent-insight").innerHTML =
    `<strong>${pct}%</strong> of descriptions score <strong>Positive</strong> sentiment — driven by habitable-zone hints, Sun-like stars, and circular orbits. Imaging &amp; Astrometry score most negative due to cool dwarf stars and elliptical orbits.`;
}

/* 5c. Habitability Pie */
function renderHabitabilityPie(data) {
  const hc = data.hab_counts;
  new Chart(document.getElementById("chart-hab"), {
    type: "pie",
    data: {
      labels: ["Potentially Habitable", "Marginally Interesting", "Uninhabitable"],
      datasets: [{
        data: [hc["Potentially Habitable"] || 0, hc["Marginally Interesting"] || 0, hc["Uninhabitable"] || 0],
        backgroundColor: ["rgba(57,255,20,0.6)", "rgba(255,215,0,0.6)", "rgba(255,68,102,0.6)"],
        borderColor: ["#39ff14", "#ffd700", "#ff4466"],
        borderWidth: 1.5,
        hoverOffset: 6,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { ...CHART_DEFAULTS.plugins.legend, position: "bottom" },
      },
    },
  });
}

/* 5d. Discovery Method Horizontal Bar */
function renderDiscoveryBar(data) {
  const entries = Object.entries(data.disc_counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels  = entries.map(([k]) =>
    k.replace("Transit Timing Variations", "TTV")
     .replace("Eclipse Timing Variations", "ETV")
     .replace("Orbital Brightness Modulation", "OBM")
  );
  const barColors = ["#00f5ff","#8b5cf6","#ff6b35","#39ff14","#ffd700","#ff4466","#4fc3f7","#b89af0"];

  new Chart(document.getElementById("chart-disc"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Planet Count",
        data: entries.map(([, v]) => v),
        backgroundColor: barColors,
        borderRadius: 4,
        borderWidth: 0,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: "y",
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: darkAxes(),
    },
  });
}

/* 5e. Top Facilities by Sentiment */
function renderFacilitySentiment(data) {
  const labels = data.top_fac.map(([n]) => n.length > 18 ? n.slice(0, 18) + "…" : n);
  const vals   = data.top_fac.map(([, v]) => v);

  new Chart(document.getElementById("chart-fac"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Avg Sentiment",
        data: vals,
        backgroundColor: vals.map(v => `rgba(${Math.round(v * 200)},${Math.round(v * 255)},${Math.round(v * 100)},0.75)`),
        borderRadius: 4,
        borderWidth: 0,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: "y",
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: darkAxes({ x: { min: 0, max: 1 } }),
    },
  });
}

/* 5f. Bubble Chart — Mass vs Orbital Period */
function renderBubbleChart(data) {
  const HAB_COLORS = {
    "Potentially Habitable":  "rgba(57,255,20,0.65)",
    "Marginally Interesting": "rgba(255,215,0,0.55)",
    "Uninhabitable":          "rgba(255,68,102,0.5)",
  };

  const grouped = {};
  data.bubble_data.forEach(p => {
    if (p.mass <= 0 || p.period <= 0 || p.mass > 15 || p.period > 20000) return;
    const h = p.hab;
    if (!grouped[h]) grouped[h] = [];
    grouped[h].push({
      x:          parseFloat(Math.log10(Math.max(p.period, 0.1)).toFixed(3)),
      y:          p.mass,
      r:          Math.max(3, Math.abs(p.sent) * 14 + 4),
      name:       p.name,
      origPeriod: p.period,
      origMass:   p.mass,
      sent:       p.sent,
    });
  });

  const datasets = Object.entries(grouped).map(([hab, pts]) => ({
    label:           hab,
    data:            pts,
    backgroundColor: HAB_COLORS[hab] || "rgba(128,128,255,0.5)",
    borderColor:     (HAB_COLORS[hab] || "rgba(128,128,255,0.5)").replace(/0\.\d+\)$/, "0.9)"),
    borderWidth: 1,
  }));

  new Chart(document.getElementById("chart-bubble"), {
    type: "bubble",
    data: { datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { ...CHART_DEFAULTS.plugins.legend, position: "top" },
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              return [
                `📍 ${d.name}`,
                `Period: ${d.origPeriod?.toFixed(1)}d`,
                `Mass:   ${d.origMass?.toFixed(3)} MJ`,
                `Sent:   ${d.sent?.toFixed(3)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          ...darkAxes().x,
          title: { display: true, text: "log₁₀ Orbital Period (days)", color: "rgba(200,220,255,0.5)", font: { family: "'Space Mono'", size: 10 } },
        },
        y: {
          ...darkAxes().y,
          title: { display: true, text: "Mass (Jupiter masses)", color: "rgba(200,220,255,0.5)", font: { family: "'Space Mono'", size: 10 } },
          min: 0, max: 14,
        },
      },
    },
  });

  document.getElementById("bubble-insight").innerHTML =
    `<strong>${data.hab_counts["Potentially Habitable"]}</strong> potentially habitable worlds identified via multi-factor scoring (habitable zone, star temp 4500–6500K, small planet mass, low eccentricity). Bubble <strong>size</strong> encodes positive sentiment — confirming that <strong>sentiment aligns with habitability</strong> scores.`;
}


// ═══════════════════════════════════════════════════════════════
// 6. WORD CLOUD
// ═══════════════════════════════════════════════════════════════
const CLOUD_STOP = new Set([
  "exoplanet","discovered","earth","system","planet","star","orbit","parsecs",
  "surface","temperature","estimated","using","technique","contains","following",
  "located","completes","host","days","known","approximately","orbits","path",
]);

function renderWordCloud(containerId, words, palette) {
  const wrap    = document.getElementById(containerId);
  const filtered = words.filter(([w]) => !CLOUD_STOP.has(w));
  const max      = filtered[0]?.[1] || 1;

  filtered.slice(0, 22).forEach(([word, count], i) => {
    const ratio = count / max;
    const el    = document.createElement("div");
    el.className = "wc-word";
    el.style.fontSize   = Math.floor(10 + ratio * 28) + "px";
    el.style.color      = palette[i % palette.length];
    el.style.opacity    = (0.5 + ratio * 0.5).toFixed(2);
    el.style.fontWeight = ratio > 0.6 ? "700" : "400";
    el.title            = `${word}: ${count}`;
    el.textContent      = word;
    wrap.appendChild(el);
  });
}


// ═══════════════════════════════════════════════════════════════
// 7. TOP-10 TABLE
// ═══════════════════════════════════════════════════════════════
function renderTop10(data) {
  const table = document.getElementById("top10-table");

  // Header row
  const hdr = document.createElement("div");
  hdr.className = "planet-row header";
  hdr.innerHTML = `<div>#</div><div>Planet</div><div>Habitability</div><div>Method</div><div>Sentiment</div><div>Score</div>`;
  table.appendChild(hdr);

  data.top10.forEach((p, i) => {
    const row       = document.createElement("div");
    row.className   = "planet-row";
    row.title       = "Click to search this planet";

    const rankClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-other";
    const habClass  = habPillClass(p.hab_label);
    const sentColor = p.sentiment > 0.3 ? "#39ff14" : p.sentiment > 0 ? "#00f5ff" : "#ff4466";
    const scorePct  = (p.combined_score * 100).toFixed(0) + "%";
    const shortMethod = (p.method || "").replace("Transit Timing Variations", "TTV").replace("Eclipse Timing Variations", "ETV");

    row.innerHTML = `
      <div class="rank-badge ${rankClass}">${i + 1}</div>
      <div>
        <div class="planet-name-cell">${p.name}</div>
        <div class="planet-method-badge">${p.facility}</div>
      </div>
      <div><span class="hab-pill ${habClass}">${p.hab_label}</span></div>
      <div style="font-family:'Space Mono',monospace;font-size:10px;color:var(--neutral);">${shortMethod}</div>
      <div style="font-family:'Orbitron',monospace;font-size:13px;color:${sentColor};">${p.sentiment?.toFixed(3)}</div>
      <div class="score-bar-wrap">
        <div class="score-bar"><div class="score-fill" style="width:${scorePct}"></div></div>
        <span class="score-val">${p.combined_score?.toFixed(2)}</span>
      </div>`;

    row.addEventListener("click", () => scrollToSearchAndQuery(p.name));
    table.appendChild(row);
  });
}

function habPillClass(label) {
  if (label === "Potentially Habitable")  return "hab-hab";
  if (label === "Marginally Interesting") return "hab-mar";
  return "hab-un";
}

function scrollToSearchAndQuery(name) {
  const input = document.getElementById("planet-search");
  input.value = name;
  document.querySelector(".search-panel").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => doSearch(name), 650);
}


// ═══════════════════════════════════════════════════════════════
// 8. SEARCH + AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════
function initSearch(data) {
  const searchIndex = data.search_index;
  const allNames    = searchIndex.map(p => p.name);
  const input       = document.getElementById("planet-search");
  const acList      = document.getElementById("autocomplete");
  let   acActive    = -1;

  // ── Autocomplete ──
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { acList.style.display = "none"; return; }

    const matches = allNames.filter(n => n.toLowerCase().includes(q)).slice(0, 10);
    if (!matches.length) { acList.style.display = "none"; return; }

    acList.innerHTML = matches.map((n, idx) =>
      `<div class="autocomplete-item" data-idx="${idx}">${n}</div>`
    ).join("");
    acList.style.display = "block";
    acActive = -1;

    acList.querySelectorAll(".autocomplete-item").forEach(item => {
      item.addEventListener("click", () => {
        input.value         = item.textContent;
        acList.style.display = "none";
        doSearch(item.textContent);
      });
    });
  });

  // ── Keyboard navigation ──
  input.addEventListener("keydown", e => {
    const items = acList.querySelectorAll(".autocomplete-item");
    if (e.key === "ArrowDown") acActive = Math.min(acActive + 1, items.length - 1);
    else if (e.key === "ArrowUp") acActive = Math.max(acActive - 1, -1);
    else if (e.key === "Enter") {
      e.preventDefault();
      acList.style.display = "none";
      const chosen = acActive >= 0 && items[acActive] ? items[acActive].textContent : input.value;
      input.value = chosen;
      doSearch(chosen);
      return;
    } else return;

    items.forEach((it, idx) => {
      it.classList.toggle("active", idx === acActive);
      if (idx === acActive) it.scrollIntoView({ block: "nearest" });
    });
  });

  // Close autocomplete on outside click
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-bar-wrap")) acList.style.display = "none";
  });

  // Expose doSearch so Top-10 rows can call it
  window.doSearch = name => doSearch(name, searchIndex);
  function doSearch(query, idx = searchIndex) {
    const q       = query.trim().toLowerCase();
    const results = idx.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
    const wrap    = document.getElementById("search-results");
    wrap.innerHTML = "";

    if (!q || !results.length) {
      wrap.innerHTML = `<div class="no-results">No planets found matching "${query}"</div>`;
      return;
    }

    results.forEach(p => {
      const sentColor = p.sentiment > 0.3 ? "#39ff14" : p.sentiment > 0 ? "#00f5ff" : "#ff4466";
      const habClass  = habPillClass(p.hab_label);

      const card      = document.createElement("div");
      card.className  = "search-result-card";
      card.innerHTML  = `
        <div class="search-result-name">🪐 ${p.name}</div>
        <div class="search-result-desc">${p.description}</div>
        <div class="search-meta">
          <span class="meta-chip">Sentiment: <span style="color:${sentColor}">${p.sentiment?.toFixed(4)} (${p.sentiment_label})</span></span>
          <span class="meta-chip"><span class="hab-pill ${habClass}">${p.hab_label}</span> · Score ${p.hab_score}/9</span>
          <span class="meta-chip">Combined: ${p.combined_score?.toFixed(4)}</span>
          <span class="meta-chip">⭐ ${p.teff}K · ${p.dist} pc</span>
          <span class="meta-chip">⏱ ${p.period}d orbit · ${p.mass} MJ</span>
        </div>`;
      wrap.appendChild(card);
    });
  }
}
