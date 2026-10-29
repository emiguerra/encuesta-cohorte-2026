/* ==========================================================================
   FaAADudp — Endpoint de COMENTARIOS (Google Apps Script).
   Guarda los comentarios del dashboard en la pestaña COMENTARIOS del Sheet.

   CÓMO DESPLEGARLO (una sola vez):
   1. Abre el Google Sheet → menú Extensiones → Apps Script.
   2. Borra lo que haya y pega TODO este archivo. Guarda (💾).
   3. Botón «Implementar» → «Nueva implementación» → tipo «Aplicación web».
        - Descripción: comentarios dashboard
        - Ejecutar como: Yo (tu cuenta, la dueña del Sheet)
        - Quién tiene acceso: Cualquier usuario
      Implementar → autoriza los permisos cuando los pida.
   4. Copia la URL que termina en /exec.
   5. Pégala en js/termico/config.js  →  commentsUrl: "…/exec"
      (y deja commentsToken igual al TOKEN de abajo). Haz commit + push.

   Si cambias el código, usa «Implementar → Gestionar implementaciones → editar
   (lápiz) → Versión: Nueva» para que la MISMA URL tome los cambios.
   ========================================================================== */

var SHEET_ID = "1TBtgTRdu8anBzwF8DglIZqiSEshpI-J8mpeOx4p0XvM";
var TAB = "COMENTARIOS";
var TOKEN = "faaad-comentarios-2026";   // debe coincidir con commentsToken en config.js

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.token !== TOKEN) return json({ ok: false, error: "token" });
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
    if (!sh) return json({ ok: false, error: "no existe la pestaña " + TAB });

    if (body.action === "resolve") {
      var data = sh.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(body.id)) { sh.getRange(i + 1, 9).setValue(body.estado || "Resuelto"); break; }
      }
      return json({ ok: true });
    }

    // alta de comentario o respuesta
    var id = String(body.id || ("c" + Date.now() + Math.floor(Math.random() * 1e4)));
    sh.appendRow([ id, new Date().toISOString(), s(body.autor), s(body.anio), s(body.metrica),
                   s(body.forma), s(body.texto), s(body.parent), "Abierto" ]);
    return json({ ok: true, id: id });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() { return json({ ok: true, service: "comentarios-faaad" }); }

function s(v) { return v == null ? "" : String(v); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
