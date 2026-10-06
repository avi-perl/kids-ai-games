// Charts — the History screen's line chart and 9×9 heatmap, hand-rolled in SVG/HTML.
// Line: 2px, ringed markers, hairline grid, crosshair + tooltip (pointer, touch, keyboard).
// Heatmap: one light blue ramp, so the grid stays soft.
const Charts = (() => {
  const COL = { line: '#2a78d6', grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', surface: '#ffffff', empty: '#f4f4f1' };
  // Light sequential blue: near-white → mid blue (reference ramp, light end).
  const RAMP = ['#f2f7fe', '#e2eefc', '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef'];
  const SVG = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent.appendChild(n);
    return n;
  }

  function niceTicks(max) {
    if (!(max > 0)) return [0, 1];
    const raw = max / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = 0; v <= Math.ceil(max / step) * step + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  // Value first (strong), label second.
  function makeTip(host) {
    const tip = document.createElement('div');
    tip.className = 'ctip';
    const v = document.createElement('b');
    const l = document.createElement('span');
    tip.append(v, l);
    host.appendChild(tip);
    return {
      show(x, y, value, label) {
        v.textContent = value;
        l.textContent = label;
        tip.classList.add('show');
        tip.style.left = Math.max(0, Math.min(host.clientWidth - tip.offsetWidth, x - tip.offsetWidth / 2)) + 'px';
        tip.style.top = Math.max(0, y - tip.offsetHeight - 12) + 'px';
      },
      hide() { tip.classList.remove('show'); },
    };
  }

  // points: [{ x, y, label }] (y may be null). opts: xTicks(min, max) → [{ x, text }],
  // yFmt(v, isTick) → text, ticks (fixed y ticks), label.
  function line(host, points, opts) {
    host.innerHTML = '';
    host.classList.add('chart');
    const W = Math.max(240, host.clientWidth || 300);
    const H = 140;
    const m = { l: 32, r: 40, t: 10, b: 20 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const valid = points.filter(p => p.y != null);
    const ticks = opts.ticks || niceTicks(Math.max(0, ...valid.map(p => p.y)));
    const yTop = ticks[ticks.length - 1];
    const xs = points.map(p => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const X = x => m.l + (x1 === x0 ? pw / 2 : ((x - x0) / (x1 - x0)) * pw);
    const Y = y => m.t + ph - (y / yTop) * ph;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, tabindex: 0, role: 'img', 'aria-label': opts.label }, host);
    for (const t of ticks) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: t === 0 ? COL.axis : COL.grid, 'stroke-width': 1, 'shape-rendering': 'crispEdges' }, svg);
      el('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end', class: 'ctick' }, svg).textContent = opts.yFmt(t, true);
    }
    for (const t of opts.xTicks(x0, x1)) {
      el('text', { x: X(t.x), y: H - 4, 'text-anchor': 'middle', class: 'ctick' }, svg).textContent = t.text;
    }

    let d = '';
    let pen = false;
    for (const p of points) {
      if (p.y == null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`;
      pen = true;
    }
    el('path', { d, fill: 'none', stroke: COL.line, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    // Markers while there's room, otherwise only the latest.
    valid.forEach((p, i) => {
      if (valid.length > 40 && i !== valid.length - 1) return;
      el('circle', { cx: X(p.x), cy: Y(p.y), r: 4, fill: COL.line, stroke: COL.surface, 'stroke-width': 2 }, svg);
    });
    if (valid.length) {
      const last = valid[valid.length - 1];
      el('text', { x: X(last.x) + 8, y: Y(last.y) + 4, class: 'cend' }, svg).textContent = opts.yFmt(last.y);
    }

    // Crosshair: the pointer snaps to the nearest x.
    const cross = el('line', { y1: m.t, y2: m.t + ph, stroke: COL.muted, 'stroke-width': 1, visibility: 'hidden' }, svg);
    const ring = el('circle', { r: 6, fill: COL.line, stroke: COL.surface, 'stroke-width': 2, visibility: 'hidden' }, svg);
    const tip = makeTip(host);
    let idx = -1;
    function focusPoint(i) {
      if (!valid.length) return;
      idx = Math.max(0, Math.min(valid.length - 1, i));
      const p = valid[idx];
      cross.setAttribute('x1', X(p.x)); cross.setAttribute('x2', X(p.x));
      ring.setAttribute('cx', X(p.x)); ring.setAttribute('cy', Y(p.y));
      cross.setAttribute('visibility', 'visible');
      ring.setAttribute('visibility', 'visible');
      const scale = svg.getBoundingClientRect().width / W || 1;
      tip.show(X(p.x) * scale, Y(p.y) * scale, opts.yFmt(p.y), p.label);
    }
    function clear() { idx = -1; cross.setAttribute('visibility', 'hidden'); ring.setAttribute('visibility', 'hidden'); tip.hide(); }
    function nearest(e) {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      let best = 0;
      valid.forEach((p, i) => { if (Math.abs(X(p.x) - px) < Math.abs(X(valid[best].x) - px)) best = i; });
      return best;
    }
    svg.addEventListener('pointermove', e => focusPoint(nearest(e)));
    svg.addEventListener('pointerdown', e => focusPoint(nearest(e)));
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') clear(); });
    svg.addEventListener('focus', () => focusPoint(valid.length - 1));
    svg.addEventListener('blur', clear);
    svg.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { focusPoint(idx - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { focusPoint(idx + 1); e.preventDefault(); }
    });
  }

  const ramp = t => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))))];

  // 9×9 heatmap. cells: { key: { value | null, tip } }; onSelect(key) when a square is tapped.
  function heat(host, cells, { min, max, fmt, selected, onSelect, label }) {
    host.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'hgrid';
    grid.setAttribute('aria-label', label);
    const hdr = text => {
      const h = document.createElement('div');
      h.className = 'hdr';
      h.textContent = text;
      grid.appendChild(h);
    };
    hdr('×');
    for (let b = 1; b <= 9; b++) hdr(b);
    const tip = makeTip(host);
    for (let a = 1; a <= 9; a++) {
      hdr(a);
      for (let b = 1; b <= 9; b++) {
        const key = `${a}x${b}`;
        const c = cells[key];
        const btn = document.createElement('button');
        btn.className = 'hcell' + (key === selected ? ' sel' : '') + (c.value == null ? ' none' : '');
        btn.style.background = c.value == null ? COL.empty : ramp(max > min ? (c.value - min) / (max - min) : 0);
        btn.setAttribute('aria-label', `${a} × ${b}: ${c.tip}`);
        btn.addEventListener('click', () => onSelect(key));
        btn.addEventListener('pointerenter', e => {
          if (e.pointerType !== 'mouse') return;
          const r = btn.getBoundingClientRect();
          const hr = host.getBoundingClientRect();
          tip.show(r.left - hr.left + r.width / 2, r.top - hr.top, `${a} × ${b}`, c.tip);
        });
        btn.addEventListener('pointerleave', () => tip.hide());
        grid.appendChild(btn);
      }
    }
    host.appendChild(grid);

    const sc = document.createElement('div');
    sc.className = 'hscale';
    const lo = document.createElement('span');
    lo.textContent = fmt(min);
    const bar = document.createElement('i');
    bar.style.background = `linear-gradient(90deg, ${RAMP.join(',')})`;
    const hi = document.createElement('span');
    hi.textContent = fmt(max);
    sc.append(lo, bar, hi);
    host.appendChild(sc);
  }

  return { line, heat };
})();
