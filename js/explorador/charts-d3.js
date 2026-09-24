/* ==========================================================================
   FaAADudp — Formas D3 para la plataforma (se registran en GCCharts).
   Un año:      radial · lollipop · bubbles · treemap · network · donut
   Comparar:    slope · lines · heat
   Cada forma recibe datos ya resueltos (colores incluidos) desde dashboard.js:
     una-año → { items:[{label,value,display,color}], bg, ink, accent, center }
     comparar → { years:[…], series:[{label,color,values:[…]}], fmt(v), bg, ink, accent }
   Texto siempre en currentColor (hereda el fondo de la lámina). Lienzo 1000×560.
   ========================================================================== */
(function () {
  "use strict";

  function boot() {
    const d3 = window.d3, G = window.GCCharts;
    if (!d3 || !G || !G.register) return;
    const W = 1000, H = 560;

    /* ---------------------------- utilidades ---------------------------- */
    const mk = host => {
      const s = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%").style("height", "100%").style("overflow", "visible");
      host.replaceChildren(s.node());
      return s;
    };
    const clip = (s, n) => s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s;
    const lum = hex => {
      const c = d3.color(hex); if (!c) return 0;
      const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
    };
    const onFill = hex => lum(hex) > .4 ? "#1C1C1C" : "#FFFFFF";
    const tip = (g, t) => g.append("title").text(t);
    function hover(marks) {
      marks.forEach(m => m
        .on("mouseenter", function () { marks.forEach(o => o.style("opacity", .3)); d3.select(this).style("opacity", 1); })
        .on("mouseleave", () => marks.forEach(o => o.style("opacity", 1))));
    }
    // separa etiquetas verticales para que no se pisen
    function spread(list, min, lo, hi) {
      const a = list.slice().sort((p, q) => p.y - q.y);
      for (let i = 1; i < a.length; i++) if (a[i].y - a[i - 1].y < min) a[i].y = a[i - 1].y + min;
      const over = a.length ? a[a.length - 1].y - hi : 0;
      if (over > 0) a.forEach(o => { o.y -= over; });
      for (let i = a.length - 2; i >= 0; i--) if (a[i + 1].y - a[i].y < min) a[i].y = a[i + 1].y - min;
      a.forEach(o => { if (o.y < lo) o.y = lo; });
      return list;
    }
    function legend(s, items, x, y0, rowH, fs) {
      items.forEach((it, i) => {
        const g = s.append("g").attr("transform", `translate(${x},${y0 + i * rowH})`);
        g.append("circle").attr("cx", 6).attr("cy", -5).attr("r", 6).attr("fill", it.hollow ? "none" : it.color).attr("stroke", it.hollow ? "currentColor" : "none").attr("stroke-opacity", .5);
        const t = g.append("text").attr("x", 20).attr("y", 0).attr("font-size", fs).attr("fill", "currentColor");
        t.append("tspan").text(clip(it.label, 34) + "  ");
        t.append("tspan").attr("font-weight", 700).text(it.display);
      });
    }

    /* ----------------------- 1. Barras radiales ----------------------- */
    function radial(host, d) {
      const s = mk(host), items = d.items.slice(0, 8), n = items.length;
      const cx = 560, cy = 285, outer = 265, inner = 70, gap = 8, bw = (outer - inner - gap * (n - 1)) / n;
      const max = d3.max(items, i => i.value) || 1;
      const ang = d3.scaleLinear().domain([0, max]).range([0, Math.PI * 1.5]);
      const arc = d3.arc().cornerRadius(Math.min(6, bw / 2));
      const g = s.append("g").attr("transform", `translate(${cx},${cy})`), marks = [];
      items.forEach((it, i) => {
        const r1 = outer - i * (bw + gap), r0 = r1 - bw;
        const m = g.append("g");
        m.append("path").attr("d", arc({ innerRadius: r0, outerRadius: r1, startAngle: 0, endAngle: Math.PI * 1.5 })).attr("fill", "currentColor").attr("opacity", .09);
        m.append("path").attr("d", arc({ innerRadius: r0, outerRadius: r1, startAngle: 0, endAngle: Math.max(ang(it.value), .03) })).attr("fill", it.color);
        const t = m.append("text").attr("x", -10).attr("y", -(r0 + r1) / 2 + 5).attr("text-anchor", "end").attr("font-size", Math.min(16, bw * .78)).attr("fill", "currentColor");
        t.append("tspan").text(clip(it.label, 30) + "  ");
        t.append("tspan").attr("font-weight", 700).text(it.display);
        tip(m, `${it.label} — ${it.display}`); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 2. Puntos conectados ----------------------- */
    function lollipop(host, d) {
      const s = mk(host), items = d.items.slice(0, 12), n = items.length;
      const x0 = 300, x1 = 900, row = Math.min(46, (H - 30) / n);
      const max = d3.max(items, i => i.value) || 1, x = d3.scaleLinear().domain([0, max]).range([x0, x1]);
      const y0 = (H - row * n) / 2 + row / 2, marks = [];
      s.append("line").attr("x1", x0).attr("x2", x0).attr("y1", y0 - row / 2).attr("y2", y0 + row * (n - .5)).attr("stroke", "currentColor").attr("stroke-opacity", .25);
      items.forEach((it, i) => {
        const y = y0 + i * row, m = s.append("g");
        m.append("line").attr("x1", x0).attr("x2", x(it.value)).attr("y1", y).attr("y2", y).attr("stroke", it.color).attr("stroke-width", 3).attr("stroke-linecap", "round");
        m.append("circle").attr("cx", x(it.value)).attr("cy", y).attr("r", 10).attr("fill", it.color);
        m.append("circle").attr("cx", x(it.value)).attr("cy", y).attr("r", 15).attr("fill", "none").attr("stroke", it.color).attr("stroke-opacity", .4);
        m.append("text").attr("x", x0 - 14).attr("y", y + 5).attr("text-anchor", "end").attr("font-size", 18).attr("fill", "currentColor").text(clip(it.label, 32));
        m.append("text").attr("x", x(it.value) + 24).attr("y", y + 5).attr("font-size", 18).attr("font-weight", 700).attr("fill", "currentColor").text(it.display);
        tip(m, `${it.label} — ${it.display}`); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 3. Burbujas ----------------------- */
    function bubbles(host, d) {
      const s = mk(host), items = d.items.filter(i => i.value > 0).slice(0, 16);
      const pack = d3.pack().size([620, 520]).padding(9)(d3.hierarchy({ children: items }).sum(x => x.value || 0));
      const g = s.append("g").attr("transform", "translate(10,20)"), marks = [];
      pack.leaves().forEach(l => {
        const it = l.data, r = l.r, m = g.append("g").attr("transform", `translate(${l.x},${l.y})`);
        m.append("circle").attr("r", r + 6).attr("fill", "none").attr("stroke", it.color).attr("stroke-opacity", .55).attr("stroke-width", 1.5);
        m.append("circle").attr("r", r).attr("fill", it.color).attr("fill-opacity", .95);
        const fg = onFill(it.color);
        if (r >= 46) {
          m.append("text").attr("text-anchor", "middle").attr("y", -3).attr("font-size", 14).attr("fill", fg).text(clip(it.label, Math.floor(r / 4.6)));
          m.append("text").attr("text-anchor", "middle").attr("y", 16).attr("font-size", 15).attr("font-weight", 700).attr("fill", fg).text(it.display);
        } else if (r >= 24) m.append("text").attr("text-anchor", "middle").attr("y", 5).attr("font-size", 13).attr("font-weight", 700).attr("fill", fg).text(it.display.split(" · ").pop());
        tip(m, `${it.label} — ${it.display}`); marks.push(m);
      });
      hover(marks);
      legend(s, items, 670, 60, Math.min(32, 470 / items.length), 17);
    }

    /* ----------------------- 4. Mosaico ----------------------- */
    function treemap(host, d) {
      const s = mk(host), items = d.items.filter(i => i.value > 0).slice(0, 16);
      const root = d3.treemap().size([W, 470]).paddingInner(4).round(true)(d3.hierarchy({ children: items }).sum(x => x.value || 0));
      const marks = [], hidden = [];
      root.leaves().forEach(l => {
        const it = l.data, w = l.x1 - l.x0, h = l.y1 - l.y0, m = s.append("g").attr("transform", `translate(${l.x0},${l.y0})`);
        m.append("rect").attr("width", w).attr("height", h).attr("rx", 3).attr("fill", it.color);
        const fg = onFill(it.color);
        if (w >= 96 && h >= 48) {
          m.append("text").attr("x", 10).attr("y", 24).attr("font-size", Math.min(18, Math.max(12, w / 9))).attr("fill", fg).text(clip(it.label, Math.floor(w / 8.4)));
          m.append("text").attr("x", 10).attr("y", 46).attr("font-size", 17).attr("font-weight", 700).attr("fill", fg).text(it.display);
        } else hidden.push(it);
        tip(m, `${it.label} — ${it.display}`); marks.push(m);
      });
      hover(marks);
      if (hidden.length) {
        const t = s.append("text").attr("y", 505).attr("font-size", 13).attr("fill", "currentColor").attr("fill-opacity", .8);
        t.append("tspan").attr("x", 0).text("Sin etiqueta en el mosaico (ver tabla):");
        hidden.slice(0, 8).forEach((it, i) => t.append("tspan").attr("x", (i % 2) * 500).attr("dy", i % 2 === 0 ? 20 : 0).text(`${clip(it.label, 30)} · ${it.display.split(" · ").pop()}`));
      }
    }

    /* ----------------------- 5. Constelación (fuerzas) ----------------------- */
    function network(host, d) {
      const s = mk(host), items = d.items.slice(0, 12);
      const rs = d3.scaleSqrt().domain([0, d3.max(items, i => i.value) || 1]).range([16, 62]);
      const nodes = [{ hub: true, r: 32, x: W / 2, y: H / 2, label: d.center || "" }].concat(items.map((it, i) => Object.assign({ r: rs(it.value), it }, { x: W / 2 + Math.cos(i) * 120, y: H / 2 + Math.sin(i) * 120 })));
      const links = items.map((_, i) => ({ source: 0, target: i + 1 }));
      const sim = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).distance(l => 170 + (1 - l.target.r / 62) * 120).strength(.7))
        .force("charge", d3.forceManyBody().strength(-320))
        .force("collide", d3.forceCollide(n => n.r + (n.hub ? 14 : 46)))
        .force("x", d3.forceX(W / 2).strength(.05)).force("y", d3.forceY(H / 2).strength(.09)).stop();
      for (let i = 0; i < 320; i++) sim.tick();
      nodes.forEach(n => { n.x = Math.max(n.r + 110, Math.min(W - n.r - 110, n.x)); n.y = Math.max(n.r + 20, Math.min(H - n.r - 44, n.y)); });
      s.append("g").selectAll("line").data(links).join("line")
        .attr("x1", l => l.source.x).attr("y1", l => l.source.y).attr("x2", l => l.target.x).attr("y2", l => l.target.y)
        .attr("stroke", "currentColor").attr("stroke-opacity", .28).attr("stroke-width", 1.2);
      const hub = nodes[0];
      s.append("circle").attr("cx", hub.x).attr("cy", hub.y).attr("r", hub.r).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", .5).attr("stroke-dasharray", "3 4");
      s.append("text").attr("x", hub.x).attr("y", hub.y + 5).attr("text-anchor", "middle").attr("font-size", 14).attr("fill", "currentColor").text(hub.label);
      const marks = [];
      nodes.slice(1).forEach(n => {
        const it = n.it, m = s.append("g").attr("transform", `translate(${n.x},${n.y})`);
        m.append("circle").attr("r", n.r + 5).attr("fill", "none").attr("stroke", it.color).attr("stroke-opacity", .5);
        m.append("circle").attr("r", n.r).attr("fill", it.color);
        // etiqueta hacia afuera del centro: así los rótulos de nodos vecinos no se pisan
        const a = Math.atan2(n.y - hub.y, n.x - hub.x), ux = Math.cos(a), uy = Math.sin(a), off = n.r + 12;
        const anchor = ux > .35 ? "start" : ux < -.35 ? "end" : "middle";
        const t = m.append("text").attr("x", ux * off).attr("y", uy * off + (uy > .35 ? 14 : uy < -.35 ? -4 : 5)).attr("text-anchor", anchor).attr("font-size", 16).attr("fill", "currentColor");
        [["paint-order", "stroke"], ["stroke", d.bg], ["stroke-width", 4], ["stroke-linejoin", "round"]].forEach(([k, v]) => t.style(k, v));
        t.append("tspan").text(clip(it.label, 22) + " ");
        t.append("tspan").attr("font-weight", 700).text(it.display.split(" · ").pop());
        tip(m, `${it.label} — ${it.display}`); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 6. Dona ----------------------- */
    function donut(host, d) {
      const s = mk(host), items = d.items.filter(i => i.value > 0);
      const cx = 290, cy = 280, R = 235, r = 145;
      const arcs = d3.pie().value(i => i.value).sort(null).padAngle(.012)(items);
      const arc = d3.arc().innerRadius(r).outerRadius(R).cornerRadius(4);
      const g = s.append("g").attr("transform", `translate(${cx},${cy})`), marks = [];
      arcs.forEach(a => {
        const m = g.append("g");
        m.append("path").attr("d", arc(a)).attr("fill", a.data.hollow ? "none" : a.data.color).attr("stroke", a.data.hollow ? "currentColor" : "none").attr("stroke-opacity", .4).attr("stroke-dasharray", a.data.hollow ? "4 4" : null);
        tip(m, `${a.data.label} — ${a.data.display}`); marks.push(m);
      });
      hover(marks);
      const top = items.slice().sort((p, q) => q.value - p.value)[0];
      g.append("text").attr("text-anchor", "middle").attr("y", 8).attr("font-size", 44).attr("font-weight", 700).attr("fill", "currentColor").text(top.display.split(" · ").pop());
      g.append("text").attr("text-anchor", "middle").attr("y", 34).attr("font-size", 14).attr("fill", "currentColor").attr("fill-opacity", .7).text(clip(top.label, 26));
      legend(s, items, 590, 120, Math.min(36, 380 / items.length), 18);
    }

    /* =================== Comparar años (series) =================== */
    const yScale = d => { const mx = d3.max(d.series, s => d3.max(s.values.filter(v => v != null))) || 1; return d3.scaleLinear().domain([0, mx * 1.08]).range([H - 70, 40]); };

    /* ----------------------- 7. Pendiente entre años ----------------------- */
    function slope(host, d) {
      const s = mk(host), a = 0, b = d.years.length - 1, xa = 330, xb = 700;
      const ser = d.series.filter(z => z.values[a] != null && z.values[b] != null).slice(0, 12);
      const y = yScale(Object.assign({}, d, { series: ser }));
      const big = ser.reduce((p, z) => Math.abs(z.values[b] - z.values[a]) > Math.abs((p ? p.values[b] - p.values[a] : -1)) ? z : p, null);
      [[xa, d.years[a]], [xb, d.years[b]]].forEach(([x, t]) => s.append("text").attr("x", x).attr("y", 14).attr("text-anchor", "middle").attr("font-size", 15).attr("font-weight", 700).attr("fill", "currentColor").text(t));
      const L = spread(ser.map(z => ({ z, y: y(z.values[a]) })), 19, 40, H - 40), Rr = spread(ser.map(z => ({ z, y: y(z.values[b]) })), 19, 40, H - 40);
      const marks = [];
      ser.forEach(z => {
        const c = z === big ? d.accent : d.ink, m = s.append("g");
        m.append("line").attr("x1", xa).attr("y1", y(z.values[a])).attr("x2", xb).attr("y2", y(z.values[b])).attr("stroke", c).attr("stroke-width", z === big ? 3.5 : 2).attr("stroke-opacity", z === big ? 1 : .7);
        [[xa, z.values[a]], [xb, z.values[b]]].forEach(([x, v]) => m.append("circle").attr("cx", x).attr("cy", y(v)).attr("r", 5.5).attr("fill", c));
        const ly = L.find(o => o.z === z).y, ry = Rr.find(o => o.z === z).y;
        m.append("text").attr("x", xa - 14).attr("y", ly + 5).attr("text-anchor", "end").attr("font-size", 17).attr("fill", "currentColor").text(`${clip(z.label, 24)}  ${d.fmt(z.values[a])}`);
        m.append("text").attr("x", xb + 14).attr("y", ry + 5).attr("font-size", 17).attr("fill", "currentColor").text(`${d.fmt(z.values[b])}  ${clip(z.label, 24)}`);
        tip(m, `${z.label}: ${d.years[a]} ${d.fmt(z.values[a])} → ${d.years[b]} ${d.fmt(z.values[b])}`); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 8. Líneas por año ----------------------- */
    function lines(host, d) {
      const s = mk(host), ny = d.years.length, xL = 70, xR = 720;
      const x = d3.scalePoint().domain(d.years).range([xL, xR]), y = yScale(d);
      y.ticks(5).forEach(t => {
        s.append("line").attr("x1", xL - 10).attr("x2", xR + 10).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", "currentColor").attr("stroke-opacity", .12);
        s.append("text").attr("x", xL - 18).attr("y", y(t) + 4).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "currentColor").attr("fill-opacity", .6).text(d.fmt(t));
      });
      d.years.forEach(t => s.append("text").attr("x", x(t)).attr("y", H - 34).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 700).attr("fill", "currentColor").text(t));
      const line = d3.line().defined(p => p[1] != null).x(p => x(p[0])).y(p => y(p[1]));
      const ser = d.series.slice(0, 10), marks = [];
      const ends = spread(ser.map(z => { const k = z.values.map(v => v != null).lastIndexOf(true); return { z, k, y: k < 0 ? -99 : y(z.values[k]) }; }).filter(o => o.k >= 0), 19, 40, H - 60);
      ser.forEach(z => {
        const m = s.append("g"), pts = d.years.map((t, i) => [t, z.values[i]]);
        m.append("path").attr("d", line(pts)).attr("fill", "none").attr("stroke", z.color).attr("stroke-width", 2.5).attr("stroke-linejoin", "round");
        pts.filter(p => p[1] != null).forEach(p => m.append("circle").attr("cx", x(p[0])).attr("cy", y(p[1])).attr("r", 5).attr("fill", z.color).attr("stroke", d.bg).attr("stroke-width", 2));
        const e = ends.find(o => o.z === z);
        if (e) m.append("circle").attr("cx", x(d.years[e.k]) + 18).attr("cy", e.y).attr("r", 5).attr("fill", z.color);
        if (e) m.append("text").attr("x", x(d.years[e.k]) + 30).attr("y", e.y + 5).attr("font-size", 16).attr("fill", "currentColor").text(`${clip(z.label, 26)}  ${d.fmt(z.values[e.k])}`);
        tip(m, `${z.label}: ` + pts.filter(p => p[1] != null).map(p => `${p[0]} ${d.fmt(p[1])}`).join(" · ")); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 9. Mapa de calor ----------------------- */
    function heat(host, d) {
      const s = mk(host), ser = d.series.slice(0, 12), ny = d.years.length;
      const x0 = 300, cw = Math.min(190, (W - x0 - 20) / ny), ch = Math.min(72, (H - 90) / ser.length);
      const mx = d3.max(ser, z => d3.max(z.values.filter(v => v != null))) || 1;
      const lo = d3.interpolateRgb(d.bg, d.accent)(.16), hi = "#C9432B", col = d3.scaleLinear().domain([0, mx]).range([lo, hi]).interpolate(d3.interpolateRgb);
      d.years.forEach((t, i) => s.append("text").attr("x", x0 + i * cw + cw / 2).attr("y", 24).attr("text-anchor", "middle").attr("font-size", 18).attr("font-weight", 700).attr("fill", "currentColor").text(t));
      ser.forEach((z, r) => {
        const y = 44 + r * ch;
        s.append("text").attr("x", x0 - 14).attr("y", y + ch / 2 + 5).attr("text-anchor", "end").attr("font-size", 17).attr("fill", "currentColor").text(clip(z.label, 30));
        z.values.forEach((v, i) => {
          const g = s.append("g").attr("transform", `translate(${x0 + i * cw},${y})`);
          if (v == null) { g.append("rect").attr("x", 2).attr("y", 2).attr("width", cw - 4).attr("height", ch - 4).attr("rx", 3).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", .3).attr("stroke-dasharray", "3 4"); tip(g, `${z.label} · ${d.years[i]}: sin dato`); return; }
          const c = col(v);
          g.append("rect").attr("x", 2).attr("y", 2).attr("width", cw - 4).attr("height", ch - 4).attr("rx", 3).attr("fill", c);
          g.append("text").attr("x", cw / 2).attr("y", ch / 2 + 5).attr("text-anchor", "middle").attr("font-size", 18).attr("font-weight", 700).attr("fill", onFill(c)).text(d.fmt(v));
          tip(g, `${z.label} · ${d.years[i]}: ${d.fmt(v)}`);
        });
      });
    }

    /* =================== Poco comunes — un año =================== */

    /* ----------------------- 10. Espiral radial ----------------------- */
    function spiral(host, d) {
      const s = mk(host), items = d.items.slice(0, 12);
      const rs = d3.scaleSqrt().domain([0, d3.max(items, i => i.value) || 1]).range([13, 74]);
      const placed = []; let theta = 0;
      items.forEach((it, i) => {
        const r = rs(it.value); let x = 0, y = 0;
        if (i > 0) {
          let th = theta;
          for (let k = 0; k < 6000; k++) {
            th += .03; const rad = 17 * th; x = rad * Math.cos(th); y = rad * Math.sin(th);
            if (placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + r + 16)) break;
          }
          theta = th;
        }
        placed.push({ x, y, r, it });
      });
      const x0 = d3.min(placed, p => p.x - p.r), x1 = d3.max(placed, p => p.x + p.r), y0 = d3.min(placed, p => p.y - p.r), y1 = d3.max(placed, p => p.y + p.r);
      const k = Math.min((W - 450) / (x1 - x0), (H - 70) / (y1 - y0), 1.5);
      const g = s.append("g").attr("transform", `translate(${W / 2 - k * (x0 + x1) / 2},${H / 2 - k * (y0 + y1) / 2}) scale(${k})`);
      g.append("path").attr("d", d3.line().curve(d3.curveCatmullRom.alpha(.6))(placed.map(p => [p.x, p.y]))).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", .22).attr("stroke-width", 1.2 / k).attr("stroke-dasharray", `${4 / k} ${5 / k}`);
      const marks = [];
      placed.forEach((p, i) => {
        const m = g.append("g").attr("transform", `translate(${p.x},${p.y})`), fg = onFill(p.it.color);
        m.append("circle").attr("r", p.r + 5).attr("fill", "none").attr("stroke", p.it.color).attr("stroke-opacity", .5).attr("stroke-width", 1.4 / k);
        m.append("circle").attr("r", p.r).attr("fill", p.it.color);
        const val = p.it.display.split(" · ").pop();
        if (i === 0) {
          m.append("text").attr("text-anchor", "middle").attr("y", -4 / k).attr("font-size", 15 / k).attr("fill", fg).text(clip(p.it.label, 20));
          m.append("text").attr("text-anchor", "middle").attr("y", 16 / k).attr("font-size", 17 / k).attr("font-weight", 700).attr("fill", fg).text(val);
        } else {
          const a = Math.atan2(p.y, p.x), ux = Math.cos(a), uy = Math.sin(a), off = p.r + 10, anchor = ux > .3 ? "start" : ux < -.3 ? "end" : "middle";
          const t = m.append("text").attr("x", ux * off).attr("y", uy * off + (uy > .3 ? 13 / k : uy < -.3 ? -3 / k : 5 / k)).attr("text-anchor", anchor).attr("font-size", 15 / k).attr("fill", "currentColor");
          [["paint-order", "stroke"], ["stroke", d.bg], ["stroke-width", 4 / k], ["stroke-linejoin", "round"]].forEach(([a2, v]) => t.style(a2, v));
          t.append("tspan").text(clip(p.it.label, 22) + " "); t.append("tspan").attr("font-weight", 700).text(val);
        }
        tip(m, `${p.it.label} — ${p.it.display}`); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 11. Rosa de Nightingale ----------------------- */
    function rose(host, d) {
      const s = mk(host), items = d.items.slice(0, 12), n = items.length, cx = W / 2, cy = H / 2 + 6, R = 205, r0 = 26;
      const max = d3.max(items, i => i.value) || 1, rr = d3.scaleSqrt().domain([0, max]).range([r0, R]);
      const g = s.append("g").attr("transform", `translate(${cx},${cy})`), a = 2 * Math.PI / n, marks = [];
      [.25, .5, 1].forEach(t => g.append("circle").attr("r", rr(max * t)).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", .13).attr("stroke-dasharray", "2 4"));
      const arc = d3.arc().cornerRadius(3);
      items.forEach((it, i) => {
        const m = g.append("g"), a0 = i * a + .02, a1 = (i + 1) * a - .02, mid = (a0 + a1) / 2, rv = rr(it.value);
        m.append("path").attr("d", arc({ innerRadius: r0, outerRadius: rv, startAngle: a0, endAngle: a1 })).attr("fill", it.color).attr("fill-opacity", .95);
        const lr = rv + 16, ux = Math.sin(mid), uy = -Math.cos(mid), anchor = ux > .3 ? "start" : ux < -.3 ? "end" : "middle";
        const t = m.append("text").attr("x", ux * lr).attr("y", uy * lr + (uy > .3 ? 13 : uy < -.3 ? -3 : 5)).attr("text-anchor", anchor).attr("font-size", 15).attr("fill", "currentColor");
        t.append("tspan").text(clip(it.label, 22) + " "); t.append("tspan").attr("font-weight", 700).text(it.display.split(" · ").pop());
        tip(m, `${it.label} — ${it.display}`); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 12. Círculos anidados ----------------------- */
    function nested(host, d) {
      const s = mk(host), items = d.items.filter(i => i.value > 0).slice(0, 8);
      const max = d3.max(items, i => i.value) || 1, rs = d3.scaleSqrt().domain([0, max]).range([0, 245]);
      const cx = 300, base = 528, marks = [];
      const lab = spread(items.map(it => ({ it, y: base - 2 * rs(it.value) })), 30, 30, base);
      items.forEach((it, i) => {
        const r = rs(it.value), m = s.append("g");
        m.append("circle").attr("cx", cx).attr("cy", base - r).attr("r", r).attr("fill", it.color).attr("fill-opacity", .92).attr("stroke", d.bg).attr("stroke-width", 2.5);
        const ly = lab.find(o => o.it === it).y, ty = base - 2 * r;
        m.append("polyline").attr("points", `${cx},${ty} ${cx + 12},${ty} ${cx + 300 - (i * 6)},${ly} ${cx + 330 - (i * 6)},${ly}`.replace(/ +/g, " ")).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", .35);
        const t = m.append("text").attr("x", cx + 340 - (i * 6)).attr("y", ly + 5).attr("font-size", 17).attr("fill", "currentColor");
        t.append("tspan").text(clip(it.label, 30) + "  "); t.append("tspan").attr("font-weight", 700).text(it.display);
        tip(m, `${it.label} — ${it.display}`); marks.push(m);
      });
      hover(marks);
    }

    /* =================== Poco comunes — comparar años =================== */
    const yc = (d, i) => d.years.length < 2 ? d.ink : d3.interpolateRgb(d.ink, d.accent)(i / (d.years.length - 1));
    const delta = (d, v) => (v > 0 ? "+" : v < 0 ? "−" : "") + d.fmt(Math.abs(v)).replace("%", " pp");
    const yearLegend = (s, d, x, y) => d.years.forEach((t, i) => {
      s.append("circle").attr("cx", x + i * 96).attr("cy", y - 5).attr("r", 7).attr("fill", yc(d, i));
      s.append("text").attr("x", x + i * 96 + 13).attr("y", y).attr("font-size", 16).attr("font-weight", 700).attr("fill", "currentColor").text(t);
    });

    /* ----------------------- 13. Haltera (puntos conectados entre años) ----------------------- */
    function dumbbell(host, d) {
      const s = mk(host), ser = d.series.slice(0, 10), n = ser.length, x0 = 330, x1 = 830, row = Math.min(52, (H - 100) / n), y0 = 76 + (H - 100 - Math.min(52, (H - 100) / n) * n) / 2;
      const mx = d3.max(ser, z => d3.max(z.values.filter(v => v != null))) || 1, x = d3.scaleLinear().domain([0, mx * 1.05]).range([x0, x1]);
      yearLegend(s, d, x0, 24);
      s.append("line").attr("x1", x0).attr("x2", x0).attr("y1", y0 - row / 2).attr("y2", y0 + row * (n - .5)).attr("stroke", "currentColor").attr("stroke-opacity", .25);
      const marks = [];
      ser.forEach((z, r) => {
        const y = y0 + r * row, m = s.append("g"), pts = z.values.map((v, i) => [v, i]).filter(p => p[0] != null);
        const lo = d3.min(pts, p => p[0]), hi = d3.max(pts, p => p[0]);
        m.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", y).attr("y2", y).attr("stroke", "currentColor").attr("stroke-opacity", .35).attr("stroke-width", 4).attr("stroke-linecap", "round");
        pts.forEach(([v, i]) => m.append("circle").attr("cx", x(v)).attr("cy", y).attr("r", 10).attr("fill", yc(d, i)).attr("stroke", d.bg).attr("stroke-width", 2));
        m.append("text").attr("x", x0 - 16).attr("y", y + 5).attr("text-anchor", "end").attr("font-size", 17).attr("fill", "currentColor").text(clip(z.label, 30));
        const ch = pts[pts.length - 1][0] - pts[0][0];
        m.append("text").attr("x", x(hi) + 22).attr("y", y + 5).attr("font-size", 16).attr("font-weight", 700).attr("fill", ch === 0 ? "currentColor" : (ch > 0 ? d.accent : "currentColor")).text(delta(d, ch));
        tip(m, `${z.label}: ` + pts.map(([v, i]) => `${d.years[i]} ${d.fmt(v)}`).join(" · ")); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 14. Ranking entre años (bump) ----------------------- */
    function bump(host, d) {
      const s = mk(host), ser = d.series.slice(0, 10), n = ser.length, ny = d.years.length;
      const x = d3.scalePoint().domain(d.years).range([330, 720]), y = d3.scaleLinear().domain([1, Math.max(n, 2)]).range([50, H - 70]);
      const rank = ser.map(() => Array(ny).fill(null));
      d.years.forEach((_, i) => ser.map((z, k) => ({ k, v: z.values[i] })).filter(o => o.v != null).sort((a, b) => b.v - a.v || a.k - b.k).forEach((o, r) => { rank[o.k][i] = r + 1; }));
      d.years.forEach(t => s.append("text").attr("x", x(t)).attr("y", 20).attr("text-anchor", "middle").attr("font-size", 17).attr("font-weight", 700).attr("fill", "currentColor").text(t));
      const line = d3.line().defined(p => p[1] != null).x(p => x(p[0])).y(p => y(p[1])).curve(d3.curveMonotoneX), marks = [];
      ser.forEach((z, k) => {
        const m = s.append("g"), pts = d.years.map((t, i) => [t, rank[k][i]]), fg = onFill(z.color);
        m.append("path").attr("d", line(pts)).attr("fill", "none").attr("stroke", z.color).attr("stroke-width", 5).attr("stroke-linecap", "round").attr("stroke-opacity", .85);
        pts.forEach(([t, r], i) => { if (r == null) return; m.append("circle").attr("cx", x(t)).attr("cy", y(r)).attr("r", 14).attr("fill", z.color).attr("stroke", d.bg).attr("stroke-width", 2.5); m.append("text").attr("x", x(t)).attr("y", y(r) + 5).attr("text-anchor", "middle").attr("font-size", 14).attr("font-weight", 700).attr("fill", fg).text(r); });
        const f = pts.findIndex(p => p[1] != null), l = pts.map(p => p[1] != null).lastIndexOf(true);
        if (f === 0) m.append("text").attr("x", x(d.years[0]) - 26).attr("y", y(rank[k][0]) + 5).attr("text-anchor", "end").attr("font-size", 16).attr("fill", "currentColor").text(`${clip(z.label, 26)}  ${d.fmt(z.values[0])}`);
        if (l === ny - 1) m.append("text").attr("x", x(d.years[ny - 1]) + 26).attr("y", y(rank[k][ny - 1]) + 5).attr("font-size", 16).attr("fill", "currentColor").text(`${d.fmt(z.values[ny - 1])}  ${clip(z.label, 26)}`);
        tip(m, `${z.label}: ` + pts.filter(p => p[1] != null).map(p => `${p[0]} lugar ${p[1]}`).join(" · ")); marks.push(m);
      });
      hover(marks);
    }

    /* ----------------------- 15. Anillos por año ----------------------- */
    function rings(host, d) {
      const s = mk(host), ny = d.years.length, cx = 290, cy = 285, R = 260, inner = 62, gap = 7, rw = (R - inner - gap * (ny - 1)) / ny;
      const ser = d.series.slice().sort((a, b) => a.k - b.k), g = s.append("g").attr("transform", `translate(${cx},${cy})`), arc = d3.arc().cornerRadius(2.5);
      d.years.forEach((t, i) => {
        const r0 = inner + i * (rw + gap), r1 = r0 + rw; let a = 0;
        g.append("path").attr("d", arc({ innerRadius: r0, outerRadius: r1, startAngle: 0, endAngle: 2 * Math.PI })).attr("fill", "currentColor").attr("opacity", .07);
        ser.forEach(z => {
          const v = z.values[i]; if (v == null || v <= 0) return;
          const a1 = a + v / 100 * 2 * Math.PI, m = g.append("path").attr("d", arc({ innerRadius: r0, outerRadius: r1, startAngle: a, endAngle: Math.min(a1, 2 * Math.PI) - .012 })).attr("fill", z.color);
          m.append("title").text(`${z.label} · ${t}: ${d.fmt(v)}`); a = a1;
        });
        g.append("text").attr("x", -8).attr("y", -(r0 + r1) / 2 + 5).attr("text-anchor", "end").attr("font-size", Math.min(16, rw * .8)).attr("font-weight", 700).attr("fill", "currentColor")
          .style("paint-order", "stroke").style("stroke", d.bg).style("stroke-width", 4).style("stroke-linejoin", "round").text(t);
      });
      legend(s, ser.map(z => ({ label: z.label, color: z.color, display: d.years.map((_, i) => z.values[i] != null ? d.fmt(z.values[i]) : "–").join(" · ") })), 600, 120, Math.min(36, 380 / ser.length), 17);
    }

    /* ----------------------- 16. Río (streamgraph) ----------------------- */
    function stream(host, d) {
      const s = mk(host), ny = d.years.length, ser = d.series.slice().sort((a, b) => a.k - b.k);
      const rows = d.years.map((t, i) => Object.fromEntries([["year", t]].concat(ser.map(z => [z.label, z.values[i] == null ? 0 : z.values[i]]))));
      const layers = d3.stack().keys(ser.map(z => z.label)).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows);
      const x = d3.scalePoint().domain(d.years).range([70, 690]);
      const y = d3.scaleLinear().domain([d3.min(layers, l => d3.min(l, p => p[0])), d3.max(layers, l => d3.max(l, p => p[1]))]).range([H - 90, 40]);
      const area = d3.area().curve(d3.curveCatmullRom.alpha(.5)).x((p, i) => x(d.years[i])).y0(p => y(p[0])).y1(p => y(p[1])), marks = [];
      layers.forEach((l, i) => {
        const z = ser[i], m = s.append("g");
        m.append("path").attr("d", area(l)).attr("fill", z.color).attr("fill-opacity", .95).attr("stroke", d.bg).attr("stroke-width", 1.5);
        tip(m, `${z.label}: ` + z.values.map((v, k) => v != null ? `${d.years[k]} ${d.fmt(v)}` : null).filter(Boolean).join(" · ")); marks.push(m);
      });
      hover(marks);
      d.years.forEach(t => s.append("text").attr("x", x(t)).attr("y", H - 46).attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", 700).attr("fill", "currentColor").text(t));
      const ends = spread(layers.map((l, i) => ({ i, y: y((l[ny - 1][0] + l[ny - 1][1]) / 2) })), 20, 30, H - 80);
      ends.forEach(o => { const z = ser[o.i], last = z.values.map(v => v != null).lastIndexOf(true);
        s.append("circle").attr("cx", 712).attr("cy", o.y - 5).attr("r", 6).attr("fill", z.color);
        s.append("text").attr("x", 726).attr("y", o.y).attr("font-size", 16).attr("fill", "currentColor").text(`${clip(z.label, 24)}  ${last >= 0 ? d.fmt(z.values[last]) : ""}`); });
    }

    /* ----------------------- 17. Radar por año ----------------------- */
    function radar(host, d) {
      const s = mk(host), ser = d.series.slice(0, 10).sort((a, b) => a.k - b.k), n = ser.length, cx = 500, cy = 300, R = 205;
      const mx = d3.max(ser, z => d3.max(z.values.filter(v => v != null))) || 1, r = d3.scaleLinear().domain([0, mx * 1.05]).range([0, R]);
      const pos = (i, v) => { const a = i / n * 2 * Math.PI; return [cx + r(v) * Math.sin(a), cy - r(v) * Math.cos(a)]; };
      [.25, .5, .75, 1].forEach(t => {
        s.append("polygon").attr("points", ser.map((_, i) => pos(i, mx * 1.05 * t).join(",")).join(" ")).attr("fill", "none").attr("stroke", "currentColor").attr("stroke-opacity", .14);
      });
      s.append("text").attr("x", cx + 6).attr("y", cy - R + 12).attr("font-size", 12).attr("fill", "currentColor").attr("fill-opacity", .6).text(d.fmt(mx * 1.05));
      ser.forEach((z, i) => {
        const [x, y] = pos(i, mx * 1.05), a = i / n * 2 * Math.PI, ux = Math.sin(a), uy = -Math.cos(a);
        s.append("line").attr("x1", cx).attr("y1", cy).attr("x2", x).attr("y2", y).attr("stroke", "currentColor").attr("stroke-opacity", .14);
        s.append("text").attr("x", x + ux * 14).attr("y", y + uy * 14 + (uy > .3 ? 12 : uy < -.3 ? -2 : 5)).attr("text-anchor", ux > .3 ? "start" : ux < -.3 ? "end" : "middle").attr("font-size", 16).attr("fill", "currentColor").text(clip(z.label, 24));
      });
      d.years.forEach((t, yi) => {
        const pts = ser.map((z, i) => pos(i, z.values[yi] == null ? 0 : z.values[yi])), c = yc(d, yi), m = s.append("g");
        m.append("polygon").attr("points", pts.map(p => p.join(",")).join(" ")).attr("fill", c).attr("fill-opacity", .13).attr("stroke", c).attr("stroke-width", 3).attr("stroke-linejoin", "round");
        pts.forEach((p, i) => { if (ser[i].values[yi] != null) m.append("circle").attr("cx", p[0]).attr("cy", p[1]).attr("r", 5).attr("fill", c).append("title").text(`${ser[i].label} · ${t}: ${d.fmt(ser[i].values[yi])}`); });
      });
      yearLegend(s, d, 20, 30);
    }

    [["radial", "Barras radiales", radial], ["lollipop", "Puntos conectados", lollipop], ["bubbles", "Burbujas", bubbles],
     ["treemap", "Mosaico", treemap], ["network", "Constelación", network], ["donut", "Dona", donut],
     ["slope", "Pendiente entre años", slope], ["lines", "Líneas por año", lines], ["heat", "Mapa de calor por año", heat],
     ["spiral", "Espiral radial", spiral], ["rose", "Rosa de Nightingale", rose], ["nested", "Círculos anidados", nested],
     ["dumbbell", "Haltera entre años", dumbbell], ["bump", "Ranking entre años", bump], ["rings", "Anillos por año", rings], ["stream", "Río de categorías", stream], ["radar", "Radar por año", radar]]
      .forEach(([k, l, f]) => G.register(k, l, f));
    document.dispatchEvent(new Event("gc:d3-ready"));
  }

  if (window.GCCharts && window.GCCharts.ready) boot(); else document.addEventListener("gc:charts-ready", boot, { once: true });
})();
