/* ==========================================================================
   FaAADudp — Encuesta cohorte, Escuela de Diseño UDP: cualquier pregunta real del Sheet dibujada
   con un "gradient map" térmico (referencia: piezas de Brik). Dos familias:
     Radiales  — Espiral (barras radiales), Rosa (área polar), Nube (radar)
     Cartesianas — Línea, Paleta (lollipop), Barras; sobre un campo líquido
   Cada forma tiene dos capas: máscara (lo que brilla, pasa por gl.js) y
   superposición nítida (texto, píldoras, ejes). La animación vive DENTRO de
   cada gráfico, nunca saltando entre formas: al entrar, cada categoría crece
   desde cero en cascada; con «Animar», si la pregunta existe en varios años
   el mismo gráfico recorre los años (los valores cambian en su lugar), y si
   no, repite el ciclo crecer → sostener → vaciar.
   Lectura "Cambio": si la pregunta existe en 2+ años con categorías que
   calzan, muestra la diferencia entre los dos últimos años (puede ser
   negativa → solo formas cartesianas).
   ========================================================================== */
(function () {
  "use strict";

  const $ = s => document.querySelector(s);
  // out/ctx son el lienzo de destino de draw(): el del editor, o el de las miniaturas mientras se toma una
  let out = $("#tm-out"), ctx = out.getContext("2d");
  const wrap = $("#tm-wrap");
  const mask = document.createElement("canvas"), mctx = mask.getContext("2d");
  let thermal = null;
  try { thermal = TermicoGL.Thermal(); } catch (e) { console.warn("[termico]", e); }

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MASK_SCALE = .5;           // máscara a media resolución: el blur la suaviza igual
  const MAX_ITEMS = 8;

  /* Colores FaAAD (manual v1.1): los 11 de la paleta, todos elegibles. Cada gráfico usa UN gradiente
     de dos colores a lo largo del eje de valor (inicio → final) sobre un fondo sólido, más un campo líquido en un color aparte con
     tope de intensidad (atmósfera, no dato). El color del texto lo decide el fondo, según la regla de
     contraste del manual: negro, rojo, verde y azul → texto blanco; el resto → texto negro (el coral
     admite ambos; acá va negro). */
  const COLORS = [
    { k: "negro", hex: "#1C1C1C", name: "Negro UDP", dark: true },
    { k: "blanco", hex: "#FFFFFF", name: "Blanco" },
    { k: "crema", hex: "#E7E4D8", name: "Crema UDP" },
    { k: "amarilloUDP", hex: "#FFF800", name: "Amarillo UDP" },
    { k: "coral", hex: "#FF6C53", name: "Coral FaAAD" },
    { k: "rojo", hex: "#D12E1C", name: "Rojo 485 C", dark: true },
    { k: "verde", hex: "#3B7359", name: "Verde 555 C", dark: true },
    { k: "azul", hex: "#335C96", name: "Azul 647 C", dark: true },
    { k: "verdeClaro", hex: "#91DBA6", name: "Verde claro 359 C" },
    { k: "azulClaro", hex: "#99B0C9", name: "Azul claro 644 C" },
    { k: "amarillo", hex: "#EDD121", name: "Amarillo 116 C" },
  ];
  const COL = Object.fromEntries(COLORS.map(c => [c.k, c]));
  const ROLES = [["bg", "Fondo"], ["a", "Inicio"], ["b", "Final"], ["field", "Campo"]];
  // combinaciones rápidas (tomadas de los ejemplos de gradiente del manual, págs. 26–27 y 30)
  /* Por defecto el gradiente es de UN color en dos tonos (b: "tono"): suave en los valores bajos y pleno
     en los altos. Dos colores distintos se leían como dos datos distintos; el segundo color queda como
     opción manual en la fila «Final». */
  const PRESETS = [
    { label: "Coral", bg: "crema", a: "coral", b: "tono", field: "azulClaro" },
    { label: "Azul", bg: "crema", a: "azul", b: "tono", field: "amarillo" },
    { label: "Verde", bg: "crema", a: "verde", b: "tono", field: "azulClaro" },
    { label: "Amarillo sobre negro", bg: "negro", a: "amarillo", b: "tono", field: "azul" },
    { label: "Rojo sobre negro", bg: "negro", a: "rojo", b: "tono", field: "verde" },
  ];
  const TONO = { k: "tono", name: "Mismo color, otro tono", swatch: "linear-gradient(90deg, #E7E4D8 0%, #8a8a8a 100%)" };
  const toneMix = (a, b, t) => "#" + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
  // par [inicio, final] del gradiente: con «tono», el inicio es el mismo color fundido a medias con el fondo
  function gradPair(c) {
    const a = COL[c.a].hex;
    return c.b === "tono" ? [toneMix(a, COL[c.bg].hex, .55), a] : [a, COL[c.b].hex];
  }
  function currentPal() {
    const c = state.colors, bg = COL[c.bg], dark = !!bg.dark, ink = dark ? "#FFFFFF" : "#1C1C1C";
    return { bg: bg.hex, pairs: [gradPair(c)], field: COL[c.field].hex, fieldAmt: dark ? .5 : .6,
      ink, pill: ink, pillInk: dark ? "#1C1C1C" : "#FFFFFF",
      grid: dark ? "rgba(255,255,255,.28)" : "rgba(28,28,28,.28)", logo: dark ? "blanco" : "negro" };
  }
  const RATIOS = { "16:9": 16 / 9, "4:5": 4 / 5, "1:1": 1 };
  const FORMS = {
    espiral: { label: "Espiral", radial: true },
    rosa: { label: "Rosa", radial: true },
    nube: { label: "Nube", radial: true },
    linea: { label: "Línea", radial: false },
    paleta: { label: "Paleta", radial: false },
    barras: { label: "Barras", radial: false },
  };

  const state = {
    year: null, q: null, P: null, cmp: null, mode: "valor", openYears: new Set(),
    form: "espiral", colors: { ...PRESETS[0] }, ratio: "16:9", showTitle: false, noBg: false, playing: false, playT: 0, playIdx: 0, playPhase: 0,
    vis: [], dom: { min: 0, max: 1 }, domT: { min: 0, max: 1 }, isPct: false, signed: false,
    meta: { title: "Elige una pregunta", crumb: "", note: "" }, message: "Cargando datos del Sheet…",
    free: "", freeByQ: {}, sub: null, ft: null, cambioYears: null, chartOnly: false,
  };
  const logos = {};
  // el lockup se guarda como canvas: así sirve igual para el lienzo y para el SVG (queda incrustado, no como ruta relativa)
  ["negro", "blanco"].forEach(k => {
    const im = new Image();
    im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext("2d").drawImage(im, 0, 0); logos[k] = cv; };
    im.src = `assets/img/logo-faaad-${k}.png`;
  });

  /* ------------------------------ utilidades ------------------------------ */
  const clip = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s;
  function fmt(v) {
    const sign = state.mode === "cambio" && v > 0.05 ? "+" : "";
    const a = Math.abs(v), s = a >= 10 || !state.isPct ? String(Math.round(v)) : v.toFixed(1).replace(".", ",");
    return sign + s;
  }
  const unitLabel = () => state.mode === "cambio" ? (state.isPct ? "puntos porcentuales" : "diferencia") : (state.isPct ? "%" : "n");
  function niceStep(span, target) {
    const raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function setStatus(kind, text) {
    const cls = "lab-dot" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
    $("#lab-dot").className = cls; $("#tm-gdot").className = cls;
    $("#lab-status").textContent = text; $("#tm-gstatus").textContent = text;
  }

  /* ------------------------------ datos → items ------------------------------ */
  function curate(items) {
    if (items.length <= MAX_ITEMS) return items;
    const sorted = [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    if (state.mode === "cambio") return sorted.slice(0, MAX_ITEMS + 2);
    const top = sorted.slice(0, MAX_ITEMS - 1);
    top.push({ label: `Otros (${sorted.length - top.length})`, value: sorted.slice(MAX_ITEMS - 1).reduce((a, i) => a + i.value, 0) });
    return top;
  }

  function buildItems() {
    const P = state.P;
    if (!P) return [];
    state.isPct = P.isPct;
    /* Comparar años: las mismas opciones con un valor por año, en UN gráfico (no paneles separados).
       Categorías fijas: las 8 mayores del último año. v.cur pasa a ser un factor 0→1 (la animación de
       entrada); los valores reales viven en v.vals, uno por año. */
    if (state.mode === "comparar" && state.cmp) {
      const c = state.cmp, last = c.years.length - 1, val = (z, i) => z.values[i] == null ? -1 : z.values[i];
      state.meta.note = [P.N ? `n ${state.year} = ${P.N}` : "", unitLabel() === "%" ? "porcentaje" : "conteo"].filter(Boolean).join(" · ");
      return [...c.series].sort((a, b) => val(b, last) - val(a, last)).slice(0, MAX_ITEMS).map(z => ({ label: z.label, value: 1, vals: z.values }));
    }
    if (state.mode === "cambio" && state.cmp) {
      const c = state.cmp, out = [];
      let ya = null, yb = null;
      c.series.forEach(z => {
        const idx = z.values.map((v, i) => v != null ? i : -1).filter(i => i >= 0);
        if (idx.length < 2) return;
        const a = idx[idx.length - 2], b = idx[idx.length - 1];
        if (ya == null) { ya = c.years[a]; yb = c.years[b]; state.cambioYears = [ya, yb]; }
        out.push({ label: z.label, value: z.values[b] - z.values[a] });
      });
      state.meta.note = ya ? `Cambio ${ya} → ${yb} · ${unitLabel()}` : "";
      return curate(out);
    }
    if (P.kind === "empty" || P.kind === "mixed") return [];
    state.meta.note = [P.N ? `n = ${P.N}` : "", unitLabel() === "%" ? "porcentaje" : "conteo"].filter(Boolean).join(" · ");
    return curate(P.numeric.map(i => ({ label: i.label || "Total", value: DatosEncuesta.val(P, i) })));
  }

  /* Los valores no saltan: cada item interpola hacia su nuevo valor; los que sobran se encogen a 0 y se van. */
  const STAGGER = .07;  // s entre una categoría y la siguiente: la cascada que hace legible el orden
  function applyItems(items, opts) {
    opts = opts || {};
    items.forEach((it, i) => {
      if (state.vis[i]) Object.assign(state.vis[i], { label: it.label, target: it.value, vals: it.vals, dying: false, delay: i * (opts.stagger || 0) });
      else state.vis.push({ label: it.label, cur: 0, target: it.value, vals: it.vals, dying: false, delay: i * (opts.stagger || 0) });
    });
    for (let i = items.length; i < state.vis.length; i++) { state.vis[i].target = 0; state.vis[i].dying = true; }
    const vals = opts.domVals || (state.mode === "comparar" ? items.flatMap(i => (i.vals || []).filter(x => x != null)) : items.map(i => i.value));
    state.signed = vals.some(v => v < 0);
    state.domT = domainFor(vals);
    if (!availableForms().includes(state.form)) state.form = "barras";
    if (REDUCED) { state.vis.forEach(v => { v.cur = v.target; }); state.dom = { ...state.domT }; }
    renderControls();
  }

  function domainFor(vals) {
    let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    if (state.P && state.P.kind === "value" && state.isPct) max = 100;  // una sola cifra en %: se lee contra el 100
    if (max === min) max = min + 1;
    return { min, max };
  }

  /* Entrada del gráfico: todo vuelve a cero y crece en cascada hacia su valor */
  function replay() {
    if (REDUCED) return;
    state.vis = state.vis.filter(v => !v.dying);
    state.vis.forEach((v, i) => { v.cur = 0; v.delay = i * STAGGER; });
  }

  /* Recorrido por años dentro del mismo gráfico. Orden y categorías fijos (top 8 del último año)
     y escala fija (máximo de todos los años): así lo que se mueve es el dato, no el gráfico. */
  const yearPlay = () => state.mode === "valor" && state.cmp && state.cmp.years.length >= 2;
  function yearItems(idx) {
    const c = state.cmp, last = c.years.length - 1, v = (z, i) => z.values[i] == null ? 0 : z.values[i];
    const keep = [...c.series].sort((a, b) => v(b, last) - v(a, last)).slice(0, MAX_ITEMS);
    return { items: keep.map(z => ({ label: z.label, value: v(z, idx) })), all: keep.flatMap(z => z.values.filter(x => x != null)) };
  }
  function showYear(idx) {
    const { items, all } = yearItems(idx);
    state.meta.crumb = [state.cmp.years[idx], state.P.q.familia].filter(Boolean).join(" · ");
    applyItems(items, { stagger: .04, domVals: all });
  }
  function startPlay() {
    state.playing = true; state.playT = 0; state.playIdx = 0; state.playPhase = 0;
    if (yearPlay()) showYear(0); else replay();
    renderControls();
  }
  function stopPlay() {
    state.playing = false;
    if (state.P) { state.meta.crumb = state.meta.baseCrumb; applyItems(buildItems(), { stagger: STAGGER }); }
    renderControls();
  }
  const playLength = () => yearPlay() ? state.cmp.years.length * 2.6 : 4.2;
  function playStep(dt) {
    state.playT += dt;
    if (yearPlay()) {
      if (state.playT > 2.6) { state.playT = 0; state.playIdx = (state.playIdx + 1) % state.cmp.years.length; showYear(state.playIdx); }
    } else if (state.playPhase === 0 && state.playT > 3.2) {
      state.playPhase = 1;  // vaciar en cascada inversa
      const n = state.vis.length; state.vis.forEach((v, i) => { v.target = 0; v.delay = (n - 1 - i) * STAGGER * .6; });
    } else if (state.playT > 4.2) {
      state.playT = 0; state.playPhase = 0;
      applyItems(buildItems()); replay();
    }
  }

  function selectQuestion(year, pregunta) {
    const q = (DatosEncuesta.data[year] || []).find(x => x.pregunta === pregunta);
    if (!q) return;
    const P = DatosEncuesta.profile(q);
    state.year = year; state.q = pregunta; state.P = P;
    // también las de una sola cifra: «Presencia digital» 2024 trae solo «Sí», pero se compara con el «Sí» de otros años
    state.cmp = (P.kind !== "empty" && P.kind !== "mixed") ? DatosEncuesta.yearSeries(P) : null;
    if (!state.cmp && state.mode !== "valor") state.mode = "valor";
    state.free = state.freeByQ[year + "|" + pregunta] || ""; $("#tm-free").value = state.free;
    state.meta.title = q.pregunta;
    state.meta.crumb = state.meta.baseCrumb = [year, q.familia].filter(Boolean).join(" · ");
    const items = buildItems();
    state.message = items.length ? "" : "Esta pregunta no trae cifras que dibujar (respuesta abierta o unidades mezcladas).";
    state.playing = false;
    applyItems(items); replay();
    renderTree();
  }

  /* ------------------------------ controles ------------------------------ */
  function btn(label, pressed, onClick, opts) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tm-btn" + (opts && opts.cls ? " " + opts.cls : ""); b.textContent = label;
    b.setAttribute("aria-pressed", String(!!pressed));
    if (opts && opts.disabled) b.disabled = true;
    if (opts && opts.title) b.title = opts.title;
    if (opts && opts.style) b.setAttribute("style", opts.style);
    b.addEventListener("click", onClick);
    return b;
  }
  const CMP_FORMS = ["barras", "paleta", "linea", "espiral"];  // en Comparar años: formas donde los años conviven sin taparse
  function availableForms() {
    if (state.mode === "comparar") return CMP_FORMS.slice();
    return Object.keys(FORMS).filter(k => !(state.signed && FORMS[k].radial));
  }
  function renderControls() {
    const av = availableForms();
    $("#tm-forms").replaceChildren(...Object.entries(FORMS).map(([k, f]) =>
      btn(f.label, k === state.form, () => setForm(k), { disabled: !av.includes(k), title: !av.includes(k) ? (state.mode === "comparar" ? "Para comparar años usa Barras, Paleta, Línea o Espiral" : "Con valores negativos solo funcionan las formas con eje") : "" })));
    $("#tm-mode").replaceChildren(
      btn("Valor", state.mode === "valor", () => setMode("valor")),
      btn("Comparar años", state.mode === "comparar", () => setMode("comparar"), { disabled: !state.cmp, title: state.cmp ? "Todos los años en un mismo gráfico" : "Esta pregunta no tiene otro año comparable" }),
      btn("Cambio entre años", state.mode === "cambio", () => setMode("cambio"), { disabled: !state.cmp, title: state.cmp ? "Diferencia entre los dos últimos años" : "Esta pregunta no tiene un año anterior comparable" }));
    const sameAs = pr => ROLES.every(([r]) => pr[r] === state.colors[r]);
    $("#tm-pal").replaceChildren(...PRESETS.map(pr => {
      const b = btn("", sameAs(pr), () => { state.colors = { ...pr }; renderControls(); },
        { cls: "tm-sw", title: pr.label, style: `--sw:linear-gradient(135deg, ${gradPair(pr)[0]} 0%, ${gradPair(pr)[1]} 100%); --sw-bg:${COL[pr.bg].hex}` });
      b.setAttribute("aria-label", "Combinación " + pr.label);
      return b;
    }));
    // los 11 colores del manual, elegibles por rol
    $("#tm-colors").replaceChildren(...ROLES.map(([role, label]) => {
      const row = document.createElement("div"); row.className = "tm-crow"; row.setAttribute("role", "radiogroup"); row.setAttribute("aria-label", label);
      const t = document.createElement("span"); t.className = "tm-clabel"; t.textContent = label; row.appendChild(t);
      (role === "b" ? [TONO, ...COLORS] : COLORS).forEach(c => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "tm-chip" + (c.k === "tono" ? " tm-chip-tono" : ""); b.style.setProperty("--c", c.swatch || c.hex); b.title = c.name;
        b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(state.colors[role] === c.k)); b.setAttribute("aria-label", `${label}: ${c.name}`);
        b.addEventListener("click", () => { state.colors = { ...state.colors, [role]: c.k }; renderControls(); });
        row.appendChild(b);
      });
      return row;
    }));
    $("#tm-ratio").replaceChildren(...Object.keys(RATIOS).map(k => btn(k, k === state.ratio, () => { state.ratio = k; resize(); renderControls(); })));
    $("#tm-play").setAttribute("aria-pressed", String(state.playing));
    $("#tm-nobg").setAttribute("aria-pressed", String(state.noBg));
    // damero de vista previa con el contraste del texto: claro si el texto es negro, oscuro si es blanco
    const darkInk = !COL[state.colors.bg].dark;
    out.classList.toggle("tm-transparent", state.noBg && darkInk);
    out.classList.toggle("tm-transparent-dark", state.noBg && !darkInk);
    $("#tm-play").textContent = state.playing ? "❚❚ Detener" : (state.P && yearPlay() ? "▶ Animar años" : "▶ Animar");
  }
  function setForm(k) {
    if (k === state.form) return;
    state.form = k;
    if (state.playing) { state.playT = 0; state.playPhase = 0; if (!yearPlay()) applyItems(buildItems()); }
    replay();
    renderControls();
  }
  function setMode(m) {
    if (m === state.mode) return;
    state.mode = m;
    if (state.playing) stopPlay(); else applyItems(buildItems(), { stagger: STAGGER });
    if (m === "comparar") replay();  // el factor de entrada parte de 0 (si no, heredaría el valor anterior)
  }
  $("#tm-play").addEventListener("click", () => state.playing ? stopPlay() : startPlay());
  // texto libre: se guarda por pregunta; al escribir, el slide se rediagrama solo (ver freeLayout)
  $("#tm-free").addEventListener("input", e => { state.free = e.target.value; if (state.q) state.freeByQ[state.year + "|" + state.q] = state.free; });
  // sin fondo: quita color y campo; quedan las formas, el texto y el lockup sobre transparente (PNG/SVG/video lo respetan)
  $("#tm-nobg").addEventListener("click", () => { state.noBg = !state.noBg; renderControls(); });

  /* ------------------------------ árbol años/preguntas ------------------------------ */
  function renderTree() {
    const query = ($("#lab-search").value || "").trim().toLowerCase();
    const frag = document.createDocumentFragment();
    [...DatosEncuesta.years].reverse().forEach(y => {
      const all = DatosEncuesta.data[y] || [];
      const list = all.filter(x => !query || x.pregunta.toLowerCase().includes(query) || x.rows.some(r => (r.categoria || "").toLowerCase().includes(query)));
      if (query && !list.length) return;
      const open = query ? true : state.openYears.has(y);
      const yrBtn = document.createElement("button");
      yrBtn.type = "button"; yrBtn.className = "lab-yr";
      yrBtn.innerHTML = `<span class="n">${y}</span><span>${all.length} preguntas</span>`;
      yrBtn.addEventListener("click", () => { state.openYears.has(y) ? state.openYears.delete(y) : state.openYears.add(y); renderTree(); });
      frag.appendChild(yrBtn);
      if (!open) return;
      const body = document.createElement("div"); body.className = "lab-q-list";
      list.forEach(x => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "lab-q"; b.textContent = x.pregunta;
        b.setAttribute("aria-current", String(y === state.year && x.pregunta === state.q));
        b.addEventListener("click", () => selectQuestion(y, x.pregunta));
        body.appendChild(b);
      });
      frag.appendChild(body);
    });
    $("#lab-tree").replaceChildren(frag);
  }
  $("#lab-search").addEventListener("input", renderTree);

  /* ------------------------------ tamaño ------------------------------ */
  let W = 800, H = 1000, DPR = 1;
  function resize() {
    const r = wrap.getBoundingClientRect(), ar = RATIOS[state.ratio];
    let w = r.width, h = w / ar;
    if (h > r.height) { h = r.height; w = h * ar; }
    W = Math.max(280, Math.floor(w)); H = Math.max(280, Math.floor(h));
    DPR = Math.min(2, window.devicePixelRatio || 1);
    out.style.width = W + "px"; out.style.height = H + "px";
    out.width = Math.round(W * DPR); out.height = Math.round(H * DPR);
    mask.width = Math.round(W * MASK_SCALE); mask.height = Math.round(H * MASK_SCALE);
  }
  new ResizeObserver(resize).observe(wrap);

  /* ------------------------------ geometría compartida ------------------------------ */
  const PAD = () => Math.round(Math.min(W, H) * .05);
  /* El gráfico vive entre el encabezado y el titular, nunca debajo de él: el titular se mide
     primero (state.hl, una vez por cuadro) y la caja del gráfico termina donde él empieza. */
  /* Diagramación paramétrica: el gráfico ocupa lo que dejan libre el encabezado (pregunta + cómo leer,
     state.sub), el titular (state.hl), el pie y, si hay, el texto libre (state.ft: columna a la derecha
     en 16:9, bloque abajo en 4:5 y 1:1). Todo se mide una vez por cuadro en draw(). */
  const areaX1 = () => state.ft && state.ft.land ? state.ft.x0 - Math.min(W, H) * .05 : W - PAD();
  function chartBox(radial) {
    const pad = PAD(), top = state.sub ? state.sub.bottom + Math.min(W, H) * .03 : pad + (state.chartOnly ? 0 : Math.min(W, H) * .07);
    // solo el gráfico: sin pie ni titular, ocupa hasta el margen inferior
    let floor = state.chartOnly ? H - pad : state.showTitle && state.hl ? state.hl.top : footerMetrics().top - 16;
    if (state.ft && !state.ft.land) floor = Math.min(floor, state.ft.y0 - 14);
    const bottom = floor - (radial ? Math.min(W, H) * .04 : 30 + FS() * 1.4 + Math.min(W, H) * .02);  // cartesianas: espacio para las categorías (2 líneas) al pie
    return { x0: pad + 30, x1: areaX1(), y0: top, y1: Math.max(top + 80, bottom) };
  }
  function radialFrame() {
    const b = chartBox(true), pad = PAD(), cx = (pad + b.x1) / 2, cy = (b.y0 + b.y1) / 2, lo = labelsOutside();
    const R = Math.max(40, Math.min((b.x1 - pad) / 2 - (lo ? 120 : 0), (b.y1 - b.y0) / 2 - (lo ? FS() * 3.4 : 0)));
    return { cx, cy, R };
  }
  const labelsOutside = () => state.form === "rosa" || state.form === "nube";
  const frac = v => Math.max(0, v - state.dom.min) / ((state.dom.max - state.dom.min) || 1);
  // la espiral escala el blur con el grosor del anillo: así cada tubo conserva su núcleo amarillo y no se funde con el vecino
  // sigma del blur en px de máscara; sigCss lo pasa a px CSS para compensar (ver INSET)
  const cartLW = () => Math.max(5, Math.min(W, H) * .012);
  const sigmaFor = form => form === "espiral" ? spiralGeo().sigma
    : form === "linea" || form === "paleta" ? cartLW() * MASK_SCALE * .45
    : Math.min(W, H) * MASK_SCALE * (form === "nube" ? .028 : form === "rosa" ? .02 : .012);
  const sigCss = form => sigmaFor(form) / MASK_SCALE;
  /* Compensación del blur: el borde que el ojo lee (donde la rampa ya es color A pleno) cae
     ~medio sigma por fuera de la geometría. Cada forma se dibuja recortada hacia adentro ese
     medio sigma, para que el borde visible coincida con el valor y el halo no infle lo chico. */
  const INSET = .5;
  // formas finas (trazo ~2σ): el blur baja su pico; más ganancia les devuelve el núcleo sin engordarlas
  const THIN = new Set(["espiral", "linea", "paleta"]);

  /* =================== Radiales =================== */
  // Espiral: un anillo por categoría, arco proporcional al valor, desde las 12 en sentido horario
  /* El cuadrante superior izquierdo es SOLO de las etiquetas: ningún arco entra ahí. El recorrido
     máximo termina a las 9 en punto, descontando lo que sobresalen la punta redondeada y el halo
     del blur (halo, en px CSS); y las etiquetas arrancan a la izquierda de ese mismo halo. */
  function spiralGeo() {
    const { cx, cy, R } = radialFrame(), n = Math.max(state.vis.length, 1);
    const r0 = R * .34, step = (R - r0) / n, lw = Math.min(step * .5, R * .075);
    const sigma = lw * MASK_SCALE * .4, halo = (sigma / MASK_SCALE) * 2.6 + 2;  // puntas rectas: lo único que sobresale es el blur
    return { cx, cy, R, r0, step, lw, sigma, halo, rings: state.vis.map((v, i) => {
      const rad = R - step * (i + .5), max = Math.max(0, Math.PI * 1.5 - halo / rad);
      return { v, rad, sweep: frac(v.cur) * max };
    }) };
  }
  function maskEspiral(c, only) {
    const g = spiralGeo();
    // puntas rectas (las redondeadas sumaban medio grosor de largo falso a cada valor) y recorte de medio sigma por extremo
    const ins = INSET * g.sigma / MASK_SCALE;
    c.lineCap = "butt"; c.lineWidth = Math.max(1, g.lw - 2 * ins);
    g.rings.forEach((r, i) => {
      if (only >= 0 && i !== only) return;
      const d = ins / r.rad;
      if (r.sweep <= 2 * d) return;
      c.beginPath(); c.arc(g.cx, g.cy, r.rad, -Math.PI / 2 + d, -Math.PI / 2 + r.sweep - d); c.stroke();
    });
  }
  /* Tipografía según manual: cifras y etiquetas en Work Sans Medium (datos duros y cuerpo),
     metadatos en Necto Mono siempre en mayúsculas, Work FaAAD solo en el titular (un solo tamaño). */
  const MIN_FS = 11;  // ningún texto del lienzo baja de 11 px (legible proyectado)
  const FS = () => Math.max(MIN_FS, Math.min(14, Math.min(W, H) * .018));
  function overEspiral(c, P) {
    const g = spiralGeo();
    guides(c, P, g.cx, g.cy, g.R, false, true);
    const fs = Math.max(MIN_FS, Math.min(14, g.step * .55));
    c.textBaseline = "middle";
    // cada etiqueta queda en la línea de su anillo, a la izquierda de donde empieza (fuera de su halo);
    // si no cabe hasta el margen, se acorta por ancho medido, nunca invade el arco
    spiralScale(c, P, g);
    const x = g.cx - g.halo - 8, room = x - PAD();
    g.rings.forEach(r => {
      const y = g.cy - r.rad;
      c.fillStyle = P.ink; c.textAlign = "right";
      c.font = `500 ${fs}px "Work Sans"`;
      const vt = fmt(r.v.cur); c.fillText(vt, x, y);
      const lw = room - c.measureText(vt).width - 8;
      c.save(); c.globalAlpha *= .72;
      c.fillText(fitText(c, r.v.label, lw), x - (room - lw), y);
      c.restore();
    });
    centerNote(c, P, g.cx, g.cy, g.r0);
  }

  /* Escala de la espiral en el borde: marcas cada «paso redondo» sobre el anillo exterior, para que el
     largo de un arco se pueda leer como cifra (sin ella, solo se comparaban largos entre sí). */
  function spiralScale(c, P, g) {
    const rad = g.R + 6, max = Math.max(0, Math.PI * 1.5 - g.halo / (g.R - g.step * .5)), st = niceStep(state.dom.max - state.dom.min, 4);
    c.strokeStyle = P.ink; c.fillStyle = P.ink; c.lineWidth = 1;
    c.font = `400 ${MIN_FS}px "Necto Mono"`; c.textBaseline = "middle";
    for (let v = 0; v <= state.dom.max + 1e-9; v += st) {
      const a = -Math.PI / 2 + frac(v) * max, ca = Math.cos(a), sa = Math.sin(a);
      c.save(); c.globalAlpha *= .6;
      c.beginPath(); c.moveTo(g.cx + ca * (g.R - 2), g.cy + sa * (g.R - 2)); c.lineTo(g.cx + ca * rad, g.cy + sa * rad); c.stroke();
      c.textAlign = ca > .3 ? "left" : ca < -.3 ? "right" : "center";
      c.fillText(String(Math.round(v * 10) / 10).replace(".", ",") + (state.isPct ? "%" : ""), g.cx + ca * (rad + 8), g.cy + sa * (rad + 8) - (Math.abs(ca) <= .3 ? 4 * Math.sign(-sa || 1) : 0));
      c.restore();
    }
  }

  // Rosa: sectores de área proporcional (radio ∝ √valor) alrededor de un hueco central
  function roseGeo() {
    const { cx, cy, R } = radialFrame(), n = Math.max(state.vis.length, 1), span = Math.PI * 2 / n, r0 = R * .34;
    return { cx, cy, R, r0, span, segs: state.vis.map((v, i) => ({ v, a0: -Math.PI / 2 + i * span, r: r0 + (R * .92 - r0) * Math.sqrt(frac(v.cur)) })) };
  }
  function maskRosa(c, only) {
    const g = roseGeo(), gap = Math.min(.12, g.span * .12);
    g.segs.forEach((s, i) => {
      if (only >= 0 && i !== only) return;
      const r = s.r - INSET * sigCss("rosa");
      if (r - g.r0 < 1) return;
      c.beginPath(); c.arc(g.cx, g.cy, r, s.a0 + gap, s.a0 + g.span - gap); c.arc(g.cx, g.cy, g.r0 + 4, s.a0 + g.span - gap, s.a0 + gap, true); c.closePath(); c.fill();
    });
  }
  function overRosa(c, P) {
    const g = roseGeo();
    guides(c, P, g.cx, g.cy, g.R, true);
    g.segs.forEach(s => calloutOut(c, P, g, s.a0 + g.span / 2, s.r + g.R * .03, s.v));
    centerNote(c, P, g.cx, g.cy, g.r0);
  }

  // Nube: radar con burbujas en cada vértice y un núcleo; el blur las funde en una sola masa
  function cloudGeo() {
    const { cx, cy, R } = radialFrame(), n = Math.max(state.vis.length, 1);
    return { cx, cy, R, pts: state.vis.map((v, i) => { const a = -Math.PI / 2 + i / n * Math.PI * 2, f = frac(v.cur), r = R * (.18 + .58 * f); return { v, a, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, r, br: R * (.07 + .14 * f) }; }) };
  }
  function maskNube(c) {
    const g = cloudGeo();
    c.beginPath(); g.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fill();
    c.beginPath(); c.arc(g.cx, g.cy, g.R * .3, 0, Math.PI * 2); c.fill();
    g.pts.forEach(p => { c.beginPath(); c.arc(p.x, p.y, p.br, 0, Math.PI * 2); c.fill(); });
  }
  function overNube(c, P) {
    const g = cloudGeo();
    guides(c, P, g.cx, g.cy, g.R, true);
    g.pts.forEach(p => calloutOut(c, P, g, p.a, p.r + p.br + g.R * .06, p.v));
  }

  /* Etiqueta fuera de la figura: una línea guía sale del borde de la forma (desde) hasta el
     anillo exterior, y el texto se apoya al lado — alineado hacia afuera según el lado del círculo. */
  function calloutOut(c, P, g, a, from, v) {
    const fs = FS(), ca = Math.cos(a), sa = Math.sin(a), rTo = g.R + 10;
    const x0 = g.cx + ca * Math.min(from, rTo - 4), y0 = g.cy + sa * Math.min(from, rTo - 4);
    const x1 = g.cx + ca * rTo, y1 = g.cy + sa * rTo;
    const side = ca > .25 ? 1 : ca < -.25 ? -1 : 0;
    const x2 = x1 + side * 10, y2 = y1;
    c.strokeStyle = P.ink; c.lineWidth = 1;
    c.save(); c.globalAlpha *= .55;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); if (side) c.lineTo(x2, y2); c.stroke();
    c.restore();
    c.fillStyle = P.ink; c.beginPath(); c.arc(x0, y0, 2.2, 0, Math.PI * 2); c.fill();
    c.textAlign = side > 0 ? "left" : side < 0 ? "right" : "center";
    const tx = x2 + side * 6;
    // arriba/abajo del círculo: el bloque se apila hacia afuera para no pisar la línea guía
    const vert = side ? 0 : (sa < 0 ? -1 : 1);
    const yv = side ? y2 - fs * .6 : y2 + vert * fs * (vert < 0 ? 2.1 : .9);
    c.textBaseline = "middle";
    c.font = `500 ${fs * 1.2}px "Work Sans"`; c.fillText(fmt(v.cur), tx, yv);
    c.save(); c.globalAlpha *= .72;
    c.font = `500 ${fs}px "Work Sans"`;
    const pad = PAD(), xr = areaX1(), room = side > 0 ? xr - tx : side < 0 ? tx - pad : Math.min(xr - pad, 2 * Math.min(tx - pad, xr - tx));
    c.fillText(fitText(c, v.label, room), tx, yv + fs * 1.25);
    c.restore();
  }

  function wrap2(c, t, maxW) {
    const lines = wrapText(c, t, maxW);
    if (lines.length <= 2) return lines.map(l => fitText(c, l, maxW));
    return [fitText(c, lines[0], maxW), fitText(c, lines.slice(1).join(" "), maxW)];
  }
  function fitText(c, t, maxW) {
    if (maxW <= 0) return "";
    if (c.measureText(t).width <= maxW) return t;
    let n = t.length;
    while (n > 1 && c.measureText(t.slice(0, n) + "…").width > maxW) n--;
    return n > 1 ? t.slice(0, n) + "…" : "";
  }
  // freeQuad: no dibuja guías en el cuadrante superior izquierdo (ahí van las etiquetas de la espiral)
  function guides(c, P, cx, cy, R, spokes, freeQuad) {
    const a0 = freeQuad ? -Math.PI / 2 : 0, a1 = freeQuad ? Math.PI : Math.PI * 2;
    c.strokeStyle = P.grid; c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    c.setLineDash([2, 4]);
    [.34, .56, .78].forEach(k => { c.beginPath(); c.arc(cx, cy, R * k, a0, a1); c.stroke(); });
    if (spokes) {
      const n = Math.max(state.vis.length, 1);
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i / n * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * .34, cy + Math.sin(a) * R * .34); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke(); }
    } else { c.beginPath(); c.moveTo(cx, cy - R * .34); c.lineTo(cx, cy - R); c.stroke(); }
    c.setLineDash([]);
  }
  function centerNote(c, P, cx, cy, r0) {
    if (!state.P) return;
    c.fillStyle = P.ink; c.textAlign = "center"; c.textBaseline = "middle";
    if (state.playing && yearPlay()) {  // el año es un dato: Work Sans Medium, no Work FaAAD (esa queda solo para el titular)
      c.font = `500 ${r0 * .42}px "Work Sans"`; c.fillText(state.cmp.years[state.playIdx], cx, cy);
      return;
    }
    // dentro del hueco central: «155» y «ESTUDIANTES» en dos líneas, achicadas si no caben
    c.font = `400 ${Math.max(MIN_FS, r0 * .15)}px "Necto Mono"`;
    if (state.P.N && state.mode === "valor") {
      const fs = Math.max(MIN_FS, r0 * .15);
      c.fillText(String(state.P.N), cx, cy - fs * .6);
      c.fillText(fitText(c, "ESTUDIANTES", r0 * 1.6), cx, cy + fs * .7);
    } else c.fillText(fitText(c, unitLabel().toUpperCase(), r0 * 1.6), cx, cy);
  }

  /* =================== Cartesianas =================== */
  // el área de trazado deja un margen del alto de una píldora arriba (y abajo si hay negativos): las cifras van al lado del punto, nunca encima de la forma
  function cartGeo() {
    const b = chartBox(), n = Math.max(state.vis.length, 1), step = (b.x1 - b.x0) / n, ph = FS() * 1.9 + 18 + Math.min(W, H) * .02;
    const top = b.y0 + ph, bot = b.y1 - (state.dom.min < -1e-9 ? ph : 0);
    const { min, max } = state.dom, yOf = v => bot - (v - min) / ((max - min) || 1) * (bot - top);
    return { b, step, yOf, y0: yOf(0), pts: state.vis.map((v, i) => ({ v, x: b.x0 + step * (i + .5), y: yOf(v.cur) })) };
  }
  function axes(c, P, g) {
    const { min, max } = state.dom, st = niceStep(max - min, 4);
    c.font = `400 ${MIN_FS}px "Necto Mono"`; c.fillStyle = P.ink; c.textAlign = "right"; c.textBaseline = "middle";
    c.strokeStyle = P.grid; c.lineWidth = 1; c.setLineDash([1, 5]);
    for (let v = Math.ceil(min / st) * st; v <= max + 1e-9; v += st) {
      const y = g.yOf(v);
      if (Math.abs(v) > 1e-9) { c.beginPath(); c.moveTo(g.b.x0, y); c.lineTo(g.b.x1, y); c.stroke(); }
      c.save(); c.globalAlpha *= .6; c.fillText(String(Math.round(v * 10) / 10).replace(".", ",") + (state.isPct ? "%" : ""), g.b.x0 - 8, y); c.restore();
    }
    c.setLineDash([]); c.save(); c.strokeStyle = P.ink; c.globalAlpha *= .5;
    c.beginPath(); c.moveTo(g.b.x0, g.y0); c.lineTo(g.b.x1, g.y0); c.stroke();
    c.restore();
    // categorías al pie, centradas bajo su columna
    c.fillStyle = P.ink; c.font = `500 ${MIN_FS}px "Work Sans"`; c.textAlign = "center"; c.textBaseline = "top";
    c.save(); c.globalAlpha *= .72;
    // hasta dos líneas por categoría: cortar «Familiar/am…» dejaba la barra sin explicar
    g.pts.forEach(p => wrap2(c, p.v.label, g.step * .92).forEach((l, i) => c.fillText(l, p.x, g.b.y1 + 16 + i * MIN_FS * 1.25)));
    c.restore();
  }
  // Cifra en píldora, desplazada del punto (dir -1 arriba, +1 abajo) y unida a él por un trazo corto
  function pill(c, P, x, y, text, dir, clear) {
    const fs = FS(), h = fs * 1.9, gap = 8 + (clear || 0);
    c.font = `500 ${fs}px "Work Sans"`;
    const w = Math.max(fs * 2.2, c.measureText(text).width + fs * 1.2), cy = y + dir * (gap + h / 2);
    c.strokeStyle = P.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + dir * gap); c.stroke();
    c.fillStyle = P.pill; roundRect(c, x - w / 2, cy - h / 2, w, h, h / 2); c.fill();
    c.fillStyle = P.pillInk; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, x, cy + .5);
  }
  const dirOf = v => v.cur < 0 ? 1 : -1;
  function dot(c, P, x, y) { c.fillStyle = P.ink; c.beginPath(); c.arc(x, y, 3.2, 0, Math.PI * 2); c.fill(); }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  /* Cartesianas: el brillo térmico ES el dato (la barra, la línea, el palito), nunca un campo de
     ruido detrás — un fondo aleatorio se leía como si "calentara" ciertas categorías. */
  function maskLinea(c) {
    const g = cartGeo();
    c.lineWidth = cartLW(); c.lineJoin = "round"; c.lineCap = "butt";
    c.beginPath(); g.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
  }
  function maskPaleta(c, only) {
    const g = cartGeo(), lw = cartLW(), ins = INSET * sigCss("paleta");
    c.lineWidth = lw * .6; c.lineCap = "butt";
    g.pts.forEach((p, i) => {
      if (only >= 0 && i !== only) return;
      const d = p.y - g.y0, dir = Math.sign(d) || 1;
      if (Math.abs(d) <= ins) return;
      c.beginPath(); c.moveTo(p.x, g.y0); c.lineTo(p.x, p.y - dir * ins); c.stroke();
      c.beginPath(); c.arc(p.x, p.y, lw * 1.25, 0, Math.PI * 2); c.fill();
    });
  }
  const barW = g => g.step * .62;
  function maskBarras(c, only) {
    const g = cartGeo(), bw = barW(g), ins = INSET * sigCss("barras");
    g.pts.forEach((p, i) => {
      if (only >= 0 && i !== only) return;
      const top = Math.min(p.y, g.y0), h = Math.abs(p.y - g.y0);
      if (h <= 2 * ins) return;
      c.fillRect(p.x - bw / 2 + ins, top + ins, bw - 2 * ins, h - 2 * ins);
    });
  }
  function overLinea(c, P) {
    const g = cartGeo();
    axes(c, P, g);
    c.strokeStyle = P.ink; c.lineWidth = 1; c.lineJoin = "round";
    c.beginPath(); g.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
    // la cifra va hacia el lado libre de la línea: arriba si el punto está más alto que sus vecinos, abajo si está más bajo
    g.pts.forEach((p, i) => {
      const nb = [g.pts[i - 1], g.pts[i + 1]].filter(Boolean), avg = nb.length ? nb.reduce((a, q) => a + q.y, 0) / nb.length : p.y + 1;
      let dir = p.y <= avg ? -1 : 1;
      if (dir > 0 && p.y > g.b.y1 - FS() * 3) dir = -1;
      dot(c, P, p.x, p.y); pill(c, P, p.x, p.y, fmt(p.v.cur), dir, cartLW());
    });
  }
  function overPaleta(c, P) {
    const g = cartGeo();
    axes(c, P, g);
    g.pts.forEach(p => { dot(c, P, p.x, p.y); pill(c, P, p.x, p.y, fmt(p.v.cur), dirOf(p.v), cartLW() * 1.25 + sigCss("paleta")); });
  }
  function overBarras(c, P) {
    const g = cartGeo();
    axes(c, P, g);
    g.pts.forEach(p => pill(c, P, p.x, p.y, fmt(p.v.cur), dirOf(p.v), sigCss("barras")));
  }

  /* =================== Comparar años: todos los años en UN gráfico =================== */
  // un color por año, del color «Inicio» (año más antiguo) al «Final» (más reciente) de la paleta elegida
  const cmpYears = () => state.cmp ? state.cmp.years : [];
  function yearColor(j) {
    const n = cmpYears().length, P = currentPal(), [a, b] = P.pairs[0];
    return mixHex(a, b, n > 1 ? j / (n - 1) : 1);
  }
  function mixHex(a, b, t) {
    const h = x => parseInt(x, 16), ca = [1, 3, 5].map(i => h(a.slice(i, i + 2))), cb = [1, 3, 5].map(i => h(b.slice(i, i + 2)));
    return "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  const cval = (v, j) => v.vals && v.vals[j] != null ? v.vals[j] * Math.max(0, v.cur) : null;  // valor del año j con la animación de entrada
  function cmpGeo() {
    const g = cartGeo(), n = Math.max(cmpYears().length, 1), gw = g.step * .8, bw = gw / n;
    return { ...g, n, gw, bw, xOf: (p, j) => p.x - gw / 2 + bw * (j + .5) };
  }
  function maskCmpBarras(c, j) {
    const g = cmpGeo(), ins = INSET * sigCss("barras"), gap = g.bw * .1;
    g.pts.forEach(p => {
      const v = cval(p.v, j); if (v == null) return;
      const y = g.yOf(v), top = Math.min(y, g.y0), h = Math.abs(y - g.y0);
      if (h <= 2 * ins) return;
      c.fillRect(g.xOf(p, j) - g.bw / 2 + gap + ins, top + ins, g.bw - 2 * gap - 2 * ins, h - 2 * ins);
    });
  }
  function overCmpBarras(c, P) {
    const g = cmpGeo();
    axes(c, P, g);
    if (g.bw < FS() * 2) return;  // sin espacio, los valores se leen en el eje
    c.fillStyle = P.ink; c.font = `500 ${MIN_FS}px "Work Sans"`; c.textAlign = "center"; c.textBaseline = "alphabetic";
    g.pts.forEach(p => { for (let j = 0; j < g.n; j++) { const v = cval(p.v, j); if (v != null) c.fillText(fmt(v), g.xOf(p, j), g.yOf(v) - (v < 0 ? -MIN_FS - 6 : 6) - sigCss("barras")); } });
  }
  // Paleta comparada: un punto por año sobre la misma vertical de la opción, unidos por un trazo
  function maskCmpPaleta(c, j) {
    const g = cmpGeo(), r = cartLW() * 1.5;
    g.pts.forEach(p => { const v = cval(p.v, j); if (v == null) return; c.beginPath(); c.arc(p.x, g.yOf(v), r, 0, Math.PI * 2); c.fill(); });
  }
  function overCmpPaleta(c, P) {
    const g = cmpGeo();
    axes(c, P, g);
    c.font = `500 ${MIN_FS}px "Work Sans"`; c.textBaseline = "middle";
    g.pts.forEach(p => {
      const ys = []; for (let j = 0; j < g.n; j++) { const v = cval(p.v, j); if (v != null) ys.push({ j, v, y: g.yOf(v) }); }
      if (ys.length > 1) { c.save(); c.strokeStyle = P.ink; c.globalAlpha *= .45; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, Math.min(...ys.map(o => o.y))); c.lineTo(p.x, Math.max(...ys.map(o => o.y))); c.stroke(); c.restore(); }
      // cifras: el año más reciente a la derecha del punto, los anteriores a la izquierda; las de un mismo
      // lado se separan en vertical si los valores son cercanos (27 y 29 se montaban)
      const gapY = MIN_FS * 1.25;
      [false, true].forEach(right => {
        const side = ys.filter(o => (o.j === g.n - 1) === right).sort((a, b2) => a.y - b2.y);
        side.forEach((o, k) => { o.ly = k ? Math.max(o.y, side[k - 1].ly + gapY) : o.y; });
        side.forEach(o => { c.fillStyle = P.ink; c.textAlign = right ? "left" : "right"; c.fillText(fmt(o.v), p.x + (right ? 1 : -1) * (cartLW() * 1.5 + sigCss("paleta") + 6), o.ly); });
      });
    });
  }
  // Línea comparada: una línea por año que recorre las mismas opciones
  function maskCmpLinea(c, j) {
    const g = cmpGeo();
    c.lineWidth = cartLW(); c.lineJoin = "round"; c.lineCap = "round";
    c.beginPath(); let open = false;
    g.pts.forEach(p => { const v = cval(p.v, j); if (v == null) { open = false; return; } const y = g.yOf(v); if (open) c.lineTo(p.x, y); else { c.moveTo(p.x, y); open = true; } });
    c.stroke();
  }
  function overCmpLinea(c, P) {
    const g = cmpGeo();
    axes(c, P, g);
    g.pts.forEach(p => { for (let j = 0; j < g.n; j++) { const v = cval(p.v, j); if (v != null) dot(c, P, p.x, g.yOf(v)); } });
  }
  // Espiral comparada: cada opción es una banda con un anillo fino por año
  function cmpSpiralGeo() {
    const g = spiralGeo(), n = Math.max(cmpYears().length, 1), sub = g.step / n, lw = Math.min(sub * .62, g.R * .05);
    return { ...g, n, sub, lwc: lw, sigmaC: lw * MASK_SCALE * .4 };
  }
  function maskCmpEspiral(c, j) {
    const g = cmpSpiralGeo(), ins = INSET * g.sigmaC / MASK_SCALE;
    c.lineCap = "butt"; c.lineWidth = Math.max(1, g.lwc - 2 * ins);
    g.rings.forEach(r => {
      const v = cval(r.v, j); if (v == null) return;
      const rad = r.rad + g.step / 2 - g.sub * (j + .5), max = Math.max(0, Math.PI * 1.5 - g.halo / rad), sw = frac(v) * max, d = ins / rad;
      if (sw <= 2 * d) return;
      c.beginPath(); c.arc(g.cx, g.cy, rad, -Math.PI / 2 + d, -Math.PI / 2 + sw - d); c.stroke();
    });
  }
  function overCmpEspiral(c, P) {
    const g = cmpSpiralGeo();
    guides(c, P, g.cx, g.cy, g.R, false, true);
    spiralScale(c, P, g);
    const fs = Math.max(MIN_FS, Math.min(14, g.step * .4)), x = g.cx - g.halo - 8, room = x - PAD();
    c.textBaseline = "middle";
    g.rings.forEach(r => {
      // «etiqueta  47 · 50»: las cifras van en el orden de los años de la leyenda
      const vt = Array.from({ length: g.n }, (_, j) => { const v = cval(r.v, j); return v == null ? "–" : fmt(v); }).join(" · ");
      c.fillStyle = P.ink; c.textAlign = "right"; c.font = `500 ${fs}px "Work Sans"`;
      c.fillText(vt, x, g.cy - r.rad);
      const lw = room - c.measureText(vt).width - 10;
      c.save(); c.globalAlpha *= .72; c.fillText(fitText(c, r.v.label, lw), x - (room - lw), g.cy - r.rad); c.restore();
    });
  }
  const CMP_DRAW = {
    barras: { mask: maskCmpBarras, over: overCmpBarras },
    paleta: { mask: maskCmpPaleta, over: overCmpPaleta },
    linea: { mask: maskCmpLinea, over: overCmpLinea },
    espiral: { mask: maskCmpEspiral, over: overCmpEspiral },
  };

  // layered: la forma tiene una pieza por categoría (el motor podría darle un gradiente a cada una si la
  // paleta trae varios pares; hoy cada gráfico usa uno solo). Línea y Nube son una sola forma continua.
  const DRAW = {
    espiral: { mask: maskEspiral, over: overEspiral, layered: true },
    rosa: { mask: maskRosa, over: overRosa, layered: true },
    nube: { mask: maskNube, over: overNube, layered: false },
    linea: { mask: maskLinea, over: overLinea, layered: false },
    paleta: { mask: maskPaleta, over: overPaleta, layered: true },
    barras: { mask: maskBarras, over: overBarras, layered: true },
  };

  /* =================== Marco editorial (manual p.34, construcción de un post) ===================
     Arriba: tag en Necto Mono (año · familia) y, a la derecha, la nota técnica (n, unidad).
     Abajo: titular en Work FaAAD y, al pie, lockup FaAADudp + «Escuela de Diseño» del mismo alto. */
  const ESCUELA = "Escuela de Diseño";
  function footerMetrics() {
    const pad = PAD(), lh = Math.max(22, Math.min(W, H) * .032);  // 22px de alto ≈ 100px de ancho: tamaño mínimo del lockup en pantalla
    return { pad, lh, top: H - pad - lh };
  }
  function frame(c, P) {
    if (state.chartOnly) { drawSub(c, P); return; }  // solo el gráfico: sin encabezado, pie ni lockup
    const { pad, lh, top } = footerMetrics(), lg = logos[P.logo];
    if (lg) c.drawImage(lg, pad, top, lh * lg.width / lg.height, lh);
    c.fillStyle = P.ink; c.textAlign = "right"; c.textBaseline = "alphabetic";
    c.font = `400 ${lh * 1.12}px "Work Sans"`; c.fillText(ESCUELA, W - pad, top + lh * .9);
    const fs = Math.max(MIN_FS, Math.min(13, W * .014));
    c.font = `400 ${fs}px "Necto Mono"`; c.textBaseline = "top";
    // Necto Mono va siempre en mayúsculas (regla de marca)
    const half = (W - pad * 2) / 2 - 12;
    c.textAlign = "left"; c.fillText(fitText(c, (state.meta.crumb || "Encuesta perfil de ingreso").toUpperCase(), half), pad, pad);
    if (state.meta.note) { c.textAlign = "right"; c.fillText(fitText(c, state.meta.note.toUpperCase(), half), W - pad, pad); }
    if (state.showTitle) headline(c, P);
    drawSub(c, P);
    drawFree(c, P);
  }
  /* «Cómo leer este gráfico»: debajo del encabezado van la pregunta (si no está el titular) y una línea
     que explica qué es cada número y cómo se lee la forma; en Comparar años, además, la leyenda de colores.
     Sin esto, una barra de «Vía de contacto» no decía que era respuesta múltiple ni sobre qué total. */
  function readingText() {
    const P = state.P; if (!P) return "";
    let a;
    if (state.mode === "comparar") {
      const out = state.cmp && !state.cmp.years.includes(state.year) ? ` ${state.year} no se incluye: sus opciones no calzan con las de otros años.` : "";
      a = `Cada color es un año: las mismas opciones, lado a lado. Solo aparecen las opciones que se repiten entre años.${out}`;
    }
    else if (state.mode === "cambio") { const [ya, yb] = state.cambioYears || ["", ""]; a = `Diferencia entre ${ya} y ${yb}, en ${state.isPct ? "puntos porcentuales" : "estudiantes"}: sobre 0 subió, bajo 0 bajó.`; }
    else if (P.kind === "value") a = state.isPct ? "Una sola cifra, leída contra el 100%." : "Una sola cifra.";
    else if (P.kind === "multi") a = "% de estudiantes que marcó cada opción. Respuesta múltiple: se podía marcar más de una, por eso suman más de 100%.";
    else if (P.kind === "single") a = "% de estudiantes que eligió cada opción (una por persona: suman 100%).";
    else if (P.kind === "partial") a = "% de estudiantes por opción.";
    else a = "Número de estudiantes por opción.";
    const key = { espiral: "El largo de cada arco es el valor (escala en el borde).", rosa: "El área de cada pétalo es el valor.", nube: "La distancia al centro es el valor." }[state.form] || "";
    const otros = state.vis.some(v => /^Otros \(/.test(v.label)) ? "«Otros» suma las opciones menores." : "";
    return [a, key, otros].filter(Boolean).join(" ");
  }
  function subLayout(c) {
    if (!state.P || state.message) return null;
    // solo el gráfico: sin pregunta ni línea de lectura; en Comparar años queda la leyenda (sin ella no se sabe qué año es cada color)
    if (state.chartOnly) {
      if (state.mode !== "comparar") return null;
      const fr = Math.max(MIN_FS, Math.min(14, Math.min(W, H) * .018)), pad = PAD();
      return { pad, y0: pad - fr * .5, fq: fr, fr, q: [], r: [], legend: cmpYears(), bottom: pad + fr * 1.6 };
    }
    const pad = PAD(), maxW = W - pad * 2, crumbFs = Math.max(MIN_FS, Math.min(13, W * .014));
    const fq = Math.max(MIN_FS + 3, Math.min(22, Math.min(W, H) * .028)), fr = Math.max(MIN_FS, Math.min(14, fq * .66));
    c.font = `500 ${fq}px "Work Sans"`;
    let q = state.showTitle ? [] : wrapText(c, state.meta.title || "", maxW);
    if (q.length > 2) q = [q[0], fitText(c, q.slice(1).join(" "), maxW)];
    c.font = `400 ${fr}px "Work Sans"`;
    let r = wrapText(c, readingText(), Math.min(maxW, W * .78));
    if (r.length > 2) r = [r[0], fitText(c, r.slice(1).join(" "), Math.min(maxW, W * .78))];
    const legend = state.mode === "comparar" ? cmpYears() : null;
    const y0 = pad + crumbFs + Math.min(W, H) * .025;
    const bottom = y0 + q.length * fq * 1.22 + (q.length ? fq * .25 : 0) + r.length * fr * 1.4 + (legend ? fr * 1.9 : 0);
    return { pad, y0, fq, fr, q, r, legend, bottom };
  }
  function drawSub(c, P) {
    const L = state.sub; if (!L) return;
    let y = L.y0;
    c.fillStyle = P.ink; c.textAlign = "left"; c.textBaseline = "top";
    c.font = `500 ${L.fq}px "Work Sans"`;
    L.q.forEach(l => { c.fillText(l, L.pad, y); y += L.fq * 1.22; });
    if (L.q.length) y += L.fq * .25;
    c.save(); c.globalAlpha *= .72; c.font = `400 ${L.fr}px "Work Sans"`;
    L.r.forEach(l => { c.fillText(l, L.pad, y); y += L.fr * 1.4; });
    c.restore();
    if (L.legend) {
      y += L.fr * .5; let x = L.pad;
      c.font = `400 ${MIN_FS}px "Necto Mono"`; c.textBaseline = "middle";
      L.legend.forEach((yr, j) => {
        c.fillStyle = yearColor(j); c.beginPath(); c.arc(x + 6, y + 6, 6, 0, Math.PI * 2); c.fill();
        c.fillStyle = P.ink; c.fillText(String(yr).toUpperCase(), x + 18, y + 6.5);
        x += 18 + c.measureText(String(yr)).width + 22;
      });
    }
  }
  /* Texto libre con diagramación paramétrica: en formatos anchos ocupa una columna a la derecha y el
     gráfico se recentra en lo que queda; en 4:5 y 1:1 va en un bloque bajo el gráfico. El tamaño de letra
     es el mayor que cabe en ese espacio (entre ~30 px y 13 px); los saltos de línea se respetan. */
  function freeLayout(c) {
    const text = (state.free || "").trim();
    if (!text || state.message || state.chartOnly) return null;
    const pad = PAD(), land = W / H >= 1.3, top = (state.sub ? state.sub.bottom : pad + 40) + Math.min(W, H) * .03;
    const floor = (state.showTitle && state.hl ? state.hl.top : footerMetrics().top) - 18;
    const x0 = land ? W * .64 : pad, w = land ? W - pad - x0 : W - pad * 2, maxH = land ? floor - top : H * .24;
    // tope de tamaño: el texto libre acompaña, no compite con el titular (Work FaAAD ≥ 1/3 más grande) ni con la pregunta
    let size = Math.max(16, Math.min(W, H) * (state.showTitle ? .032 : .04)), lines = [], lh = 0;
    for (; size >= MIN_FS + 2; size *= .93) {
      c.font = `500 ${size}px "Work Sans"`; lh = size * 1.32;
      lines = text.split(/\n/).flatMap(par => par.trim() ? wrapText(c, par.trim(), w) : [""]);
      if (lines.length * lh <= maxH) break;
    }
    const maxLines = Math.max(1, Math.floor(maxH / lh));
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = fitText(c, lines[maxLines - 1] + "…", w); }
    const h = lines.length * lh;
    return { land, x0, w, size, lh, lines, y0: land ? top : floor - h };
  }
  function drawFree(c, P) {
    const F = state.ft; if (!F) return;
    c.fillStyle = P.ink; c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.font = `500 ${F.size}px "Work Sans"`;
    // un filete corto marca dónde empieza el texto (y lo separa del gráfico)
    c.fillRect(F.x0, F.y0 - Math.min(W, H) * .018, Math.min(40, F.w * .2), 2);
    F.lines.forEach((l, i) => { if (l) c.fillText(l, F.x0, F.y0 + F.size * .95 + i * F.lh); });
  }

  // Titular a tamaño de afiche: máx. 3 líneas y máx. ~30% del alto, la 2da línea con sangría; se apoya sobre el pie
  function headlineLayout(c) {
    const pad = PAD(), text = state.meta.title || "", maxW = W - pad * 2, foot = footerMetrics();
    let size = Math.min(W, H) * .14, lines = [];
    for (; size > 14; size *= .92) {
      c.font = `400 ${size}px "Work FaAAD"`;
      lines = wrapText(c, text, maxW - size * .4);
      const fits = lines.length <= 3 && lines.every(l => c.measureText(l).width <= maxW - size * .4);
      if (fits && (lines.length - 1) * size * 1.08 + size * .98 <= H * .28) break;
    }
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = clip(lines[2], Math.max(3, lines[2].length - 1)); }
    // interlineado medido: alto real de tildes + descendentes («Región» sobre «procedencia» se tocaban con .9)
    c.font = `400 ${size}px "Work FaAAD"`;
    const mt = c.measureText("ÁÉÍÓÚÑgjpqy"), lh = (mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) * 1.06;
    const base = foot.top - Math.max(16, foot.lh * .9) - size * .2;
    return { size, lines, lh, base, pad, top: base - (lines.length - 1) * lh - size * .8 };  // .8: alto de mayúsculas con tilde
  }
  function headline(c, P) {
    const { size, lines, lh, base, pad } = state.hl;
    c.font = `400 ${size}px "Work FaAAD"`;
    c.fillStyle = P.ink; c.textAlign = "left"; c.textBaseline = "alphabetic";
    lines.forEach((l, i) => c.fillText(l, pad + (i % 2 ? size * .4 : 0), base - (lines.length - 1 - i) * lh));
  }
  function wrapText(c, text, maxW) {
    const words = text.split(/\s+/), lines = []; let cur = "";
    words.forEach(w => { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }

  /* =================== Loop =================== */
  let last = performance.now(), time = 0;
  function tick(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!REDUCED) time += dt;
    const k = 1 - Math.pow(.0015, dt);  // interpolación independiente del framerate
    state.vis.forEach(v => { if (v.delay > 0) v.delay -= dt; else v.cur += (v.target - v.cur) * k; });
    state.dom.min += (state.domT.min - state.dom.min) * k; state.dom.max += (state.domT.max - state.dom.max) * k;
    const lim = (state.dom.max - state.dom.min) * .01;
    state.vis = state.vis.filter(v => !(v.dying && Math.abs(v.cur) < lim));
    if (state.playing && state.P) playStep(dt);
    if (isGallery()) stepGallery(); else draw();
    requestAnimationFrame(tick);
  }

  /* Gradiente a lo largo del eje de valor de cada forma (en coordenadas uv: y hacia arriba, radios en
     unidades del alto): así el color repite el valor en vez de dibujar un borde que no es dato. */
  function gradFor(form) {
    const u = (x, y) => [x / W, 1 - y / H];
    if (form === "espiral") { const g = spiralGeo(); return { mode: 3, p: [...u(g.cx, g.cy), Math.max(.1, Math.PI * 1.5 - g.halo / (g.R - g.step * .5)), 0] }; }
    if (form === "rosa") { const g = roseGeo(); return { mode: 2, p: [...u(g.cx, g.cy), g.r0 / H, (g.R * .92) / H] }; }
    if (form === "nube") { const g = cloudGeo(); return { mode: 2, p: [...u(g.cx, g.cy), (g.R * .18) / H, (g.R * .76) / H] }; }
    const g = cartGeo();
    return { mode: 1, p: [1 - g.y0 / H, 1 - g.yOf(state.dom.max) / H, 0, 0] };
  }

  let lastThermal = null;
  function draw() {
    const P = currentPal(), cmp = state.mode === "comparar" && state.cmp, D = cmp ? CMP_DRAW[state.form] : DRAW[state.form];
    state.hl = headlineLayout(ctx);
    state.sub = subLayout(ctx);
    state.ft = freeLayout(ctx);

    // 1+2) fondo con campo líquido + capas térmicas: una por año en Comparar años (cada una de su color),
    // una por categoría si la paleta trae varios pares, o una sola
    const layered = cmp || (D.layered && P.pairs.length > 1), nCmp = cmpYears().length;
    const n = state.vis.length ? (cmp ? nCmp : layered ? state.vis.length : 1) : 0;
    const drawLayer = i => {
      mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.globalAlpha = 1;
      mctx.fillStyle = "#000"; mctx.fillRect(0, 0, mask.width, mask.height);
      mctx.setTransform(MASK_SCALE, 0, 0, MASK_SCALE, 0, 0);
      mctx.fillStyle = "#fff"; mctx.strokeStyle = "#fff";
      D.mask(mctx, layered ? i : -1);
      return mask;
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, out.width, out.height);
    if (thermal) {
      ctx.drawImage(lastThermal = thermal.render({
        width: out.width, height: out.height, time, grain: .03,
        bg: P.bg, field: P.field, fieldAmt: P.fieldAmt, transparent: state.noBg,
        layers: n, drawLayer, pair: i => cmp ? [yearColor(i), yearColor(i)] : P.pairs[(layered ? i : 0) % P.pairs.length],
        sigma: cmp && state.form === "espiral" ? cmpSpiralGeo().sigmaC : sigmaFor(state.form), gain: THIN.has(state.form) ? 1.75 : 1.2, s1: .3,
        grad: cmp ? { mode: 0, p: [0, 0, 1, 1] } : gradFor(state.form),
      }), 0, 0);
    } else if (!state.noBg) { ctx.fillStyle = P.bg; ctx.fillRect(0, 0, out.width, out.height); }

    // 3) superposición nítida
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    overlay(ctx, P, D);
  }
  // todo lo vectorial (texto, ejes, guías, píldoras, lockup): el mismo código dibuja en el lienzo o en el SVG
  function overlay(c, P, D) {
    if (state.vis.length) D.over(c, P);
    c.globalAlpha = 1;
    frame(c, P);
    if (state.message) {
      c.fillStyle = P.ink; c.textAlign = "center"; c.textBaseline = "middle"; c.font = `400 14px "Work Sans"`;
      c.fillText(state.message, W / 2, H * .4);
    }
  }

  /* =================== Galería =================== */
  /* Cada pregunta como tarjeta, con una miniatura por gráfico posible. La miniatura es el slide real:
     se dibuja con el mismo draw() a 960×540 (valores ya en su sitio, sin animación) y se reduce.
     Se generan de a una por cuadro y solo cuando entran en pantalla; si cambian los colores, se rehacen. */
  const SNAP_W = 960, SNAP_H = 540;
  const snap = document.createElement("canvas"); snap.width = SNAP_W; snap.height = SNAP_H;
  const snapCtx = snap.getContext("2d");
  const SNAP_KEYS = ["year", "q", "P", "cmp", "mode", "form", "vis", "dom", "domT", "isPct", "signed", "meta", "showTitle", "playing", "message", "hl", "colors", "noBg", "free", "sub", "ft", "cambioYears", "chartOnly"];

  /* En la galería cada familia de preguntas lleva su propia combinación del manual: así se reconoce
     de un vistazo a qué grupo pertenece cada tarjeta (con un solo color, todo se veía igual). */
  let familyOrder = [];
  function buildFamilyOrder() {
    familyOrder = [];
    [...DatosEncuesta.years].reverse().forEach(y => (DatosEncuesta.data[y] || []).forEach(q => { const f = q.familia || "—"; if (!familyOrder.includes(f)) familyOrder.push(f); }));
  }
  const familyColors = f => PRESETS[Math.max(0, familyOrder.indexOf(f || "—")) % PRESETS.length];

  function formsFor(P) {
    if (P.kind === "empty" || P.kind === "mixed") return [];
    if (P.kind === "value") return ["espiral", "barras"];
    return Object.keys(FORMS);
  }
  function snapshot(year, q, form, colors) {
    const saved = {}; SNAP_KEYS.forEach(k => { saved[k] = state[k]; });
    const savedT = { out, ctx, W, H, DPR, mw: mask.width, mh: mask.height };
    try {
      state.P = DatosEncuesta.profile(q); state.cmp = null; state.mode = "valor"; state.form = form;
      if (colors) state.colors = colors;
      state.noBg = false; state.free = ""; state.chartOnly = false;  // las miniaturas: slide completo, con fondo y sin texto libre
      state.showTitle = false; state.playing = false; state.message = "";
      state.meta = { title: q.pregunta, crumb: [year, q.familia].filter(Boolean).join(" · "), note: "" };
      const items = buildItems();
      state.vis = items.map(it => ({ label: it.label, cur: it.value, target: it.value, delay: 0 }));
      state.dom = state.domT = domainFor(items.map(i => i.value)); state.signed = state.dom.min < 0;
      out = snap; ctx = snapCtx; W = SNAP_W; H = SNAP_H; DPR = 1;
      mask.width = Math.round(W * MASK_SCALE); mask.height = Math.round(H * MASK_SCALE);
      draw();
    } finally {
      SNAP_KEYS.forEach(k => { state[k] = saved[k]; });
      ({ out, ctx, W, H, DPR } = savedT); mask.width = savedT.mw; mask.height = savedT.mh;
    }
    return snap;
  }

  const gallery = { year: null, queue: [], io: null, onlyCmp: false };  // year null = el más reciente
  const isGallery = () => document.body.classList.contains("view-gallery");
  function paintThumb(th) {
    const q = (DatosEncuesta.data[th.dataset.year] || []).find(x => x.pregunta === th.dataset.q);
    if (!q) return;
    const cv = th.querySelector("canvas"), c2 = cv.getContext("2d");
    c2.drawImage(snapshot(th.dataset.year, q, th.dataset.form, familyColors(q.familia)), 0, 0, cv.width, cv.height);
    th.dataset.key = th.dataset.form;
  }
  function queueThumb(th) { if (th.dataset.key !== th.dataset.form && !gallery.queue.includes(th)) gallery.queue.push(th); }
  function stepGallery() {
    // una miniatura por cuadro mantiene la página fluida mientras se generan
    const th = gallery.queue.shift();
    if (th && th.isConnected && th.dataset.vis === "1") paintThumb(th);
  }

  /* Gráfico recomendado por tipo de dato: la tarjeta muestra UNA vista previa (no todas las formas);
     las demás quedan como chips que cambian la vista al pasar el mouse. */
  function recommendedForm(P) {
    const n = P.numeric.length;
    if (P.kind === "value") return "espiral";                    // una cifra: un anillo contra el 100
    if (P.kind === "multi" || n > 5) return "barras";            // ranking / muchas categorías: comparar largos
    if (P.kind === "counts") return "paleta";                    // conteos: altura exacta de cada uno
    if (n <= 3) return "rosa";                                   // pocas partes de un todo
    return "espiral";
  }
  // dato principal de la tarjeta: la categoría más grande y su valor
  function leadStat(P) {
    if (!P.numeric.length) return "";
    const top = [...P.numeric].sort((a, b) => DatosEncuesta.val(P, b) - DatosEncuesta.val(P, a))[0], v = DatosEncuesta.val(P, top);
    const num = (Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(".", ",")) + (P.isPct ? "%" : "");
    return [top.label, num].filter(Boolean).join(" · ");
  }

  function renderGallery() {
    const list = $("#tm-glist"), query = ($("#tm-gsearch").value || "").trim().toLowerCase();
    const latest = DatosEncuesta.years[DatosEncuesta.years.length - 1];
    if (!gallery.year) gallery.year = latest;
    if (gallery.io) gallery.io.disconnect();
    gallery.queue = [];
    gallery.io = new IntersectionObserver(entries => entries.forEach(e => {
      e.target.dataset.vis = e.isIntersecting ? "1" : "0";
      if (e.isIntersecting) queueThumb(e.target);
    }), { rootMargin: "300px 0px" });

    $("#tm-gyears").replaceChildren(...[...[...DatosEncuesta.years].reverse(), "todos"].map(y =>
      btn(y === "todos" ? "Todos los años" : y, !query && gallery.year === y, () => { gallery.year = y; $("#tm-gsearch").value = ""; renderGallery(); })),
      // atajo para encontrar lo que se puede ver en «Comparar años» (en 2026 son pocas preguntas)
      btn("Comparables entre años", gallery.onlyCmp, () => { gallery.onlyCmp = !gallery.onlyCmp; if (gallery.onlyCmp && !$("#tm-gsearch").value) gallery.year = "todos"; renderGallery(); }, { cls: "tm-cmpf" }));
    const comparable = q => { const P = DatosEncuesta.profile(q); return P.kind !== "empty" && P.kind !== "mixed" && !!DatosEncuesta.yearSeries(P); };

    // con búsqueda se busca en todos los años; sin búsqueda, solo en el año elegido
    const years = [...DatosEncuesta.years].reverse().filter(y => query || gallery.year === "todos" || gallery.year === y);
    const frag = document.createDocumentFragment();
    years.forEach(y => {
      const qs = (DatosEncuesta.data[y] || []).filter(q => (!query || q.pregunta.toLowerCase().includes(query) || q.rows.some(r => (r.categoria || "").toLowerCase().includes(query))) && (!gallery.onlyCmp || comparable(q)));
      if (!qs.length) return;
      const charts = qs.filter(q => formsFor(DatosEncuesta.profile(q)).length), plain = qs.filter(q => !charts.includes(q));
      const hd = document.createElement("div"); hd.className = "tm-g-yearh";
      hd.innerHTML = `<h2>${y}</h2><small>${charts.length} ${charts.length === 1 ? "pregunta graficable" : "preguntas graficables"}</small>`;
      frag.appendChild(hd);
      // dentro del año, agrupado por familia: subtítulo con la muestra de su color
      const fams = []; charts.forEach(q => { const f = q.familia || "—"; if (!fams.includes(f)) fams.push(f); });
      fams.forEach(f => {
        const qsF = charts.filter(q => (q.familia || "—") === f), pc = familyColors(f);
        const fh = document.createElement("div"); fh.className = "tm-g-fam";
        fh.style.setProperty("--sw", `linear-gradient(135deg, ${gradPair(pc)[0]} 0%, ${gradPair(pc)[1]} 100%)`);
        fh.style.setProperty("--sw-bg", COL[pc.bg].hex);
        fh.innerHTML = `<i aria-hidden="true"></i><span></span><small>${qsF.length}</small>`;
        fh.querySelector("span").textContent = f;
        frag.appendChild(fh);
        const grid = document.createElement("div"); grid.className = "tm-g-grid";
        qsF.forEach(q => grid.appendChild(card(y, q)));
        frag.appendChild(grid);
      });
      if (plain.length) {
        const d = document.createElement("details"); d.className = "tm-g-plain";
        d.innerHTML = `<summary>${plain.length} ${plain.length === 1 ? "pregunta" : "preguntas"} sin cifras para graficar</summary>`;
        const ul = document.createElement("ul");
        plain.forEach(q => { const li = document.createElement("li"); li.textContent = q.pregunta; ul.appendChild(li); });
        d.appendChild(ul); frag.appendChild(d);
      }
    });
    if (!frag.childNodes.length) { const e = document.createElement("p"); e.className = "tm-g-hint"; e.textContent = "Ninguna pregunta coincide con la búsqueda."; frag.appendChild(e); }
    list.replaceChildren(frag);
  }

  function card(y, q) {
    const P = DatosEncuesta.profile(q), forms = formsFor(P), rec = recommendedForm(P);
    const el = document.createElement("article"); el.className = "tm-card";
    const th = document.createElement("button");
    th.type = "button"; th.className = "tm-thumb";
    Object.assign(th.dataset, { year: y, q: q.pregunta, form: rec });
    th.setAttribute("aria-label", `Abrir «${q.pregunta}» en el editor`);
    const cv = document.createElement("canvas"); cv.width = 640; cv.height = 360;
    th.appendChild(cv);
    th.addEventListener("click", () => openEditor(y, q.pregunta, th.dataset.form));
    gallery.io.observe(th);

    const crumb = document.createElement("p"); crumb.className = "tm-card-crumb";
    const cmp = (P.kind !== "empty" && P.kind !== "mixed") ? DatosEncuesta.yearSeries(P) : null;
    crumb.textContent = [P.N ? `n = ${P.N}` : "", cmp ? "comparable " + cmp.years.filter(x => x !== y).join(", ") : ""].filter(Boolean).join(" · ");
    const h = document.createElement("h3"); h.textContent = q.pregunta; h.title = q.pregunta;
    const lead = document.createElement("p"); lead.className = "tm-card-lead"; lead.textContent = leadStat(P);

    // chips de forma: pasar el mouse cambia la vista previa; clic abre el editor en esa forma
    const chips = document.createElement("div"); chips.className = "tm-chips"; chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Formas");
    const setForm = f => {
      th.dataset.form = f;
      chips.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.form === f)));
      if (th.dataset.vis === "1") paintThumb(th);
    };
    forms.forEach(f => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tm-fchip"; b.dataset.form = f; b.textContent = FORMS[f].label;
      b.setAttribute("aria-pressed", String(f === rec));
      b.addEventListener("mouseenter", () => setForm(f));
      b.addEventListener("focus", () => setForm(f));
      b.addEventListener("click", () => openEditor(y, q.pregunta, f));
      chips.appendChild(b);
    });
    el.append(th, crumb, h, lead, chips);
    return el;
  }
  $("#tm-gsearch").addEventListener("input", renderGallery);

  /* Texto introductorio (fijo): pasar el mouse por un paso ilumina el primer control del que habla. */
  (function guide() {
    let lit = [];
    const clear = () => { lit.forEach(el => el.classList.remove("tm-lit")); lit = []; };
    $("#tm-guide").querySelectorAll("li").forEach(li => {
      li.addEventListener("mouseenter", () => {
        clear();
        li.dataset.target.split(",").forEach(sel => { const el = document.querySelector(sel.trim()); if (el) { el.classList.add("tm-lit"); lit.push(el); } });
      });
      li.addEventListener("mouseleave", clear);
    });
  })();

  function showGallery() {
    if (state.playing) stopPlay();
    document.body.classList.replace("view-editor", "view-gallery");
    // si cambiaron los colores en el editor, las miniaturas visibles se rehacen
    document.querySelectorAll(".tm-thumb").forEach(th => { if (th.dataset.vis === "1") queueThumb(th); });
  }
  function openEditor(year, pregunta, form) {
    document.body.classList.replace("view-gallery", "view-editor");
    // el editor abre con los colores de la tarjeta elegida (después se pueden cambiar)
    const q = (DatosEncuesta.data[year] || []).find(x => x.pregunta === pregunta);
    if (q) state.colors = { ...familyColors(q.familia) };
    state.form = form;
    state.openYears.add(year);  // la lista lateral abre el año de la pregunta elegida
    selectQuestion(year, pregunta);
    resize(); renderControls();
    window.scrollTo(0, 0);
  }
  $("#tm-back").addEventListener("click", showGallery);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !isGallery() && !$("#tm-ask").open) showGallery();
  });

  /* =================== Exportar =================== */
  const fileBase = () => "faaad-" + (state.q || "visual").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + state.form;
  function download(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  /* Qué se exporta (se pregunta antes de cada PNG, SVG o video):
     «slide» = como se ve en pantalla · «titulo» = slide + titular en Work FaAAD ·
     «grafico» = solo la visualización con sus etiquetas, sin encabezado, pregunta, texto libre ni pie. */
  function askTitle() {
    const d = $("#tm-ask");
    return new Promise(res => {
      d.addEventListener("close", () => res(["slide", "titulo", "grafico"].includes(d.returnValue) ? d.returnValue : null), { once: true });
      d.returnValue = ""; d.showModal();
    });
  }
  const setExport = kind => { state.showTitle = kind === "titulo"; state.chartOnly = kind === "grafico"; };
  const resetExport = () => { state.showTitle = false; state.chartOnly = false; };
  const suffix = kind => ({ titulo: "-con-titulo", grafico: "-solo-grafico" }[kind] || "") + (state.noBg ? "-sin-fondo" : "");
  $("#tm-png").addEventListener("click", async () => {
    const kind = await askTitle();
    if (kind == null) return;
    setExport(kind); draw();          // el cuadro elegido se dibuja solo para la captura
    out.toBlob(b => b && download(b, fileBase() + suffix(kind) + ".png"), "image/png");
    resetExport();
  });

  /* SVG: el fondo térmico (blur + campo) va como imagen PNG incrustada —un SVG no reproduce ese
     efecto de forma confiable en Illustrator/Figma—, y encima todo lo demás queda VECTORIAL y
     editable: textos (con sus fuentes del manual), cifras, ejes, guías, píldoras y lockup. */
  function loadC2S() {
    if (window.C2S) return Promise.resolve();
    return new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/canvas2svg@1.0.16/canvas2svg.js";
      sc.onload = res; sc.onerror = () => rej(new Error("No pude cargar canvas2svg"));
      document.head.appendChild(sc);
    });
  }
  function svgContext() {
    const c = new C2S(W, H);
    // canvas2svg no trae setLineDash: se traduce a stroke-dasharray en cada trazo
    c.setLineDash = function (a) { this.__dash = a && a.length ? a.join(" ") : ""; };
    const stroke = c.stroke;
    c.stroke = function () { stroke.apply(this, arguments); if (this.__dash) this.__currentElement.setAttribute("stroke-dasharray", this.__dash); };
    /* Texto editable en Illustrator/Figma: se escribe siempre con línea base alfabética y alineado a la
       izquierda, con x/y ya calculados (Illustrator ignora dominant-baseline y corre los textos). La
       conversión mide el texto real: la base alfabética queda (ascenso alfabético − ascenso actual) más abajo. */
    const mc = document.createElement("canvas").getContext("2d"), fillText = c.fillText;
    c.fillText = function (text, x, y) {
      text = String(text);
      if (!text) return;
      mc.font = this.font;
      mc.textBaseline = this.textBaseline; const mb = mc.measureText(text);
      mc.textBaseline = "alphabetic"; const ma = mc.measureText(text);
      const dy = (ma.actualBoundingBoxAscent - mb.actualBoundingBoxAscent) || 0;
      const al = this.textAlign, dx = al === "right" || al === "end" ? -ma.width : al === "center" ? -ma.width / 2 : 0;
      const sb = this.textBaseline, sa = this.textAlign;
      this.textBaseline = "alphabetic"; this.textAlign = "left";
      fillText.call(this, text, x + dx, y + dy);
      this.textBaseline = sb; this.textAlign = sa;
    };
    // su drawImage ubica la imagen con un translate que no siempre se aplica: acá va con x/y explícitos
    c.drawImage = function (img, x, y, w, h) {
      const el = this.__createElement("image");
      [["x", x], ["y", y], ["width", w], ["height", h], ["preserveAspectRatio", "none"]].forEach(([k, v]) => el.setAttribute(k, v));
      el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", img.toDataURL());
      if (this.globalAlpha < 1) el.setAttribute("opacity", this.globalAlpha);
      this.__closestGroupOrSvg().appendChild(el);
    };
    return c;
  }
  /* Ordena el SVG para un programa de diseño: capas con nombre (Fondo térmico, Gráfico, Lockup, Textos)
     y fuentes con su nombre PostScript primero —como las escribe Illustrator— y la familia de respaldo,
     para que el texto abra como texto con la fuente instalada y no como una sustitución. */
  const PS_NAMES = {
    "Work Sans": { 400: "WorkSans-Regular", 500: "WorkSans-Medium", 600: "WorkSans-SemiBold" },
    "Necto Mono": { 400: "NectoMono-Regular" },
    "Work FaAAD": { 400: "WorkFaAAD-A" },
  };
  function finishSvg(root) {
    const NS = "http://www.w3.org/2000/svg";
    root.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const layer = (id, label) => { const g = document.createElementNS(NS, "g"); g.setAttribute("id", id); g.setAttribute("data-name", label); return g; };
    const bgL = layer("Fondo_termico", "Fondo térmico"), chartL = layer("Grafico", "Gráfico"), logoL = layer("Lockup", "Lockup"), textL = layer("Textos", "Textos");
    const els = [...root.querySelectorAll("image, path, rect, line, circle, text")];
    let firstImage = true;
    els.forEach(el => {
      if (el.tagName === "image") { (firstImage ? bgL : logoL).appendChild(el); firstImage = false; return; }
      if (el.tagName === "text") {
        const fam = (el.getAttribute("font-family") || "").replace(/["']/g, "").split(",")[0].trim();
        const w = +el.getAttribute("font-weight") || 400, ps = (PS_NAMES[fam] || {})[w];
        el.setAttribute("font-family", ps ? `${ps}, ${fam}` : fam);
        ["dominant-baseline", "text-anchor", "text-decoration", "stroke"].forEach(a => el.removeAttribute(a));
        el.setAttribute("xml:space", "preserve");
        textL.appendChild(el); return;
      }
      chartL.appendChild(el);
    });
    [...root.childNodes].forEach(n => { if (n.nodeName !== "defs") root.removeChild(n); });  // los grupos anónimos quedaron vacíos
    [bgL, chartL, logoL, textL].forEach(g => { if (g.childNodes.length) root.appendChild(g); });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
  }

  $("#tm-svg").addEventListener("click", async () => {
    const kind = await askTitle();
    if (kind == null) return;
    try { await loadC2S(); } catch (e) { alert("No se pudo cargar el exportador SVG (revisa la conexión)."); return; }
    setExport(kind);
    try {
      draw();  // deja listo el fondo térmico de este cuadro (y el layout con o sin título)
      const P = currentPal(), D = state.mode === "comparar" && state.cmp ? CMP_DRAW[state.form] : DRAW[state.form], c = svgContext();
      if (lastThermal) c.drawImage(lastThermal, 0, 0, W, H); else if (!state.noBg) { c.fillStyle = P.bg; c.fillRect(0, 0, W, H); }
      overlay(c, P, D);
      const svg = finishSvg(c.getSvg());
      download(new Blob([svg], { type: "image/svg+xml" }), fileBase() + suffix(kind) + ".svg");
    } finally { resetExport(); }
  });

  let rec = null;
  $("#tm-rec").addEventListener("click", async () => {
    const b = $("#tm-rec");
    if (rec) { rec.stop(); return; }
    const kind = await askTitle();
    if (kind == null) return;
    if (!out.captureStream || !window.MediaRecorder) { alert("Este navegador no permite grabar el lienzo."); return; }
    // sin fondo: primero WebM (el único que puede llevar transparencia; MP4 no la admite)
    const types = state.noBg ? ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=avc1"] : ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm"];
    const type = types.find(t => MediaRecorder.isTypeSupported(t)) || "";
    const chunks = [];
    rec = new MediaRecorder(out.captureStream(60), type ? { mimeType: type, videoBitsPerSecond: 12e6 } : undefined);
    rec.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
    rec.onstop = () => {
      const t = rec.mimeType || type || "video/webm";
      download(new Blob(chunks, { type: t }), fileBase() + suffix(kind) + (t.includes("mp4") ? ".mp4" : ".webm"));
      resetExport(); rec = null; b.textContent = "● Video"; b.classList.remove("rec");
    };
    setExport(kind);
    rec.start(); b.textContent = "■ Detener"; b.classList.add("rec");
    // graba una vuelta completa de la animación del gráfico actual (años o crecer → vaciar)
    const wasPlaying = state.playing;
    startPlay();
    setTimeout(() => { if (rec) rec.stop(); if (!wasPlaying) stopPlay(); }, playLength() * 1000 + 400);
  });

  /* =================== Arranque =================== */
  // la página arranca recién después de la pantalla de acceso (js/termico/acceso.js)
  $("#tm-logout").addEventListener("click", () => TermicoAcceso.salir());
  TermicoAcceso.listo.then(async function init() {
    resize(); renderControls();
    requestAnimationFrame(tick);
    try { await Promise.all(['400 40px "Work FaAAD"', '400 12px "Work Sans"', '600 12px "Work Sans"', '400 12px "Necto Mono"'].map(f => document.fonts.load(f))); } catch (e) { /* sigue con fuentes del sistema */ }
    const ok = await DatosEncuesta.loadAll().catch(e => { console.warn(e); return false; });
    if (!ok) { setStatus("err", "Sin conexión con el Sheet"); state.message = "No pude leer el Sheet."; return; }
    setStatus("ok", `Sheet en vivo · ${DatosEncuesta.years.length} años`);
    state.openYears.add(DatosEncuesta.years[DatosEncuesta.years.length - 1]);
    buildFamilyOrder();
    renderGallery();  // se entra por la galería; el editor se abre al elegir un gráfico
  });
})();
