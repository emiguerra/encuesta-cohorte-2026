/* ==========================================================================
   FaAADudp — Comentarios tipo Drive dentro del dashboard.
   Los comentarios se anclan a un gráfico (año + «metrica», la etiqueta interna).
   LEER es público (gviz CSV de la pestaña COMENTARIOS). ESCRIBIR va por un Google
   Apps Script desplegado como "aplicación web" (ver comentarios.gs). Como el POST
   es cross-origin sin CORS, se envía en modo no-cors (respuesta opaca) y la UI es
   optimista: el comentario aparece al instante y luego se reconcilia releyendo.
   ========================================================================== */
(function () {
  "use strict";
  const cfg = window.GC_CONFIG || {};
  const TAB = cfg.commentsTab || "COMENTARIOS";
  const key = (y, m) => `${y}||${m}`;
  const el = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  let all = [];                 // todos los comentarios
  let byChart = new Map();      // "anio||metrica" -> [comentarios]
  let cur = null;               // { year, metrica, enun, forma }
  let panel, listBox, titleBox, composer;

  /* ---------- nombre del autor (por navegador) ---------- */
  function getAuthor() { try { return localStorage.getItem("faaad_coment_autor") || ""; } catch (e) { return ""; } }
  function setAuthor(a) { try { localStorage.setItem("faaad_coment_autor", a); } catch (e) {} }
  function ensureAuthor() {
    let a = getAuthor();
    if (!a) { a = (window.prompt("¿Cómo te llamas? (aparecerá junto a tus comentarios)", "") || "").trim(); if (a) setAuthor(a); }
    return a || null;
  }

  /* ---------- CSV (RFC 4180) ---------- */
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

  /* ---------- leer (gviz público) ---------- */
  async function load() {
    if (!cfg.sheetId) return;
    const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(TAB)}&_=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const t = await res.text();
      if (/^\s*</.test(t)) return;        // no público / página de acceso
      const rows = parseCSV(t); if (!rows.length) return;
      const h = rows[0].map(s => s.trim()); const ix = k => h.indexOf(k);
      const I = { id: ix("id"), fecha: ix("fecha"), autor: ix("autor"), anio: ix("anio"), metrica: ix("metrica"), forma: ix("forma"), texto: ix("texto"), parent: ix("parent"), estado: ix("estado") };
      if (I.texto < 0 || I.metrica < 0) return;
      const fromSheet = rows.slice(1)
        .filter(r => (r[I.id] || "").trim() !== "")
        .map(r => ({
          id: (r[I.id] || "").trim(), fecha: (r[I.fecha] || "").trim(), autor: (r[I.autor] || "").trim(),
          anio: (r[I.anio] || "").trim(), metrica: (r[I.metrica] || "").trim(), forma: (r[I.forma] || "").trim(),
          texto: (r[I.texto] || "").trim(), parent: (r[I.parent] || "").trim(), estado: (r[I.estado] || "").trim() || "Abierto",
        }));
      // conserva comentarios optimistas que el Sheet todavía no refleja
      const seen = new Set(fromSheet.map(c => c.id));
      const pending = all.filter(c => c._pending && !seen.has(c.id));
      all = fromSheet.concat(pending);
      reindex(); if (panel && !panel.hidden) renderThreads(); decorateGallery(); updateButton();
    } catch (e) { console.warn("[comentarios] load", e); }
  }
  function reindex() {
    byChart = new Map();
    all.forEach(c => { const k = key(c.anio, c.metrica); if (!byChart.has(k)) byChart.set(k, []); byChart.get(k).push(c); });
  }
  const openRoots = (y, m) => (byChart.get(key(y, m)) || []).filter(c => !c.parent && c.estado !== "Resuelto").length;
  const totalRoots = (y, m) => (byChart.get(key(y, m)) || []).filter(c => !c.parent).length;

  /* ---------- escribir (Apps Script, no-cors) ---------- */
  async function post(payload) {
    if (!cfg.commentsUrl) { alert("Falta configurar el endpoint de comentarios (commentsUrl en js/termico/config.js)."); return false; }
    try {
      await fetch(cfg.commentsUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ token: cfg.commentsToken || "" }, payload)) });
      return true;
    } catch (e) { console.warn("[comentarios] post", e); alert("No se pudo guardar el comentario. Revisa la conexión."); return false; }
  }
  function reconcile() { setTimeout(load, 2500); setTimeout(load, 7000); }

  async function addComment(texto, parent) {
    texto = (texto || "").trim(); if (!texto || !cur) return;
    const autor = ensureAuthor(); if (!autor) return;
    const id = "c" + Date.now() + Math.floor(Math.random() * 1e4);
    const c = { id, fecha: new Date().toISOString(), autor, anio: cur.year, metrica: cur.metrica, forma: cur.forma || "", texto, parent: parent || "", estado: "Abierto", _pending: true };
    all.push(c); reindex(); renderThreads(); decorateGallery(); updateButton();   // optimista
    const ok = await post({ action: "add", id, autor, anio: c.anio, metrica: c.metrica, forma: c.forma, texto, parent: c.parent });
    if (ok) reconcile();
  }
  async function setEstado(id, estado) {
    const c = all.find(x => x.id === id); if (c) { c.estado = estado; c._pending = true; }
    reindex(); renderThreads(); decorateGallery(); updateButton();
    const ok = await post({ action: "resolve", id, estado });
    if (ok) reconcile();
  }

  /* ---------- UI: panel lateral ---------- */
  function buildPanel() {
    panel = el("aside", "tm-cpanel"); panel.hidden = true; panel.setAttribute("aria-label", "Comentarios");
    const head = el("div", "tm-cpanel-head");
    titleBox = el("div", "tm-cpanel-title");
    const x = el("button", "tm-cpanel-x", "✕"); x.type = "button"; x.title = "Cerrar"; x.addEventListener("click", () => toggle(false));
    head.append(titleBox, x);
    listBox = el("div", "tm-cpanel-list");
    composer = el("div", "tm-cpanel-composer");
    const ta = el("textarea"); ta.placeholder = "Escribe un comentario sobre este gráfico…"; ta.rows = 3;
    const row = el("div", "tm-cpanel-crow");
    const who = el("button", "tm-clink"); who.type = "button"; who.addEventListener("click", () => { const a = (window.prompt("Tu nombre:", getAuthor()) || "").trim(); if (a) { setAuthor(a); refreshWho(); } });
    const send = el("button", "tm-btn tm-csend", "Comentar"); send.type = "button";
    send.addEventListener("click", () => { if (ta.value.trim()) { addComment(ta.value); ta.value = ""; } });
    row.append(who, send); composer.append(ta, row);
    panel.append(head, listBox, composer);
    document.body.appendChild(panel);
    panel._who = who; refreshWho();
  }
  function refreshWho() { const a = getAuthor(); panel._who.textContent = a ? `Comentas como ${a} ✎` : "Poner mi nombre ✎"; }

  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }); };

  function commentCard(c, isReply) {
    const box = el("div", "tm-c" + (isReply ? " tm-c-reply" : "") + (c.estado === "Resuelto" ? " tm-c-done" : ""));
    const meta = el("div", "tm-c-meta");
    meta.append(el("b", null, c.autor || "—"), el("span", "tm-c-date", fmtDate(c.fecha)));
    if (!isReply && c.estado === "Resuelto") meta.append(el("span", "tm-c-chip", "Resuelto"));
    box.append(meta, el("div", "tm-c-text", c.texto));
    const acts = el("div", "tm-c-acts");
    if (!isReply) {
      const rep = el("button", "tm-clink", "Responder"); rep.type = "button";
      rep.addEventListener("click", () => openReply(box, c.id));
      acts.append(rep);
      const res = el("button", "tm-clink", c.estado === "Resuelto" ? "Reabrir" : "Resolver"); res.type = "button";
      res.addEventListener("click", () => setEstado(c.id, c.estado === "Resuelto" ? "Abierto" : "Resuelto"));
      acts.append(res);
    }
    box.append(acts);
    return box;
  }
  function openReply(afterBox, parentId) {
    if (afterBox.querySelector(".tm-c-replybox")) return;
    const rb = el("div", "tm-c-replybox");
    const ta = el("textarea"); ta.rows = 2; ta.placeholder = "Responder…";
    const b = el("button", "tm-btn tm-csend", "Responder"); b.type = "button";
    b.addEventListener("click", () => { if (ta.value.trim()) { addComment(ta.value, parentId); rb.remove(); } });
    rb.append(ta, b); afterBox.append(rb); ta.focus();
  }

  function renderThreads() {
    if (!listBox) return;
    titleBox.textContent = cur ? `${cur.metrica} · ${cur.year}` : "Comentarios";
    listBox.replaceChildren();
    if (!cur) { listBox.append(el("p", "tm-cpanel-hint", "Abre un gráfico para comentarlo.")); return; }
    const list = (byChart.get(key(cur.year, cur.metrica)) || []);
    const roots = list.filter(c => !c.parent).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    if (!roots.length) { listBox.append(el("p", "tm-cpanel-hint", "Sin comentarios todavía. Sé la primera en dejar uno 👇")); }
    roots.forEach(r => {
      const thread = el("div", "tm-c-thread");
      thread.append(commentCard(r, false));
      list.filter(c => c.parent === r.id).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
        .forEach(rep => thread.append(commentCard(rep, true)));
      listBox.append(thread);
    });
  }

  function toggle(force) {
    if (!panel) return;
    const show = force == null ? panel.hidden : force;
    panel.hidden = !show;
    document.body.classList.toggle("cpanel-open", show);
    const btn = document.getElementById("tm-comments"); if (btn) btn.setAttribute("aria-pressed", String(show));
    if (show) { renderThreads(); load(); }
  }

  /* ---------- badges en galería y botón del editor ---------- */
  function decorateGallery() {
    document.querySelectorAll(".tm-card .tm-thumb[data-year][data-q]").forEach(th => {
      const card = th.closest(".tm-card"); if (!card) return;
      const n = totalRoots(th.dataset.year, th.dataset.q), open = openRoots(th.dataset.year, th.dataset.q);
      let b = card.querySelector(".tm-card-cbadge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = el("span", "tm-card-cbadge"); th.appendChild(b); }
      b.textContent = "💬 " + n;
      b.classList.toggle("has-open", open > 0);
      b.title = open ? `${open} comentario(s) sin resolver` : "Comentarios resueltos";
    });
  }
  function updateButton() {
    const btn = document.getElementById("tm-comments"); if (!btn || !cur) return;
    const n = totalRoots(cur.year, cur.metrica), open = openRoots(cur.year, cur.metrica);
    btn.textContent = n ? `💬 Comentarios (${n})` : "💬 Comentarios";
    btn.classList.toggle("has-open", open > 0);
  }

  /* ---------- API para app.js ---------- */
  function onChart(year, metrica, enun, forma) {
    cur = { year: String(year), metrica: String(metrica), enun: enun || "", forma: forma || "" };
    updateButton(); if (panel && !panel.hidden) renderThreads();
  }

  window.Comentarios = { onChart, decorateGallery, load, toggle: () => toggle() };

  document.addEventListener("DOMContentLoaded", () => {
    buildPanel();
    const btn = document.getElementById("tm-comments");
    if (btn) btn.addEventListener("click", () => toggle());
    load();
    setInterval(load, 60000);   // refresco suave cada minuto
  });
})();
