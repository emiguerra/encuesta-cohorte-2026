/* ==========================================================================
   EDITOR — Informe Encuesta Cohorte 2026
   Vanilla JS, sin frameworks. Patrón de toolbar+sidebar+lienzo tomado como
   referencia de PCD-graficas-2026 (github.com/matbutom/PCD-graficas-2026).
   El "lienzo" es el propio informe en HTML (#informe-root): editar =
   contenteditable sobre esos mismos nodos, no un modelo de datos aparte.
   ========================================================================== */

(() => {
  const root = document.getElementById("informe-root");
  const previewArea = document.getElementById("ed-preview-area");
  const statusEl = document.getElementById("ed-status");

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  let editMode = true;
  let activeSlideId = "slide-1";
  let dirty = false;

  /* ---------------------------------------------------------------- */
  /* Deshacer / rehacer (Ctrl+Z / Cmd+Z) — el contenteditable nativo    */
  /* del navegador no cubre acciones del editor (agregar/eliminar fila, */
  /* insertar gráficos, cambiar color), así que se maneja a mano con    */
  /* una pila de snapshots del HTML completo.                          */
  /* ---------------------------------------------------------------- */
  const HISTORY_LIMIT = 60;
  let undoStack = [];
  let redoStack = [];
  let typingSessionOpen = false;

  function pushHistory() {
    undoStack.push(root.innerHTML);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("btn-undo");
    const redoBtn = document.getElementById("btn-redo");
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  function undo() {
    if (undoStack.length === 0) {
      toast("Nada que deshacer", "error");
      return;
    }
    typingSessionOpen = false;
    redoStack.push(root.innerHTML);
    const html = undoStack.pop();
    restoreHTML(html);
    updateUndoRedoButtons();
    markDirty();
    toast("Deshecho", "success");
  }

  function redo() {
    if (redoStack.length === 0) {
      toast("Nada que rehacer", "error");
      return;
    }
    typingSessionOpen = false;
    undoStack.push(root.innerHTML);
    const html = redoStack.pop();
    restoreHTML(html);
    updateUndoRedoButtons();
    markDirty();
    toast("Rehecho", "success");
  }

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */
  function toast(msg, kind = "") {
    const box = document.getElementById("ed-toasts");
    const el = document.createElement("div");
    el.className = "ed-toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function markDirty() {
    dirty = true;
    statusEl.textContent = "cambios sin guardar";
  }
  function markClean(label) {
    dirty = false;
    statusEl.textContent = label;
  }

  /* ---------------------------------------------------------------- */
  /* Navegación de slides                                              */
  /* ---------------------------------------------------------------- */
  function buildNav() {
    const list = document.getElementById("ed-nav-list");
    const slides = $$(".slide", root);
    slides.forEach((slide, i) => {
      const item = document.createElement("button");
      item.className = "ed-nav-item";
      item.dataset.target = slide.id;
      item.innerHTML = `<span class="n">${String(i + 1).padStart(2, "0")}</span><span>${slide.dataset.slideTitle || slide.id}</span>`;
      item.addEventListener("click", () => {
        slide.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      list.appendChild(item);
    });
  }

  function setActiveSlide(id) {
    if (id === activeSlideId) return;
    activeSlideId = id;
    $$(".ed-nav-item").forEach((it) =>
      it.classList.toggle("is-active", it.dataset.target === id)
    );
    $$(".slide", root).forEach((s) =>
      s.classList.toggle("ed-slide-active", s.id === id)
    );
    updateBgSwatchHighlight();
  }

  let slideObserver = null;
  function observeSlides() {
    if (slideObserver) slideObserver.disconnect();
    const io = new IntersectionObserver(
      (entries) => {
        let best = null;
        entries.forEach((e) => {
          if (e.isIntersecting) {
            if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
          }
        });
        if (best) setActiveSlide(best.target.id);
      },
      { root: previewArea, threshold: [0.25, 0.5, 0.75] }
    );
    $$(".slide", root).forEach((s) => io.observe(s));
    slideObserver = io;
  }

  /* ---------------------------------------------------------------- */
  /* Fondo del slide activo (paleta fija FaAAD)                        */
  /* ---------------------------------------------------------------- */
  const BG_CLASSES = [
    "bg-negro", "bg-blanco", "bg-crema", "bg-amarillo", "bg-coral", "bg-rojo",
    "bg-verde", "bg-azul", "bg-verde-claro", "bg-amarillo-claro", "bg-azul-claro",
  ];

  function updateBgSwatchHighlight() {
    const slide = document.getElementById(activeSlideId);
    if (!slide) return;
    const current = BG_CLASSES.find((c) => slide.classList.contains(c));
    const currentGrad = slide.dataset.grad || null;
    $$(".ed-swatch").forEach((sw) => {
      const isActive = sw.dataset.bg
        ? sw.dataset.bg === current
        : sw.dataset.grad === currentGrad;
      sw.classList.toggle("is-active", isActive);
    });
  }

  function bindBgSwatches() {
    $$("#ed-bg-swatches .ed-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        const slide = document.getElementById(activeSlideId);
        if (!slide) return;
        pushHistory();
        BG_CLASSES.forEach((c) => slide.classList.remove(c));
        slide.classList.add(sw.dataset.bg);
        slide.style.background = "";
        delete slide.dataset.grad;
        delete slide.dataset.gradInk;
        updateBgSwatchHighlight();
        markDirty();
      });
    });
    $$("#ed-grad-swatches .ed-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        const slide = document.getElementById(activeSlideId);
        if (!slide) return;
        pushHistory();
        BG_CLASSES.forEach((c) => slide.classList.remove(c));
        slide.style.background = sw.dataset.grad;
        slide.dataset.grad = sw.dataset.grad;
        slide.dataset.gradInk = sw.dataset.ink;
        slide.style.color = sw.dataset.ink === "negro" ? "var(--negro)" : "var(--blanco)";
        updateBgSwatchHighlight();
        markDirty();
      });
    });
    const clearBtn = document.getElementById("btn-clear-grad");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const slide = document.getElementById(activeSlideId);
        if (!slide) return;
        pushHistory();
        slide.style.background = "";
        slide.style.color = "";
        delete slide.dataset.grad;
        delete slide.dataset.gradInk;
        if (!BG_CLASSES.some((c) => slide.classList.contains(c))) {
          slide.classList.add("bg-blanco");
        }
        updateBgSwatchHighlight();
        markDirty();
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Modo edición                                                       */
  /* ---------------------------------------------------------------- */
  function setEditMode(on) {
    editMode = on;
    $$(".ed-editable", root).forEach((el) =>
      el.setAttribute("contenteditable", on ? "true" : "false")
    );
    document.body.classList.toggle("ed-editing", on);
    const btn = document.getElementById("btn-toggle-edit");
    btn.classList.toggle("active", on);
    btn.textContent = on ? "✎ Editar contenido" : "👁 Vista previa";
  }

  /* ---------------------------------------------------------------- */
  /* Herramientas inyectadas: eliminar fila / agregar fila             */
  /* ---------------------------------------------------------------- */
  function injectRowTools() {
    $$(".barra-fila", root).forEach((fila) => {
      if ($(".ed-row-tools", fila)) return;
      const tools = document.createElement("span");
      tools.className = "ed-row-tools ed-injected";
      tools.innerHTML = `<button type="button" class="ed-mini-btn" data-action="delete-row" title="Eliminar fila">✕</button>`;
      fila.appendChild(tools);
    });
  }

  function injectAddRowButtons() {
    $$(".barras", root).forEach((ul) => {
      if ($(".ed-add-row-item", ul)) return;
      const li = document.createElement("li");
      li.className = "ed-add-row-item ed-injected";
      li.style.listStyle = "none";
      li.innerHTML = `<button type="button" class="ed-add-row" data-action="add-row">+ Agregar fila</button>`;
      ul.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Acciones delegadas (click)                                        */
  /* ---------------------------------------------------------------- */
  function bindDelegatedActions() {
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === "delete-row") {
        const fila = btn.closest(".barra-fila");
        const ul = fila.closest(".barras");
        const rows = $$(".barra-fila", ul);
        if (rows.length <= 1) {
          toast("Debe quedar al menos una fila", "error");
          return;
        }
        pushHistory();
        fila.remove();
        markDirty();
      }

      if (action === "add-row") {
        pushHistory();
        const li = btn.closest("li");
        const ul = li.closest(".barras");
        const rows = $$(".barra-fila", ul);
        const last = rows[rows.length - 1];
        const clone = last.cloneNode(true);
        clone.style.setProperty("--pct", "0");
        const label = $(".barra-label", clone);
        if (label) label.textContent = "Nueva categoría";
        const val = $(".barra-valor", clone);
        if (val) val.textContent = "0";
        const fill = $(".barra-fill", clone);
        if (fill) fill.className = "barra-fill";
        li.parentNode.insertBefore(clone, li);
        markDirty();
        const newLabel = $(".barra-label", clone);
        if (newLabel) placeCursorIn(newLabel);
      }
    });
  }

  function placeCursorIn(el) {
    if (!editMode) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ---------------------------------------------------------------- */
  /* Insertar gráficos en el slide activo                               */
  /* ---------------------------------------------------------------- */
  function activeSlidePad() {
    const slide = document.getElementById(activeSlideId);
    return slide ? $(".slide-pad", slide) : null;
  }

  function insertStat() {
    const pad = activeSlidePad();
    if (!pad) return;
    pushHistory();
    const stat = document.createElement("p");
    stat.className = "stat-huge ed-editable ed-pct-standalone ed-injected-content";
    stat.setAttribute("contenteditable", editMode ? "true" : "false");
    stat.style.gridColumn = "1 / 5";
    stat.style.gridRow = "5 / 7";
    stat.style.color = "var(--coral)";
    stat.textContent = "00%";
    pad.appendChild(stat);
    markDirty();
    toast("Cifra agregada — arrástrala con las clases gc-* si no queda bien ubicada", "success");
    placeCursorIn(stat);
  }

  function insertBars() {
    const pad = activeSlidePad();
    if (!pad) return;
    pushHistory();
    const wrap = document.createElement("div");
    wrap.className = "ed-injected-content";
    wrap.style.gridColumn = "1 / 9";
    wrap.style.gridRow = "5 / 7";
    wrap.innerHTML = `
      <ul class="barras">
        <li class="barra-fila" style="--pct:60"><span class="barra-label ed-editable" contenteditable="${editMode}">Categoría 1</span><span class="barra-track"><span class="barra-fill"></span></span><span class="barra-valor ed-editable ed-pct" contenteditable="${editMode}">60%</span></li>
        <li class="barra-fila" style="--pct:30"><span class="barra-label ed-editable" contenteditable="${editMode}">Categoría 2</span><span class="barra-track"><span class="barra-fill" style="background:var(--azul-osc)"></span></span><span class="barra-valor ed-editable ed-pct" contenteditable="${editMode}">30%</span></li>
      </ul>`;
    pad.appendChild(wrap);
    injectRowTools();
    injectAddRowButtons();
    markDirty();
    toast("Bloque de barras agregado", "success");
  }

  function insertCircle() {
    const slide = document.getElementById(activeSlideId);
    if (!slide) return;
    pushHistory();
    const colors = ["var(--coral)", "var(--azul-osc)", "var(--negro)", "var(--blanco)"];
    const color = colors[($$(".deco", slide).length) % colors.length];
    const deco = document.createElement("div");
    deco.className = "deco pos-br ed-injected-content";
    deco.style.color = color;
    deco.innerHTML = `<div class="deco-solid" style="width:100%;height:100%;border-radius:50%"></div>`;
    slide.insertBefore(deco, slide.firstChild);
    markDirty();
    toast("Círculo agregado en la esquina — edítalo desde el HTML si necesitas otra posición", "success");
  }

  /* ---------------------------------------------------------------- */
  /* Porcentajes: el texto tipeado maneja la barra                     */
  /* ---------------------------------------------------------------- */
  function bindPctEditing() {
    root.addEventListener("input", (e) => {
      const target = e.target.closest(".ed-pct");
      if (!target) return;
      const num = parseFloat((target.textContent || "").replace(",", "."));
      if (isNaN(num)) return;
      const fila = target.closest(".barra-fila");
      if (!fila) return;
      fila.style.setProperty("--pct", Math.max(0, num));
    });
  }

  /* ---------------------------------------------------------------- */
  /* Marcar "sin guardar" ante cualquier edición de texto               */
  /* ---------------------------------------------------------------- */
  function bindDirtyTracking() {
    root.addEventListener("input", () => markDirty());
  }

  /* ---------------------------------------------------------------- */
  /* Un snapshot de historial por sesión de escritura (no por tecla):   */
  /* al entrar a un campo editable se guarda el "antes"; escribir       */
  /* varias letras cuenta como un solo paso de deshacer, como en        */
  /* cualquier editor de texto.                                        */
  /* ---------------------------------------------------------------- */
  function bindTypingHistory() {
    root.addEventListener("focusin", (e) => {
      if (!e.target.closest(".ed-editable")) return;
      if (typingSessionOpen) return;
      typingSessionOpen = true;
      pushHistory();
    });
    root.addEventListener("focusout", (e) => {
      if (!e.target.closest(".ed-editable")) return;
      typingSessionOpen = false;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Exportar HTML final (limpio, sin nada del editor)                 */
  /* ---------------------------------------------------------------- */
  function cleanClone() {
    const clone = root.cloneNode(true);
    $$(".ed-injected", clone).forEach((el) => el.remove());
    $$("[contenteditable]", clone).forEach((el) => el.removeAttribute("contenteditable"));
    $$(".ed-slide-active", clone).forEach((el) => el.classList.remove("ed-slide-active"));
    return clone;
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------------------------------------------------------------- */
  /* Exportar PNG del slide activo                                     */
  /* html2canvas no resuelve unidades cqw/cqh (container queries), así  */
  /* que antes de capturar "aplanamos" los estilos computados (ya en    */
  /* px reales) sobre el propio slide, y los revertimos después.        */
  /* ---------------------------------------------------------------- */
  const CAPTURE_PROPS = [
    "font-size", "font-weight", "line-height", "letter-spacing",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "width", "height", "min-width", "min-height", "max-width",
    "gap", "row-gap", "column-gap", "border-radius",
    "top", "right", "bottom", "left",
    "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
    "background-color", "background-image", "color",
    "border-top-width", "border-top-color", "border-top-style",
    "opacity", "stroke-width", "align-self", "justify-self",
  ];

  function flattenComputedStyles(node) {
    const all = [node, ...node.querySelectorAll("*")];
    const originals = all.map((el) => [el, el.getAttribute("style")]);
    all.forEach((el) => {
      const cs = getComputedStyle(el);
      let inline = el.getAttribute("style") || "";
      CAPTURE_PROPS.forEach((p) => {
        const v = cs.getPropertyValue(p);
        if (v) inline += `;${p}:${v}`;
      });
      el.setAttribute("style", inline);
    });
    return () => {
      originals.forEach(([el, style]) => {
        if (style === null) el.removeAttribute("style");
        else el.setAttribute("style", style);
      });
    };
  }

  async function captureSlideCanvas(slide, scale = 2) {
    const restore = flattenComputedStyles(slide);
    try {
      return await html2canvas(slide, { scale, useCORS: true, backgroundColor: null });
    } finally {
      restore();
    }
  }

  async function withCaptureMode(fn) {
    document.body.classList.add("ed-capturing");
    const wasEditing = editMode;
    if (wasEditing) setEditMode(false);
    try {
      return await fn();
    } finally {
      document.body.classList.remove("ed-capturing");
      if (wasEditing) setEditMode(true);
    }
  }

  async function exportPNG() {
    if (typeof html2canvas === "undefined") {
      toast("No se pudo cargar html2canvas (¿sin conexión?)", "error");
      return;
    }
    const slide = document.getElementById(activeSlideId);
    if (!slide) return;
    try {
      const canvas = await withCaptureMode(() => captureSlideCanvas(slide));
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (slide.dataset.slideTitle || slide.id).toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast("PNG exportado", "success");
      }, "image/png");
    } catch (err) {
      toast("Error al exportar PNG", "error");
      console.error(err);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Exportar deck completo — PDF y PPTX                                */
  /* Cada slide se captura como imagen (misma canalización que el PNG)  */
  /* y se inserta a pantalla completa en una página/slide 16:9. Así el  */
  /* PDF/PPTX se ven idénticos al deck web, con las mismas fuentes y    */
  /* degradados — el costo es que el texto queda como imagen, no como   */
  /* texto editable dentro de esos archivos.                            */
  /* ---------------------------------------------------------------- */
  function setExportProgress(btn, current, total) {
    if (!btn) return;
    btn.dataset.origLabel = btn.dataset.origLabel || btn.textContent;
    if (current === null) {
      btn.textContent = btn.dataset.origLabel;
      btn.disabled = false;
    } else {
      btn.textContent = `Generando… ${current}/${total}`;
      btn.disabled = true;
    }
  }

  async function captureAllSlides(btn) {
    const slides = $$(".slide", root);
    const shots = [];
    for (let i = 0; i < slides.length; i++) {
      setExportProgress(btn, i + 1, slides.length);
      const canvas = await captureSlideCanvas(slides[i], 1.5);
      shots.push({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), w: canvas.width, h: canvas.height });
    }
    setExportProgress(btn, null, slides.length);
    return shots;
  }

  async function exportPDF() {
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (typeof html2canvas === "undefined" || !jsPDFCtor) {
      toast("No se pudo cargar el generador de PDF (¿sin conexión?)", "error");
      return;
    }
    const btn = document.getElementById("btn-export-pdf");
    try {
      const shots = await withCaptureMode(() => captureAllSlides(btn));
      const pdf = new jsPDFCtor({ orientation: "landscape", unit: "in", format: [13.333, 7.5] });
      shots.forEach((shot, i) => {
        if (i > 0) pdf.addPage([13.333, 7.5], "landscape");
        pdf.addImage(shot.dataUrl, "JPEG", 0, 0, 13.333, 7.5, undefined, "FAST");
      });
      pdf.save("informe-cohorte-2026.pdf");
      toast("PDF exportado", "success");
    } catch (err) {
      toast("Error al exportar PDF", "error");
      console.error(err);
    }
  }

  async function exportPPTX() {
    if (typeof html2canvas === "undefined" || typeof PptxGenJS === "undefined") {
      toast("No se pudo cargar el generador de PPTX (¿sin conexión?)", "error");
      return;
    }
    const btn = document.getElementById("btn-export-pptx");
    try {
      const shots = await withCaptureMode(() => captureAllSlides(btn));
      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: "FAAAD_16x9", width: 13.333, height: 7.5 });
      pptx.layout = "FAAAD_16x9";
      shots.forEach((shot) => {
        const slide = pptx.addSlide();
        slide.addImage({ data: shot.dataUrl, x: 0, y: 0, w: 13.333, h: 7.5 });
      });
      await pptx.writeFile({ fileName: "informe-cohorte-2026.pptx" });
      toast("PPTX exportado", "success");
    } catch (err) {
      toast("Error al exportar PPTX", "error");
      console.error(err);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Guardar / cargar progreso (.json con el HTML editado)             */
  /* ---------------------------------------------------------------- */
  const AUTOSAVE_KEY = "faaad-informe-2026-autosave";

  function currentSnapshot() {
    return {
      savedAt: new Date().toISOString(),
      html: cleanClone().innerHTML,
    };
  }

  function saveJSON() {
    const snap = currentSnapshot();
    downloadBlob(JSON.stringify(snap, null, 2), "informe-cohorte-2026-progreso.json", "application/json");
    markClean("progreso guardado");
    toast("Progreso guardado en .json", "success");
  }

  function restoreHTML(html) {
    root.innerHTML = html;
    setupInjectedTools();
    setEditMode(editMode);
    rebuildNav();
  }

  function applySnapshot(snap) {
    pushHistory();
    restoreHTML(snap.html);
    toast("Progreso cargado", "success");
    markClean("progreso cargado");
  }

  function loadJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const snap = JSON.parse(reader.result);
        applySnapshot(snap);
      } catch (err) {
        toast("El archivo no es un progreso válido", "error");
      }
    };
    reader.readAsText(file);
  }

  function autosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(currentSnapshot()));
    } catch (err) {
      /* localStorage puede fallar en modo privado; no bloquea la edición */
    }
  }

  function restoreAutosave(silent) {
    let raw;
    try {
      raw = localStorage.getItem(AUTOSAVE_KEY);
    } catch (err) {
      raw = null;
    }
    if (!raw) {
      if (!silent) toast("No hay autoguardado disponible", "error");
      return;
    }
    applySnapshot(JSON.parse(raw));
  }

  function rebuildNav() {
    // Los swatches de color/degradado viven en el sidebar (fuera de
    // #informe-root) y nunca se destruyen, así que se enlazan una sola
    // vez en init() — reenlazarlos aquí duplicaría listeners en cada
    // undo/redo/carga.
    document.getElementById("ed-nav-list").innerHTML = "";
    buildNav();
    observeSlides();
  }

  let autosaveTimer = null;
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosave, 1500);
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                              */
  /* ---------------------------------------------------------------- */
  function setupInjectedTools() {
    injectRowTools();
    injectAddRowButtons();
  }

  function init() {
    setupInjectedTools();
    buildNav();
    observeSlides();
    bindBgSwatches();
    bindDelegatedActions();
    bindPctEditing();
    bindDirtyTracking();
    bindTypingHistory();
    setEditMode(true);
    setActiveSlide("slide-1");
    updateUndoRedoButtons();

    root.addEventListener("input", scheduleAutosave);

    document.addEventListener("keydown", (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (key === "z") {
        e.preventDefault();
        undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    });

    document.getElementById("btn-undo").addEventListener("click", undo);
    document.getElementById("btn-redo").addEventListener("click", redo);
    document.getElementById("btn-toggle-edit").addEventListener("click", () => setEditMode(!editMode));
    document.getElementById("btn-insert-stat").addEventListener("click", insertStat);
    document.getElementById("btn-insert-bars").addEventListener("click", insertBars);
    document.getElementById("btn-insert-circle").addEventListener("click", insertCircle);
    document.getElementById("btn-export-pdf").addEventListener("click", exportPDF);
    document.getElementById("btn-export-pptx").addEventListener("click", exportPPTX);
    document.getElementById("btn-export-png").addEventListener("click", exportPNG);
    document.getElementById("btn-save-json").addEventListener("click", saveJSON);
    document.getElementById("btn-restore-autosave").addEventListener("click", () => restoreAutosave(false));

    const fileInput = document.getElementById("file-load-json");
    document.getElementById("btn-load-json").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) loadJSONFile(fileInput.files[0]);
      fileInput.value = "";
    });

    window.addEventListener("beforeunload", (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    markClean("cargado");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
