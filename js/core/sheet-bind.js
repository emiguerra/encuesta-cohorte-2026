/* ==========================================================================
   FaAADudp — Conector Google Sheet → gráficos del informe.
   Lee la pestaña del año desde el Sheet público (CSV vía gviz), y reemplaza
   SOLO los números de cada gráfico según js/bindings.js. El diseño (colores,
   textos cortos, formas) sigue viviendo en index.html. Si el Sheet no
   responde, el informe se ve igual con los valores que trae el HTML.
   ========================================================================== */
(function (root) {
  "use strict";

  const ZONE = { I: "#D12E1C", II: "#EDD121", III: "#3B7359" };
  const LIST = { pictogram: "segments", band: "segments", swarm: "items", burst: "items", rankedBars: "items", bulletThreshold: "items" };
  const DEFAULT_FMT = { band: "{v}%", burst: "{n} · {v}%", rankedBars: "{v}%", swarm: "{n}", bulletThreshold: "{v}%" };
  const r4 = x => Math.round(x * 1e4) / 1e4;

  /* ---------- CSV (RFC 4180: comillas, comas y saltos dentro de celdas) ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  const num = s => { if (s == null || String(s).trim() === "") return null; const f = Number(s); return Number.isNaN(f) ? null : f; };

  function toRows(csvText) {
    const t = parseCSV(csvText);
    const h = t[0].map(s => s.trim());
    const ix = k => h.indexOf(k);
    const col = { fam: ix("familia"), q: ix("pregunta"), cat: ix("categoria"), v: ix("valor"), u: ix("unidad"), n: ix("n_absoluto"), nt: ix("n_total_respuestas"), rg: ix("rango_logro"), nota: ix("nota") };
    if (col.q < 0 || col.cat < 0 || col.v < 0) throw new Error("El Sheet no tiene las columnas pregunta/categoria/valor");
    return t.slice(1).filter(r => (r[col.q] || "").trim() !== "").map(r => ({
      familia: (r[col.fam] || "").trim(), pregunta: (r[col.q] || "").trim(), categoria: (r[col.cat] || "").trim(),
      valor: num(r[col.v]), unidad: (r[col.u] || "").trim(), n: num(r[col.n]), ntot: num(r[col.nt]),
      rango: (r[col.rg] || "").trim(), nota: (r[col.nota] || "").trim(),
    }));
  }

  /* ---------- Selección de filas ---------- */
  function pick(rows, sel, defQ) {
    if (typeof sel === "string" || Array.isArray(sel)) sel = { cat: sel };
    const q = sel.q || defQ;
    let c = rows.filter(r => r.pregunta === q);
    if (sel.rango) c = c.filter(r => r.rango === sel.rango);
    let expected = null;
    if (sel.cat != null) { const cats = [].concat(sel.cat); expected = cats.length; c = c.filter(r => cats.includes(r.categoria)); }
    const sum = k => c.some(r => r[k] != null) ? r4(c.reduce((a, r) => a + (r[k] || 0), 0)) : null;
    const nt = c.find(r => r.ntot != null);
    return { found: c.length, expected, q, v: sum("valor"), n: sum("n"), ntot: nt ? nt.ntot : null };
  }

  /* ---------- Formato (es-CL: coma decimal) ---------- */
  const fmtNum = x => String(Math.round(x * 100) / 100).replace(".", ",");
  const level = v => v < 60 ? "I" : v <= 80 ? "II" : "III";
  function fmt(tpl, p) {
    return tpl.replace(/\{(v0|v|n|lvl)\}/g, (_, k) => {
      if (k === "v0") return p.v == null ? "" : String(Math.round(p.v));
      if (k === "v") return p.v == null ? "" : fmtNum(p.v);
      if (k === "n") return p.n == null ? "" : fmtNum(p.n);
      return p.v == null ? "" : level(p.v);
    });
  }

  /* ---------- Aplicar una variante (una forma) ---------- */
  function applyVariant(form, data, vs, rows, defQ, warn) {
    if (form === "ring") return applyRing(data, vs, rows, defQ, warn);
    const list = data[LIST[form]];
    const els = vs.items;
    if (!list || !els) return;
    if (list.length !== els.length) { warn(`${form}: el HTML tiene ${list.length} elementos y bindings.js ${els.length}; no se toca`); return; }
    const norm = els.map(e => e && !Array.isArray(e) && typeof e === "object" ? e : (e == null ? null : { cat: e }));
    const picks = norm.map(e => e && !e.rest ? pick(rows, e, defQ) : null);
    const N = vs.total ? pick(rows, vs.total, defQ).n : (picks.find(p => p && p.ntot != null) || {}).ntot;
    const sumV = r4(picks.reduce((a, p) => a + (p && p.v || 0), 0));
    const sumN = r4(picks.reduce((a, p) => a + (p && p.n || 0), 0));
    const metric = vs.metric || (form === "swarm" || form === "pictogram" ? "n" : "v");
    norm.forEach((e, i) => {
      if (!e) return;
      let p = picks[i];
      if (e.rest) p = { found: 1, v: r4(100 - sumV), n: N != null ? r4(N - sumN) : null };
      else if (!p.found || (p.expected && p.found < p.expected)) { warn(`${form}[${i}]: no encontré «${[].concat(e.cat || "").join(" + ")}» en «${p.q}»`); if (!p.found) return; }
      const el = list[i];
      if (form === "pictogram") { if (p.n != null) el.count = p.n; return; }
      const x = metric === "n" ? p.n : p.v;
      if (form === "swarm") { if (p.n != null) el.n = p.n; } else if (x != null) el.value = x;
      const f = e.fmt != null ? e.fmt : vs.fmt;
      if (f && x != null) el.display = fmt(f, p);
      if (vs.levelColor && p.v != null) el.color = ZONE[level(p.v)];
      if (e.core && form === "swarm") { const c = pick(rows, e.core, defQ); if (c.n != null) el.coreN = c.n; }
    });
    if (form === "pictogram" && N != null) data.total = N;
  }

  function applyRing(data, vs, rows, defQ, warn) {
    const p = pick(rows, vs.pct, defQ);
    if (p.found && p.v != null) data.pct = p.v; else warn(`ring: no encontré el valor principal en «${p.q}»`);
    (vs.satellites || []).forEach((s, i) => {
      if (!s || !data.satellites || !data.satellites[i]) return;
      const q = pick(rows, s, defQ);
      if (q.found && s.note) data.satellites[i].note = fmt(s.note, q); else if (!q.found) warn(`ring.satellites[${i}]: fila no encontrada`);
    });
  }

  /* ---------- Un gráfico completo: mezcla defaults del gráfico + de cada forma ---------- */
  function applyChart(host, spec, rows, warn) {
    const variants = host._variants || {};
    Object.keys(variants).forEach(form => {
      const raw = spec.variants ? spec.variants[form] : undefined;
      if (raw === false) return;
      const own = raw || {};
      const vs = Object.assign({ items: spec.items, fmt: spec.fmt && spec.fmt[form] !== undefined ? spec.fmt[form] : DEFAULT_FMT[form], metric: spec.metric && spec.metric[form], total: spec.total, levelColor: false }, own);
      if (form !== "ring" && !vs.items) return;
      applyVariant(form, variants[form], vs, rows, spec.q, msg => warn(`«${host.dataset.label}» ${msg}`));
    });
    if (spec.stat && host.closest) {
      const slide = host.closest(".slide"), el = slide && slide.querySelector(".gc-stat-inline");
      const p = pick(rows, spec.stat, spec.q);
      if (el && p.found && (p.v != null || p.n != null)) el.textContent = fmt(spec.stat.fmt || "{v}%", p);
      else if (el) warn(`«${host.dataset.label}» stat: fila no encontrada`);
    }
  }

  /* ---------- Carga + estado ---------- */
  const cache = {};
  async function loadTab(cfg, tab) {
    if (cache[tab]) return cache[tab];
    const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (/^\s*</.test(text)) throw new Error("El Sheet no es público (respondió una página de acceso)");
      return (cache[tab] = toRows(text));
    } finally { clearTimeout(timer); }
  }

  function badge(state, msg) {
    if (typeof document === "undefined") return;
    let b = document.getElementById("gc-live-status");
    if (!b) {
      b = document.createElement("button"); b.id = "gc-live-status"; b.type = "button";
      b.setAttribute("data-html2canvas-ignore", "true");
      b.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:9999;font:500 11px/1 var(--f-mono,monospace);letter-spacing:.03em;padding:7px 10px;border-radius:999px;border:1px solid rgba(28,28,28,.25);background:#F4F2EA;color:#1C1C1C;cursor:pointer;";
      b.addEventListener("click", () => root.GCLive.run(true));
      document.body.appendChild(b);
    }
    const dot = state === "ok" ? "#3B7359" : state === "load" ? "#EDD121" : "#D12E1C";
    b.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:7px;"></span>${msg}`;
    b.title = "Clic para volver a leer el Sheet";
  }

  async function run(force) {
    const B = root.GC_BINDINGS, C = root.GCCharts;
    if (!B || !C) return;
    badge("load", "Leyendo Sheet…");
    if (force) Object.keys(cache).forEach(k => delete cache[k]);
    const warns = [];
    try {
      const rows = await loadTab(root.GC_CONFIG, B.tab);
      document.querySelectorAll(".gc-chart[data-label]").forEach(host => {
        const spec = B.charts[host.dataset.label];
        if (!spec) return;
        applyChart(host, spec, rows, m => warns.push(m));
        C.renderForm(host, host.dataset.form);
      });
      warns.forEach(w => console.warn("[Sheet]", w));
      const t = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
      badge(warns.length ? "warn" : "ok", `Sheet ${B.tab} · ${t}${warns.length ? " · " + warns.length + " aviso(s), ver consola" : ""}`);
    } catch (e) {
      console.warn("[Sheet] sin conexión, se usan los valores del HTML:", e);
      badge("err", "Sin Sheet · valores del informe");
    }
  }

  root.GCLive = { run, _t: { parseCSV, toRows, pick, fmt, applyVariant, applyChart, loadTab, clearCache: () => Object.keys(cache).forEach(k => delete cache[k]) } };
  if (typeof module !== "undefined") module.exports = root.GCLive;
  if (typeof document !== "undefined" && root.GC_BINDINGS) {
    const go = () => run();
    if (root.GCCharts && root.GCCharts.ready) go(); else document.addEventListener("gc:charts-ready", go, { once: true });
  }
})(typeof window !== "undefined" ? window : globalThis);
