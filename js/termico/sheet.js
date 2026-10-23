/* ==========================================================================
   FaAADudp — Encuesta cohorte, Escuela de Diseño UDP: lectura del Google Sheet.
   Lee una pestaña de año del Sheet público (CSV vía gviz) y la convierte en
   filas. Las columnas se buscan por su título (fila 1), así que el orden y las
   columnas vacías de más que agrega gviz no importan.
   ========================================================================== */
(function () {
  "use strict";

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
    const col = { fam: ix("familia"), q: ix("pregunta"), cat: ix("categoria"), v: ix("valor"), u: ix("unidad"), n: ix("n_absoluto"), nt: ix("n_total_respuestas"), rg: ix("rango_logro"), nota: ix("nota"), base: ix("pregunta_base"), cbase: ix("categoria_base"), enun: ix("enunciado_original") };
    if (col.q < 0 || col.cat < 0 || col.v < 0) throw new Error("El Sheet no tiene las columnas pregunta/categoria/valor");
    return t.slice(1).filter(r => (r[col.q] || "").trim() !== "").map(r => ({
      familia: (r[col.fam] || "").trim(), pregunta: (r[col.q] || "").trim(), categoria: (r[col.cat] || "").trim(),
      valor: num(r[col.v]), unidad: (r[col.u] || "").trim(), n: num(r[col.n]), ntot: num(r[col.nt]),
      rango: (r[col.rg] || "").trim(), nota: (r[col.nota] || "").trim(),
      // columna opcional: liga preguntas con texto distinto entre años que miden lo mismo (ver bloque 4D del README del Sheet)
      pregunta_base: col.base < 0 ? "" : (r[col.base] || "").trim(),
      // columna opcional: liga opciones con nombre distinto entre años que son la misma respuesta (p. ej. «Ella» 2024 = «Mujer» 2026)
      categoria_base: col.cbase < 0 ? "" : (r[col.cbase] || "").trim(),
      // columna opcional: enunciado LITERAL de la pregunta tal como se le hizo al estudiante en el formulario de ese año
      enunciado_original: col.enun < 0 ? "" : (r[col.enun] || "").trim(),
    }));
  }

  /* ---------- Carga (con caché por pestaña y tiempo máximo de 8 s) ---------- */
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


  window.TermicoSheet = { loadTab, clearCache: () => Object.keys(cache).forEach(k => delete cache[k]) };
})();
