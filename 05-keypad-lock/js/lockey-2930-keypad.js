// <lockey-2930-keypad> — the face of a Lockey 2930 as an interactive SVG.
//
// An input surface (see lock-contract.js): it reports raw presses and knob turns as 'lock-input'
// events and knows none of the lock's rules — <lockey-2930-lock> wraps it with those.
//   keypad.controls   keypad.down(id)   keypad.up(id)   keypad.tap(id)   keypad.turn('knob')
//   keypad.spinKnob(turned)   animate the knob turning (true) or catching on the lock (false)
//   keypad.setPushedIn(ids)   show these buttons as staying pushed in (the lock passes its seated tumblers)
//
// Size it with CSS `width` on the element; height follows the lock's aspect ratio.
(() => {
  const LEFT  = ['1', '2', '3', '4', '5', 'X', 'Y'];
  const RIGHT = ['6', '7', '8', '9', '0', 'Z', 'C'];
  const CONTROLS = [
    ...[...LEFT, ...RIGHT].map(id => ({ id, kind: 'button', label: id })),
    { id: 'knob', kind: 'knob', label: 'Knob' },
  ];

  // Geometry measured from a 248×800 product photo of the lock; the viewBox crops its margins.
  const VB = '16.5 84 212 632';
  const ROW0 = 186, DY = 43.6;                       // label centre of row 1, row pitch
  const CAP = { w: 35, h: 25, lift: 4.5 };          // the cap's box; its centre sits 4.5 above its label's centre
  const CAP_X = { L: 73.5, R: 140 };
  const LABEL = { leftCentre: 60.5, rightCentre: 186.5 };
  const HOLE = 1.4;                                 // gap between a button and its hole in the plate
  // Where the photo's camera was: each button's top sits a little further from this point than its base
  // does (k of the distance), so you see a sliver of a button's side on the side facing the camera —
  // most under the top rows, nothing under the bottom ones, the inner side of each column.
  const CAMERA = { x: 123, y: 490, k: 0.013 };
  // The shadow the light casts (not the camera): tight and dark right under a button, then a soft tail
  // fading out over a few pixels, as in the photo.
  const SHADOW = { near: { dx: .6, dy: 1.6, opacity: .18 }, far: { dx: 1.2, dy: 4.5, opacity: .3 } };
  const KNOB = { cx: 125, cy: 617, r: 69 };
  const PRESS_MS = 110;

  const CSS = `
    :where(lockey-2930-keypad) { display: inline-block; width: 200px; aspect-ratio: 212 / 632; }
    lockey-2930-keypad svg {
      display: block; width: 100%; height: 100%;
      touch-action: none; user-select: none; -webkit-user-select: none;
      -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
    }
    .kl-key, .kl-knob { cursor: pointer; outline: none; }
    .kl-hit { fill: transparent; }
    .kl-glyph { pointer-events: none; }
    .kl-cap { transition: transform 60ms; }
    .kl-cap-shade { opacity: 0; transition: opacity 60ms; }
    .kl-shadow { transition: opacity 60ms; }
    /* Pushed in, a cap slides toward its base (each key sets how far: --in-*, --down-*), its shadow
       shrinks and its top darkens a touch; a finger on it pushes a little deeper. */
    .kl-key.in .kl-cap { transform: translate(var(--in-x), var(--in-y)); }
    .kl-key.in .kl-cap-shade { opacity: .1; }
    .kl-key.in .kl-shadow { opacity: .55; }
    .kl-key.down .kl-cap { transform: translate(var(--down-x), var(--down-y)); }
    .kl-key.down .kl-cap-shade { opacity: .14; }
    .kl-key.down .kl-shadow { opacity: .45; }
    .kl-key:focus-visible .kl-cap-ring, .kl-knob:focus-visible .kl-knob-face { stroke: #2f7de1; stroke-width: 2.5; stroke-opacity: 1; }
    .kl-knurl { transform-box: fill-box; transform-origin: 50% 50%; }
    .kl-knob.turned .kl-knurl { animation: kl-turn 650ms ease-in-out; }
    .kl-knob.caught .kl-knurl { animation: kl-catch 300ms ease-out; }
    @keyframes kl-turn { 50% { transform: rotate(80deg); } }
    @keyframes kl-catch { 30% { transform: rotate(7deg); } 60% { transform: rotate(-3deg); } 85% { transform: rotate(1.5deg); } }
  `;

  let instance = 0;

  // Engraved labels: a squared, extended font (like Microgramma) filled with dark ink — flat-cut ends,
  // square corners (blunt where a stroke turns back sharply), rounded ones elsewhere, nothing past the cap
  // line or baseline. Pressed into the plate, so the light from above catches the metal just under each
  // letter: a soft pale edge below it. Each glyph is strokes of [x, y, corner radius] points along the
  // centre line, relative to the label's centre ('Z' closes a stroke), cut flush at the centre lines of
  // its top and bottom bars plus half the stroke.
  const INK = { width: 2.47, color: '#282828' };
  const EDGE = { dy: .8, color: '#fff', opacity: .45 };
  const GLYPHS = {
    1: { top: -6.67, bottom: 8.91, strokes: [[[-5.35, -1.01], [3.01, -7.52], [3.01, 12.91]]] },
    2: { top: -6.81, bottom: 8.77, strokes: [[[-7.66, -2.21], [-7.66, -6.81, 3.9], [9.09, -6.81, 4.1], [9.09, 1.99, 4.1], [-7.66, 1.99, 8.39], [-7.66, 8.77], [10.36, 8.77]]] },
    3: { top: -6.85, bottom: 8.73, strokes: [[[-8.04, -2.25], [-8.04, -6.85, 3.9], [9.35, -6.85, 4.1], [9.35, 8.73, 4.1], [-8.04, 8.73, 3.9], [-8.04, 4.13]], [[-1.77, .51], [9.35, .51]]] },
    4: { top: -6.96, bottom: 8.62, strokes: [[[7.1, 12.62], [7.1, -8.29], [-9.17, 4.78], [11.73, 4.78]]] },
    5: { top: -6.98, bottom: 8.6, strokes: [[[10.07, -6.98], [-7.7, -6.98], [-7.7, -1.31], [9.4, -1.31, 4.1], [9.4, 8.6, 4.1], [-7.7, 8.6, 3.9], [-7.7, 4]]] },
    'X': { top: -7.03, bottom: 8.55, strokes: [[[-9.34, -9.85], [12.05, 11.37]], [[11.77, -9.82], [-9.97, 11.34]]] },
    'Y': { top: -6.82, bottom: 8.76, strokes: [[[-9.77, -9.85], [.61, 2.15], [11.21, -9.81]], [[.61, 2.15], [.61, 12.76]]] },
    6: { top: -7.15, bottom: 8.43, strokes: [[[8.13, -2.55], [8.13, -7.15, 3.9], [-8.42, -7.15, 4.1], [-8.42, 8.43, 4.1], [8.33, 8.43, 4.1], [8.33, -.12, 4.1], [-8.42, -.12]]] },
    7: { top: -7.25, bottom: 8.33, strokes: [[[-9.53, -7.25], [10.24, -7.25], [-6.05, 11.34]]] },
    8: { top: -7.47, bottom: 8.11, strokes: [[[-8.3, -7.47, 3.72], [8.56, -7.47, 3.72], [8.56, .09, 3.72], [-8.3, .09, 3.72], 'Z'], [[-8.43, .09, 3.72], [8.74, .09, 3.72], [8.74, 8.11, 3.72], [-8.43, 8.11, 3.72], 'Z']] },
    9: { top: -7.57, bottom: 8.01, strokes: [[[-8.72, 3.41], [-8.72, 8.01, 3.9], [8.54, 8.01, 4.1], [8.54, -7.57, 4.1], [-8.29, -7.57, 4.1], [-8.29, .77, 4.1], [8.54, .77]]] },
    0: { top: -7.74, bottom: 7.84, strokes: [[[-8.29, -7.74, 4.1], [9.44, -7.74, 4.1], [9.44, 7.84, 4.1], [-8.29, 7.84, 4.1], 'Z']] },
    'Z': { top: -7.82, bottom: 7.76, strokes: [[[-9.53, -7.82], [9.9, -7.82], [-8.7, 7.76], [10.76, 7.76]]] },
    'C': { top: -7.87, bottom: 7.71, strokes: [[[9.34, -3.27], [9.34, -7.87, 3.9], [-8.2, -7.87, 4.1], [-8.2, 7.71, 4.1], [9.57, 7.71, 3.9], [9.57, 3.11]]] },
  };

  // A stroke's centre line as a path: a corner with radius r rounds off with a quadratic curve from r
  // before it to r after it (at most half a side, or all of a side that ends the stroke).
  function centreLine(strokes) {
    const f = v => +v.toFixed(2);
    let d = '';
    for (const stroke of strokes) {
      const closed = stroke.at(-1) === 'Z';
      const pts = closed ? stroke.slice(0, -1) : stroke, n = pts.length;
      let cmd = 'M';
      const to = (x, y) => { d += `${cmd}${f(x)} ${f(y)}`; cmd = 'L'; };
      pts.forEach(([x, y, r = 0], i) => {
        if (r <= 0 || (!closed && (i === 0 || i === n - 1))) return to(x, y);
        const [px, py] = pts[(i - 1 + n) % n], [nx, ny] = pts[(i + 1) % n];
        const din = Math.hypot(x - px, y - py), dout = Math.hypot(nx - x, ny - y);
        const rin = Math.min(r, !closed && i === 1 ? din : din / 2);
        const rout = Math.min(r, !closed && i === n - 2 ? dout : dout / 2);
        to(x - (x - px) / din * rin, y - (y - py) / din * rin);
        d += `Q${f(x)} ${f(y)} ${f(x + (nx - x) / dout * rout)} ${f(y + (ny - y) / dout * rout)}`;
      });
      if (closed) d += 'Z';
    }
    return d;
  }

  // The pale edge is the letter again, a little lower, under the ink: only its rim below the ink shows.
  function labelSvg(p, key, side, cy) {
    const cx = side === 'L' ? LABEL.leftCentre : LABEL.rightCentre;
    const { top, bottom, strokes } = GLYPHS[key];
    const half = INK.width / 2;
    const letter = `d="${centreLine(strokes)}" fill="none" stroke-width="${INK.width}" stroke-miterlimit="2" clip-path="url(#${p}cut${key})"`;
    return `<g class="kl-glyph" transform="translate(${cx} ${cy})">
      <clipPath id="${p}cut${key}"><rect x="-14" y="${(top - half).toFixed(2)}" width="28" height="${(bottom - top + 2 * half).toFixed(2)}"/></clipPath>
      <path ${letter} stroke="${EDGE.color}" opacity="${EDGE.opacity}" transform="translate(0 ${EDGE.dy})" filter="url(#${p}edgeBlur)"/>
      <path ${letter} stroke="${INK.color}"/>
    </g>`;
  }

  // A button's outline, measured from the photo: a superellipse |x/a|^n + |y/b|^n = 1 — rounded corners
  // and gently bulging sides, rather than a rounded rectangle's straight ones.
  const SHAPE = { a: 15.9, b: 11.7, n: 3.1 };
  function squircle(cx, cy, a, b) {
    const pts = [];
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t);
      const px = cx + a * Math.sign(c) * Math.abs(c) ** (2 / SHAPE.n);
      const py = cy + b * Math.sign(s) * Math.abs(s) ** (2 / SHAPE.n);
      pts.push(`${px.toFixed(2)} ${py.toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
  }

  // A button stands proud of the plate in a slightly bigger hole. The hole, the shadows and the dark
  // side wall (with a darker line where it meets the hole) stay put; the cap (a flat brushed-steel top
  // whose edge rolls off into the side: lit along the top, shaded along the bottom) moves when pressed.
  // C, the one that clears, has a knurled top.
  function keySvg(p, key, side, row) {
    const cy = ROW0 + row * DY;            // label centre
    const x = CAP_X[side], y = cy - CAP.lift - CAP.h / 2;
    const { a, b } = SHAPE;
    // The top's centre, and the base's: shifted from the top toward the camera.
    const tx = x + CAP.w / 2, ty = y + CAP.h / 2;
    const bx = tx - CAMERA.k * (tx - CAMERA.x), by = ty - CAMERA.k * (ty - CAMERA.y);
    // Pushed in, the top slides most of the way to its base (a little further under a finger), and
    // always moves down at least a bit so even the bottom rows show it.
    const dx = bx - tx, dy = by - ty;
    const push = `--in-x:${(dx * .7).toFixed(2)}px;--in-y:${Math.max(dy * .7, .8).toFixed(2)}px;`
      + `--down-x:${(dx * .85).toFixed(2)}px;--down-y:${Math.max(dy * .85, 1.2).toFixed(2)}px`;
    return `
      <g class="kl-key" data-key="${key}" role="button" tabindex="0" aria-label="${key}" style="${push}">
        <rect class="kl-hit" x="${side === 'L' ? 36 : 124}" y="${cy - DY / 2}" width="88" height="${DY}"/>
        <path d="${squircle(bx, by, a + HOLE, b + HOLE)}" fill="url(#${p}hole)"/>
        <clipPath id="${p}lip${key}"><!-- the plate around the hole, not the hole itself -->
          <path clip-rule="evenodd" d="M${bx - a - 9} ${by - b - 9}h${2 * a + 18}v${2 * b + 18}h${-2 * a - 18}Z${squircle(bx, by, a + HOLE, b + HOLE)}"/>
        </clipPath>
        <g clip-path="url(#${p}lip${key})"><!-- the plate rolling smoothly down into the hole -->
          <path d="${squircle(bx, by, a + HOLE, b + HOLE)}" fill="none" stroke="url(#${p}holeLip)" stroke-width="2" filter="url(#${p}edgeSoft)"/>
        </g>
        <g class="kl-shadow">
          <path d="${squircle(bx + SHADOW.far.dx, by + SHADOW.far.dy, a, b)}" fill="#000" opacity="${SHADOW.far.opacity}" filter="url(#${p}softWide)"/>
          <path d="${squircle(bx + SHADOW.near.dx, by + SHADOW.near.dy, a, b)}" fill="#000" opacity="${SHADOW.near.opacity}" filter="url(#${p}soft)"/>
        </g>
        <path d="${squircle(bx, by, a, b)}" fill="url(#${p}capWall)" stroke="#0e0f10" stroke-opacity=".8" stroke-width=".8"/>
        <clipPath id="${p}top${key}"><path d="${squircle(tx, ty, a, b)}"/></clipPath>
        <g class="kl-cap">
          <path class="kl-cap-ring" d="${squircle(tx, ty, a, b)}" fill="url(#${p}capFace)" stroke="#7f8285" stroke-opacity=".6" stroke-width=".5"/>
          <path d="${squircle(tx, ty, a, b)}" filter="url(#${p}brush)" opacity=".55"/>
          <path d="${squircle(tx, ty, a, b)}" fill="url(#${p}capSheen)"/>
          ${key === 'C' ? `<path d="${squircle(tx, ty, a - 2, b - 2.2)}" fill="url(#${p}hatch)"/>` : ''}
          <g clip-path="url(#${p}top${key})"><!-- the rolled edge, fading smoothly into the flat top -->
            <path d="${squircle(tx, ty, a, b)}" fill="none" stroke="url(#${p}capEdge)" stroke-width="2" filter="url(#${p}edgeSoft)"/>
            <path d="${squircle(tx, ty + .3, a - .8, b - .8)}" fill="none" stroke="url(#${p}capGlint)" stroke-width="2" filter="url(#${p}edgeSoft)"/>
            <path d="${squircle(tx, ty + .2, a - .7, b - .7)}" fill="none" stroke="url(#${p}capGlint)" stroke-width=".9"/>
          </g>
          <path class="kl-cap-shade" d="${squircle(tx, ty, a, b)}" fill="#000"/>
        </g>
        ${labelSvg(p, key, side, cy)}
      </g>`;
  }

  // The knob's grip ring: four identical lobes (top, right, bottom, left) centred on the face, each
  // with broad rounded ridges and V-notches — a notch on every lobe's centre line, so each lobe mirrors
  // itself — and narrow dips between lobes.
  const GRIP = { base: 71, outer: 82, flat: 30, taper: 6, ridgeDeg: 7.5, depth: 1.6 };  // ridgeDeg divides 90
  const lobeAt = deg => {
    const off = Math.abs(((deg + 45) % 90) - 45);   // degrees from the nearest lobe centre
    return off < GRIP.flat ? 1 : off > GRIP.flat + GRIP.taper ? 0 : 0.5 + 0.5 * Math.cos((off - GRIP.flat) / GRIP.taper * Math.PI);
  };
  const gripR = deg => {
    const lobe = lobeAt(deg);
    const notch = 1 - Math.abs(Math.sin(deg / GRIP.ridgeDeg * Math.PI));  // 0 on a ridge, 1 in a V-notch
    return GRIP.base + (GRIP.outer - GRIP.base) * lobe - GRIP.depth * notch * lobe;
  };
  const gripPt = (deg, r) => {
    const th = deg * Math.PI / 180;
    return `${(KNOB.cx + r * Math.sin(th)).toFixed(2)} ${(KNOB.cy - r * Math.cos(th)).toFixed(2)}`;
  };

  function gripPath() {
    const pts = [];
    for (let deg = 0; deg < 360; deg += 0.5) pts.push(gripPt(deg, gripR(deg)));
    return `M${pts.join('L')}Z`;
  }

  // A short groove in from each V-notch, near the outer edge.
  function gripGrooves() {
    let d = '';
    for (let deg = 0; deg < 360; deg += GRIP.ridgeDeg) {
      if (lobeAt(deg) < 0.8) continue;
      const r = gripR(deg);
      d += `M${gripPt(deg, r - 4.5)}L${gripPt(deg, r)}`;
    }
    return `<path d="${d}" stroke="#55585c" stroke-opacity=".4" stroke-width=".9"/>`;
  }

  // The knob face, as in the photo: satin steel with no lines — just a very fine, faint grain — lit
  // softly from the top left.
  function knobFace(p, cx, cy, r) {
    return `<g clip-path="url(#${p}faceClip)">
      <rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" filter="url(#${p}satin)" opacity=".2" style="mix-blend-mode:soft-light"/>
      <circle cx="${cx - 18}" cy="${cy - 26}" r="${(r * .8).toFixed(1)}" fill="#fff" opacity=".2" filter="url(#${p}sheen)"/>
    </g>`;
  }

  function lockSvg(p) {
    const { cx, cy, r } = KNOB;
    const grip = gripPath();
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" role="group" aria-label="Combination lock keypad">
  <defs>
    <!-- The plate's light, measured from the photo: a bright band ~10 px wide down each side edge that
         drops quickly into a darker middle, and a near-white band just inside the top edge. -->
    <linearGradient id="${p}plateH" x1="35" x2="211" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d0d1d2"/><stop offset=".05" stop-color="#cccdce"/>
      <stop offset=".075" stop-color="#b4b5b6"/><stop offset=".12" stop-color="#a6a7a8"/>
      <stop offset=".25" stop-color="#9c9d9e"/><stop offset=".4" stop-color="#a2a3a4"/>
      <stop offset=".5" stop-color="#9e9fa0"/><stop offset=".62" stop-color="#98999a"/>
      <stop offset=".74" stop-color="#a4a5a6"/><stop offset=".88" stop-color="#aaabac"/>
      <stop offset=".925" stop-color="#b2b3b4"/><stop offset=".95" stop-color="#c8c9ca"/>
      <stop offset=".975" stop-color="#cecfd0"/><stop offset="1" stop-color="#bebfc0"/>
    </linearGradient>
    <linearGradient id="${p}plateV" x1="0" x2="0" y1="99" y2="519" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".006" stop-color="#fff" stop-opacity=".92"/>
      <stop offset=".02" stop-color="#fff" stop-opacity=".92"/><stop offset=".027" stop-color="#fff" stop-opacity=".72"/>
      <stop offset=".038" stop-color="#fff" stop-opacity=".55"/><stop offset=".1" stop-color="#fff" stop-opacity=".48"/>
      <stop offset=".145" stop-color="#fff" stop-opacity=".37"/><stop offset=".193" stop-color="#fff" stop-opacity=".27"/>
      <stop offset=".288" stop-color="#fff" stop-opacity=".12"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}housing" x1="35" x2="211" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#c4c5c6"/><stop offset=".07" stop-color="#9c9d9e"/>
      <stop offset=".5" stop-color="#a3a4a5"/><stop offset=".93" stop-color="#9c9d9e"/>
      <stop offset="1" stop-color="#c4c5c6"/>
    </linearGradient>
    <linearGradient id="${p}toLedge" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/>
    </linearGradient>
    <linearGradient id="${p}ledgeFront" x1="0" x2="0" y1="507" y2="519" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#a6a7a8"/><stop offset=".7" stop-color="#9d9e9f"/><stop offset="1" stop-color="#b4b5b6"/>
    </linearGradient>
    <linearGradient id="${p}ledgeShadow" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset=".35" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}capFace" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#c0c2c4"/><stop offset="1" stop-color="#b2b4b6"/>
    </linearGradient>
    <linearGradient id="${p}capEdge" x1="0" x2=".2" y1="0" y2="1"><!-- the rounded edge of a cap's top -->
      <stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".18" stop-color="#fff" stop-opacity=".45"/>
      <stop offset=".35" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".03"/>
      <stop offset=".62" stop-color="#000" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".26"/>
    </linearGradient>
    <!-- Light from above: a crisp glint along the top of each cap, a sheen fading down its face, and
         on the plate a bright top rim and a soft glare (not a highlight all the way round). -->
    <radialGradient id="${p}capGlint" cx=".5" cy="0" r=".9" fx=".5" fy="0"><!-- fades with distance from the top centre -->
      <stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff" stop-opacity=".88"/>
      <stop offset=".55" stop-color="#fff" stop-opacity=".5"/><stop offset=".75" stop-color="#fff" stop-opacity=".18"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}capSheen" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}plateRim" x1="0" x2="0" y1="99" y2="704" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".06" stop-color="#fff" stop-opacity=".4"/>
      <stop offset=".2" stop-color="#fff" stop-opacity=".12"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".05"/>
    </linearGradient>
    <linearGradient id="${p}edgeTop" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".14"/><stop offset=".35" stop-color="#000" stop-opacity=".1"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <filter id="${p}glare" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="${p}edgeSoft" x="-10%" y="-15%" width="120%" height="130%"><feGaussianBlur stdDeviation=".55"/></filter>
    <filter id="${p}edgeBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".3"/></filter>
    <linearGradient id="${p}hole" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#46484b"/><stop offset="1" stop-color="#65686b"/>
    </linearGradient>
    <linearGradient id="${p}holeLip" x1="0" x2=".2" y1="0" y2="1"><!-- the plate's rounded edge into a hole -->
      <stop offset="0" stop-color="#000" stop-opacity=".24"/><stop offset=".45" stop-color="#000" stop-opacity=".03"/>
      <stop offset=".6" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/>
    </linearGradient>
    <linearGradient id="${p}capWall" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#7d8083"/><stop offset=".6" stop-color="#686b6e"/><stop offset="1" stop-color="#55585b"/>
    </linearGradient>
    <radialGradient id="${p}gripRim" cx="${cx}" cy="${cy}" r="${GRIP.outer}" gradientUnits="userSpaceOnUse">
      <stop offset=".86" stop-color="#8e9195"/><stop offset=".9" stop-color="#b9bcbf"/>
      <stop offset=".95" stop-color="#e9ebec"/><stop offset=".98" stop-color="#fbfbfc"/><stop offset="1" stop-color="#b0b3b6"/>
    </radialGradient>
    <linearGradient id="${p}gripLight" x1="0" x2=".15" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".75" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".05"/>
    </linearGradient>
    <radialGradient id="${p}face" cx=".45" cy=".4" r=".75">
      <stop offset="0" stop-color="#aeb0b2"/><stop offset="1" stop-color="#a3a5a7"/>
    </radialGradient>
    <linearGradient id="${p}faceRim" x1="0" x2=".3" y1="0" y2="1">
      <stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#d3d5d7"/><stop offset="1" stop-color="#f4f5f6"/>
    </linearGradient>
    <filter id="${p}soft" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
    <filter id="${p}softWide" x="-50%" y="-60%" width="200%" height="240%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="${p}blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="${p}sheen" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="${p}brush" x="0" y="0" width="100%" height="100%"><!-- fine horizontal grain on the caps -->
      <feTurbulence type="fractalNoise" baseFrequency=".022 .95" numOctaves="2" seed="5"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .9 0 0 0 -.35"/>
      <feComposite in2="SourceGraphic" operator="in"/><!-- only within the cap's own outline -->
    </filter>
    <!-- C's diamond knurl: each diamond is a little pyramid, its four faces lit from the top left like
         the rest of the keypad, with dark grooves between them. -->
    <pattern id="${p}hatch" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0V3.4L1.7 1.7Z" fill="#fff" fill-opacity=".5"/>
      <path d="M0 0H3.4L1.7 1.7Z" fill="#fff" fill-opacity=".22"/>
      <path d="M0 3.4H3.4L1.7 1.7Z" fill="#000" fill-opacity=".2"/>
      <path d="M3.4 0V3.4L1.7 1.7Z" fill="#000" fill-opacity=".4"/>
      <path d="M0 0H3.4V3.4H0Z" fill="none" stroke="#1e2023" stroke-opacity=".35" stroke-width=".3"/>
    </pattern>
    <!-- Stainless steel isn't perfect: a fine vertical brushed grain and faint uneven patches on the
         plate, a fine grain on the grip, patches on the knob face. Grey noise, blended soft-light. -->
    <filter id="${p}steelBrush" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".75 .014" numOctaves="2" seed="11"/>
      <feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/>
    </filter>
    <filter id="${p}steelPatch" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="3" seed="4"/>
      <feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/>
    </filter>
    <filter id="${p}steelFine" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".5" numOctaves="2" seed="8"/>
      <feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/>
    </filter>
    <clipPath id="${p}plate"><rect x="35" y="99" width="176" height="605" rx="50"/></clipPath>
    <clipPath id="${p}gripClip"><path d="${grip}"/></clipPath>
    <filter id="${p}satin" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="2"/>
      <feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/>
    </filter>
    <clipPath id="${p}faceClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>

  <!-- body -->
  <rect x="21" y="89" width="204" height="623" rx="60" fill="#0b0b0c"/>
  <rect x="21.75" y="89.75" width="202.5" height="621.5" rx="59.25" fill="none" stroke="#2c2d2f" stroke-width="1.5"/>

  <!-- face plate: satin steel, bright along the top and edges; a ledge, then the darker knob housing -->
  <g clip-path="url(#${p}plate)">
    <rect x="35" y="99" width="176" height="605" fill="url(#${p}plateH)"/>
    <rect x="35" y="99" width="176" height="420" fill="url(#${p}plateV)"/>
    <ellipse cx="123" cy="116" rx="62" ry="15" fill="#fff" opacity=".25" filter="url(#${p}glare)"/>
    <rect x="35" y="99" width="16" height="230" fill="url(#${p}edgeTop)" filter="url(#${p}softWide)"/><!-- the side bands only show further down -->
    <rect x="195" y="99" width="16" height="230" fill="url(#${p}edgeTop)" filter="url(#${p}softWide)"/>
    <rect x="35" y="470" width="176" height="40" fill="url(#${p}toLedge)"/>
    <rect x="35" y="518" width="176" height="190" fill="url(#${p}housing)"/>
    <rect x="35" y="519" width="176" height="16" fill="url(#${p}ledgeShadow)"/>
    <rect x="35" y="99" width="176" height="605" filter="url(#${p}steelBrush)" opacity=".3" style="mix-blend-mode:soft-light"/>
    <rect x="35" y="99" width="176" height="605" filter="url(#${p}steelPatch)" opacity=".28" style="mix-blend-mode:soft-light"/>
    <path d="M35 507H211V519H35Z" fill="url(#${p}ledgeFront)"/>
    <path d="M35 507L42 515.6M211 507L204 515.6" stroke="#000" stroke-opacity=".12" stroke-width=".8"/>
    <path d="M35 515.8H211" stroke="#fff" stroke-opacity=".8" stroke-width="1.1"/>
    <path d="M35 519.4H211" stroke="#000" stroke-opacity=".3" stroke-width="1"/>
  </g>
  <rect x="35.6" y="99.6" width="174.8" height="603.8" rx="49.4" fill="none" stroke="url(#${p}plateRim)" stroke-width="1.2"/>

  <!-- keys -->
  ${LEFT.map((k, i) => keySvg(p, k, 'L', i)).join('')}
  ${RIGHT.map((k, i) => keySvg(p, k, 'R', i)).join('')}

  <!-- knob: the grip ring turns; the face stays still -->
  <g class="kl-knob" role="button" tabindex="0" aria-label="Turn knob">
    <circle class="kl-hit" cx="${cx}" cy="${cy}" r="86"/>
    <circle cx="${cx + 1}" cy="${cy + 6}" r="80" fill="#000" opacity=".3" filter="url(#${p}blur)"/>
    <g class="kl-knurl">
      <path d="${grip}" fill="url(#${p}gripRim)" stroke="#5a5d61" stroke-width=".7"/>
      <path d="${grip}" fill="url(#${p}gripLight)"/>
      <rect x="${cx - GRIP.outer}" y="${cy - GRIP.outer}" width="${2 * GRIP.outer}" height="${2 * GRIP.outer}" clip-path="url(#${p}gripClip)" filter="url(#${p}steelFine)" opacity=".4" style="mix-blend-mode:soft-light"/>
      ${gripGrooves()}
    </g>
    <circle cx="${cx}" cy="${cy}" r="${r + 1.2}" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="1.4"/>
    <circle class="kl-knob-face" cx="${cx}" cy="${cy}" r="${r}" fill="url(#${p}face)"/>
    ${knobFace(p, cx, cy, r)}
    <rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" clip-path="url(#${p}faceClip)" filter="url(#${p}steelPatch)" opacity=".35" style="mix-blend-mode:soft-light"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 1.2}" fill="none" stroke="url(#${p}faceRim)" stroke-width="1.7"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 2.8}" fill="none" stroke="#000" stroke-opacity=".1" stroke-width="1"/>
  </g>
</svg>`;
  }

  class Lockey2930Keypad extends HTMLElement {
    get controls() { return CONTROLS; }

    connectedCallback() {
      if (this._svg) return;
      if (!document.getElementById('lockey-2930-keypad-css')) {
        const style = document.createElement('style');
        style.id = 'lockey-2930-keypad-css';
        style.textContent = CSS;
        document.head.prepend(style); // page styles win over these defaults
      }
      const prefix = `kl${++instance}-`;
      this.innerHTML = lockSvg(prefix);
      this._svg = this.querySelector('svg');
      this._knob = this._svg.querySelector('.kl-knob');
      this._keys = new Map([...this._svg.querySelectorAll('.kl-key')].map(el => [el.dataset.key, el]));
      this._held = new Set();      // button ids currently down
      this._pointers = new Map();  // pointerId -> button id
      this._tapTimers = new Map(); // button id -> pending up()

      this._svg.addEventListener('pointerdown', e => this._onPointerDown(e));
      this._svg.addEventListener('keydown', e => this._onKeyDown(e));
      this._svg.addEventListener('contextmenu', e => e.preventDefault());
      this._onPointerUp = e => this._onPointerRelease(e);
      window.addEventListener('pointerup', this._onPointerUp);
      window.addEventListener('pointercancel', this._onPointerUp);
    }

    disconnectedCallback() {
      window.removeEventListener('pointerup', this._onPointerUp);
      window.removeEventListener('pointercancel', this._onPointerUp);
    }

    down(id) {
      const el = this._keys?.get(id);
      if (!el || this._held.has(id)) return;
      this._held.add(id);
      el.classList.add('down');
      this._emit(id, 'button', 'down');
    }

    up(id) {
      if (!this._held?.delete(id)) return;
      this._keys.get(id).classList.remove('down');
      this._emit(id, 'button', 'up');
    }

    tap(id) {
      this.down(id);
      clearTimeout(this._tapTimers.get(id));
      this._tapTimers.set(id, setTimeout(() => this.up(id), PRESS_MS));
    }

    turn(id = 'knob') {
      if (id === 'knob' && this._svg) this._emit('knob', 'knob', 'turn');
    }

    setPushedIn(ids) {
      const pushed = new Set(ids);
      this._keys?.forEach((el, id) => el.classList.toggle('in', pushed.has(id)));
    }

    spinKnob(turned) {
      const knob = this._knob;
      if (!knob) return;
      knob.classList.remove('turned', 'caught');
      void knob.getBoundingClientRect(); // restart the animation
      knob.classList.add(turned ? 'turned' : 'caught');
    }

    _onPointerDown(e) {
      if (e.button !== 0) return;
      const target = e.target.closest('.kl-key, .kl-knob');
      if (!target) return;
      e.preventDefault(); // no focus ring / text selection on tap
      if (target === this._knob) { this.turn(); return; }
      this._pointers.set(e.pointerId, target.dataset.key);
      this.down(target.dataset.key);
    }

    _onPointerRelease(e) {
      const id = this._pointers.get(e.pointerId);
      if (id === undefined) return;
      this._pointers.delete(e.pointerId);
      if (![...this._pointers.values()].includes(id)) this.up(id);
    }

    _onKeyDown(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest('.kl-key, .kl-knob');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (target === this._knob) this.turn();
      else this.tap(target.dataset.key);
    }

    _emit(id, kind, action) {
      this.dispatchEvent(new CustomEvent('lock-input', {
        detail: { id, kind, action, t: performance.now() }, bubbles: true, composed: true,
      }));
    }
  }

  customElements.define('lockey-2930-keypad', Lockey2930Keypad);
})();
