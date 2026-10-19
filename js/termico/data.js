/* ==========================================================================
   FaAADudp — Encuesta cohorte, Escuela de Diseño UDP: capa de datos (sin UI, sin dibujo).
   Lee TODAS las pestañas de año del Sheet y arma, por pregunta, un "perfil"
   (qué forma de dato es: una cifra, categorías de una respuesta, categorías
   de respuesta múltiple…) y, si la pregunta se repite, su serie entre años.
   No dibuja ni decide formas: solo entrega datos.
   ========================================================================== */
(function () {
  "use strict";
  const L = window.TermicoSheet;
  const CUR = new Date().getFullYear();
  const CANDIDATES = []; for (let y = 2023; y <= CUR + 3; y++) CANDIDATES.push(String(y));
  const r2 = x => Math.round(x * 100) / 100;

  function groupQuestions(rows) {
    const map = new Map();
    rows.forEach(r => {
      if (!map.has(r.pregunta)) map.set(r.pregunta, { pregunta: r.pregunta, familia: r.familia, base: (r.pregunta_base || "").trim() || r.pregunta, rows: [] });
      map.get(r.pregunta).rows.push(r);
    });
    return [...map.values()];
  }
  const baseOf = x => x.base || x.pregunta;

  /* Perfil de una pregunta: qué tipo de dato trae.
     value  → una sola cifra (nada que agrupar: tratamiento "cifra única")
     single/partial/multi/counts → 2+ categorías numéricas (tratamiento "conjunto de categorías")
     mixed/empty → sin números limpios (cualitativo) */
  function profile(q) {
    // base: con qué se empareja esta opción entre años (categoria_base del Sheet, o el mismo nombre)
    const items = q.rows.map(r => ({ label: r.categoria || "", base: r.categoria_base || r.categoria || "", v: r.valor, n: r.n, ntot: r.ntot, unidad: r.unidad, nota: r.nota }));
    const isPct = items.some(i => i.unidad === "%");
    const numeric = isPct ? items.filter(i => i.v != null) : items.filter(i => i.n != null || i.v != null);
    const sumV = r2(numeric.reduce((a, i) => a + (isPct ? i.v : 0), 0));
    const nts = items.map(i => i.ntot).filter(x => x != null);
    const N = nts.length ? Math.max(...nts) : null;
    const units = new Set(numeric.map(i => i.unidad || ""));
    let kind;
    if (!numeric.length) kind = "empty";
    else if (units.size > 1) kind = "mixed";
    else if (numeric.length === 1) kind = "value";
    else if (isPct) kind = sumV > 105 ? "multi" : sumV >= 95 ? "single" : "partial";
    else kind = "counts";
    return { q, items, numeric, isPct, sumV, N, kind };
  }
  const val = (P, i) => P.isPct ? i.v : (i.n != null ? i.n : i.v);

  const Datos = {
    years: [], data: {},

    async loadAll() {
      let decoy = null;
      try { decoy = JSON.stringify(await L.loadTab(window.GC_CONFIG, "__pestana_inexistente__")); } catch (e) { /* sin señuelo */ }
      const res = await Promise.all(CANDIDATES.map(async y => {
        try { return [y, await L.loadTab(window.GC_CONFIG, y)]; } catch (e) { return [y, null]; }
      }));
      this.data = {}; this.years = [];
      res.forEach(([y, rows]) => {
        if (!rows || !rows.length) return;
        if (decoy && JSON.stringify(rows) === decoy) return;
        this.data[y] = groupQuestions(rows); this.years.push(y);
      });
      return this.years.length > 0;
    },

    profile, baseOf, val,

    relatedYears(q) {
      const key = baseOf(q);
      return this.years.filter(y => (this.data[y] || []).some(x => baseOf(x) === key));
    },

    /* Misma pregunta (o su "base") en 2+ años, con categorías que de verdad calzan. Las opciones se
       emparejan por su base (categoria_base del Sheet) y se muestran con el nombre del año que se mira. */
    yearSeries(P) {
      const key = baseOf(P.q);
      const yrs = this.years.filter(y => (this.data[y] || []).some(x => baseOf(x) === key));
      if (yrs.length < 2) return null;
      const profs = yrs.map(y => profile(this.data[y].find(x => baseOf(x) === key)));
      if (profs.some(pp => pp.kind === "empty" || pp.kind === "mixed" || pp.isPct !== P.isPct)) return null;
      const cats = [], shown = {};
      P.numeric.forEach(i => { shown[i.base] = i.label; });
      profs.forEach(pp => pp.numeric.forEach(i => { if (!cats.includes(i.base)) cats.push(i.base); if (!shown[i.base]) shown[i.base] = i.label; }));
      const series = cats.map(c => ({ label: shown[c], values: profs.map(pp => { const it = pp.numeric.find(i => i.base === c); return it ? val(pp, it) : null; }) }))
        .filter(z => z.values.filter(v => v != null).length >= 2);
      if (!series.length) return null;
      const keep = yrs.map((_, i) => series.some(z => z.values[i] != null));
      if (keep.filter(Boolean).length < 2) return null;
      series.forEach(z => { z.values = z.values.filter((_, i) => keep[i]); });
      return { years: yrs.filter((_, i) => keep[i]), series };
    },
  };

  window.DatosEncuesta = Datos;
})();
