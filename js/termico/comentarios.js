/* ==========================================================================
   FaAADudp — Comentarios tipo Drive dentro del dashboard.
   Los comentarios se anclan a un gráfico (año + «metrica») y, opcionalmente, a un
   PUNTO del gráfico (clic → pin). El punto se guarda codificado en el campo «forma»
   como "<forma>@<x>,<y>" (x,y normalizados 0..1), así NO hay que cambiar el Apps
   Script ni las columnas del Sheet.
   LEER es público (gviz CSV de la pestaña COMENTARIOS). ESCRIBIR va por un Apps
   Script (web app) en modo no-cors (respuesta opaca) → UI optimista + reconciliación.
   ========================================================================== */
(function () {
  "use strict";
  const cfg = window.GC_CONFIG || {};
  const TAB = cfg.commentsTab || "COMENTARIOS";
  const key = (y, m) => `${y}||${m}`;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  let all = [];                 // todos los comentarios
  let byChart = new Map();      // "anio||metrica" -> [comentarios]
  let cur = null;               // { year, metrica, enun, forma }
  let panel, listBox, titleBox, composer, anchorBtn, ta;
  let pinsLayer, canvas, wrap;
  let pending = null;           // punto pendiente {x,y} mientras se redacta
  let placing = false;          // true = esperando clic en el gráfico

  /* ---------- autor ---------- */
  function getAuthor() { try { return localStorage.getItem("faaad_coment_autor") || ""; } catch (e) { return ""; } }
  function setAuthor(a) { try { localStorage.setItem("faaad_coment_autor", a); } catch (e) {} }
  function ensureAuthor() {
    let a = getAuthor();
    if (!a) { a = (window.prompt("¿Cómo te llamas? (aparecerá junto a tus comentarios)", "") || "").trim(); if (a) setAuthor(a); }
    return a || null;
  }

  /* ---------- anchor codificado en «forma» ---------- */
  function parseForma(raw) {
    raw = raw || ""; const at = raw.indexOf("@");
    if (at < 0) return { form: raw, x: null, y: null };
    const xy = raw.slice(at + 1).split(","); const x = parseFloat(xy[0]), y = parseFloat(xy[1]);
    return { form: raw.slice(0, at), x: isNaN(x) ? null : x, y: isNaN(y) ? null : y };
  }
  const encodeForma = (form, p) => p ? `${form || ""}@${p.x.toFixed(4)},${p.y.toFixed(4)}` : (form || "");

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* ---------- leer (gviz) ---------- */
  async function load() {
    if (!cfg.sheetId) return;
    const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(TAB)}&_=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: "no-store" }); if (!res.ok) return;
      const t = await res.text(); if (/^\s*</.test(t)) return;
      const rows = parseCSV(t); if (!rows.length) return;
      const h = rows[0].map(s => s.trim()); const ix = k => h.indexOf(k);
      const I = { id: ix("id"), fecha: ix("fecha"), autor: ix("autor"), anio: ix("anio"), metrica: ix("metrica"), forma: ix("forma"), texto: ix("texto"), parent: ix("parent"), estado: ix("estado") };
      if (I.texto < 0 || I.metrica < 0) return;
      const fromSheet = rows.slice(1).filter(r => (r[I.id] || "").trim() !== "").map(r => {
        const f = parseForma((r[I.forma] || "").trim());
        return {
          id: (r[I.id] || "").trim(), fecha: (r[I.fecha] || "").trim(), autor: (r[I.autor] || "").trim(),
          anio: (r[I.anio] || "").trim(), metrica: (r[I.metrica] || "").trim(), forma: f.form, ax: f.x, ay: f.y,
          texto: (r[I.texto] || "").trim(), parent: (r[I.parent] || "").trim(), estado: (r[I.estado] || "").trim() || "Abierto",
        };
      });
      const seen = new Set(fromSheet.map(c => c.id));
      const kept = all.filter(c => c._pending && !seen.has(c.id));
      all = fromSheet.concat(kept);
      reindex(); if (panel && !panel.hidden) renderThreads(); renderPins(); decorateGallery(); updateButton();
    } catch (e) { console.warn("[comentarios] load", e); }
  }
  function reindex() { byChart = new Map(); all.forEach(c => { const k = key(c.anio, c.metrica); if (!byChart.has(k)) byChart.set(k, []); byChart.get(k).push(c); }); }
  const rootsOf = (y, m) => (byChart.get(key(y, m)) || []).filter(c => !c.parent).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const openRoots = (y, m) => rootsOf(y, m).filter(c => c.estado !== "Resuelto").length;
  const totalRoots = (y, m) => rootsOf(y, m).length;

  /* ---------- escribir ---------- */
  async function post(payload) {
    if (!cfg.commentsUrl) { alert("Falta configurar el endpoint de comentarios (commentsUrl en js/termico/config.js)."); return false; }
    try {
      await fetch(cfg.commentsUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ token: cfg.commentsToken || "" }, payload)) });
      return true;
    } catch (e) { console.warn("[comentarios] post", e); alert("No se pudo guardar el comentario."); return false; }
  }
  function reconcile() { setTimeout(load, 2500); setTimeout(load, 7000); }

  async function addComment(texto, parent) {
    texto = (texto || "").trim(); if (!texto || !cur) return;
    const autor = ensureAuthor(); if (!autor) return;
    const p = parent ? null : pending;                 // solo los raíz llevan punto
    const id = "c" + Date.now() + Math.floor(Math.random() * 1e4);
    const c = { id, fecha: new Date().toISOString(), autor, anio: cur.year, metrica: cur.metrica, forma: cur.forma || "",
      ax: p ? p.x : null, ay: p ? p.y : null, texto, parent: parent || "", estado: "Abierto", _pending: true };
    all.push(c); reindex();
    if (!parent) clearAnchor();
    renderThreads(); renderPins(); decorateGallery(); updateButton();
    const ok = await post({ action: "add", id, autor, anio: c.anio, metrica: c.metrica, forma: encodeForma(cur.forma, p), texto, parent: c.parent });
    if (ok) reconcile();
  }
  async function setEstado(id, estado) {
    const c = all.find(x => x.id === id); if (c) { c.estado = estado; c._pending = true; }
    reindex(); renderThreads(); renderPins(); decorateGallery(); updateButton();
    if (await post({ action: "resolve", id, estado })) reconcile();
  }

  /* ---------- anclaje a un punto ---------- */
  function clearAnchor() { pending = null; placing = false; if (anchorBtn) syncAnchorBtn(); renderPins(); }
  function syncAnchorBtn() {
    if (!anchorBtn) return;
    anchorBtn.setAttribute("aria-pressed", String(placing || !!pending));
    anchorBtn.textContent = pending ? "📍 Punto fijado · quitar" : placing ? "📍 Haz clic en el gráfico…" : "📍 Anclar a un punto";
  }
  function onCanvasClick(e) {
    if (!placing || !canvas) return;
    const r = canvas.getBoundingClientRect();
    pending = { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
    placing = false; syncAnchorBtn(); renderPins();
  }

  /* ---------- pins sobre el lienzo ---------- */
  function ensurePinsLayer() {
    wrap = wrap || document.getElementById("tm-wrap");
    canvas = canvas || document.getElementById("tm-out");
    if (wrap && !pinsLayer) {
      pinsLayer = el("div", "tm-cpins"); wrap.appendChild(pinsLayer);
      if (window.ResizeObserver) new ResizeObserver(reposition).observe(canvas || wrap);
      window.addEventListener("resize", reposition);
    }
  }
  function renderPins() {
    ensurePinsLayer(); if (!pinsLayer) return;
    pinsLayer.replaceChildren();
    if (!cur || (panel && panel.hidden)) { reposition(); return; }   // los pins solo se ven con el panel abierto
    rootsOf(cur.year, cur.metrica).forEach((c, i) => {
      if (c.ax == null) return;
      const pin = el("button", "tm-cpin" + (c.estado === "Resuelto" ? " done" : "")); pin.type = "button";
      pin.dataset.id = c.id; pin.dataset.nx = c.ax; pin.dataset.ny = c.ay; pin.textContent = String(i + 1);
      pin.title = `${c.autor}: ${c.texto.slice(0, 60)}`;
      pin.addEventListener("click", () => { toggle(true); flashThread(c.id); });
      pinsLayer.appendChild(pin);
    });
    if (pending) { const m = el("div", "tm-cpin pending"); m.dataset.nx = pending.x; m.dataset.ny = pending.y; m.textContent = "＋"; pinsLayer.appendChild(m); }
    reposition();
  }
  function reposition() {
    if (!pinsLayer || !canvas || !wrap) return;
    const cr = canvas.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const ox = cr.left - wr.left, oy = cr.top - wr.top;
    pinsLayer.querySelectorAll("[data-nx]").forEach(p => {
      p.style.left = (ox + parseFloat(p.dataset.nx) * cr.width) + "px";
      p.style.top = (oy + parseFloat(p.dataset.ny) * cr.height) + "px";
    });
  }

  /* ---------- panel ---------- */
  function buildPanel() {
    panel = el("aside", "tm-cpanel"); panel.hidden = true; panel.setAttribute("aria-label", "Comentarios");
    const head = el("div", "tm-cpanel-head");
    titleBox = el("div", "tm-cpanel-title");
    const x = el("button", "tm-cpanel-x", "✕"); x.type = "button"; x.title = "Cerrar"; x.addEventListener("click", () => toggle(false));
    head.append(titleBox, x);
    listBox = el("div", "tm-cpanel-list");
    composer = el("div", "tm-cpanel-composer");
    ta = el("textarea"); ta.placeholder = "Escribe un comentario…"; ta.rows = 3;
    anchorBtn = el("button", "tm-clink tm-anchor"); anchorBtn.type = "button";
    anchorBtn.addEventListener("click", () => { if (pending) { clearAnchor(); } else { placing = !placing; syncAnchorBtn(); } });
    const row = el("div", "tm-cpanel-crow");
    const who = el("button", "tm-clink"); who.type = "button";
    who.addEventListener("click", () => { const a = (window.prompt("Tu nombre:", getAuthor()) || "").trim(); if (a) { setAuthor(a); refreshWho(); } });
    const send = el("button", "tm-btn tm-csend", "Comentar"); send.type = "button";
    send.addEventListener("click", () => { if (ta.value.trim()) { addComment(ta.value); ta.value = ""; } });
    row.append(who, send);
    composer.append(anchorBtn, ta, row);
    panel.append(head, listBox, composer);
    document.body.appendChild(panel);
    panel._who = who; refreshWho(); syncAnchorBtn();
  }
  function refreshWho() { const a = getAuthor(); panel._who.textContent = a ? `Comentas como ${a} ✎` : "Poner mi nombre ✎"; }
  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }); };

  function commentCard(c, isReply, num) {
    const box = el("div", "tm-c" + (isReply ? " tm-c-reply" : "") + (c.estado === "Resuelto" ? " tm-c-done" : ""));
    box.dataset.id = c.id;
    const meta = el("div", "tm-c-meta");
    if (!isReply && num != null) meta.append(el("span", "tm-c-num" + (c.ax != null ? " pinned" : ""), String(num)));
    meta.append(el("b", null, c.autor || "—"), el("span", "tm-c-date", fmtDate(c.fecha)));
    if (!isReply && c.ax != null) meta.append(el("span", "tm-c-pinchip", "📍 punto"));
    if (!isReply && c.estado === "Resuelto") meta.append(el("span", "tm-c-chip", "Resuelto"));
    box.append(meta, el("div", "tm-c-text", c.texto));
    const acts = el("div", "tm-c-acts");
    if (!isReply) {
      const rep = el("button", "tm-clink", "Responder"); rep.type = "button"; rep.addEventListener("click", () => openReply(box, c.id)); acts.append(rep);
      const res = el("button", "tm-clink", c.estado === "Resuelto" ? "Reabrir" : "Resolver"); res.type = "button";
      res.addEventListener("click", () => setEstado(c.id, c.estado === "Resuelto" ? "Abierto" : "Resuelto")); acts.append(res);
    }
    box.append(acts);
    return box;
  }
  function openReply(afterBox, parentId) {
    if (afterBox.querySelector(".tm-c-replybox")) return;
    const rb = el("div", "tm-c-replybox");
    const t = el("textarea"); t.rows = 2; t.placeholder = "Responder…";
    const b = el("button", "tm-btn tm-csend", "Responder"); b.type = "button";
    b.addEventListener("click", () => { if (t.value.trim()) { addComment(t.value, parentId); rb.remove(); } });
    rb.append(t, b); afterBox.append(rb); t.focus();
  }
  function renderThreads() {
    if (!listBox) return;
    titleBox.textContent = cur ? `${cur.metrica} · ${cur.year}` : "Comentarios";
    listBox.replaceChildren();
    if (!cur) { listBox.append(el("p", "tm-cpanel-hint", "Abre un gráfico para comentarlo.")); return; }
    const roots = rootsOf(cur.year, cur.metrica), list = byChart.get(key(cur.year, cur.metrica)) || [];
    listBox.append(el("p", "tm-cpanel-hint", "Tip: usa 📍 «Anclar a un punto» y haz clic en el gráfico para comentar un objeto específico."));
    if (!roots.length) listBox.append(el("p", "tm-cpanel-hint", "Sin comentarios todavía."));
    roots.forEach((r, i) => {
      const thread = el("div", "tm-c-thread"); thread.dataset.id = r.id;
      thread.append(commentCard(r, false, i + 1));
      list.filter(c => c.parent === r.id).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).forEach(rep => thread.append(commentCard(rep, true)));
      listBox.append(thread);
    });
  }
  function flashThread(id) {
    const node = listBox && listBox.querySelector(`.tm-c-thread[data-id="${id}"]`);
    if (node) { node.scrollIntoView({ block: "center", behavior: "smooth" }); node.classList.remove("flash"); void node.offsetWidth; node.classList.add("flash"); }
  }

  function toggle(force) {
    if (!panel) return;
    const show = force == null ? panel.hidden : force;
    panel.hidden = !show;
    document.body.classList.toggle("cpanel-open", show);
    const btn = document.getElementById("tm-comments"); if (btn) btn.setAttribute("aria-pressed", String(show));
    if (!show) { placing = false; }
    if (show) { renderThreads(); load(); }
    renderPins();
  }

  /* ---------- badges galería + botón ---------- */
  function decorateGallery() {
    document.querySelectorAll(".tm-card .tm-thumb[data-year][data-q]").forEach(th => {
      const card = th.closest(".tm-card"); if (!card) return;
      const n = totalRoots(th.dataset.year, th.dataset.q), open = openRoots(th.dataset.year, th.dataset.q);
      let b = card.querySelector(".tm-card-cbadge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = el("span", "tm-card-cbadge"); th.appendChild(b); }
      b.textContent = "💬 " + n; b.classList.toggle("has-open", open > 0);
    });
  }
  function updateButton() {
    const btn = document.getElementById("tm-comments"); if (!btn || !cur) return;
    const n = totalRoots(cur.year, cur.metrica), open = openRoots(cur.year, cur.metrica);
    btn.textContent = n ? `💬 Comentarios · ${n}` : "💬 Comentarios";
    btn.classList.toggle("has-open", open > 0);
  }

  /* ---------- API ---------- */
  function onChart(year, metrica, enun, forma) {
    cur = { year: String(year), metrica: String(metrica), enun: enun || "", forma: forma || "" };
    clearAnchor(); updateButton(); if (panel && !panel.hidden) renderThreads(); renderPins();
  }
  window.Comentarios = { onChart, decorateGallery, load, toggle: () => toggle(), reposition };

  document.addEventListener("DOMContentLoaded", () => {
    buildPanel(); ensurePinsLayer();
    canvas = document.getElementById("tm-out"); if (canvas) canvas.addEventListener("click", onCanvasClick);
    const btn = document.getElementById("tm-comments"); if (btn) btn.addEventListener("click", () => toggle());
    load(); setInterval(load, 60000);
  });
})();
