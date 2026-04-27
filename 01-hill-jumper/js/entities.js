// ── Entity/vehicle size constants ────────────────────────────
const CAR_W  = 100, CAR_H  = 44;
const FLAT_HW    = 40;   // half-width of flat area under rock (px beyond rock edge)
const FLAT_SLOPE = 60;   // px of smooth transition into/out of flat area

const HEBREW_TITLES = ['בראשית','שמות','ויקרא','במדבר','דברים','תהלים','משלי','תורה'];

// ── Enemy type registry ───────────────────────────────────────
// To add a new enemy: add an entry here + a draw function below.
// Each definition needs: w, h, minDist, maxDist, hitboxPad,
//   deathTitle, deathSub, deathColor, draw, spawn().
const ENEMY_TYPES = {
  book: {
    w: 52, h: 52,
    minDist: 450, maxDist: 800,
    hitboxPad: 9,
    deathTitle: 'CHOMPED!',
    deathSub:   'A T-Rex stomped right through you!',
    deathColor: '#2d6b28',
    galleryProps: {},
    galleryDesc:  'A charging T-Rex — jump over it!',
    galleryLabel: 'T-Rex',
    draw: drawTrex,
    spawn(groundY) {
      return {
        type: 'book',
        x: W + 60 + Math.random() * 80,
        y: groundY - this.h,
        w: this.w, h: this.h,
        walkSpeed: 0.8 + Math.random() * 1.2,
        frame: Math.random() * 6,
      };
    },
  },
  rock: {
    w: 57, h: 42,
    minDist: 900, maxDist: 1800,
    hitboxPad: 7,
    deathTitle: 'OUCH!',
    deathSub:   'You ran straight into a rock!',
    deathColor: '#666',
    galleryProps: { seed: 42 },
    galleryDesc:  'Stationary — but very solid!',
    draw: drawRock,
    spawnOk(worldX) {
      const clear = POOL_SLOPE + this.w + 180;
      for (const pool of firePools) {
        if (worldX > pool.worldStart - clear && worldX < pool.worldEnd + clear) return false;
      }
      // Never spawn within 250px (edge-to-edge) of a vehicle
      const vClear = CAR_W / 2 + this.w / 2 + 250;
      for (const v of vehicles) {
        if (Math.abs(worldX - (v.x + terrainOffset + CAR_W / 2)) < vClear) return false;
      }
      return true;
    },
    spawn() {
      const sx          = W + 60 + Math.random() * 80;
      const wx          = sx + this.w / 2 + terrainOffset;
      const flatY       = terrainY(wx);
      const groundOffset = Math.round(this.h * 0.30);   // sink 30% below ground surface
      flatZones.push({ worldX: wx, flatY, hw: this.w / 2 + FLAT_HW, slope: FLAT_SLOPE });
      return {
        type: 'rock',
        x: sx, y: flatY - this.h + groundOffset,
        w: this.w, h: this.h,
        walkSpeed: 0, frame: 0,
        seed: Math.random() * 100,
        groundOffset,
        zoneWorldX: wx,
      };
    },
  },
  mouse: {
    w: 44, h: 24,
    minDist: 300, maxDist: 650,
    hitboxPad: 7,
    deathTitle: 'CHOMPED!',
    deathSub:   'A Mouse Fish bit you!',
    deathColor: '#446677',
    galleryProps: { nearPlayer: true },
    galleryDesc:  'Swift and hungry — part mouse, part fish!',
    galleryLabel: 'Mouse Fish',
    draw: drawMouse,
    spawn(groundY) {
      return {
        type: 'mouse',
        x: W + 60 + Math.random() * 80,
        y: groundY - this.h,
        w: this.w, h: this.h,
        walkSpeed: 1.4 + Math.random() * 1.8,
        frame: Math.random() * 6,
        nearPlayer: false,
      };
    },
  },
};

// ── Draw: Car (police vehicle, rideable) ──────────────────────
function drawCar(car) {
  const { x, y, w, h, frame, state } = car;

  const wr  = h * 0.22;
  const wx1 = x + w * 0.20;   // front (left) wheel screen x
  const wx2 = x + w * 0.80;   // rear  (right) wheel screen x

  // Ground at each wheel — flatGround flag bypasses terrain for gallery use
  const gnd1 = car.flatGround ? y + h : getGroundAt(wx1);
  const gnd2 = car.flatGround ? y + h : getGroundAt(wx2);
  const ay1  = gnd1 - wr;     // front axle center y (wheel bottom = gnd)
  const ay2  = gnd2 - wr;     // rear  axle center y

  // Car tilt and mid-axle pivot in screen space
  const tilt = Math.atan2(ay2 - ay1, wx2 - wx1);
  const mx   = (wx1 + wx2) * 0.5;
  const my   = (ay1 + ay2) * 0.5;

  // ── Exhaust puffs (screen space, from rear axle) ──────────
  const exhaustAlpha = state === 'boarded' ? 0.60 : 0.28;
  for (let i = 0; i < 3; i++) {
    const pf    = ((frame * 0.85 + i * 0.34) % 1);
    const alpha = (1 - pf) * exhaustAlpha;
    ctx.beginPath();
    ctx.arc(wx2 + pf * 22, ay2 - pf * 10, 2 + pf * 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(155,155,155,${alpha.toFixed(2)})`;
    ctx.fill();
  }

  // ── Speed lines when boarded ──────────────────────────────
  if (state === 'boarded') {
    for (let i = 0; i < 5; i++) {
      const ly   = ay2 - h * (0.05 + i * 0.12);
      const llen = 14 + i * 11 + Math.sin(frame * 4.5 + i * 1.3) * 5;
      ctx.strokeStyle = `rgba(255,255,255,${(0.12 + i * 0.04).toFixed(2)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(wx2 + 6, ly);
      ctx.lineTo(wx2 + 6 + llen, ly);
      ctx.stroke();
    }
  }

  // ── Light glow (screen space, pre-body) ──────────────────
  const _fp = Math.floor(frame * (state === 'boarded' ? 3.5 : 1.8)) % 2;
  ctx.fillStyle = _fp === 0 ? 'rgba(255,20,20,0.12)' : 'rgba(20,60,255,0.12)';
  ctx.beginPath(); ctx.ellipse(mx, my - h * 0.38, w * 0.26, h * 0.22, tilt, 0, Math.PI*2); ctx.fill();

  // ── Car body — drawn in tilted local space ────────────────
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(tilt);
  ctx.translate(-(x + w * 0.5), -(y + h - wr * 0.55));

  // Flash phase for lights
  const flashRate  = state === 'boarded' ? 3.5 : 1.8;
  const flashPhase = Math.floor(frame * flashRate) % 2;

  // Lower body (police black)
  ctx.fillStyle = '#1c1c2e';
  ctx.fillRect(x + 2, y + h * 0.44, w - 4, h * 0.56);

  // White door stripe
  ctx.fillStyle = '#eeeef5';
  ctx.fillRect(x + 4, y + h * 0.55, w - 8, h * 0.13);

  // Cabin (trapezoid)
  ctx.fillStyle = '#1c1c2e';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.10, y + h * 0.44);
  ctx.lineTo(x + w * 0.20, y + h * 0.06);
  ctx.lineTo(x + w * 0.82, y + h * 0.06);
  ctx.lineTo(x + w * 0.92, y + h * 0.44);
  ctx.closePath();
  ctx.fill();

  // Light bar housing
  const lbX = x + w * 0.28, lbY = y + h * 0.02;
  const lbW = w * 0.44,     lbH = h * 0.08;
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(lbX, lbY, lbW, lbH);
  // Red half
  ctx.fillStyle = flashPhase === 0 ? '#ff2020' : '#550000';
  ctx.fillRect(lbX + 1, lbY + 1, lbW * 0.5 - 2, lbH - 2);
  // Blue half
  ctx.fillStyle = flashPhase === 1 ? '#2244ff' : '#000066';
  ctx.fillRect(lbX + lbW * 0.5 + 1, lbY + 1, lbW * 0.5 - 2, lbH - 2);

  // Window
  ctx.fillStyle = state === 'boarded' ? '#aed6f1' : '#85c1e9';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.17, y + h * 0.41);
  ctx.lineTo(x + w * 0.26, y + h * 0.11);
  ctx.lineTo(x + w * 0.76, y + h * 0.11);
  ctx.lineTo(x + w * 0.85, y + h * 0.41);
  ctx.closePath();
  ctx.fill();

  // Window highlight
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.20, y + h * 0.38);
  ctx.lineTo(x + w * 0.28, y + h * 0.14);
  ctx.lineTo(x + w * 0.48, y + h * 0.14);
  ctx.lineTo(x + w * 0.45, y + h * 0.38);
  ctx.closePath();
  ctx.fill();

  // Player head peeking through window when boarded
  if (state === 'boarded') {
    const hx = x + w * 0.51, hy = y + h * 0.27;
    ctx.fillStyle = '#ffcc80';
    ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillRect(hx - 3.5, hy - 1, 2, 2.5);
    ctx.fillRect(hx + 1.5, hy - 1, 2, 2.5);
  }

  // "POLICE" on door stripe
  ctx.fillStyle = '#1c1c2e';
  ctx.font = `bold ${Math.round(h * 0.13)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('POLICE', x + w * 0.50, y + h * 0.65);

  // Headlight (left = front)
  ctx.fillStyle = '#f4d03f';
  ctx.beginPath(); ctx.ellipse(x + 6, y + h * 0.60, 5, 4, 0, 0, Math.PI * 2); ctx.fill();

  // Body outline
  ctx.strokeStyle = '#0a0a1a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 2, y + h * 0.44, w - 4, h * 0.56);

  ctx.restore();

  // ── Wheels — drawn at actual ground-snapped axle positions ─
  for (const [wpx, way] of [[wx1, ay1], [wx2, ay2]]) {
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(wpx, way, wr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bdc3c7';
    ctx.beginPath(); ctx.arc(wpx, way, wr * 0.56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 1.5;
    for (let s = 0; s < 4; s++) {
      const angle = frame * 0.45 + s * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(wpx, way);
      ctx.lineTo(wpx + Math.cos(angle) * wr * 0.5, way + Math.sin(angle) * wr * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#ecf0f1';
    ctx.beginPath(); ctx.arc(wpx, way, wr * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  // ── RIDE! arrow when available ────────────────────────────
  if (state === 'available') {
    const bounce = Math.sin(frame * 5) * 7;
    const ax = mx;
    const topY = my - (h - wr * 0.55 - h * 0.06);   // approx screen y of cabin peak
    const ay  = topY - 28 + bounce;

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0a0a1a';
    ctx.strokeText('RIDE!', ax, ay - 4);
    ctx.fillStyle = '#fff800';
    ctx.fillText('RIDE!', ax, ay - 4);

    ctx.fillStyle = '#1c1c2e';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax,      ay + 14);
    ctx.lineTo(ax - 11, ay + 3);
    ctx.lineTo(ax - 5,  ay + 3);
    ctx.lineTo(ax - 5,  ay - 4);
    ctx.lineTo(ax + 5,  ay - 4);
    ctx.lineTo(ax + 5,  ay + 3);
    ctx.lineTo(ax + 11, ay + 3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

// ── Draw: Rock (stationary obstacle) ─────────────────────────
function drawRock(rock) {
  const { x, y, w, h, seed } = rock;

  const nPts      = 6 + Math.floor(((Math.sin(seed * 1.0) + 1) / 2) * 4);
  const jitterAmp = 0.14 + ((Math.sin(seed * 2.3) + 1) / 2) * 0.28;
  const xScale    = 0.78 + ((Math.sin(seed * 3.7) + 1) / 2) * 0.38;
  const yScale    = 0.78 + ((Math.sin(seed * 5.1) + 1) / 2) * 0.38;
  const tilt      = (Math.sin(seed * 4.4)) * 0.22;

  const cx = x + w / 2;
  const cy = y + h * 0.55;
  const rx = (w / 2) * Math.min(xScale, 1.0);
  const ry = (h / 2) * Math.min(yScale, 1.0);

  const points = [];
  for (let i = 0; i < nPts; i++) {
    const angle  = (i / nPts) * Math.PI * 2 - Math.PI / 2 + tilt;
    const jitter = (1 - jitterAmp) + jitterAmp * 2 *
                   ((Math.sin(seed * 2.9 + i * (6.28 / nPts) * 1.3) + 1) / 2);
    const sinA   = Math.sin(angle - tilt);
    const flatten = (sinA > 0.15 && sinA < 0.95) ? 0.86 : 1;
    points.push({
      px: cx + Math.cos(angle) * rx * jitter,
      py: cy + Math.sin(angle) * ry * jitter * flatten,
    });
  }

  ctx.beginPath();
  for (let i = 0; i < nPts; i++) {
    const curr = points[i];
    const next = points[(i + 1) % nPts];
    const mx   = (curr.px + next.px) / 2;
    const my   = (curr.py + next.py) / 2;
    i === 0 ? ctx.moveTo(mx, my) : null;
    ctx.quadraticCurveTo(curr.px, curr.py, mx, my);
  }
  ctx.closePath();

  const grad = ctx.createRadialGradient(
    cx - rx * 0.28, cy - ry * 0.38, rx * 0.05,
    cx + rx * 0.05, cy + ry * 0.1,  Math.max(rx, ry) * 1.1
  );
  grad.addColorStop(0,    '#c8c8c8');
  grad.addColorStop(0.25, '#9e9e9e');
  grad.addColorStop(0.6,  '#6b6b6b');
  grad.addColorStop(1,    '#3a3a3a');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(30,30,30,0.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  const sheen = ctx.createRadialGradient(
    cx - rx * 0.3, cy - ry * 0.45, 0,
    cx - rx * 0.3, cy - ry * 0.45, rx * 0.72
  );
  sheen.addColorStop(0,   'rgba(255,255,255,0.28)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  sheen.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.restore();

  // Seed-driven crack
  const crackAngle = tilt + Math.sin(seed * 6.1) * 0.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(crackAngle)       * rx * 0.28, cy + Math.sin(crackAngle)       * ry * 0.28);
  ctx.lineTo(cx + Math.cos(crackAngle + 0.9) * rx * 0.12, cy + Math.sin(crackAngle + 0.9) * ry * 0.12);
  ctx.lineTo(cx + Math.cos(crackAngle + 0.9) * rx * 0.35, cy + Math.sin(crackAngle + 0.9) * ry * 0.35);
  ctx.stroke();
}

// ── Draw: T-Rex ───────────────────────────────────────────────
function drawTrex(trex) {
  const { x, y, w, h, frame } = trex;
  const step  = Math.sin(frame * 6);
  const chomp = (Math.sin(frame * 5) + 1) * 0.5;

  ctx.save();
  ctx.translate(x, y);

  // Tail sweeping right
  ctx.fillStyle = '#3d7538';
  ctx.beginPath();
  ctx.moveTo(w * 0.65, h * 0.46);
  ctx.quadraticCurveTo(w * 1.02, h * 0.28 + step * 5, w * 1.08, h * 0.40 + step * 6);
  ctx.quadraticCurveTo(w * 1.02, h * 0.55, w * 0.65, h * 0.58);
  ctx.closePath();
  ctx.fill();

  // Main body
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.ellipse(w * 0.50, h * 0.50, w * 0.25, h * 0.28, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#7abf6e';
  ctx.beginPath();
  ctx.ellipse(w * 0.43, h * 0.56, w * 0.13, h * 0.16, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.moveTo(w * 0.30, h * 0.28);
  ctx.lineTo(w * 0.38, h * 0.38);
  ctx.lineTo(w * 0.24, h * 0.50);
  ctx.lineTo(w * 0.13, h * 0.43);
  ctx.closePath();
  ctx.fill();

  // Head (upper)
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.ellipse(w * 0.13, h * 0.27, w * 0.16, h * 0.13, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Upper snout
  const upShift = chomp * h * 0.07;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.27 - upShift);
  ctx.lineTo(w * 0.00, h * 0.33 - upShift);
  ctx.lineTo(w * 0.06, h * 0.40 - upShift * 0.4);
  ctx.lineTo(w * 0.18, h * 0.37 - upShift * 0.2);
  ctx.closePath();
  ctx.fill();

  // Lower jaw
  const dnShift = chomp * h * 0.05;
  ctx.fillStyle = '#3d7538';
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.40 + dnShift * 0.3);
  ctx.lineTo(w * 0.00, h * 0.44 + dnShift);
  ctx.lineTo(w * 0.15, h * 0.52 + dnShift * 0.5);
  ctx.lineTo(w * 0.22, h * 0.46);
  ctx.closePath();
  ctx.fill();

  // Mouth interior + teeth
  if (chomp > 0.15) {
    ctx.fillStyle = '#922b21';
    ctx.beginPath();
    ctx.moveTo(w * 0.03, h * 0.37 - upShift * 0.3);
    ctx.lineTo(w * 0.00, h * 0.40 + dnShift * 0.5);
    ctx.lineTo(w * 0.13, h * 0.50 + dnShift * 0.3);
    ctx.lineTo(w * 0.18, h * 0.41);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0f0f0';
    for (let i = 0; i < 3; i++) {
      const tx = w * 0.04 + i * w * 0.055;
      const td = chomp * h * 0.06;
      ctx.beginPath();
      ctx.moveTo(tx, h * 0.38 - upShift * 0.3);
      ctx.lineTo(tx + w * 0.027, h * 0.38 + td - upShift * 0.3);
      ctx.lineTo(tx + w * 0.054, h * 0.38 - upShift * 0.3);
      ctx.fill();
    }
  }

  // Eye
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath(); ctx.arc(w * 0.10, h * 0.21, w * 0.046, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(w * 0.09, h * 0.21, w * 0.024, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2d5c28'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.04, h * 0.16); ctx.lineTo(w * 0.17, h * 0.18); ctx.stroke();

  // Tiny arms
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.moveTo(w * 0.32, h * 0.40);
  ctx.quadraticCurveTo(w * 0.22, h * 0.50 + step * 3, w * 0.20, h * 0.58 + step * 3);
  ctx.lineTo(w * 0.27, h * 0.56 + step * 3);
  ctx.quadraticCurveTo(w * 0.30, h * 0.46, w * 0.37, h * 0.44);
  ctx.closePath();
  ctx.fill();

  // Big legs
  const la = step * 9;
  for (const [lx, swing] of [[w * 0.42, la], [w * 0.57, -la]]) {
    ctx.fillStyle = '#3d7538';
    ctx.beginPath();
    ctx.ellipse(lx, h * 0.76 - swing * 0.18, w * 0.09, h * 0.18, 0.1 + swing * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(lx - swing * 0.28, h * 0.93 - Math.abs(swing) * 0.13, w * 0.11, h * 0.08, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Draw: Mouse Fish ──────────────────────────────────────────
function drawMouse(mouse) {
  const { x, y, w, h, frame, nearPlayer } = mouse;
  const bob      = Math.sin(frame * 5) * 1.5;
  const tailWag  = Math.sin(frame * 7) * 4;
  const mouthOpen = nearPlayer ? (Math.sin(frame * 8) + 1) * 2.5 : 0;

  ctx.save();
  ctx.translate(x, y + bob);

  // Fish tail — forked, right side (rear of left-facing creature)
  const tailX = w * 0.84, midY = h * 0.50;
  ctx.fillStyle = '#5a8899';
  ctx.beginPath();
  ctx.moveTo(tailX, midY);
  ctx.lineTo(w + 5,  midY - h * 0.38 + tailWag);
  ctx.lineTo(w,      midY);
  ctx.lineTo(w + 5,  midY + h * 0.38 - tailWag);
  ctx.closePath();
  ctx.fill();

  // Fish body
  const bx = w * 0.46, by = h * 0.50;
  const brx = w * 0.40, bry = h * 0.38;
  ctx.fillStyle = '#7fa8b8';
  ctx.beginPath();
  ctx.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pale belly
  ctx.fillStyle = '#c0dce8';
  ctx.beginPath();
  ctx.ellipse(bx + 2, by + h * 0.10, brx * 0.68, bry * 0.50, 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Scales (curved arcs)
  ctx.strokeStyle = 'rgba(50,85,105,0.28)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 4; i++) {
    const sx = bx - brx * 0.25 + i * brx * 0.52;
    ctx.beginPath();
    ctx.arc(sx, by + h * 0.06, bry * 0.62, -Math.PI * 0.55, 0.12);
    ctx.stroke();
  }

  // Dorsal fin
  ctx.fillStyle = '#5a8899';
  ctx.beginPath();
  ctx.moveTo(bx - brx * 0.28, by - bry * 0.88);
  ctx.quadraticCurveTo(bx + brx * 0.05, by - bry - h * 0.44, bx + brx * 0.32, by - bry * 0.92);
  ctx.closePath();
  ctx.fill();

  // Pectoral fin (side)
  ctx.fillStyle = 'rgba(90,136,153,0.68)';
  ctx.beginPath();
  ctx.moveTo(bx - brx * 0.08, by + bry * 0.18);
  ctx.quadraticCurveTo(bx - brx * 0.14, by + bry + h * 0.20, bx + brx * 0.28, by + bry * 0.22);
  ctx.closePath();
  ctx.fill();

  // Mouse head (grey, blends into body left side)
  const hx = w * 0.18, hy = h * 0.48;
  ctx.fillStyle = '#909090';
  ctx.beginPath();
  ctx.arc(hx, hy, h * 0.37, 0, Math.PI * 2);
  ctx.fill();

  // Ears (round, on top — two sizes)
  for (const [ex, ey, ro, ri] of [
    [hx - h * 0.08, hy - h * 0.30, h * 0.20, h * 0.12],
    [hx + h * 0.12, hy - h * 0.27, h * 0.15, h * 0.09],
  ]) {
    ctx.fillStyle = '#787878';
    ctx.beginPath(); ctx.arc(ex, ey, ro, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e899aa';
    ctx.beginPath(); ctx.arc(ex, ey, ri, 0, Math.PI * 2); ctx.fill();
  }

  // Snout
  ctx.fillStyle = '#b8b8b8';
  ctx.beginPath();
  ctx.ellipse(hx - h * 0.28, hy + h * 0.04, h * 0.17, h * 0.12, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FF9999';
  ctx.beginPath();
  ctx.arc(hx - h * 0.40, hy + h * 0.01, h * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(hx - h * 0.08, hy - h * 0.10, h * 0.10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff2222';
  ctx.beginPath(); ctx.arc(hx - h * 0.08, hy - h * 0.10, h * 0.056, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.arc(hx - h * 0.11, hy - h * 0.13, h * 0.028, 0, Math.PI * 2); ctx.fill();

  // Mouth (triangle; opens near player, shows fangs)
  ctx.fillStyle = '#bb2222';
  ctx.beginPath();
  ctx.moveTo(hx - h * 0.33, hy + h * 0.06);
  ctx.lineTo(hx - h * 0.14, hy + h * 0.06 + mouthOpen);
  ctx.lineTo(hx - h * 0.14, hy + h * 0.06 - mouthOpen);
  ctx.closePath();
  ctx.fill();
  if (mouthOpen > 1) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(hx - h * 0.31, hy + h * 0.06 - mouthOpen + 0.5);
    ctx.lineTo(hx - h * 0.24, hy + h * 0.06);
    ctx.lineTo(hx - h * 0.17, hy + h * 0.06 - mouthOpen + 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // Whiskers
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 0.6;
  const wbx = hx - h * 0.30, wby = hy + h * 0.03;
  ctx.beginPath();
  ctx.moveTo(wbx, wby - h * 0.05); ctx.lineTo(wbx - h * 0.40, wby - h * 0.15);
  ctx.moveTo(wbx, wby);             ctx.lineTo(wbx - h * 0.44, wby + h * 0.02);
  ctx.moveTo(wbx, wby + h * 0.05); ctx.lineTo(wbx - h * 0.40, wby + h * 0.14);
  ctx.stroke();

  ctx.restore();
}
