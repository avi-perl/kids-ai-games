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
  const KNOB = { cx: 124.6, cy: 613.8, r: 70.7 };     // the face
  const PRESS_MS = 110;
  // The grip's turn when the knob opens the lock, or catches on it: [time, degrees] keyframes, eased
  // between each pair.
  const SPIN = {
    turned: { ms: 650, keys: [[0, 0], [.5, 80], [1, 0]], ease: t => t * t * (3 - 2 * t) },
    caught: { ms: 300, keys: [[0, 0], [.3, 7], [.6, -3], [.85, 1.5], [1, 0]], ease: t => 1 - (1 - t) ** 2 },
  };

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

  // The knob's grip, behind the face: one ring of rounded bumps all the way round (a V-notch every
  // ridgeDeg), with four deep, sweeping cuts taken out of it between the grips: the bite of a round cutter
  // of radius CUT.r, down to just short of the face at the front (a thin collar of the grip stays round the
  // face) and nearly as deep at the back, so a little of each cut's floor shows. The camera looks a little down on the knob, so the back of the ring
  // shows LIFT above its front wherever the ring faces up: the top grip's bumpy wall (the same bumps as on
  // the sides, seen from above), and in the upper cuts their sloping floors, lit where they rise steeply to
  // the grips and dark down in the bottom. The rounded front edge turns away from the camera at the top and
  // bottom, so the ring looks a little shorter there (`top`, `bottom`). Angles are on screen, clockwise from
  // straight up, so the light and the camera stay put while the grip turns.
  const GRIP = { inner: 72.5, outer: 80, top: 2, bottom: 2.8, ridgeDeg: 10, rib: 1.4, lift: 6 };
  const CUT = { r: 34, front: 73.5, back: 74.5 };  // cutter radius; how far in it reaches, front and back
  const WALL_SHADES = 32;
  const rad = deg => deg * Math.PI / 180;
  const polar = (deg, r) => [KNOB.cx + r * Math.sin(rad(deg)), KNOB.cy - r * Math.cos(rad(deg))];
  const pathOf = pts => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

  // The bumpy ring before the cuts, at screen angle deg with the grip turned rot.
  function ringOuter(deg, rot) {
    const ridge = Math.abs(Math.sin((deg - rot) / GRIP.ridgeDeg * Math.PI));  // 0 in a notch, 1 on a bump
    const cos = Math.cos(rad(deg)), down = Math.max(0, -cos) ** 2;
    return GRIP.outer - (cos > 0 ? GRIP.top : GRIP.bottom) * cos * cos - GRIP.rib * (1 - ridge) * (1 - down);
  }

  // Where the nearest cut's edge is along screen angle deg, for a cut whose deepest point is `depth` from
  // the centre (Infinity where the cutter doesn't reach).
  function cutEdge(deg, rot, depth) {
    const phi = rad(((deg - rot - 45) % 90 + 135) % 90 - 45);  // from the nearest cut's centre line
    const dist = depth + CUT.r, off = dist * Math.sin(phi);
    return Math.abs(off) >= CUT.r ? Infinity : dist * Math.cos(phi) - Math.sqrt(CUT.r * CUT.r - off * off);
  }

  // The ring's outline, clockwise on screen, at its front and at its back (lifted), and how deep the cut is
  // at each point (0 uncut, 1 at the bottom of a cut).
  function ringOutline(rot) {
    const front = [], back = [], cut = [];
    for (let deg = 0; deg < 360; deg += .5) {
      const r = ringOuter(deg, rot);
      const rf = Math.max(GRIP.inner, Math.min(r, cutEdge(deg, rot, CUT.front)));
      const rb = Math.min(r, cutEdge(deg, rot, CUT.back));
      front.push(polar(deg, rf));
      const [x, y] = polar(deg, rb);
      back.push([x, y - GRIP.lift]);
      cut.push(Math.max(0, (r - rf) / (r - CUT.front)));
    }
    return { front, back, cut };
  }

  // The ring swept back through its depth: on a clockwise outline the rightward edges face up, and those
  // show at the back; the rest stay at the front, joined by straight runs where the two meet. Filled
  // nonzero, this covers every depth's copy.
  function swept({ front, back }) {
    const n = front.length, out = [];
    const up = i => front[(i + 1) % n][0] > front[i][0];
    for (let i = 0; i < n; i++) {
      const was = up((i - 1 + n) % n), is = up(i);
      if (was !== is) out.push(was ? back[i] : front[i]);
      out.push(is ? back[i] : front[i]);
    }
    return out;
  }

  // Light on the bottom grip's front, along the inner side of its rounded edge. The light stays put, so
  // this stays where the bottom grip sits, on whichever grip is there.
  const BOTTOM_GLINT = (() => {
    const [x0, y0] = polar(140, 74.8), [x1, y1] = polar(220, 74.8);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A74.8 74.8 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  })();

  // The grip at a turn of rot degrees. The wall is lit by how squarely it faces up; a cut's floor curves
  // like a scoop — lit where it climbs to the grips, darker down in the bottom, and darkening smoothly
  // toward the back. Each strip of wall or floor is drawn in slices from front to back so it shades evenly.
  function gripSvg(p, rot) {
    const ring = ringOutline(rot), { front, back, cut } = ring, n = front.length;
    const shades = Array(WALL_SHADES).fill('');
    const shade = (grey, quad) => {
      shades[Math.max(0, Math.min(WALL_SHADES - 1, Math.round((grey - 90) / (220 - 90) * (WALL_SHADES - 1))))] += pathOf(quad);
    };
    const SLICES = 6;
    const at = ([x, y], [bx, by], k) => [x + (bx - x) * k, y + (by - y) * k];
    front.forEach(([x0, y0], i) => {
      const j = (i + 1) % n, [x1, y1] = front[j], len = Math.hypot(x1 - x0, y1 - y0);
      if (x1 <= x0 || len < 1e-6) return;
      const facingUp = (x1 - x0) / len;  // minus the outward normal's y
      const t = Math.max(cut[i], cut[j]);
      const [near, fall] = t > .02 ? [190 - 45 * t ** .6, 50] : [125 + 95 * facingUp ** 2, 10];
      for (let k = 0; k < SLICES; k++) {
        const k0 = k / SLICES, k1 = (k + 1) / SLICES;
        shade(near - fall * (k + .5) / SLICES, [at(front[i], back[i], k0), at(front[j], back[j], k0), at(front[j], back[j], k1), at(front[i], back[i], k1)]);
      }
    });
    // A soft seam between bumps, from each notch in over the rounded edge (and up the wall, where it shows).
    // Not along the bottom, where the rounded edge turns away from the camera and the bumps flatten out.
    let seams = '';
    for (let k = 0; k < 360 / GRIP.ridgeDeg; k++) {
      const deg = rot + k * GRIP.ridgeDeg, i = Math.round((((deg % 360) + 360) % 360) / .5) % n;
      if (Math.cos(rad(deg)) < -.7 || cut[i] > 0 || cut[(i + 2) % n] > 0 || cut[(i + n - 2) % n] > 0) continue;
      const [x, y] = front[i], [bx, by] = back[i], [ix, iy] = polar(deg, GRIP.outer - 5.5);
      const tx = Math.cos(rad(deg)) * 1.3, ty = Math.sin(rad(deg)) * 1.3;
      seams += pathOf([[ix, iy], [x + tx, y + ty], [bx + tx, by + ty], [bx - tx, by - ty], [x - tx, y - ty]]);
    }
    const grey = k => Math.round(90 + (220 - 90) * k / (WALL_SHADES - 1));
    const fronts = pathOf(front), walls = pathOf(swept(ring));
    return `
      <path d="${walls}" fill="#8c8c8c"/>
      ${shades.map((d, k) => d && `<path d="${d}" fill="rgb(${grey(k)},${grey(k)},${grey(k)})"/>`).join('')}
      <path d="${fronts}" fill="url(#${p}lobeFront)"/>
      <path d="${fronts}" fill="url(#${p}lobeLight)"/>
      <clipPath id="${p}gripAll"><path d="${walls}"/></clipPath>
      <path d="${seams}" fill="#000" fill-opacity=".16" filter="url(#${p}edgeSoft)" clip-path="url(#${p}gripAll)"/>
      <clipPath id="${p}gripFront"><path d="${fronts}"/></clipPath>
      <path d="${BOTTOM_GLINT}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2" clip-path="url(#${p}gripFront)"/>`;
  }

  // The knob face, as in the photo: flat satin steel with a rounded rim — a fine bright line all round,
  // broadening only near the top, where it faces the light (so it stays a fine line beside the cuts).
  const RIM = { line: 1.6, top: 3.6 };
  function knobFace(p, cx, cy, r) {
    const outer = [], inner = [];
    for (let deg = 0; deg < 360; deg += 2) {
      const w = RIM.line + RIM.top * Math.max(0, Math.cos(rad(deg))) ** 3;
      outer.push([cx + r * Math.sin(rad(deg)), cy - r * Math.cos(rad(deg))]);
      inner.push([cx + (r - w) * Math.sin(rad(deg)), cy - (r - w) * Math.cos(rad(deg))]);
    }
    const rim = pathOf(outer) + pathOf(inner);
    // The fill goes inside the clipped group: a clip isolates the group, so the soft-light grain needs its
    // backdrop in there with it.
    return `
      <g clip-path="url(#${p}faceClip)">
        <rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" fill="url(#${p}face)"/>
        <rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" filter="url(#${p}satin)" opacity=".2" style="mix-blend-mode:soft-light"/>
        <path d="${rim}" fill-rule="evenodd" fill="url(#${p}faceRimTop)" filter="url(#${p}edgeSoft)"/><!-- soft inside: a rounded edge -->
      </g>
      <circle cx="${cx}" cy="${cy}" r="${r + .8}" fill="none" stroke="#8a8a8a" stroke-width="1.4"/>
      <circle class="kl-knob-face" cx="${cx}" cy="${cy}" r="${r}" fill="none"/>`;
  }

  function lockSvg(p) {
    const { cx, cy, r } = KNOB;
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
    <!-- The knob housing, measured from the photo: a flat, darker grey, lighter toward the right. -->
    <linearGradient id="${p}housing" x1="35" x2="211" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#909090"/><stop offset=".5" stop-color="#8b8b8b"/>
      <stop offset=".8" stop-color="#959595"/><stop offset=".97" stop-color="#a6a6a6"/>
    </linearGradient>
    <radialGradient id="${p}leftDim" cx="35" cy="517" r="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity=".15"/><stop offset=".5" stop-color="#000" stop-opacity=".08"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}ledgeFront" x1="0" x2="0" y1="516.5" y2="524.5" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#a2a2a2"/><stop offset="1" stop-color="#999"/>
    </linearGradient>
    <linearGradient id="${p}ledgeDark" x1="35" x2="211" gradientUnits="userSpaceOnUse">
      <stop offset=".153" stop-color="#000" stop-opacity="0"/><stop offset=".21" stop-color="#000" stop-opacity=".22"/>
      <stop offset=".244" stop-color="#000" stop-opacity=".24"/><stop offset=".29" stop-color="#000" stop-opacity=".1"/>
      <stop offset=".347" stop-color="#000" stop-opacity="0"/><stop offset=".653" stop-color="#000" stop-opacity="0"/>
      <stop offset=".7" stop-color="#000" stop-opacity=".15"/><stop offset=".795" stop-color="#000" stop-opacity=".15"/>
      <stop offset=".847" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}ledgeFoot" x1="70" x2="180" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".3" stop-color="#000" stop-opacity=".4"/>
      <stop offset=".5" stop-color="#000" stop-opacity=".6"/><stop offset=".7" stop-color="#000" stop-opacity=".4"/>
      <stop offset="1" stop-color="#000" stop-opacity=".1"/>
    </linearGradient>
    <linearGradient id="${p}ledgeShadow" x1="0" x2="0" y1="525" y2="545" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".1" stop-color="#000" stop-opacity=".27"/>
      <stop offset=".3" stop-color="#000" stop-opacity=".2"/><stop offset=".6" stop-color="#000" stop-opacity=".08"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
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
    <!-- The grip's front: a band whose rounded outer edge catches the light, brightest along the top. -->
    <radialGradient id="${p}lobeFront" cx="${cx}" cy="${cy}" r="${GRIP.outer}" gradientUnits="userSpaceOnUse">
      <stop offset="${GRIP.inner / GRIP.outer}" stop-color="#9a9a9a"/><stop offset=".92" stop-color="#ababab"/>
      <stop offset=".945" stop-color="#bcbcbc"/><stop offset=".98" stop-color="#c6c6c6"/><stop offset="1" stop-color="#b4b4b4"/>
    </radialGradient>
    <linearGradient id="${p}lobeLight" x1="0" x2="0" y1="${cy - GRIP.outer}" y2="${cy}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="#fff" stop-opacity=".6"/>
      <stop offset=".6" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="${p}face" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#acacac"/><stop offset=".12" stop-color="#a7a7a7"/>
      <stop offset=".88" stop-color="#a6a6a6"/><stop offset="1" stop-color="#acacac"/>
    </linearGradient>
    <linearGradient id="${p}faceRimTop" x1="0" x2="0" y1="${cy - r}" y2="${cy + r}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="#fff" stop-opacity=".65"/>
      <stop offset=".5" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/>
    </linearGradient>
    <filter id="${p}soft" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
    <filter id="${p}softWide" x="-50%" y="-60%" width="200%" height="240%"><feGaussianBlur stdDeviation="3.2"/></filter>
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
         plate, patches on the knob face. Grey noise, blended soft-light. -->
    <filter id="${p}steelBrush" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".75 .014" numOctaves="2" seed="11"/>
      <feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/>
    </filter>
    <filter id="${p}steelPatch" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="3" seed="4"/>
      <feColorMatrix type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 1"/>
    </filter>
    <clipPath id="${p}plate"><rect x="35" y="99" width="176" height="605" rx="50"/></clipPath>
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
    <rect x="35" y="456" width="70" height="61" fill="url(#${p}leftDim)"/><!-- the left rail dims toward the ledge -->
    <rect x="35" y="524.5" width="176" height="184" fill="url(#${p}housing)"/>
    <rect x="35" y="99" width="176" height="418" filter="url(#${p}steelBrush)" opacity=".3" style="mix-blend-mode:soft-light"/>
    <rect x="35" y="99" width="176" height="605" filter="url(#${p}steelPatch)" opacity=".28" style="mix-blend-mode:soft-light"/>
    <!-- the ledge: a chamfer down from the keypad's plate, mitred into the side rails, its foot shadowed
         (most of all over the knob) -->
    <path d="M44.5 516.5H202.5L209.5 524.5H35.5Z" fill="url(#${p}ledgeFront)"/>
    <path d="M44.5 516.5L36 524.5M202.5 516.5L210 524.5" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/>
    <path d="M38 516.2H208" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/>
    <path d="M35 525.1H211" stroke="#fff" stroke-opacity=".22" stroke-width=".9"/>
    <rect x="35" y="525" width="176" height="20" fill="url(#${p}ledgeShadow)"/>
    <path d="M44.5 516.5H202.5L209.5 524.5H35.5Z" fill="url(#${p}ledgeDark)"/>
    <path d="M70 524H180" stroke="url(#${p}ledgeFoot)" stroke-width="2.6" filter="url(#${p}edgeSoft)"/>
  </g>
  <rect x="35.6" y="99.6" width="174.8" height="603.8" rx="49.4" fill="none" stroke="url(#${p}plateRim)" stroke-width="1.2"/>
  <path d="M35.7 525V654A49.3 49.3 0 0 0 85 703.3H161A49.3 49.3 0 0 0 210.3 654V525" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>

  <!-- keys -->
  ${LEFT.map((k, i) => keySvg(p, k, 'L', i)).join('')}
  ${RIGHT.map((k, i) => keySvg(p, k, 'R', i)).join('')}

  <!-- knob: the grip turns (redrawn as it goes: the light and the camera don't turn with it); the face
       stays still. Behind them the plate darkens by the knob's cuts. -->
  <g class="kl-knob" role="button" tabindex="0" aria-label="Turn knob">
    <circle class="kl-hit" cx="${cx}" cy="${cy}" r="86"/>
    <ellipse cx="${cx - 56}" cy="${cy - 62}" rx="22" ry="13" transform="rotate(-42 ${cx - 56} ${cy - 62})" fill="#000" opacity=".16" filter="url(#${p}softWide)"/>
    <ellipse cx="${cx + 57}" cy="${cy - 63}" rx="16" ry="10" transform="rotate(42 ${cx + 57} ${cy - 63})" fill="#000" opacity=".1" filter="url(#${p}softWide)"/>
    ${[135, 225].map(c => { const [x0, y0] = polar(c - 16, 77), [x1, y1] = polar(c + 16, 77); return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A77 77 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="16" filter="url(#${p}softWide)"/>`; }).join('')}
    <g class="kl-grip">${gripSvg(p, 0)}</g>
    ${knobFace(p, cx, cy, r)}
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
      this._prefix = `kl${++instance}-`;
      this.innerHTML = lockSvg(this._prefix);
      this._svg = this.querySelector('svg');
      this._knob = this._svg.querySelector('.kl-knob');
      this._grip = this._svg.querySelector('.kl-grip');
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
      if (!this._grip) return;
      const { ms, keys, ease } = SPIN[turned ? 'turned' : 'caught'];
      const start = performance.now();
      const angle = t => {
        const i = keys.findIndex(([at]) => at >= t);
        if (i <= 0) return keys[0][1];
        const [t0, a0] = keys[i - 1], [t1, a1] = keys[i];
        return a0 + (a1 - a0) * ease((t - t0) / (t1 - t0));
      };
      const frame = now => {
        const t = Math.min(1, (now - start) / ms);
        this._grip.innerHTML = gripSvg(this._prefix, angle(t));
        if (t < 1) this._spin = requestAnimationFrame(frame);
      };
      cancelAnimationFrame(this._spin);
      this._spin = requestAnimationFrame(frame);
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
