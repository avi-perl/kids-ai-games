// Note text — prints a note (a little Markdown) onto the blank note in the door photo (door-blank.jpg).
// The note is laid out flat in Times, bent onto the paper with a perspective map and inked into
// the photo's own pixels, so it zooms, blurs and grains exactly like the rest of the picture.
const NoteText = (() => {
  // The paper's corners in the photo, in its pixels: top-left, top-right, bottom-right, bottom-left.
  const PAPER = [[276, 557.5], [785, 576.5], [796.5, 842.5], [310, 865]];
  const FLAT_W = 500, FLAT_H = 290; // the paper laid flat, in about the same pixels
  const SS = 3;                     // the flat text is drawn this many times finer than the photo

  const DEFAULTS = {
    font: '"Times New Roman", Tinos, Times, serif',
    maxSize: 56, minSize: 12,   // letter size range, in photo pixels
    margin: [0.1, 0.17],        // blank border, as a share of the paper's width and height
    lineHeight: 1.2,
    ink: [0.25, 0.23, 0.22],    // how much light the toner lets through, per colour channel
    density: 0.95,              // overall ink strength, 0..1
    blur: 0.45,                 // softness to match the camera, in photo pixels
    sharpen: 0.42,              // the phone's sharpening: a faint light rim around each stroke
    rough: 0.3,                 // how far the ink edges wander, in photo pixels
    grain: 3.5,                 // camera noise in the ink, in 0..255 levels
    wear: 2.5,                  // toner rubbed off where the paper is scuffed lighter than around it
    crease: 0.6,                // toner cracked along creases and fibres
    tilt: 0.6,                  // most the print may sit crooked on the sheet, in degrees
    shift: 0.03,                // most the print may sit off-centre, as a share of the paper
    jpeg: 0.85,                 // quality of the finished photo; its blocks fall on the letters too
    seed: 7,
  };

  // --- Perspective map --------------------------------------------------------------------------

  // The 3×3 map (as 8 numbers) that takes each `from` point to the matching `to` point.
  function homography(from, to) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = from[i], [x, y] = to[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    for (let c = 0; c < 8; c++) { // Gaussian elimination with partial pivoting
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = c + 1; r < 8; r++) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = new Array(8);
    for (let r = 7; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k];
      h[r] = s / A[r][r];
    }
    return h;
  }

  // --- Noise ------------------------------------------------------------------------------------

  function rng(seed) { // mulberry32
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, seed) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // Smooth value noise in 0..1.
  function noise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
    const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // --- Markdown ---------------------------------------------------------------------------------
  // The note is a small Markdown: # ## ### headings, - * + or 1. lists, > quotes, --- rules, blank
  // lines between paragraphs and a plain newline for a line break; **bold**, *italic*, ***both***,
  // ~~struck~~, `typed`, and a backslash to escape. It becomes DOM nodes, never HTML, because the
  // text comes from a link.

  const ESCAPABLE = '\\`*_~#>+-.!';
  const PUA = 0xe000; // escaped characters wait here, out of the markup's way, until drawn
  const HIDDEN = new RegExp(`[${String.fromCharCode(PUA)}-${String.fromCharCode(PUA + ESCAPABLE.length - 1)}]`, 'g');
  const hide = s => s.replace(/\\([\\`*_~#>+\-.!])/g, (_, c) => String.fromCharCode(PUA + ESCAPABLE.indexOf(c)));
  const show = s => s.replace(HIDDEN, c => ESCAPABLE[c.charCodeAt(0) - PUA]);

  function parseBlocks(md) {
    const blocks = [];
    let para = null, list = null, quote = null;
    for (const line of hide(String(md)).replace(/\r\n?/g, '\n').split('\n')) {
      let m;
      if (!line.trim()) {
        para = list = quote = null;
      } else if ((m = /^\s*(#{1,3})\s+(.*?)(\s+#+)?\s*$/.exec(line))) {
        para = list = quote = null;
        blocks.push({ type: 'h' + m[1].length, text: m[2] });
      } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        para = list = quote = null;
        blocks.push({ type: 'hr' });
      } else if ((m = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line))) {
        const ordered = /\d/.test(m[1]);
        if (!list || list.ordered !== ordered) blocks.push(list = { type: 'list', ordered, start: parseInt(m[1], 10) || 1, items: [] });
        list.items.push(m[2]);
        para = quote = null;
      } else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
        if (quote) quote.text += '\n' + m[1];
        else blocks.push(quote = { type: 'quote', text: m[1] });
        para = list = null;
      } else if (list && /^\s/.test(line)) {
        list.items[list.items.length - 1] += '\n' + line.trim(); // an indented line carries on the item
      } else if (para) {
        para.text += '\n' + line.trim();
      } else {
        blocks.push(para = { type: 'p', text: line.trim() });
        list = quote = null;
      }
    }
    return blocks;
  }

  // Inline marks, tried together; the earliest wins, and on a tie the first listed.
  const INLINE = [
    [/`([^`]+)`/, ['code']],
    [/\*\*\*(?=\S)([^]*?\S)\*\*\*/, ['b', 'i']],
    [/\*\*(?=\S)([^]*?\S)\*\*/, ['b']],
    [/(?<!\w)__(?=\S)([^]*?\S)__(?!\w)/, ['b']],
    [/\*(?=\S)([^*]*?\S)\*/, ['i']],
    [/(?<!\w)_(?=\S)([^_]*?\S)_(?!\w)/, ['i']],
    [/~~(?=\S)([^]*?\S)~~/, ['s']],
  ];

  function addText(parent, text) {
    text.split('\n').forEach((t, i) => {
      if (i) parent.append(document.createElement('br'));
      if (t) parent.append(show(t));
    });
  }

  function inline(parent, text) {
    while (text) {
      let best = null;
      for (const [re, tags] of INLINE) {
        const m = re.exec(text);
        if (m && (!best || m.index < best.m.index)) best = { m, tags };
      }
      if (!best) return addText(parent, text);
      const { m, tags } = best;
      addText(parent, text.slice(0, m.index));
      let inner = parent;
      for (const tag of tags) inner = inner.appendChild(document.createElement(tag));
      if (tags[0] === 'code') addText(inner, m[1]);
      else inline(inner, m[1]);
      text = text.slice(m.index + m[0].length);
    }
  }

  function buildDoc(blocks) {
    const doc = document.createElement('div');
    doc.className = 'doc';
    for (const b of blocks) {
      if (b.type === 'hr') {
        doc.append(document.createElement('hr'));
      } else if (b.type === 'list') {
        const list = doc.appendChild(document.createElement('div'));
        list.className = 'list';
        b.items.forEach((item, i) => {
          const li = list.appendChild(document.createElement('div'));
          li.className = 'li';
          li.dir = 'auto';
          const mark = li.appendChild(document.createElement('span'));
          mark.className = 'mark';
          mark.textContent = b.ordered ? `${b.start + i}.` : '•';
          inline(li, item);
        });
      } else {
        const el = doc.appendChild(document.createElement(b.type === 'quote' ? 'blockquote' : b.type));
        el.dir = 'auto';
        inline(el, b.text);
      }
    }
    return doc;
  }

  // --- Layout -----------------------------------------------------------------------------------
  // The browser lays the note out (wrapping, fonts, lists, right-to-left) on a hidden stage the
  // size of the flat paper; then every word is drawn onto the canvas where the browser put it.

  const stageCss = o => `
    :host { all: initial; }
    .doc { display: flow-root; font-family: ${o.font}; line-height: ${o.lineHeight}; color: #000; text-align: start; }
    .doc.center { text-align: center; }
    .doc > * { margin: 0 0 .4em; }
    .doc > :last-child { margin-bottom: 0; }
    h1, h2, h3 { font-weight: bold; line-height: 1.1; text-align: center; text-wrap: balance; }
    h1 { font-size: 1.6em; }
    h2 { font-size: 1.3em; }
    h3 { font-size: 1.12em; }
    p, .li, blockquote { text-wrap: pretty; }
    .center p { text-wrap: balance; }
    blockquote { margin-inline-start: 1.2em; font-style: italic; }
    code { font-family: "Courier New", Courier, monospace; }
    hr { border: 0; height: .07em; background: #000; margin: .5em 0; }
    .li { position: relative; padding-inline-start: 1.3em; }
    .li + .li { margin-top: .15em; }
    .mark { position: absolute; inset-inline-start: 0; }`;

  let host;
  function stage(o) {
    if (!host) {
      host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
      host.attachShadow({ mode: 'open' });
    }
    if (!host.isConnected) document.body.append(host);
    host.shadowRoot.innerHTML = `<style>${stageCss(o)}</style>`; // our own CSS only, no note text
    return host.shadowRoot;
  }

  function* textNodes(root) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) yield walk.currentNode;
  }

  // How many lines the laid-out note takes (line pieces whose middles sit within half a letter).
  function countLines(doc, size) {
    const mids = [], range = document.createRange();
    for (const node of textNodes(doc)) {
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width) mids.push(r.top + r.height / 2);
    }
    mids.sort((a, b) => a - b);
    return mids.filter((y, i) => !i || y - mids[i - 1] > size / 2).length;
  }

  // Every word (or line) to draw, with its font and where the browser put it.
  function collect(doc) {
    const ops = [], range = document.createRange();
    const probe = document.createElement('canvas').getContext('2d');
    const o = doc.getBoundingClientRect();
    for (const node of textNodes(doc)) {
      const cs = getComputedStyle(node.parentElement);
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const size = parseFloat(cs.fontSize);
      probe.font = font;
      const ascent = probe.measureText('').fontBoundingBoxAscent ?? size * 0.89;
      const rtl = cs.direction === 'rtl';
      const put = (text, r) => ops.push({ text, font, rtl, x: r.left - o.left, y: r.top - o.top + ascent, w: r.width, top: r.top - o.top, h: r.height });
      for (const m of node.data.matchAll(/\S+/g)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rects = [...range.getClientRects()].filter(r => r.width);
        if (rects.length === 1) { put(m[0], rects[0]); continue; }
        for (let i = 0; i < m[0].length; i++) { // the word broke across lines: letter by letter
          range.setStart(node, m.index + i);
          range.setEnd(node, m.index + i + 1);
          const r = range.getClientRects()[0];
          if (r && r.width) put(m[0][i], r);
        }
      }
      if (node.parentElement.closest('s')) {
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width) ops.push({ line: true, x: r.left - o.left, y: r.top - o.top + ascent - size * 0.3, w: r.width, t: size * 0.06 });
        }
      }
    }
    for (const hr of doc.querySelectorAll('hr')) {
      const r = hr.getBoundingClientRect();
      ops.push({ line: true, x: r.left - o.left, y: r.top - o.top + r.height / 2, w: r.width, t: Math.max(r.height, 0.8) });
    }
    return ops;
  }

  // The biggest letter size at which the note fits the paper, its column narrowed as far as it
  // goes without adding a line (so no word is left alone), and what to draw.
  function layout(text, o) {
    const root = stage(o);
    const blocks = parseBlocks(text);
    const doc = root.appendChild(buildDoc(blocks));
    const boxW = FLAT_W * (1 - 2 * o.margin[0]), boxH = FLAT_H * (1 - 2 * o.margin[1]);
    const set = (size, width) => { doc.style.fontSize = `${size}px`; doc.style.width = `${width}px`; };
    const fits = width => doc.getBoundingClientRect().height <= boxH && doc.scrollWidth <= Math.ceil(width);

    let lo = o.minSize, hi = o.maxSize;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      set(mid, boxW);
      if (fits(boxW)) lo = mid; else hi = mid - 1;
    }
    const size = lo;
    set(size, boxW);
    // A few lines are centred, like a sign; anything longer is flush to its start side, like a letter.
    const lines = countLines(doc, size);
    doc.classList.toggle('center', lines <= 3 && blocks.every(b => b.type === 'p' || b.type[0] === 'h'));

    let a = boxW * 0.3, z = boxW;
    for (let i = 0; i < 10; i++) {
      const mid = (a + z) / 2;
      set(size, mid);
      if (fits(mid) && countLines(doc, size) <= lines) z = mid; else a = mid;
    }
    set(size, z);
    const ops = collect(doc);
    doc.remove();
    return { size, lines, ops };
  }

  // The note drawn flat on a transparent sheet, SS times finer than the photo. Returns its alpha.
  function flatInk(text, o) {
    const cv = document.createElement('canvas');
    cv.width = FLAT_W * SS; cv.height = FLAT_H * SS;
    const ctx = cv.getContext('2d');
    const { size, lines, ops } = layout(text, o);
    ctx.scale(SS, SS);
    // Printed a little crooked and off-centre, the same way every time for the same text.
    let h = o.seed;
    for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761);
    const r1 = hash(h, 1, o.seed) * 2 - 1, r2 = hash(h, 2, o.seed) * 2 - 1, r3 = hash(h, 3, o.seed) * 2 - 1;
    ctx.translate(FLAT_W / 2 + r2 * o.shift * FLAT_W, FLAT_H / 2 + r3 * o.shift * FLAT_H);
    ctx.rotate((r1 * o.tilt * Math.PI) / 180);
    ctx.translate(-FLAT_W / 2, -FLAT_H / 2);
    if (o.grid) { // debug: a square grid on the flat sheet, to check the perspective map
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
      for (let x = 0; x <= FLAT_W; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FLAT_H); ctx.stroke(); }
      for (let y = 0; y <= FLAT_H; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FLAT_W, y); ctx.stroke(); }
    }
    // The printed block, centred on the paper.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const op of ops) {
      const top = op.line ? op.y - op.t / 2 : op.top, bottom = op.line ? op.y + op.t / 2 : op.top + op.h;
      x0 = Math.min(x0, op.x); x1 = Math.max(x1, op.x + op.w);
      y0 = Math.min(y0, top); y1 = Math.max(y1, bottom);
    }
    if (ops.length) ctx.translate(FLAT_W / 2 - (x0 + x1) / 2, FLAT_H / 2 - (y0 + y1) / 2);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const op of ops) {
      if (op.line) { ctx.fillRect(op.x, op.y - op.t / 2, op.w, op.t); continue; }
      ctx.font = op.font;
      ctx.direction = op.rtl ? 'rtl' : 'ltr';
      ctx.fillText(op.text, op.x, op.y);
    }
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const alpha = new Uint8Array(cv.width * cv.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
    return { alpha, w: cv.width, h: cv.height, size, lines };
  }

  // --- Warp + ink -------------------------------------------------------------------------------

  function gaussBlur(src, w, h, sigma) {
    if (sigma <= 0) return src;
    if (sigma > 4) return boxBlur3(src, w, h, sigma);
    const r = Math.ceil(sigma * 3), k = [];
    let ks = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); ks += v; }
    for (let i = 0; i < k.length; i++) k[i] /= ks;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = s;
    }
    return out;
  }

  // A wide Gaussian blur, near enough: three box blurs, each a running sum, so wide costs no more than narrow.
  function boxBlur3(src, w, h, sigma) {
    const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2)), n = 2 * r + 1;
    let a = Float32Array.from(src), b = new Float32Array(w * h);
    // One pass along `len` cells spaced `step` apart, starting at `o`, clamped at the ends.
    const pass = (o, step, len) => {
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[o + Math.min(len - 1, Math.max(0, i)) * step];
      for (let i = 0; i < len; i++) {
        b[o + i * step] = s / n;
        s += a[o + Math.min(len - 1, i + r + 1) * step] - a[o + Math.max(0, i - r) * step];
      }
    };
    for (let k = 0; k < 3; k++) {
      for (let y = 0; y < h; y++) pass(y * w, 1, w);
      [a, b] = [b, a];
      for (let x = 0; x < w; x++) pass(x, w, h);
      [a, b] = [b, a];
    }
    return a;
  }

  // Paint `text` onto the note in `img` (the loaded blank photo). Returns a canvas the photo's size.
  async function paint(img, text, options = {}) {
    const o = { ...DEFAULTS, ...options };
    if (document.fonts) {
      await Promise.all(['', 'bold ', 'italic ', 'italic bold '].map(v => document.fonts.load(`${v}${o.maxSize}px ${o.font}`, text)));
    }

    const W = img.naturalWidth, H = img.naturalHeight;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.drawImage(img, 0, 0);
    if (!String(text).trim()) return out;

    const flat = flatInk(text, o);
    const corners = options.corners || PAPER;
    const toFlat = homography(corners, [[0, 0], [FLAT_W, 0], [FLAT_W, FLAT_H], [0, FLAT_H]]);
    const [h0, h1, h2, h3, h4, h5, h6, h7] = toFlat;

    // Ink coverage of every photo pixel over the paper: 3×3 samples per pixel through the map.
    const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
    const x0 = Math.floor(Math.min(...xs)) - 2, y0 = Math.floor(Math.min(...ys)) - 2;
    const bw = Math.ceil(Math.max(...xs)) + 2 - x0, bh = Math.ceil(Math.max(...ys)) + 2 - y0;
    const cover = new Float32Array(bw * bh);
    const SUB = [-1 / 3, 0, 1 / 3];
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const X = x0 + i + 0.5, Y = y0 + j + 0.5;
      // Wandering ink edges: nudge where this pixel looks into the flat text.
      const ox = o.rough * (noise(X / 1.7, Y / 1.7, o.seed) * 2 - 1);
      const oy = o.rough * (noise(X / 1.7, Y / 1.7, o.seed + 1) * 2 - 1);
      let s = 0;
      for (const sy of SUB) for (const sx of SUB) {
        const x = X + sx + ox, y = Y + sy + oy;
        const d = h6 * x + h7 * y + 1;
        const u = ((h0 * x + h1 * y + h2) / d) * SS, v = ((h3 * x + h4 * y + h5) / d) * SS;
        if (u >= 0 && v >= 0 && u < flat.w && v < flat.h) s += flat.alpha[(v | 0) * flat.w + (u | 0)];
      }
      cover[j * bw + i] = s / (9 * 255);
    }
    const soft = gaussBlur(cover, bw, bh, o.blur);
    // Unsharp mask, like the phone did to the rest of the photo: crisper edges, lighter rims.
    const wide = gaussBlur(soft, bw, bh, 1.4);
    for (let k = 0; k < soft.length; k++) soft[k] += o.sharpen * (soft[k] - wide[k]);

    // Read the paper's damage from the photo: patches lighter than their surroundings are scuffs,
    // thin light or dark lines are creases and fibres. Toner wears away on both.
    const photo = ctx.getImageData(x0, y0, bw, bh), p = photo.data;
    const lum = new Float32Array(bw * bh);
    for (let k = 0; k < lum.length; k++) lum[k] = 0.3 * p[k * 4] + 0.59 * p[k * 4 + 1] + 0.11 * p[k * 4 + 2];
    const fine = gaussBlur(lum, bw, bh, 1), mid = gaussBlur(lum, bw, bh, 3), area = gaussBlur(lum, bw, bh, 25);

    // Ink it into the photo: the paper shows through (multiply), with patchy toner and camera grain.
    const rand = rng(o.seed);
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
      const k0 = j * bw + i, c = soft[k0];
      if (Math.abs(c) < 0.003) continue;
      const X = x0 + i, Y = y0 + j;
      const scuff = Math.max(0, mid[k0] / area[k0] - 1);
      const crack = Math.max(0, Math.abs(fine[k0] - mid[k0]) - 3) / 10;
      const worn = Math.max(0.35, 1 - o.wear * scuff - o.crease * crack);
      const patch = 1 + 0.16 * (noise(X / 14, Y / 14, o.seed + 2) - 0.5) + 0.1 * (rand() - 0.5);
      const a = Math.min(1, c * o.density * patch * worn); // below 0 on the rims: lightens the paper
      const g = o.grain * (rand() + rand() + rand() - 1.5) * a;
      const k = (j * bw + i) * 4;
      for (let ch = 0; ch < 3; ch++) p[k + ch] = p[k + ch] * (1 - a * (1 - o.ink[ch])) + g;
    }
    ctx.putImageData(photo, x0, y0);
    out.layout = { size: flat.size, lines: flat.lines };
    return out;
  }

  // The painted photo saved as a JPEG, as an object URL ready for a CSS background-image or <img>.
  async function paintURL(img, text, options = {}) {
    const cv = await paint(img, text, options);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', options.jpeg ?? DEFAULTS.jpeg));
    return URL.createObjectURL(blob);
  }

  // The note's words without the Markdown marks, e.g. for a screen reader.
  const words = node => node.nodeType === Node.TEXT_NODE ? node.data
    : node.nodeName === 'BR' ? ' '
    : node.classList.contains('mark') ? ''
    : [...node.childNodes].map(words).join('');
  const plain = text => [...buildDoc(parseBlocks(text)).querySelectorAll('h1, h2, h3, p, blockquote, .li')]
    .map(el => words(el).trim()).join(' ');

  return { PAPER, FLAT_W, FLAT_H, DEFAULTS, homography, paint, paintURL, plain };
})();
