// Note text — prints words onto the blank note in the door photo (door-blank.jpg).
// The words are laid out flat in Times, bent onto the paper with a perspective map and inked into
// the photo's own pixels, so they zoom, blur and grain exactly like the rest of the picture.
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

  // --- Layout -----------------------------------------------------------------------------------

  // Greedy word wrap of each paragraph to `width`.
  function wrap(ctx, paras, width) {
    const lines = [];
    for (const words of paras) {
      let line = '';
      for (const w of words) {
        const next = line ? line + ' ' + w : w;
        if (line && ctx.measureText(next).width > width) { lines.push(line); line = w; }
        else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  // The biggest letter size at which the text fits the paper, and its lines, evened out in length.
  function layout(ctx, text, o) {
    const boxW = FLAT_W * (1 - 2 * o.margin[0]), boxH = FLAT_H * (1 - 2 * o.margin[1]);
    const paras = String(text).split('\n').map(p => p.trim().split(/\s+/));
    let size = o.maxSize, lines;
    for (; size > o.minSize; size--) {
      ctx.font = `${size}px ${o.font}`;
      lines = wrap(ctx, paras, boxW);
      const fitsWide = lines.every(l => ctx.measureText(l).width <= boxW);
      if (fitsWide && lines.length * size * o.lineHeight <= boxH) break;
    }
    ctx.font = `${size}px ${o.font}`;
    lines = wrap(ctx, paras, boxW);
    // Narrow the wrap width as far as it goes without adding a line, so no word is left alone.
    let lo = boxW * 0.3, hi = boxW;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (wrap(ctx, paras, mid).length <= lines.length) hi = mid; else lo = mid;
    }
    return { size, lines: wrap(ctx, paras, hi) };
  }

  // The text drawn flat on a transparent sheet, SS times finer than the photo. Returns its alpha.
  function flatInk(text, o) {
    const cv = document.createElement('canvas');
    cv.width = FLAT_W * SS; cv.height = FLAT_H * SS;
    const ctx = cv.getContext('2d');
    const { size, lines } = layout(ctx, text, o);
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
    ctx.font = `${size}px ${o.font}`;
    const rtl = /[\u0590-\u06ff]/.test(text);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    // A few lines are centred, like a sign; a paragraph is flush to its start side, like a letter,
    // with the block as a whole centred on the paper.
    let x = FLAT_W / 2;
    if (lines.length > 3) {
      const half = Math.max(...lines.map(l => ctx.measureText(l).width)) / 2;
      x += rtl ? half : -half;
      ctx.textAlign = 'start';
    } else {
      ctx.textAlign = 'center';
    }
    const lh = size * o.lineHeight, cy = FLAT_H / 2 - lh * 0.04;
    lines.forEach((l, i) => ctx.fillText(l, x, cy + (i - (lines.length - 1) / 2) * lh));
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
    if (document.fonts) await document.fonts.load(`${o.maxSize}px ${o.font}`, text);

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

  return { PAPER, FLAT_W, FLAT_H, DEFAULTS, homography, paint, paintURL };
})();
