/* ==========================================================================
   Qué celdas del Sheet alimentan cada gráfico.
   Clave = data-label del gráfico en index.html. Los elementos de `items` se
   emparejan por POSICIÓN con los elementos de cada forma (mismo orden que en
   el HTML); las etiquetas y los colores siguen siendo del HTML.

   Un elemento puede ser:
     "Categoría"                       una fila (columna categoria)
     ["A","B"]                         suma de varias filas
     {q:"…", cat:"…"}                  otra pregunta distinta a la del gráfico
     {q:"…", rango:"Acertado"}         suma de las filas con ese rango_logro
     {rest:true, fmt:"≈{v}%"}          lo que falta para 100% (o para el total)
   Formato: {v} valor %, {v0} sin decimales, {n} n_absoluto, {lvl} nivel I/II/III.
   Un gráfico que no aparece aquí (Motivación) queda con los valores del HTML.
   ========================================================================== */
window.GC_BINDINGS = {
  tab: "2026",
  charts: {
    "Cobertura del estudio": {
      q: "Universo de respuestas",
      total: { cat: "Matriculados válidos" },
      items: ["Tasa de respuesta", { rest: true }],
      fmt: { band: "{n}" },
      stat: { cat: "Tasa de respuesta", fmt: "{v0}%" },
    },
    "Edad": {
      q: "Distribución etaria",
      stat: { cat: "Rango estándar de ingreso", fmt: "{v}%" },
      variants: {
        ring: { pct: "Rango estándar de ingreso", satellites: [null, { cat: "Más de 24 años", note: "{v}% · {n} estudiantes" }] },
        band: { items: ["Rango estándar de ingreso", { rest: true, fmt: "grupo menor" }, "Más de 24 años"] },
      },
    },
    "Estudios previos": {
      q: "Estudios previos",
      items: ["Sin estudios previos", { cat: "Con estudios previos, otra área", fmt: "≈{v}%" }, "Estudios previos en Diseño"],
      stat: { cat: "Sin estudios previos", fmt: "{v}%" },
    },
    "Género": {
      q: "Identidad de género",
      items: ["Mujer", "Hombre", { cat: "No conforme", fmt: "≈{v}%" }],
      fmt: { swarm: "{v}%" },
      stat: { cat: "Mujer", fmt: "{v}%" },
    },
    "Vía de contacto": {
      q: "Vía de contacto con la Escuela",
      items: ["Familiar/amigx/conocidx", "Redes sociales", "Sitio web institucional", "Feria carreras UDP", "Feria universidades", "Visita UDP → colegio", "Visita colegio → UDP", "Prensa"],
      fmt: { rankedBars: "{n} · {v}%" },
      stat: { cat: "Familiar/amigx/conocidx", fmt: "{v}%" },
    },
    "Experiencias de aprendizaje": {
      q: "Experiencias de aprendizaje escolar (pregunta nueva 2026)",
      items: ["Trabajar en equipo", "Investigación", "Clases expositivas", "Crear proyectos", "Maquetas/prototipos", "Combinar disciplinas", "Generar ideas", "Ninguna"],
      fmt: { rankedBars: "{n} · {v}%" },
      stat: { cat: "Trabajar en equipo", fmt: "{v}%" },
    },
    "Observación y abstracción": {
      items: [
        { q: "Sección 2 · Promedio general del ámbito", cat: "—" },
        { q: "Sección 2 · P1 Organización espacial de las formas", rango: "Acertado" },
        { q: "Sección 2 · P2 Forma y concepto (colaboración)", rango: "Acertado" },
        { q: "Sección 2 · P3 Síntesis visual (ojo humano)", rango: "Acertado" },
        { q: "Sección 2 · P4 Comprensión sistémica (bicicleta, concepto)", rango: "Acertado" },
      ],
      stat: { q: "Sección 2 · Promedio general del ámbito", cat: "—", fmt: "{v}%" },
      variants: { rankedBars: { fmt: "{v}% · Nivel {lvl}", levelColor: true } },
    },
    "Manejo de técnicas": {
      q: "Sección 4 · Manejo de técnicas",
      items: ["Tradicionales", "Especializadas", "Ninguna"],
      metric: { rankedBars: "n" },
      fmt: { rankedBars: "{n}", swarm: false },
      stat: { cat: ["Tradicionales", "Especializadas"], fmt: "{n}" },
    },
    "Herramientas digitales": {
      q: "Sección 4 · Herramientas digitales",
      items: [
        { cat: "Diseño (32 especializadas dentro del total)", core: { q: "Sección 4 · Manejo de técnicas", cat: "Especializadas" } },
        "Productividad", "Inteligencia artificial", "Colaborativo", "Ninguna",
      ],
      metric: { rankedBars: "n" },
      fmt: { rankedBars: "{n}", swarm: false },
      stat: { cat: ["Diseño (32 especializadas dentro del total)", "Productividad", "Inteligencia artificial", "Colaborativo"], fmt: "{n}" },
    },
    "Caso 1 · Colaborativo": {
      q: "Sección 5 · Caso 1 Trabajo colaborativo",
      items: ["A — Coordina y organiza", { rest: true, fmt: "≈{v}%" }],
    },
    "Caso 2 · Retroalimentación": {
      q: "Sección 5 · Caso 2 Retroalimentación",
      items: [["A — Integración equilibrada", "B — Criterio propio predominante"], "D — Alta apertura/ajuste", "C — Busca mayor claridad antes de actuar"],
    },
    "Caso 3 · Organización": {
      q: "Sección 5 · Caso 3 Organización del estudio",
      items: ["A — Planificación distribuida", "D — Prioriza por urgencia", { rest: true, fmt: "≈{v}%" }],
      stat: { cat: "A — Planificación distribuida", fmt: "{v}%" },
    },
  },
};
