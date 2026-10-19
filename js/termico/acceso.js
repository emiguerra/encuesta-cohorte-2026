/* ==========================================================================
   FaAADudp — Encuesta cohorte, Escuela de Diseño UDP: pantalla de acceso.
   Un solo usuario y una contraseña. La contraseña NO está escrita aquí: solo
   su huella PBKDF2-SHA256 (150 000 iteraciones, con sal), que no se puede
   revertir. Al entrar, se compara la huella de lo escrito con la guardada.
   Para cambiar la contraseña, ver «Cambiar la contraseña» en el README.

   Ojo: es una barrera del lado del navegador (el sitio es estático). Impide
   que cualquiera use la herramienta, pero no es control de acceso de servidor
   y los datos siguen en el Sheet público.
   ========================================================================== */
(function () {
  "use strict";

  const ACCESO = {
    usuario: "admin",
    sal: "359008993e208b6c1f13d970c522a3a5",          // la escribe el comando de «Cambiar la contraseña»
    huella: "2801e774ccef1308aa8f66e8f6a75f73d1861ee1a449eb45ee898ee60ad976f1",       // ídem: PBKDF2-SHA256(contraseña, sal, 150000) en hexadecimal
    iteraciones: 150000,
  };
  const SESION = "encuesta-cohorte-acceso";  // dura mientras la pestaña esté abierta

  const $ = s => document.querySelector(s);
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));

  async function huellaDe(clave) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(ACCESO.sal), iterations: ACCESO.iteraciones }, key, 256);
    return hex(bits);
  }

  let abrir;
  const listo = new Promise(res => { abrir = res; });
  window.TermicoAcceso = {
    listo,
    salir() { try { sessionStorage.removeItem(SESION); } catch (e) { /* sin almacenamiento */ } location.reload(); },
  };

  function entrar() {
    document.body.classList.remove("locked");
    const box = $("#tm-login"); if (box) box.hidden = true;
    abrir();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("#tm-login-form"), err = $("#tm-login-err"), btn = form.querySelector("button");
    if (!ACCESO.sal || !ACCESO.huella) {
      err.textContent = "El acceso todavía no tiene contraseña configurada (ver README: «Cambiar la contraseña»).";
      btn.disabled = true;
      return;
    }
    try { if (sessionStorage.getItem(SESION) === ACCESO.huella) { entrar(); return; } } catch (e) { /* sin almacenamiento */ }
    $("#tm-login-user").focus();
    let fallos = 0;
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      btn.disabled = true; err.textContent = "";
      const user = $("#tm-login-user").value.trim(), clave = $("#tm-login-pass").value;
      const ok = user === ACCESO.usuario && (await huellaDe(clave)) === ACCESO.huella;
      if (ok) {
        try { sessionStorage.setItem(SESION, ACCESO.huella); } catch (e) { /* sin almacenamiento */ }
        entrar();
        return;
      }
      // cada intento fallido espera un poco más: probar contraseñas a mano se vuelve lento
      fallos++;
      err.textContent = "Usuario o contraseña incorrectos.";
      $("#tm-login-pass").value = "";
      setTimeout(() => { btn.disabled = false; $("#tm-login-pass").focus(); }, Math.min(8000, 600 * fallos * fallos));
    });
  });
})();
