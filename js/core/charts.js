/* ==========================================================================
   FaAADudp — Informe Encuesta Cohorte 2026
   Librería de gráficos del informe (reemplaza las barras genéricas).
   Cada <div class="gc-chart" data-form="..." data-json="{...}"></div> dentro
   de un slide se renderiza al cargar la página, según data-form.
   Convención: todo texto/línea usa currentColor (hereda el color del slide,
   ya resuelto por bg-negro/bg-blanco/etc en style.css) — así el mismo
   renderer sirve para slides claros y oscuros sin parámetros extra. Los
   colores categóricos (fills) sí vienen explícitos en cada data-json,
   elegidos a mano por slide para que contrasten con su fondo.
   Los números NO se editan aquí ni en el HTML: viven en el Google Sheet y
   js/sheet-bind.js los reemplaza al cargar (mapa en js/bindings.js). Los
   valores del HTML son solo el respaldo si el Sheet no responde.
   ========================================================================== */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const VB_W = 1000, VB_H = 260;

  function el(tag, attrs, txt) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (txt != null) e.textContent = txt;
    return e;
  }
  function svgRoot(vb) {
    const s = el("svg", { viewBox: vb || `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: "xMidYMid meet" });
    s.style.width = "100%"; s.style.height = "100%"; s.style.overflow = "visible";
    return s;
  }

  /* ---------------- Pictograma: 1 unidad = 1 persona/respuesta ---------------- */
  function renderPictogram(host, d) {
    const total = d.total, segs = d.segments;
    const svg = svgRoot();
    const cols = Math.max(20, Math.ceil(total / 5));
    const avail = VB_W - 60;
    // gridW = cell*cols + gap*(cols-1), con gap=cell*0.32 -> despejando cell para que gridW <= avail
    const cell = Math.min(avail / (cols * 1.32 - 0.32), 34);
    const gap = cell * 0.32;
    const gridW = cols * (cell + gap) - gap;
    const rows = Math.ceil(total / cols);
    const gridH = rows * (cell + gap) - gap;
    const x0 = (VB_W - gridW) / 2, y0 = (VB_H - 40 - gridH) / 2 + 4;
    let i = 0;
    segs.forEach(seg => {
      for (let k = 0; k < seg.count; k++, i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = x0 + col * (cell + gap), y = y0 + row * (cell + gap);
        if (seg.hollow) svg.appendChild(el("rect", { x, y, width: cell, height: cell, rx: cell * 0.18, fill: "none", stroke: "currentColor", "stroke-opacity": .35, "stroke-width": 1.4, "stroke-dasharray": (cell*0.22)+" "+(cell*0.3) }));
        else svg.appendChild(el("rect", { x, y, width: cell, height: cell, rx: cell * 0.18, fill: seg.color }));
      }
    });
    let ly = y0 + gridH + 26;
    let lx = x0;
    segs.forEach(seg => {
      svg.appendChild(el("circle", { cx: lx + 6, cy: ly - 4, r: 6, fill: seg.hollow ? "none" : seg.color, stroke: seg.hollow ? "currentColor" : "none", "stroke-opacity": .5 }));
      const t = el("text", { x: lx + 18, y: ly, "font-size": 15, fill: "currentColor" }, `${seg.count} · ${seg.label}`);
      svg.appendChild(t);
      lx += 18 + seg.label.length * 7.4 + String(seg.count).length * 7.4 + 46;
    });
    host.innerHTML = ""; host.appendChild(svg);
  }

  /* ---------------- Anillo: una cifra dominante + satélites ---------------- */
  function renderRing(host, d) {
    const svg = svgRoot();
    const cx = 155, cy = 130, r = 92, sw = 30;
    const C = 2 * Math.PI * r;
    svg.appendChild(el("circle", { cx, cy, r, fill: "none", stroke: "currentColor", "stroke-opacity": .14, "stroke-width": sw }));
    svg.appendChild(el("circle", { cx, cy, r, fill: "none", stroke: d.accent, "stroke-width": sw, "stroke-dasharray": `${C * d.pct / 100} ${C}`, transform: `rotate(-90 ${cx} ${cy})` }));
    svg.appendChild(el("text", { x: cx, y: cy - 2, "text-anchor": "middle", "font-size": 46, "font-weight": 700, fill: "currentColor" }, d.pct.toString().replace(".", ",") + "%"));
    svg.appendChild(el("text", { x: cx, y: cy + 22, "text-anchor": "middle", "font-size": 12.5, fill: "currentColor", "fill-opacity": .72 }, d.label));
    // satélites a la derecha, listados verticalmente
    let ly = 70;
    (d.satellites || []).forEach(s => {
      const sx = 330;
      svg.appendChild(el("circle", { cx: sx, cy: ly - 5, r: 7, fill: s.hollow ? "none" : d.accent, stroke: "currentColor", "stroke-opacity": s.hollow ? .4 : 0, "stroke-dasharray": s.hollow ? "2 3" : "none" }));
      svg.appendChild(el("text", { x: sx + 18, y: ly, "font-size": 14, fill: "currentColor" }, s.label));
      svg.appendChild(el("text", { x: sx + 18, y: ly + 20, "font-size": 13, fill: "currentColor", "fill-opacity": .62 }, s.note));
      ly += 62;
    });
    host.innerHTML = ""; host.appendChild(svg);
  }

  /* ---------------- Enjambre (beeswarm): 1 punto = 1 unidad ---------------- */
  const GOLDEN = 137.50776;
  function fermat(g, cx, cy, n, dotR, coreN, coreColor, color, hollow) {
    const c = dotR * 2.15;
    for (let i = 0; i < n; i++) {
      const r = c * Math.sqrt(i + 0.5), th = i * GOLDEN * Math.PI / 180;
      const x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
      if (hollow) g.appendChild(el("circle", { cx: x, cy: y, r: dotR * 1.2, fill: "none", stroke: "currentColor", "stroke-opacity": .4, "stroke-width": 1.3, "stroke-dasharray": "1.4 2.1" }));
      else g.appendChild(el("circle", { cx: x, cy: y, r: dotR, fill: i < coreN ? coreColor : color, "fill-opacity": i < coreN ? 1 : .85 }));
    }
  }
  function labelHalfW(name) { return name.length * 4.3 + 8; }
  function renderSwarm(host, d) {
    const items = d.items; const svg = svgRoot();
    const DOT_R = 3.0;
    const radiusFor = n => DOT_R * 2.15 * Math.sqrt(n + 0.5) + DOT_R;
    const slots = items.map(it => Math.max(radiusFor(it.n), labelHalfW(it.label)));
    const GAP = 20, totalW = slots.reduce((a, s) => a + 2 * s, 0) + GAP * (items.length - 1);
    let x = Math.max(10, (VB_W - totalW) / 2);
    const cy = 140;
    items.forEach(it => {
      const s = slots[items.indexOf(it)], cx = x + s;
      const g = el("g", {});
      fermat(g, cx, cy, it.n, DOT_R, it.coreN || 0, it.coreColor || it.color, it.hollow ? null : it.color, it.hollow);
      svg.appendChild(g);
      svg.appendChild(el("text", { x: cx, y: cy + Math.max(radiusFor(it.n), 20) + 22, "text-anchor": "middle", "font-size": 14, fill: "currentColor" }, it.label));
      svg.appendChild(el("text", { x: cx, y: cy + Math.max(radiusFor(it.n), 20) + 40, "text-anchor": "middle", "font-size": 17, "font-weight": 700, fill: "currentColor" }, it.display != null ? it.display : it.n));
      x = cx + s + GAP;
    });
    host.innerHTML = ""; host.appendChild(svg);
    if (d.note) {
      const cap = document.createElement("div");
      cap.style.cssText = "font-family:var(--f-mono);font-size:.85cqw;opacity:.55;margin-top:.4cqw;";
      cap.textContent = d.note;
      host.appendChild(cap);
    }
  }

  /* ---------------- Estallido radial (multi-respuesta) ---------------- */
  function renderBurst(host, d) {
    // las etiquetas de arriba/abajo caen fuera de 0..260: se amplía el lienzo para que no se corten
    const items = d.items; const svg = svgRoot(`0 -50 ${VB_W} ${VB_H + 100}`);
    const cx = 500, cy = 132, rMin = 24, rMax = 104, lr = rMax + 68;
    const pMax = Math.max(...items.map(it => it.value));
    const R = v => rMin + Math.min(1, v / pMax) * (rMax - rMin);
    const n = items.length;
    const trunc = s => s.length > 15 ? s.slice(0, 14) + "…" : s;
    items.forEach((it, i) => {
      const deg = (360 / n) * i + (180 / n);
      const rad = (deg - 90) * Math.PI / 180;
      const rr = R(it.value);
      const nx = cx + rr * Math.cos(rad), ny = cy + rr * Math.sin(rad);
      const lx = cx + lr * Math.cos(rad), ly = cy + lr * Math.sin(rad);
      const anchor = Math.abs(Math.cos(rad)) < 0.3 ? "middle" : (Math.cos(rad) > 0 ? "start" : "end");
      svg.appendChild(el("line", { x1: cx, y1: cy, x2: nx, y2: ny, stroke: "currentColor", "stroke-opacity": .22 }));
      svg.appendChild(el("line", { x1: nx, y1: ny, x2: lx, y2: ly, stroke: "currentColor", "stroke-opacity": .3 }));
      const node = el("circle", { cx: nx, cy: ny, r: 5 + it.value * 0.09, fill: d.accent });
      node.appendChild(el("title", {}, `${it.label} — ${it.display}`));
      svg.appendChild(node);
      const tx = lx + (anchor === "start" ? 6 : anchor === "end" ? -6 : 0);
      const lbl = el("text", { x: tx, y: ly - 4, "text-anchor": anchor, "font-size": 13, fill: "currentColor" }, trunc(it.label));
      if (it.label.length > 15) lbl.appendChild(el("title", {}, it.label));
      svg.appendChild(lbl);
      svg.appendChild(el("text", { x: tx, y: ly + 13, "text-anchor": anchor, "font-size": 12, fill: "currentColor", "fill-opacity": .62 }, it.display));
    });
    svg.appendChild(el("circle", { cx, cy, r: 20, fill: "currentColor", "fill-opacity": .12 }));
    svg.appendChild(el("text", { x: cx, y: cy + 4, "text-anchor": "middle", "font-size": 11, fill: "currentColor" }, d.center || "155"));
    host.innerHTML = ""; host.appendChild(svg);
  }

  /* ---------------- Banda 100% apilada ---------------- */
  function renderBand(host, d) {
    const segs = d.segments; const svg = svgRoot();
    const x0 = 20, x1 = 980, W = x1 - x0, yT = 78, H = 84; let x = x0;
    const smalls = [];
    segs.forEach((s, i) => {
      const w = (i === segs.length - 1) ? (x1 - x) : W * s.value / 100;
      if (s.hollow) {
        svg.appendChild(el("rect", { x, y: yT, width: w, height: H, fill: "none", stroke: "currentColor", "stroke-opacity": .4, "stroke-width": 1.6 }));
        for (let dd = -H; dd < w; dd += 9) svg.appendChild(el("line", { x1: x + dd, y1: yT + H, x2: x + dd + H, y2: yT, stroke: "currentColor", "stroke-opacity": .18, "stroke-width": 1 }));
      } else svg.appendChild(el("rect", { x, y: yT, width: w, height: H, fill: s.fill }));
      const cx = x + w / 2, big = s.value >= 15;
      if (big) {
        svg.appendChild(el("text", { x: cx, y: yT - 14, "text-anchor": "middle", "font-size": 14, fill: "currentColor" }, s.label));
        svg.appendChild(el("text", { x: cx, y: yT + H + 32, "text-anchor": "middle", "font-size": 28, "font-weight": 700, fill: "currentColor" }, s.display));
      } else {
        svg.appendChild(el("line", { x1: cx, y1: yT + H, x2: cx, y2: yT + H + 14, stroke: "currentColor", "stroke-opacity": .4 }));
        smalls.push({ ...s, cx });
      }
      x += w;
    });
    if (smalls.length) {
      let lx = x0;
      smalls.forEach(s => {
        svg.appendChild(el("circle", { cx: lx + 6, cy: yT + H + 52, r: 6, fill: s.hollow ? "none" : s.fill, stroke: s.hollow ? "currentColor" : "none", "stroke-opacity": .4 }));
        svg.appendChild(el("text", { x: lx + 18, y: yT + H + 56, "font-size": 14, fill: "currentColor" }, `${s.display} · ${s.label}`));
        lx += 18 + (s.label.length + s.display.length) * 7.6 + 40;
      });
    }
    host.innerHTML = ""; host.appendChild(svg);
  }

  /* ---------------- Franja de umbral (bullet / niveles I·II·III) ---------------- */
  function renderBulletThreshold(host, d) {
    const items = d.items;
    const zoneColors = d.zones || { I: "#D12E1C", II: "#EDD121", III: "#3B7359" };
    const rows = items.map(it => {
      const level = it.value < 60 ? "I" : it.value <= 80 ? "II" : "III";
      return `<div style="margin:.55cqw 0;">
        <div style="display:flex;justify-content:space-between;font-family:var(--f-sans);font-size:1.05cqw;margin-bottom:.25cqw;">
          <span>${it.label}</span><span style="font-weight:700;font-variant-numeric:tabular-nums;">${it.display} · Nivel ${level}</span>
        </div>
        <div style="position:relative;height:.85cqw;border-radius:2px;overflow:hidden;display:flex;">
          <div style="width:60%;background:${zoneColors.I}33"></div>
          <div style="width:20%;background:${zoneColors.II}33"></div>
          <div style="width:20%;background:${zoneColors.III}33"></div>
          <div style="position:absolute;top:-.25cqw;left:calc(${it.value}% - .1cqw);width:.22cqw;height:1.35cqw;border-radius:2px;background:${zoneColors[level]};"></div>
        </div>
      </div>`;
    }).join("");
    host.innerHTML = `<div style="height:100%;display:flex;flex-direction:column;justify-content:flex-end;">${rows}
      <div style="font-family:var(--f-mono);font-size:.8cqw;opacity:.55;margin-top:.5cqw;text-transform:uppercase;letter-spacing:.04em;">
        Fondo — rojo &lt;60% (Nivel I) · amarillo 60–80% (Nivel II) · verde &gt;80% (Nivel III)
      </div></div>`;
  }

  /* ---------------- Ranking de barras (HTML, forma simple de comparación) ---------------- */
  function renderRankedBars(host, d) {
    const items = d.items;
    const max = Math.max(...items.map(it => it.value));
    // el track (tenue) y el relleno (sólido) van como capas hermanas, nunca
    // anidadas — un opacity en el padre bajaría también la opacidad del hijo.
    host.innerHTML = items.map(it => `
      <div style="display:grid;grid-template-columns:minmax(6cqw,13cqw) 1fr auto;align-items:center;gap:.8cqw;padding:.35cqw 0;">
        <div style="font-size:1.05cqw;font-family:var(--f-sans);">${it.label}</div>
        <div style="position:relative;height:1cqw;border-radius:2px;overflow:hidden;">
          <div style="position:absolute;inset:0;background:currentColor;opacity:.12;"></div>
          <div style="position:absolute;inset:0;width:${Math.max(2, it.value / max * 100)}%;background:${it.color || "#FF6C53"};border-radius:2px;"></div>
        </div>
        <div style="font-size:1.05cqw;font-weight:700;font-variant-numeric:tabular-nums;min-width:5ch;text-align:right;">${it.display}</div>
      </div>`).join("");
  }

  /* ---------------- Tarjetas (tríada cualitativa) ---------------- */
  function renderCards(host, d) {
    host.innerHTML = `<div style="display:grid;grid-template-columns:repeat(${d.cards.length},1fr);gap:1.4cqw;height:100%;align-items:end;">` +
      d.cards.map(c => `<div style="border-top:2px solid currentColor;padding-top:1cqw;">
        <b style="display:block;font-family:var(--f-faaad);font-size:1.7cqw;margin-bottom:.5cqw;">${c.t}</b>
        <span style="font-size:1.05cqw;line-height:1.35;opacity:.82;font-family:var(--f-sans);">${c.d}</span>
      </div>`).join("") + `</div>`;
  }

  const RENDERERS = {
    pictogram: renderPictogram, ring: renderRing, swarm: renderSwarm,
    burst: renderBurst, band: renderBand, bulletThreshold: renderBulletThreshold,
    cards: renderCards, rankedBars: renderRankedBars,
  };
  const FORM_LABEL = {
    pictogram: "Pictograma", ring: "Anillo", swarm: "Enjambre de puntos",
    burst: "Estallido radial", band: "Banda 100%", bulletThreshold: "Franja de umbral",
    cards: "Tarjetas", rankedBars: "Ranking de barras",
  };

  /* ---------------- Render + selector de forma por gráfico ----------------
     Cada mount trae TODAS sus formas alternativas en data-variants (una
     misma cifra, varias maneras de dibujarla) y data-form dice cuál está
     activa. Cambiar de forma es solo volver a llamar al renderer con los
     datos de esa variante — no hay estado que migrar entre formas. */
  function renderForm(host, formKey) {
    const data = host._variants && host._variants[formKey];
    const fn = RENDERERS[formKey];
    if (!fn || !data) return;
    host.dataset.form = formKey;
    fn(host, data);
  }

  function initCharts() {
    document.querySelectorAll(".gc-chart[data-form]").forEach(host => {
      let variants = {};
      try { variants = JSON.parse(host.dataset.variants || "{}"); } catch (e) { console.error("gc-chart data-variants inválido en", host.id || host.dataset.label, e); }
      host._variants = variants;
      renderForm(host, host.dataset.form);
    });
    initPicker();
    window.GCCharts = { renderForm, render: (host, formKey, data) => { const fn = RENDERERS[formKey]; if (!fn) return false; host.dataset.form = formKey; fn(host, data); return true; }, FORM_LABEL, register: (key, label, fn) => { RENDERERS[key] = fn; FORM_LABEL[key] = label; }, ready: true };
    document.dispatchEvent(new Event("gc:charts-ready"));
  }

  /* ---------------- Panel "Tipo de gráfico" (sidebar) ----------------
     Sigue al slide activo (mismo criterio de visibilidad que la navegación
     del editor: el slide más visible en el área de preview) y ofrece un
     chip por cada forma disponible de cada gráfico de ese slide. */
  function initPicker() {
    const panel = document.getElementById("gc-chart-picker");
    const previewArea = document.getElementById("ed-preview-area");
    if (!panel || !previewArea) return;

    function paintPanel(slide) {
      panel.innerHTML = "";
      const mounts = slide ? Array.from(slide.querySelectorAll(".gc-chart")) : [];
      const withChoices = mounts.filter(m => Object.keys(m._variants || {}).length > 1);
      if (!withChoices.length) {
        const p = document.createElement("p");
        p.className = "ed-hint";
        p.textContent = "Este slide no tiene un gráfico con formas alternativas.";
        panel.appendChild(p);
        return;
      }
      withChoices.forEach(mount => {
        const group = document.createElement("div");
        group.className = "ed-sub-group";
        const label = document.createElement("p");
        label.className = "ed-sub-label";
        label.textContent = mount.dataset.label || "Gráfico";
        group.appendChild(label);
        const row = document.createElement("div");
        row.className = "ed-chip-row";
        Object.keys(mount._variants).forEach(formKey => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "ed-chip" + (formKey === mount.dataset.form ? " is-active" : "");
          chip.textContent = FORM_LABEL[formKey] || formKey;
          chip.addEventListener("click", () => {
            renderForm(mount, formKey);
            paintPanel(slide); // repinta para mover el estado "activo" del chip
          });
          row.appendChild(chip);
        });
        group.appendChild(row);
        panel.appendChild(group);
      });
    }

    // mismo cuidado que en app.js: se guarda el ratio por slide y se busca
    // el máximo sobre TODOS los slides conocidos, no solo los que trajo
    // este callback puntual (si no, el panel queda mostrando el slide
    // equivocado apenas se hace scroll).
    let current = null;
    const ratios = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
      let bestEl = null, bestRatio = -1;
      ratios.forEach((r, el) => { if (r > bestRatio) { bestRatio = r; bestEl = el; } });
      if (bestEl && bestEl !== current) { current = bestEl; paintPanel(current); }
    }, { root: previewArea, threshold: [0.25, 0.5, 0.75] });
    document.querySelectorAll(".slide").forEach(s => io.observe(s));

    paintPanel(document.querySelector(".slide"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCharts);
  else initCharts();
})();
