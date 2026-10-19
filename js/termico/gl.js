/* ==========================================================================
   FaAADudp — Encuesta cohorte, Escuela de Diseño UDP: motor WebGL (sin datos, sin texto).
   Dos capas:
     1) Fondo: color sólido + un campo líquido animado (fbm con domain warp)
        en UN color propio, distinto de los colores de dato y con intensidad
        tope — se lee como atmósfera, nunca como "calor" de una categoría.
     2) Capas de dato: por cada capa, la app dibuja su máscara (formas blancas
        sobre negro); acá se desenfoca (gaussiano separable de dos pasadas) y
        se colorea con un gradiente de DOS colores de la paleta a lo largo del
        eje de valor, con alfa en el halo (mismo color, sin anillo), y se compone sobre lo anterior.
   ========================================================================== */
(function () {
  "use strict";

  const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;

  // sigma fija en "taps" (6); el radio real se escala con el paso (dir)
  const BLUR = `precision highp float; varying vec2 uv; uniform sampler2D t; uniform vec2 dir;
    void main(){ float s = 0., w = 0.;
      for (int i = -16; i <= 16; i++) { float x = float(i); float k = exp(-x * x / 72.); s += texture2D(t, uv + dir * x).r * k; w += k; }
      gl_FragColor = vec4(vec3(s / w), 1.); }`;

  const NOISE = `
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }`;

  const BG = `precision highp float; varying vec2 uv;
    uniform vec3 bgc, fc; uniform float time, aspect, amt, grain;
    ${NOISE}
    void main(){
      vec2 q = vec2(uv.x * aspect, uv.y) * 1.25;
      vec2 w = vec2(fbm(q + time * .045), fbm(q + vec2(5.2, 1.3) - time * .035));
      float f = fbm(q + 1.9 * w + vec2(time * .015, 0.));
      float b = smoothstep(.38, .82, f) * amt;
      vec3 col = mix(bgc, fc, b) + (h(gl_FragCoord.xy + fract(time * 7.) * 91.) - .5) * grain;
      gl_FragColor = vec4(col, 1.); }`;

  /* Gradiente de dos colores según la POSICIÓN en el eje de valor (no según la intensidad del blur):
     antes el halo era un anillo de otro color alrededor de cada forma y se leía como un dato que no
     existe. Ahora el borde es solo un desvanecimiento suave del mismo color de esa zona.
     gm: 0 = color plano (A) · 1 = vertical (gp.x base → gp.y tope, en uv)
         2 = radial (centro gp.xy, radios gp.z → gp.w en unidades de alto)
         3 = angular desde las 12 en sentido horario (centro gp.xy, recorrido total gp.z) */
  const LAYER = `precision highp float; varying vec2 uv;
    uniform sampler2D t; uniform vec3 ca, cb; uniform float gain, s1, grain, time, gm, aspect; uniform vec4 gp;
    ${NOISE}
    void main(){
      float m = clamp(texture2D(t, uv).r * gain, 0., 1.);
      float a = smoothstep(0., s1, m);
      float k = 0.;
      vec2 d = (uv - gp.xy) * vec2(aspect, 1.);
      if (gm > .5 && gm < 1.5) k = clamp((uv.y - gp.x) / (gp.y - gp.x), 0., 1.);
      else if (gm > 1.5 && gm < 2.5) k = clamp((length(d) - gp.z) / (gp.w - gp.z), 0., 1.);
      else if (gm > 2.5) { float ang = atan(d.x, d.y); if (ang < 0.) ang += 6.2831853; k = clamp(ang / gp.z, 0., 1.); }
      vec3 col = mix(ca, cb, k) + (h(gl_FragCoord.xy + fract(time * 5.) * 57.) - .5) * grain;
      gl_FragColor = vec4(col * a, a); }`;  // premultiplicado: el halo queda limpio también sobre transparente

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "p"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  function tex(gl) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]
      .forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
    return t;
  }
  const rgb = hex => { const c = hex.replace("#", ""); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255); };

  function Thermal() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: true });
    if (!gl) throw new Error("WebGL no disponible");
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const blur = program(gl, BLUR), bg = program(gl, BG), layer = program(gl, LAYER);
    const maskTex = tex(gl), fbos = [0, 1].map(() => { const t = tex(gl), f = gl.createFramebuffer(); return { t, f }; });
    let mw = 0, mh = 0;

    function sizeMask(w, h) {
      if (w === mw && h === mh) return;
      mw = w; mh = h;
      fbos.forEach(({ t, f }) => {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function blurMask(mask, sigma) {
      sizeMask(mask.width, mask.height);
      gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
      const stride = Math.max(sigma, .01) / 6;
      gl.useProgram(blur.p); gl.uniform1i(blur.u.t, 0);
      gl.viewport(0, 0, mw, mh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[0].f); gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.uniform2f(blur.u.dir, stride / mw, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1].f); gl.bindTexture(gl.TEXTURE_2D, fbos[0].t);
      gl.uniform2f(blur.u.dir, 0, stride / mh); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* o = { width, height, time, grain,
             bg: hex, field: hex, fieldAmt (0..1), transparent (sin fondo: solo las formas, con alfa),
             layers: n, drawLayer(i) → canvas máscara de la capa i, pair(i) → [hexA, hexB],
             sigma (px de máscara), gain, s1 (dónde termina el halo y empieza el color pleno),
             grad: { mode, p: [4] } — ver LAYER } */
    function render(o) {
      if (canvas.width !== o.width || canvas.height !== o.height) { canvas.width = o.width; canvas.height = o.height; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.disable(gl.BLEND);
      if (o.transparent) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }  // sin fondo: ni color ni campo
      else {
      gl.useProgram(bg.p);
      gl.uniform3fv(bg.u.bgc, rgb(o.bg)); gl.uniform3fv(bg.u.fc, rgb(o.field));
      gl.uniform1f(bg.u.time, o.time); gl.uniform1f(bg.u.aspect, canvas.width / canvas.height);
      gl.uniform1f(bg.u.amt, o.fieldAmt); gl.uniform1f(bg.u.grain, o.grain);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      for (let i = 0; i < o.layers; i++) {
        blurMask(o.drawLayer(i), o.sigma);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(layer.p); gl.bindTexture(gl.TEXTURE_2D, fbos[1].t);
        const [a, b] = o.pair(i);
        gl.uniform1i(layer.u.t, 0); gl.uniform3fv(layer.u.ca, rgb(a)); gl.uniform3fv(layer.u.cb, rgb(b));
        gl.uniform1f(layer.u.gain, o.gain); gl.uniform1f(layer.u.s1, o.s1); gl.uniform1f(layer.u.grain, o.grain); gl.uniform1f(layer.u.time, o.time);
        const gr = o.grad || { mode: 0, p: [0, 0, 1, 1] };
        gl.uniform1f(layer.u.gm, gr.mode); gl.uniform4fv(layer.u.gp, gr.p); gl.uniform1f(layer.u.aspect, canvas.width / canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.BLEND);
      return canvas;
    }
    return { canvas, render };
  }

  window.TermicoGL = { Thermal };
})();
