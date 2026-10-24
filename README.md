# Encuesta cohorte — Escuela de Diseño UDP

Sitio web con los resultados de la encuesta que responde cada cohorte al ingresar a la Escuela de Diseño UDP. Los números no están escritos en el código: se leen en vivo desde un Google Sheet, así que cambiar un dato en la planilla actualiza los gráficos sin tocar nada más.

## Características

* Galería de todas las preguntas por año, agrupadas por familia (cada familia con su color del manual FaAAD), con una vista previa del gráfico recomendado y el dato principal de cada una.
* Siete formas de gráfico: Espiral, Rosa, Nube, Línea, Paleta, Barras y Mapa (mapa de calor geográfico para preguntas de comuna o región), con un efecto térmico (blur + gradiente) dibujado en WebGL.
* Cada slide se explica solo: muestra la pregunta, una línea de cómo leerla (por ejemplo, que una respuesta múltiple suma más de 100%) y la escala de la forma.
* Comparar años: las mismas opciones de distintos años en un mismo gráfico, con un tono por año y su leyenda; y Cambio entre años (diferencia en puntos porcentuales).
* Colores del manual FaAAD: los 11 de la paleta, elegibles como fondo, gradiente y campo; el color del texto sigue la regla de contraste del manual.
* Texto libre con diagramación paramétrica: columna a la derecha en 16:9, bloque abajo en 4:5 y 1:1.
* Exportación a PNG (con o sin fondo), SVG con texto editable y video; como slide, slide con título o solo el gráfico.
* Acceso con un usuario (`admin`) y una contraseña.
* Sin backend ni build: HTML, CSS y JS puro, servido como archivo estático.

## Estructura del proyecto

```txt
index.html            la página: galería + editor
css/
  termico.css           estilos de la galería y el editor (tipografías del manual incluidas)
cambiar-clave.py      define o cambia la contraseña de acceso
js/termico/
  acceso.js             pantalla de acceso (guarda solo la huella de la contraseña)
  config.js             id del Google Sheet
  sheet.js              lee una pestaña del Sheet (CSV) y la convierte en filas
  data.js               perfil de cada pregunta y su serie entre años
  gl.js                 motor WebGL: blur + gradiente de dos tonos + campo líquido
assets/geo/
  rm-comunas.json       polígonos de las comunas de la RM (mapa de «Comuna de residencia»)
  cl-regiones.json      polígonos de las regiones de Chile (mapa de «Región de procedencia»)
  app.js                galería, editor, formas, animación y exportación
assets/
  img/                  lockup FaAADudp (negro y blanco)
  fonts/                Work Sans, Work FaAAD y Necto Mono
```

## Cómo verlo en el navegador

El navegador bloquea la lectura del Sheet si el sitio se abre directo como archivo (`file://`), así que hace falta un servidor simple dentro de esta carpeta:

```bash
python3 -m http.server 8000
```

Y abrir `http://localhost:8000/` en el navegador.

## De dónde vienen los datos

Todo sale de este Google Sheet: **[Base de datos · Encuesta de perfil de ingreso](https://docs.google.com/spreadsheets/d/1TBtgTRdu8anBzwF8DglIZqiSEshpI-J8mpeOx4p0XvM/edit?usp=sharing)**. Tiene una pestaña por año (`2023`, `2024`, `2025`, `2026`…) y una pestaña `README.MD` que explica su formato con ejemplos, para alguien sin conocimientos técnicos.

El id de ese Sheet está en un solo archivo del código:

```js
// js/termico/config.js
window.GC_CONFIG = { sheetId: "..." };
```

El sitio lee cada pestaña como CSV, de forma pública y sin necesitar clave:

```txt
https://docs.google.com/spreadsheets/d/<sheetId>/gviz/tq?tqx=out:csv&sheet=<año>
```

Cada fila del Sheet es un dato: una categoría de una pregunta, con su valor. Las columnas se buscan por su título:

```txt
familia | pregunta | categoria | valor | unidad | n_absoluto | n_total_respuestas | rango_logro | nota | pregunta_base | categoria_base | metrica
```

`pregunta_base` y `categoria_base` son opcionales y casi siempre van vacías (ver «Comparar entre años»).

**`pregunta` vs `metrica`:** la columna `pregunta` trae el **enunciado literal** del formulario (lo que respondió el/la estudiante, ej. «¿Cuántos años tienes?»). La columna **`metrica`** trae la **etiqueta corta y única** del gráfico (ej. «Edad promedio», «Distribución etaria»). La plataforma **agrupa y titula** los gráficos por `metrica` y muestra el enunciado (`pregunta`) como subtítulo; así dos gráficos que salen de la misma pregunta (p. ej. edad promedio y distribución etaria) no colisionan. Si no existiera la columna `metrica`, el código vuelve al esquema antiguo (agrupa por `pregunta`).

## Cambiar la contraseña

La página pide usuario (`admin`) y contraseña. La contraseña no se guarda en ningún archivo: `js/termico/acceso.js` guarda solo su huella (PBKDF2-SHA256, 150 000 iteraciones, con sal al azar), que no se puede revertir. Para definirla o cambiarla, dentro de esta carpeta:

```bash
python3 cambiar-clave.py
```

Pide la contraseña dos veces (mínimo 10 caracteres; no se ve al escribir) y actualiza `acceso.js`. Después hay que subir el cambio (commit + push) para que rija en la web. Si `acceso.js` no tiene huella, la página queda bloqueada y avisa que falta configurarla.

Ojo: como el sitio es estático, es una barrera del lado del navegador. Evita que cualquiera use la herramienta, pero no reemplaza un control de acceso de servidor, y los datos siguen en el Sheet público.

## Agregar un año nuevo

1. En el Sheet, clic derecho sobre la pestaña del año más reciente → Duplicar.
2. Renombrar la copia solo con el año nuevo, por ejemplo `2028`.
3. Reemplazar los valores de las columnas `valor`, `n_absoluto` y `n_total_respuestas`.
4. Recargar la página: el año aparece solo en la galería, sin editar código.

## Comparar entre años

* Una pregunta se puede comparar cuando existe en 2 o más años con opciones en común. En la galería, el filtro «Comparables entre años» las muestra todas.
* Los gráficos se emparejan por `metrica` (la etiqueta corta) y las opciones por su texto exacto. Si una **métrica** se llamó distinto entre años, se escribe el mismo texto en la columna `pregunta_base` de las filas de ambas (solo sirve si comparten las mismas opciones de respuesta).
* Si lo que cambió es el nombre de una **respuesta** (por ejemplo «Ella» en 2024 y «Mujer» en 2026), en la columna `categoria_base` de la fila del año anterior se escribe el nombre exacto que tiene en el año más reciente. Solo se unen respuestas que de verdad significan lo mismo: «Elle» (2024) y «No conforme» (2026) no se unieron.

## Problemas comunes

### La página no lee el Sheet

* Revisar que el Sheet siga compartido como «Cualquier persona con el enlace — Lector».
* Abrir la consola del navegador: ahí queda el motivo exacto del error.

### Un año nuevo no aparece

* El nombre de la pestaña debe ser exactamente el año, sin espacios ni texto extra.
* La pestaña `README.MD` del Sheet debe seguir siendo la primera de todas.

### Una pregunta aparece como «sin cifras para graficar»

* Pasa cuando sus filas mezclan unidades distintas (por ejemplo % y personas), o cuando no tienen ningún número. Revisar la columna `unidad` de esa pregunta en el Sheet.

### El SVG no muestra las fuentes del manual

* El SVG nombra las fuentes (Work Sans, Work FaAAD, Necto Mono) pero no las incrusta: deben estar instaladas en el computador que lo abre.

## Posibles mejoras

* Más formas: grilla de unidades (100 cuadrados), semicírculo para cifras únicas y pendiente entre años.
* Gráficos de red entre respuestas de una misma persona (hoy solo existen datos crudos por persona para 2025).

## Créditos

Los mapas de comunas y regiones derivan de los SVG de **MiPolitico.cl** (repositorio [mapa-chile-svg](https://github.com/contacto-mipolitico-source/mapa-chile-svg), licencia MIT), convertidos a polígonos para el mapa de calor.

Identidad visual y sistema gráfico según el manual de marca FaAAD / Escuela de Diseño UDP.
