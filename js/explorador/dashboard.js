/* ==========================================================================
   FaAADudp — Explorador de datos.
   Lee TODAS las pestañas de año del Sheet (2023 → año actual + 3; las que no
   existen se ignoran), arma un índice de preguntas y dibuja la que se elija
   como una lámina 16:9 con las mismas formas de js/charts.js. Nada de esto
   lleva números escritos a mano: todo sale de las filas del Sheet.
   ========================================================================== */
(function () {
  "use strict";

  const L = window.GCLive._t;
  const CUR = new Date().getFullYear();
  const CANDIDATES = []; for (let y = 2023; y <= CUR + 3; y++) CANDIDATES.push(String(y));

  /* Colores: acento coral + orden fijo de rellenos validado con validate_palette.js
     (CVD y visión normal OK sobre cada fondo). Cada elemento va además con etiqueta
     directa y hay tabla de datos, porque los colores de marca (tinta/pastel) no
     pasan la banda de luminosidad de un categórico estricto. */
  const CORAL = "#FF6C53";
  const BG = {
    crema:  { cls: "bg-crema",  dark: false, label: "Crema",  hex: "#E7E4D8", ink: "#1C1C1C", order: ["#FF6C53", "#1C1C1C", "#335C96", "#EDD121", "#3B7359", "#99B0C9"] },
    blanco: { cls: "bg-blanco", dark: false, label: "Blanco", hex: "#FFFFFF", ink: "#1C1C1C", order: ["#FF6C53", "#1C1C1C", "#335C96", "#EDD121", "#3B7359", "#99B0C9"] },
    negro:  { cls: "bg-negro",  dark: true,  label: "Negro",  hex: "#1C1C1C", ink: "#FFFFFF", order: ["#FF6C53", "#FFFFFF", "#99B0C9", "#EDD121", "#335C96", "#91DBA6"] },
  };

  const ONE_D3 = ["radial", "lollipop", "bubbles", "treemap", "network", "donut"];
  const CMP = ["slope", "lines", "heat"];
  const RARE1 = ["spiral", "rose", "nested"];
  const RARE_CMP = ["dumbbell", "bump", "rings", "stream", "radar"];
  const RARE = [...RARE1, ...RARE_CMP];
  const isCmp = f => CMP.includes(f) || RARE_CMP.includes(f);
  const TALL = new Set([...ONE_D3, ...CMP, ...RARE]);

  const $ = s => document.querySelector(s);
  const state = { years: [], data: {}, year: null, q: null, form: null, bg: "crema", query: "", open: new Set() };
  const r2 = x => Math.round(x * 100) / 100;
  const fnum = x => String(r2(x)).replace(".", ",");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = p => p.replace(/^Sección \d+ · /, "");
  const seccion = p => (p.match(/^(Sección \d+) · /) || [])[1] || "";

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === "class") e.className = attrs[k]; else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => e.append(c && c.nodeType ? c : document.createTextNode(c == null ? "" : c)));
    return e;
  }

  /* ---------------------------- Carga ---------------------------- */
  function groupQuestions(rows) {
    const map = new Map();
    rows.forEach(r => {
      if (!map.has(r.pregunta)) map.set(r.pregunta, { pregunta: r.pregunta, familia: r.familia, rows: [] });
      map.get(r.pregunta).rows.push(r);
    });
    return [...map.values()];
  }

  function setStatus(kind, text) {
    $("#dash-status-dot").className = "dot" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
    $("#dash-status-text").textContent = text;
  }

  async function loadAll(force) {
    setStatus("load", "Leyendo Sheet…");
    if (force) L.clearCache();
    // Google devuelve la PRIMERA hoja cuando se pide una pestaña que no existe. Se reconoce ese "señuelo" pidiendo
    // un nombre imposible: si trae datos, se descartan los candidatos idénticos a él. (Con README como primera
    // pestaña el señuelo no trae columnas de datos y se rechaza solo.) Una pestaña copiada de otra año SÍ cuenta.
    let decoy = null;
    try { decoy = JSON.stringify(await L.loadTab(window.GC_CONFIG, "__pestana_inexistente__")); } catch (e) { /* sin señuelo: nada que descartar */ }
    const res = await Promise.all(CANDIDATES.map(async y => {
      try { return [y, await L.loadTab(window.GC_CONFIG, y)]; } catch (e) { return [y, null]; }
    }));
    state.data = {}; state.years = [];
    res.forEach(([y, rows]) => {
      if (!rows || !rows.length) return;
      if (decoy && JSON.stringify(rows) === decoy) return;
      state.data[y] = groupQuestions(rows); state.years.push(y);
    });
    if (!state.years.length) {
      setStatus("err", "No pude leer el Sheet");
      showMsg("No pude leer el Sheet. Revisa la conexión y que el archivo siga compartido como «Cualquier persona con el enlace», y pulsa «Actualizar».");
      return false;
    }
    const n = Object.values(state.data).reduce((a, q) => a + q.length, 0);
    setStatus("ok", `Sheet en vivo · ${state.years.length} años · ${n} preguntas · ${new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`);
    return true;
  }

  function showMsg(t) { const m = $("#dash-empty"); m.textContent = t; m.hidden = false; $("#dash-content").hidden = true; }

  /* ---------------------- Perfil de una pregunta ---------------------- */
  function profile(q) {
    const items = q.rows.map(r => ({ label: r.categoria || short(q.pregunta), v: r.valor, n: r.n, ntot: r.ntot, unidad: r.unidad, rango: r.rango, nota: r.nota }));
    const isPct = items.some(i => i.unidad === "%");
    const numeric = isPct ? items.filter(i => i.v != null) : items.filter(i => i.n != null || i.v != null);
    const unit = (numeric.find(i => i.unidad && i.unidad !== "%") || {}).unidad || "";
    const sumV = r2(numeric.reduce((a, i) => a + (isPct ? i.v : 0), 0));
    const hasN = numeric.length > 0 && numeric.every(i => i.n != null);
    const sumN = numeric.reduce((a, i) => a + (i.n || 0), 0);
    const nts = items.map(i => i.ntot).filter(x => x != null);
    const N = nts.length ? Math.max(...nts) : null;
    const units = new Set(numeric.map(i => i.unidad || ""));
    let kind;
    if (!numeric.length) kind = "empty";
    else if (units.size > 1) kind = "mixed";
    else if (numeric.length === 1) kind = "value";
    else if (isPct) kind = sumV > 105 ? "multi" : sumV >= 95 ? "single" : "partial";
    else kind = "counts";
    return { q, items, numeric, isPct, unit, sumV, hasN, sumN, N, kind };
  }
  const val = (P, i) => P.isPct ? i.v : (i.n != null ? i.n : i.v);

  function formsFor(P) {
    const n = P.numeric.length, f = [];
    const swarm = P.hasN && P.sumN > 0 && P.sumN <= 420 && n <= 8;
    const pict = swarm && n <= 6 && P.isPct && P.kind === "single" && (P.N == null || Math.abs(P.N - P.sumN) <= Math.max(2, P.N * 0.03));
    const cmp = P.cmp ? CMP.slice() : [];
    if (P.kind === "empty" || P.kind === "mixed") return ["cards"];
    if (P.kind === "value") return ["stat", ...cmp, ...(P.cmp ? ["dumbbell"] : [])];
    if (P.kind === "single") { if (n <= 6) f.push("band", "ring"); f.push("rankedBars"); if (n >= 3 && n <= 12) f.push("burst"); if (swarm) f.push("swarm"); if (pict) f.push("pictogram"); }
    else if (P.kind === "partial") { if (n <= 6) f.push("band"); f.push("rankedBars"); if (n >= 3 && n <= 12) f.push("burst"); if (swarm) f.push("swarm"); }
    else if (P.kind === "multi") { if (n >= 3 && n <= 12) f.push("burst"); f.push("rankedBars"); if (swarm) f.push("swarm"); }
    else { f.push("rankedBars"); if (n >= 3 && n <= 12) f.push("burst"); if (swarm) f.push("swarm"); }
    if (n >= 2) f.push("radial", "lollipop");
    if (n >= 3) f.push("bubbles", "treemap", "network");
    if ((P.kind === "single" || P.kind === "partial") && n >= 2 && n <= 8) f.push("donut");
    const rare = [];
    if (n >= 4) rare.push("spiral");
    if (n >= 3) rare.push("rose");
    if (n >= 3 && n <= 8) rare.push("nested");
    if (P.cmp) {
      const c = P.cmp, shares = P.isPct && c.sums.every(x => x >= 85 && x <= 105);
      rare.push("dumbbell");
      if (c.series.length >= 3) rare.push("bump");
      if (c.series.length >= 4) rare.push("radar");
      if (shares && c.series.length >= 2) rare.push("rings");
      if (shares && c.years.length >= 3 && c.series.length >= 2) rare.push("stream");
    }
    return f.concat(cmp, rare);
  }

  /* Misma pregunta en varios años: una serie por categoría (color según su lugar de aparición, no su ranking) */
  function yearSeries(P) {
    const yrs = state.years.filter(y => (state.data[y] || []).some(x => x.pregunta === P.q.pregunta));
    if (yrs.length < 2) return null;
    const profs = yrs.map(y => profile(state.data[y].find(x => x.pregunta === P.q.pregunta)));
    if (profs.some(pp => pp.kind === "empty" || pp.kind === "mixed" || pp.isPct !== P.isPct)) return null;
    const cats = [], first = [profs[yrs.indexOf(state.year)], ...profs.filter((_, i) => yrs[i] !== state.year)];
    first.forEach(pp => pp.numeric.forEach(i => { if (!cats.includes(i.label)) cats.push(i.label); }));
    const sums = profs.map(pp => r2(pp.numeric.reduce((a, i) => a + (pp.isPct ? i.v : 0), 0)));
    const series = cats.map((c, k) => ({ label: c, k, values: profs.map(pp => { const it = pp.numeric.find(i => i.label === c); return it ? (pp.isPct ? it.v : (it.n != null ? it.n : it.v)) : null; }) }))
      .filter(z => z.values.filter(v => v != null).length >= 2);
    if (!series.length) return null;
    // se descartan los años sin ningún dato comparable (p. ej. si ese año se midió con otras categorías)
    const keep = yrs.map((_, i) => series.some(z => z.values[i] != null));
    if (keep.filter(Boolean).length < 2) return null;
    series.forEach(z => { z.values = z.values.filter((_, i) => keep[i]); });
    const peak = z => Math.max(...z.values.filter(v => v != null));
    series.sort((a, b) => peak(b) - peak(a));
    return { years: yrs.filter((_, i) => keep[i]), series: series.slice(0, 12), sums: sums.filter((_, i) => keep[i]) };
  }
  const FORM_LABEL = () => Object.assign({}, window.GCCharts.FORM_LABEL, { stat: "Cifra" });

  /* ------------------ Datos para cada forma (desde las filas) ------------------ */
  function build(form, P, theme) {
    const it = P.numeric, order = theme.order, ink = theme.ink;
    const disp = (i, withN) => P.isPct ? (withN && i.n != null ? `${fnum(i.n)} · ${fnum(i.v)}%` : `${fnum(i.v)}%`) : fnum(val(P, i));
    const desc = [...it].sort((a, b) => val(P, b) - val(P, a));
    const clip = (s, k) => s.length > k ? s.slice(0, k - 1) + "…" : s;
    switch (form) {
      case "band": {
        const segs = it.map((i, k) => ({ label: i.label, value: i.v, display: disp(i, false), fill: order[k % order.length] }));
        if (P.sumV < 99.5) segs.push({ label: "Sin cifra en la fuente", value: r2(100 - P.sumV), display: "≈" + fnum(100 - P.sumV) + "%", hollow: true });
        return { segments: segs };
      }
      case "ring": {
        const m = desc[0];
        return { pct: m.v, accent: CORAL, label: clip(m.label, 26), satellites: desc.slice(1, 6).map(i => ({ label: i.label, note: disp(i, true) })) };
      }
      case "rankedBars":
        return { items: desc.slice(0, 10).map((i, k) => ({ label: esc(i.label), value: val(P, i), display: esc(disp(i, true)), color: k === 0 ? CORAL : ink })) };
      case "burst": {
        const list = desc.slice(0, 12), mx = Math.max(...list.map(i => val(P, i)));
        return { accent: CORAL, center: P.N != null ? String(P.N) : "", items: list.map(i => ({ label: i.label, value: P.isPct ? i.v : val(P, i) / mx * 100, display: disp(i, true) })) };
      }
      case "swarm":
        return { items: it.map((i, k) => ({ label: i.label, n: i.n, display: disp(i, false), color: order[k % order.length] })),
                 note: `1 punto = 1 ${P.isPct ? "respuesta" : (P.unit || "unidad").replace(/s$/, "")}${P.N ? " · " + P.N + " en total" : ""}` };
      case "pictogram": {
        const total = P.N != null && P.N >= P.sumN ? P.N : P.sumN;
        const segs = it.map((i, k) => ({ count: i.n, label: i.label, color: order[k % order.length] }));
        if (total > P.sumN) segs.push({ count: total - P.sumN, label: "Sin respuesta / otras", hollow: true });
        return { total, segments: segs };
      }
      case "radial": case "lollipop": {
        const base = { bg: theme.hex, ink, accent: CORAL };
        return Object.assign(base, { items: desc.slice(0, form === "radial" ? 8 : 12).map((i, k) => ({ label: i.label, value: val(P, i), display: disp(i, true), color: k === 0 ? CORAL : ink })) });
      }
      case "bubbles": case "treemap":
        return { bg: theme.hex, ink, accent: CORAL, items: desc.slice(0, 16).map(i => ({ label: i.label, value: val(P, i), display: disp(i, true), color: order[it.indexOf(i) % order.length] })) };
      case "network":
        return { bg: theme.hex, ink, accent: CORAL, center: P.N != null ? String(P.N) : "",
                 items: desc.slice(0, 12).map((i, k) => ({ label: i.label, value: val(P, i), display: disp(i, true), color: k === 0 ? CORAL : order[1 + (it.indexOf(i) % (order.length - 1))] })) };
      case "donut": {
        const items = it.map((i, k) => ({ label: i.label, value: i.v, display: disp(i, true), color: order[k % order.length] }));
        if (P.sumV < 99.5) items.push({ label: "Sin cifra en la fuente", value: r2(100 - P.sumV), display: "≈" + fnum(100 - P.sumV) + "%", hollow: true });
        return { bg: theme.hex, ink, accent: CORAL, items };
      }
      case "spiral": case "rose": case "nested":
        return { bg: theme.hex, ink, accent: CORAL, items: desc.slice(0, form === "nested" ? 8 : 12).map(i => ({ label: i.label, value: val(P, i), display: disp(i, true), color: order[it.indexOf(i) % order.length] })) };
      case "slope": case "lines": case "heat": case "dumbbell": case "bump": case "rings": case "stream": case "radar":
        return { bg: theme.hex, ink, accent: CORAL, years: P.cmp.years, fmt: P.isPct ? v => fnum(v) + "%" : v => fnum(v),
                 series: P.cmp.series.map(z => Object.assign({}, z, { color: order[z.k % order.length] })) };
      case "cards":
        return { cards: P.items.map(i => {
          const v = i.v != null ? fnum(i.v) + (i.unidad === "%" ? "%" : " " + i.unidad) : (i.n != null ? fnum(i.n) + (i.unidad ? " " + i.unidad : "") : "");
          return { t: esc(i.label + (v ? " · " + v : "")), d: esc(i.nota || "") };
        }) };
    }
  }

  /* ------------------------ Titular + texto de la lámina ------------------------ */
  function headline(P) {
    const it = P.numeric;
    const strong = t => h("strong", null, t);
    if (P.kind === "empty") return { big: String(P.items.length), cap: [strong(`${P.items.length} categorías`), " cualitativas: la fuente no entrega porcentajes."] };
    if (P.kind === "mixed") return { big: String(P.items.length), cap: [strong(`${P.items.length} datos`), " de distinto tipo (personas, respuestas, porcentajes): se muestran uno a uno."] };
    if (P.kind === "value") {
      const i = it[0], meaningful = i.label && i.label !== "—" && i.label !== short(P.q.pregunta);
      return { big: P.isPct ? fnum(i.v) + "%" : fnum(val(P, i)), cap: [meaningful ? strong(i.label) : "", meaningful ? " · " : "", P.isPct ? short(P.q.pregunta) : (P.unit || short(P.q.pregunta))] };
    }
    const top = [...it].sort((a, b) => val(P, b) - val(P, a))[0];
    if (P.isPct) return { big: fnum(top.v) + "%", cap: [strong(top.label), ` es la categoría con mayor porcentaje${P.N ? ` (sobre ${P.N} respuestas)` : ""}${P.kind === "multi" ? " · respuesta múltiple" : ""}.`] };
    return { big: fnum(val(P, top)), cap: [strong(top.label), ` es lo más frecuente${P.unit ? " (" + P.unit + ")" : ""}.`] };
  }

  /* ------------------------------ Lámina ------------------------------ */
  function renderStat(host, P) {
    const i = P.numeric[0];
    host.replaceChildren(h("div", { style: "height:100%;display:flex;align-items:flex-end;font-size:1.5cqw;line-height:1.4;max-width:60ch;opacity:.85;" }, i.nota || ""));
  }

  function drawStage(P, form) {
    const theme = BG[state.bg];
    const N = P.kind === "mixed" ? "" : P.N != null ? `${P.N} respuestas` : (P.hasN && P.sumN ? `${fnum(P.sumN)} en total` : "");
    const hd = headline(P);
    const tall = TALL.has(form), cmp = isCmp(form);
    const eyebrow = h("span", { class: `tag-eyebrow ${theme.dark ? "on-coral" : "on-negro"} gc-tag` }, [short(P.q.pregunta), cmp ? `${P.cmp.years[0]}–${P.cmp.years[P.cmp.years.length - 1]}` : state.year, cmp ? "" : N].filter(Boolean).join(" · "));
    const len = hd.big.length;
    const cols = len <= 3 ? [3, 3] : len <= 5 ? [4, 4] : [5, 5];
    const bigStyle = tall ? `color:var(--coral);grid-column:1/3;grid-row:2/5;align-self:end;font-size:${Math.min(9, 19 / (0.62 * Math.max(len, 1))).toFixed(2)}cqw;`
                          : `color:var(--coral);grid-column:1/${cols[0]};${len >= 6 ? "font-size:7cqw;" : ""}`;
    const capStyle = tall ? "grid-column:1/3;grid-row:5/7;align-self:start;font-size:1.45cqw;max-width:none;padding-top:1cqw;" : `grid-column:${cols[1]}/9`;
    const big = h("p", { class: "stat-huge gc-stat-inline", style: bigStyle }, hd.big);
    const cap = h("p", { class: "stat-caption gc-caption-inline", style: capStyle }, hd.cap);
    const chart = h("div", { class: tall ? "gc-chart gc-tall" : "gc-bars-wide gc-chart" });
    const slide = h("section", { class: `slide ${theme.cls}`, "aria-label": `${short(P.q.pregunta)} — ${FORM_LABEL()[form]}` },
      h("div", { class: "slide-pad" }, eyebrow, big, cap, chart),
      h("div", { class: "firma" },
        h("span", { class: "firma-left" }, h("img", { src: `assets/logo-faaad-${theme.dark ? "blanco" : "negro"}.png`, alt: "FaAADudp" }), h("span", { class: "escuela-tag" }, "Escuela de Diseño")),
        h("span", { class: "doc-tag" }, P.q.familia)));
    $("#dash-stage-wrap").replaceChildren(slide);
    if (form === "stat") renderStat(chart, P);
    else window.GCCharts.render(chart, form, build(form, P, theme));
  }

  /* ------------------------------ Render principal ------------------------------ */
  let P = null;

  // la interfaz es neutra: el color queda solo para los gráficos; los grupos se separan con un rótulo
  const GROUPS = ["Básicos", "Más formas", "Comparar años", "Poco comunes"];
  const groupOf = f => RARE.includes(f) ? 3 : CMP.includes(f) ? 2 : ONE_D3.includes(f) ? 1 : 0;
  const SVGNS = "http://www.w3.org/2000/svg";
  const THUMB_VB = { band: "110 40 780 150", ring: "25 15 430 235", burst: "385 25 230 215", pictogram: "0 10 1000 210", swarm: "0 20 1000 240" };

  const ICON_FORMS = new Set(["rankedBars", "cards", "swarm"]);
  function iconSvg(kind, P, theme) {
    const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("viewBox", "0 0 100 62"); svg.style.cssText = "width:100%;height:100%";
    const add = (tag, a) => { const e = document.createElementNS(SVGNS, tag); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); };
    if (kind === "rankedBars") {
      const items = build("rankedBars", P, theme).items.slice(0, 7), mx = Math.max(...items.map(i => i.value)) || 1, hh = 62 / (items.length * 1.6);
      items.forEach((it, k) => { const y = k * hh * 1.6; add("rect", { x: 0, y, width: 100, height: hh, rx: hh / 2, fill: "#1C1C1C", "fill-opacity": .1 }); add("rect", { x: 0, y, width: Math.max(4, it.value / mx * 100), height: hh, rx: hh / 2, fill: it.color }); });
    } else if (kind === "swarm") {
      // tres racimos de puntos (espiral de Fermat), del tamaño relativo de las tres primeras categorías
      const items = build("swarm", P, theme).items.slice(0, 3), mx = Math.max(...items.map(i => i.n)) || 1;
      items.forEach((it, k) => {
        const cx = 17 + k * 33, n = Math.max(6, Math.round(it.n / mx * 46));
        for (let i = 0; i < n; i++) { const r = 2.1 * Math.sqrt(i + .5), a = i * 2.39996; add("circle", { cx: cx + r * Math.cos(a), cy: 31 + r * Math.sin(a), r: 1.15, fill: it.color, "fill-opacity": .95 }); }
      });
    } else {
      [0, 34, 68].forEach((x, k) => { add("rect", { x, y: 6, width: 30, height: 50, rx: 4, fill: "none", stroke: "#1C1C1C", "stroke-width": 1.4, "stroke-opacity": .5 }); add("rect", { x: x + 4, y: 12, width: 14, height: 3, rx: 1.5, fill: k === 0 ? "#FF6C53" : "#1C1C1C" }); add("rect", { x: x + 4, y: 22, width: 22, height: 2, rx: 1, fill: "#1C1C1C", "fill-opacity": .35 }); add("rect", { x: x + 4, y: 28, width: 18, height: 2, rx: 1, fill: "#1C1C1C", "fill-opacity": .35 }); });
    }
    return svg;
  }

  function currentQuestion() { return (state.data[state.year] || []).find(x => x.pregunta === state.q); }
  const isGood = x => ["single", "multi", "partial", "counts"].includes(profile(x).kind);

  function renderMain() {
    const q = currentQuestion();
    if (!q) { showMsg("Elige una pregunta en la barra de la izquierda."); return; }
    $("#dash-empty").hidden = true; $("#dash-content").hidden = false;
    P = profile(q); P.cmp = yearSeries(P);
    const forms = formsFor(P);
    if (!forms.includes(state.form)) state.form = forms[0];

    $("#dash-title").textContent = short(q.pregunta);
    $("#dash-crumb").textContent = [state.year, q.familia, seccion(q.pregunta)].filter(Boolean).join("  ·  ");
    $("#dash-bgs").replaceChildren(...Object.entries(BG).map(([k, b]) => h("button", {
      type: "button", class: "bgdot", style: `--c:${b.hex}`, "aria-pressed": String(k === state.bg), "aria-label": "Fondo " + b.label, title: "Fondo " + b.label,
      onclick: () => { state.bg = k; renderMain(); } })));

    drawStage(P, state.form);
    renderThumbs(P, forms);
    $("#dash-formname").textContent = FORM_LABEL()[state.form] || state.form;

    const others = state.years.filter(y => y !== state.year && (state.data[y] || []).some(x => x.pregunta === q.pregunta));
    $("#dash-also").replaceChildren(...(others.length
      ? ["También en", ...others.map(y => h("button", { type: "button", onclick: () => { state.year = y; state.open.add(y); renderMain(); } }, y))]
      : ["Solo en " + state.year]));

    renderTable(q); renderTree(); saveHash();
  }

  /* Galería: cada tipo de gráfico se ve dibujado con los datos de ESTA pregunta (sin textos) */
  function renderThumbs(P, forms) {
    const light = BG.blanco, labels = FORM_LABEL();
    const cards = forms.flatMap((f, i) => {
      const head = i === 0 || groupOf(f) !== groupOf(forms[i - 1]) ? [h("div", { class: "thumb-group" }, GROUPS[groupOf(f)])] : [];
      const host = h("div", { class: "gc-chart" }), inner = h("div", { class: "thumb-inner" }, host);
      try {
        if (f === "stat") host.replaceChildren(h("div", { class: "thumb-stat" }, headline(P).big));
        else if (ICON_FORMS.has(f)) host.replaceChildren(iconSvg(f, P, light));
        else window.GCCharts.render(host, f, build(f, P, light));
      } catch (e) { console.warn("[miniatura]", f, e); }
      return [...head, h("button", { type: "button", class: "thumb", "data-f": f, role: "option", "aria-selected": String(f === state.form), "aria-label": labels[f] || f, title: labels[f] || f,
        onclick: () => { state.form = f; renderMain(); } }, h("div", { class: "thumb-box" }, inner))];
    });
    $("#dash-forms").replaceChildren(...cards);
    fitThumbs();
  }
  // escala cada miniatura a su tarjeta y encuadra el SVG sobre la figura (sin los textos, que van ocultos)
  function fitThumbs() {
    document.querySelectorAll("#dash-forms .thumb").forEach(t => {
      const w = t.clientWidth; if (!w) return;
      t.style.height = `${Math.round(w * .625)}px`;   // 16:10 exacto (una altura fija evita que la cuadrícula las comprima)
      t.querySelector(".thumb-inner").style.transform = `scale(${w / 2000})`;
      const svg = t.querySelector(".gc-chart > svg");
      if (svg && !ICON_FORMS.has(t.dataset.f)) {
        try { const bb = svg.getBBox(); if (bb.width > 4 && bb.height > 4) { const pad = Math.max(bb.width, bb.height) * .05; svg.setAttribute("viewBox", `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`); } } catch (e) { /* aún sin layout */ }
      }
    });
  }

  function renderTable(q) {
    const cell = (v, cls) => h("td", { class: (cls || "") + (v == null || v === "" ? " blank" : "") }, v == null || v === "" ? "—" : v);
    const head = h("tr", null, ["Categoría", "Valor", "Unidad", "n", "N total", "Rango de logro", "Nota"].map(t => h("th", null, t)));
    const rows = q.rows.map(r => h("tr", null, cell(r.categoria), cell(r.valor == null ? null : fnum(r.valor), "num"), cell(r.unidad), cell(r.n == null ? null : fnum(r.n), "num"), cell(r.ntot == null ? null : fnum(r.ntot), "num"), cell(r.rango), cell(r.nota, "nota")));
    $("#dash-table").replaceChildren(head, ...rows);
    const gid = (window.GC_CONFIG.gids || {})[state.year];
    $("#dash-sheet-link").href = `https://docs.google.com/spreadsheets/d/${window.GC_CONFIG.sheetId}/edit${gid != null ? "#gid=" + gid : ""}`;
  }

  /* ------------------ Árbol: cada año contiene sus preguntas ------------------ */
  function renderTree() {
    const q = state.query.trim().toLowerCase(), out = [];
    [...state.years].reverse().forEach(y => {
      const all = state.data[y] || [];
      const list = all.filter(x => !q || x.pregunta.toLowerCase().includes(q) || x.rows.some(r => r.categoria.toLowerCase().includes(q)));
      if (q && !list.length) return;
      const open = q ? true : state.open.has(y);
      out.push(h("button", { type: "button", class: "yr" + (y === state.year ? " is-cur" : ""), "aria-expanded": String(open),
        onclick: () => { if (state.open.has(y)) state.open.delete(y); else state.open.add(y); renderTree(); } },
        h("span", { class: "yr-n" }, y), h("span", { class: "yr-c" }, `${all.length} preguntas`), h("span", { class: "yr-chev", "aria-hidden": "true" }, "▾")));
      if (!open) return;
      const body = h("div", { class: "yr-body" }); let fam = null, sec = null;
      list.forEach(x => {
        if (x.familia !== fam) { fam = x.familia; sec = null; body.append(h("div", { class: "q-familia" }, fam || "Sin familia")); }
        const sc = seccion(x.pregunta);
        if (sc && sc !== sec) body.append(h("div", { class: "q-seccion" }, sc));
        sec = sc || null;
        // un punto por año: relleno si esa pregunta existe en ese año (así se ve dónde se puede comparar)
        const pips = h("span", { class: "pips", title: "Años en que existe esta pregunta" }, state.years.map(yy => h("i", { class: "pip" + ((state.data[yy] || []).some(z => z.pregunta === x.pregunta) ? (yy === y ? " cur" : " on") : "") })));
        body.append(h("button", { type: "button", class: "q-item", "aria-current": String(y === state.year && x.pregunta === state.q),
          onclick: () => { state.year = y; state.q = x.pregunta; state.open.add(y); renderMain(); } }, h("span", null, short(x.pregunta)), pips));
      });
      out.push(body);
    });
    $("#dash-tree").replaceChildren(...(out.length ? out : [h("p", { class: "tbl-foot", style: "color:#8d8d88;padding:8px 10px" }, "Ninguna pregunta coincide.")]));
  }

  /* ------------------------ Estado en la URL (#año|pregunta|forma|fondo) ------------------------ */
  function saveHash() {
    const t = [state.year, state.q, state.form, state.bg].map(x => encodeURIComponent(x || "")).join("|");
    try { history.replaceState(null, "", "#" + t); } catch (e) { /* file:// en algunos navegadores */ }
  }
  function readHash() {
    const p = decodeURIComponent(location.hash.slice(1) || "").split("|");
    return { year: p[0] || null, q: p[1] || null, form: p[2] || null, bg: p[3] || null };
  }
  function applyState(hs) {
    state.year = state.years.includes(hs.year) ? hs.year : state.years[state.years.length - 1];
    const qs = state.data[state.year] || [];
    state.q = qs.some(x => x.pregunta === hs.q) ? hs.q : ((qs.find(isGood) || qs[0]) || {}).pregunta;
    if (hs.form) state.form = hs.form;
    if (BG[hs.bg]) state.bg = hs.bg;
    state.open.add(state.year);
  }

  /* ------------------------------ Arranque ------------------------------ */
  async function start(force) {
    const keep = { year: state.year, q: state.q, form: state.form, bg: state.bg };
    const ok = await loadAll(force);
    if (!ok) return;
    applyState(force ? keep : readHash());
    $("#dash-empty").hidden = true;
    renderMain();
    const cur = document.querySelector("#dash-tree .q-item[aria-current='true']"), box = cur && cur.closest(".yr-body");
    if (box) box.scrollTop = cur.offsetTop - box.clientHeight / 2;   // solo el árbol, sin mover la página
  }

  function init() {
    $("#dash-refresh").addEventListener("click", () => start(true));
    $("#dash-search").addEventListener("input", e => { state.query = e.target.value; renderTree(); });
    window.addEventListener("resize", fitThumbs);
    window.addEventListener("hashchange", () => { const hs = readHash(); if (hs.year && (hs.year !== state.year || hs.q !== state.q)) { applyState(hs); renderMain(); } });
    start(false);
  }
  if (window.GCCharts && window.GCCharts.ready) init(); else document.addEventListener("gc:charts-ready", init, { once: true });
})();
