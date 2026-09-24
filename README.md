# Perfil de Ingreso — Escuela de Diseño UDP

Sitio web con el informe y el explorador de datos de la encuesta de perfil de ingreso de la Escuela de Diseño UDP. Los números no están escritos en el código: se leen en vivo desde un Google Sheet, así que cambiar un dato en la planilla actualiza los gráficos sin tocar nada más.

## Características

* Informe de la cohorte 2026 en formato de láminas 16:9, con la identidad visual FaAAD.
* Explorador de datos: navega por año y por pregunta, y elige entre más de 20 tipos de gráfico.
* Cada tipo de gráfico se ve dibujado con los datos reales de la pregunta antes de elegirlo.
* Comparación entre años cuando la misma pregunta se repite (líneas, pendientes, mapas de calor).
* Edición del informe directo en el navegador: texto, colores de fondo y tipo de gráfico.
* Exportación del informe a PNG, PDF y PPTX.
* Datos leídos en vivo desde Google Sheets: un año nuevo se detecta solo, sin tocar código.
* Sin backend ni build: HTML, CSS y JS puro, servido como archivo estático.

## Estructura del proyecto

```txt
index.html          informe de la cohorte 2026 (láminas)
dashboard.html       explorador de datos
css/
  style.css            colores, tipografías y grilla de las láminas (la usan las dos páginas)
  editor.css           barra de herramientas del editor del informe
  dashboard.css        interfaz del explorador
js/
  core/                 lo que usan las dos páginas
    config.js             id del Google Sheet
    sheet-bind.js         lee el Sheet y lo convierte en filas usables
    charts.js             motor de gráficos propio (SVG)
  informe/              solo para index.html
    bindings.js           qué celda del Sheet alimenta cada gráfico del informe
    app.js                editor del informe (edición, exportar, deshacer)
  explorador/            solo para dashboard.html
    charts-d3.js          gráficos adicionales hechos con D3
    dashboard.js          lógica del explorador
assets/
  img/                 logos
  fonts/               tipografías Work Sans, Work FaAAD y Necto Mono
```

## Cómo verlo en el navegador

El navegador bloquea la lectura del Sheet si el sitio se abre directo como archivo (`file://`), así que hace falta un servidor simple:

```bash
python3 -m http.server 8000
```

Y abrir en el navegador:

```txt
http://localhost:8000/index.html
http://localhost:8000/dashboard.html
```

## De dónde vienen los datos

Todo sale de este Google Sheet: **[Base de datos · Encuesta de perfil de ingreso](https://docs.google.com/spreadsheets/d/1TBtgTRdu8anBzwF8DglIZqiSEshpI-J8mpeOx4p0XvM/edit?usp=sharing)**. Tiene una pestaña por año (`2023`, `2024`, `2025`, `2026`…) y una pestaña `README.MD` que explica su formato con ejemplos, para alguien sin conocimientos técnicos.

El id de ese Sheet está en un solo archivo del código:

```js
// js/core/config.js
window.GC_CONFIG = { sheetId: "..." };
```

El sitio lee cada pestaña como CSV, de forma pública y sin necesitar clave:

```txt
https://docs.google.com/spreadsheets/d/<sheetId>/gviz/tq?tqx=out:csv&sheet=<año>
```

Cada fila del Sheet es un dato: una categoría de una pregunta, con su valor. Las columnas son siempre las mismas:

```txt
familia | pregunta | categoria | valor | unidad | n_absoluto | n_total_respuestas | rango_logro | nota
```

## Agregar un año nuevo

1. En el Sheet, clic derecho sobre la pestaña del año más reciente → Duplicar.
2. Renombrar la copia solo con el año nuevo, por ejemplo `2028`.
3. Reemplazar los valores de las columnas `valor`, `n_absoluto` y `n_total_respuestas`.
4. Abrir el explorador y pulsar «Actualizar»: el año aparece solo en la barra lateral, sin editar código.

## Agregar un tipo de gráfico nuevo

Cada tipo de gráfico es una función que recibe un contenedor y los datos, y dibuja un SVG adentro. Se registra una sola vez:

```js
window.GCCharts.register("miForma", "Mi forma", (host, data) => { /* dibuja el SVG */ });
```

Después de registrarla, el explorador la ofrece solo si el perfil de la pregunta calza con ella (una sola respuesta, respuesta múltiple, comparación entre años, etc.), en `js/explorador/dashboard.js`.

## Problemas comunes

### El explorador no lee el Sheet

* Revisar que el Sheet siga compartido como "Cualquier persona con el enlace — Lector".
* Abrir la consola del navegador: ahí queda el motivo exacto del error.
* Pulsar «Actualizar» en el explorador antes de asumir que algo se rompió: a veces es solo caché.

### Un año nuevo no aparece

* El nombre de la pestaña debe ser exactamente el año, sin espacios ni texto extra.
* La pestaña `README.MD` del Sheet debe seguir siendo la primera de todas.

### Dos años con la misma pregunta no se pueden comparar

* El explorador empareja categorías por texto exacto. Si una categoría cambia de nombre entre años (por ejemplo "Moda" y "Mención Moda"), se tratan como categorías distintas.

### Una pregunta se ve como tarjetas sueltas en vez de un gráfico

* Pasa cuando sus filas mezclan unidades distintas (por ejemplo % y personas), o cuando no tienen ningún número. Revisar la columna `unidad` de esa pregunta en el Sheet.

## Posibles mejoras

* Exportar las láminas del explorador a PPTX y PDF, igual que el informe.
* Permitir comparar categorías con nombres distintos entre años (por ejemplo, agregando una columna `categoria_base` en el Sheet).
* Gráficos de red entre respuestas de una misma persona (hoy solo existen datos crudos por persona para 2025).
* Guardar el sitio como una app instalable, para usarlo sin conexión con los últimos datos leídos.

## Créditos

Identidad visual y sistema gráfico según el manual de marca FaAAD / Escuela de Diseño UDP.
