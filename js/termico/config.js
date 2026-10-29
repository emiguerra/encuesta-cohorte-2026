/* Un solo lugar para el Sheet que es la base de datos de la página (index.html). */
window.GC_CONFIG = {
  sheetId: "1TBtgTRdu8anBzwF8DglIZqiSEshpI-J8mpeOx4p0XvM",
  // gid de cada pestaña, solo para que «Abrir en el Google Sheet» caiga en la pestaña correcta
  gids: { "2023": 0, "2024": 100, "2025": 101, "2026": 102 },

  // ----- Comentarios (modo tipo Drive dentro del dashboard) -----
  // Se guardan en la pestaña COMENTARIOS del mismo Sheet. Leer es público (gviz); escribir va por un
  // Google Apps Script desplegado como "aplicación web" (ver js/termico/comentarios.gs y el README).
  // Pega aquí la URL del Apps Script desplegado y el mismo token que pusiste en el script.
  commentsTab: "COMENTARIOS",
  commentsUrl: "https://script.google.com/macros/s/AKfycbwlgoyrNQ6V-yUNMPXSIWw0mdy8vbskKMh7viJXAnOsdPPKctW1P3fdHUiC6FztjWKBSA/exec",
  commentsToken: "faaad-comentarios-2026",  // debe coincidir con TOKEN en el Apps Script
};
