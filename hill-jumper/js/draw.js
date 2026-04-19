function buildSkyCache() {
  const oc  = document.createElement('canvas');
  oc.width  = Math.round(W * DPR);
  oc.height = Math.round(H * DPR);
  const oc2 = oc.getContext('2d');
  oc2.scale(DPR, DPR);

  const grad = oc2.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   '#4A90D9');
  grad.addColorStop(0.3, '#87CEEB');
  grad.addColorStop(0.7, '#B0E0FF');
  grad.addColorStop(1,   '#FFECD2');
  oc2.fillStyle = grad;
  oc2.fillRect(0, 0, W, H);

  const sx = W * 0.85, sy = H * 0.18;
  const sunGlow = oc2.createRadialGradient(sx, sy, 10, sx, sy, 60);
  sunGlow.addColorStop(0,   '#FFF9C4');
  sunGlow.addColorStop(0.5, '#FFE082');
  sunGlow.addColorStop(1,   'rgba(255,224,130,0)');
  oc2.beginPath(); oc2.arc(sx, sy, 40, 0, Math.PI * 2);
  oc2.fillStyle = sunGlow; oc2.fill();
  oc2.beginPath(); oc2.arc(sx, sy, 28, 0, Math.PI * 2);
  oc2.fillStyle = '#FFF176'; oc2.fill();

  // Clouds (static — drawn into cache)
  function cloud(cx, cy, sc) {
    oc2.save(); oc2.translate(cx, cy); oc2.scale(sc, sc);
    oc2.fillStyle = 'rgba(255,255,255,0.85)';
    oc2.beginPath();
    oc2.arc( 0,   0,  20, 0, Math.PI * 2);
    oc2.arc(22,  -5,  16, 0, Math.PI * 2);
    oc2.arc(-20,  2,  14, 0, Math.PI * 2);
    oc2.arc(10,   5,  14, 0, Math.PI * 2);
    oc2.arc(-8,  -8,  16, 0, Math.PI * 2);
    oc2.fill(); oc2.restore();
  }
  cloud(W * 0.12, H * 0.15, 1.0);
  cloud(W * 0.38, H * 0.22, 0.7);
  cloud(W * 0.58, H * 0.11, 0.85);
  cloud(W * 0.78, H * 0.28, 0.6);

  skyCache = oc;
}

function drawSky() {
  if (!skyCache) buildSkyCache();
  ctx.drawImage(skyCache, 0, 0, W, H);
}

function drawTerrain() {
  // Sample terrain once at 6px intervals, reuse for fill + grass stroke
  const step = 6;
  const pts  = [];
  for (let sx = 0; sx <= W; sx += step) pts.push(getGroundAt(sx));

  if (!terrainGrad) {
    terrainGrad = ctx.createLinearGradient(0, H * 0.6, 0, H);
    terrainGrad.addColorStop(0,   '#3a7a30');
    terrainGrad.addColorStop(0.3, '#2d5a27');
    terrainGrad.addColorStop(1,   '#1a3a15');
  }

  ctx.beginPath();
  ctx.moveTo(0, pts[0]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(i * step, pts[i]);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = terrainGrad;
  ctx.fill();

  // Grass line reuses same points — no second getGroundAt pass
  ctx.strokeStyle = '#5aaf4f';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.moveTo(0, pts[0]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(i * step, pts[i]);
  ctx.stroke();
}

function drawPlayer(p) {
  const { x, y, w, h, onGround, legFrame } = p || { ...player, legFrame: score };
  const cx = x + w / 2;
  const airborne = !onGround;
  const t = legFrame || 0;

  const headR  = w * 0.31;
  const headCY = y + headR + 1;

  const shirtW = w * 0.74;
  const shirtT = headCY + headR * 0.72;
  const shirtB = y + h * 0.78;
  const shirtL = cx - shirtW / 2;

  // Legs (dark pants)
  ctx.fillStyle = '#37474f';
  const legW = shirtW * 0.36;
  const legH = (y + h) - shirtB;
  if (airborne) {
    ctx.fillRect(cx - shirtW * 0.32, shirtB, legW, legH * 0.9);
    ctx.fillRect(cx + shirtW * 0.32 - legW, shirtB, legW, legH * 0.9);
  } else {
    const la = Math.sin(t * 0.28) * 3;
    ctx.fillRect(cx - shirtW * 0.32, shirtB + la,  legW, legH - la);
    ctx.fillRect(cx + shirtW * 0.32 - legW, shirtB - la, legW, legH + la);
  }

  // Tzitzis — 1 string each side
  const tzLen = h * 0.28;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#fffff4';
  ctx.fillStyle = '#fffff4';
  for (let i = 0; i < 2; i++) {
    const tx0 = i === 0 ? cx - shirtW * 0.32 : cx + shirtW * 0.32;
    const ty0 = shirtB;
    const sway = Math.sin(t * 0.18 + i * 0.9) * 2;
    const tx1 = tx0 + sway;
    const ty1 = ty0 + tzLen;
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    ctx.quadraticCurveTo(tx0 + sway * 0.5, ty0 + tzLen * 0.5, tx1, ty1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tx1, ty1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Red shirt body
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(shirtL, shirtT, shirtW, shirtB - shirtT);

  // Neck
  ctx.fillStyle = '#ffcc80';
  ctx.fillRect(cx - headR * 0.35, headCY + headR * 0.68, headR * 0.70, shirtT - (headCY + headR * 0.68) + 1);

  // Head (skin)
  ctx.fillStyle = '#ffcc80';
  ctx.beginPath();
  ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Yarmulka (kippah) — solid blue, clipped to top of head
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1a237e';
  ctx.fillRect(cx - headR, headCY - headR, headR * 2, headR * 0.68);
  ctx.restore();

  // Eyes
  ctx.fillStyle = '#333';
  const eyeY = headCY + headR * 0.08;
  ctx.fillRect(cx - headR * 0.52, eyeY, headR * 0.26, headR * 0.34);
  ctx.fillRect(cx + headR * 0.26, eyeY, headR * 0.26, headR * 0.34);
}

function fillTextWrapped(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, y);
      line = word;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, y);
}

function drawGallery() {
  designFrame += 0.08;

  drawSky();
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 0, W, H);

  // ── Build entity list ──────────────────────────────────
  const entries = [
    {
      label: 'Player', desc: "That's you!",
      w: 36, h: 48, drawFn: drawPlayer,
      makeObj: () => ({ x: 0, y: 0, w: 36, h: 48, onGround: true, legFrame: designFrame * 10 }),
    },
    ...Object.entries(ENEMY_TYPES).map(([type, def]) => ({
      label:   def.galleryLabel || type.charAt(0).toUpperCase() + type.slice(1),
      desc:    def.galleryDesc || def.deathSub,
      w: def.w, h: def.h, drawFn: def.draw,
      makeObj: () => ({ x: 0, y: 0, w: def.w, h: def.h, frame: designFrame, ...def.galleryProps }),
    })),
    {
      label: 'Fire Pool', desc: 'Avoid falling in!',
      w: 60, h: 36, drawFn: drawFirePoolLocal,
      makeObj: () => ({ x: 0, y: 0, w: 60, h: 36, frame: designFrame, seed: 7 }),
    },
    {
      label: 'Car', desc: 'Walk into it to board — jump to drive, jump again in air to bail out!',
      w: CAR_W, h: CAR_H, drawFn: drawCar,
      makeObj: () => ({ x: 0, y: 0, w: CAR_W, h: CAR_H, frame: designFrame, state: 'available', flatGround: true }),
    },
  ];
  const count = entries.length;

  // ── Layout: portrait = 2-col grid, landscape = single row ─
  const portrait  = H > W;
  const cols      = portrait ? 2 : count;
  const rows      = Math.ceil(count / cols);
  const cellW     = W / cols;

  // Vertical space: leave room for header and footer
  const headerH   = H * (portrait ? 0.14 : 0.18);
  const footerH   = H * 0.07;
  const bodyH     = H - headerH - footerH;
  const cellH     = bodyH / rows;

  // How far down within each cell the ground sits (80%)
  const GROUND_FRAC = 0.80;

  const titleSize = Math.max(18, Math.round(Math.min(W, H) * (portrait ? 0.07 : 0.058)));
  const subSize   = Math.max(11, Math.round(Math.min(W, H) * (portrait ? 0.038 : 0.028)));
  const labelSize = Math.max(12, Math.round(cellH * 0.10));
  const descSize  = Math.max(9,  Math.round(cellH * 0.07));

  // ── Title ─────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${titleSize}px monospace`;
  ctx.fillText('🎨 Design Gallery', W / 2, headerH * 0.5);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `${subSize}px monospace`;
  ctx.fillText(
    portrait ? 'All characters & obstacles' : 'All characters & obstacles — animated as they appear in game',
    W / 2, headerH * 0.5 + titleSize * 1.15
  );

  // ── Draw one ground strip per row ────────────────────
  for (let r = 0; r < rows; r++) {
    const gy = headerH + cellH * r + cellH * GROUND_FRAC;
    const grad = ctx.createLinearGradient(0, gy, 0, gy + cellH * (1 - GROUND_FRAC) + footerH);
    grad.addColorStop(0,   '#3a7a30');
    grad.addColorStop(0.4, '#2d5a27');
    grad.addColorStop(1,   '#1a3a15');
    ctx.fillStyle = grad;
    ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = '#5aaf4f';
    ctx.fillRect(0, gy, W, 3);
  }

  // ── Draw each entity ──────────────────────────────────
  const scale = Math.min(
    Math.max(cellW / 120, 1.5),
    Math.max(cellH * GROUND_FRAC / 80, 1.5),
    portrait ? 5 : 4.5
  );

  for (let i = 0; i < count; i++) {
    const ent = entries[i];
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Centre of this cell, with last-row centering when count is odd
    const rowCount    = (row === rows - 1) ? count - row * cols : cols;
    const colOffset   = (cols - rowCount) / 2;
    const cx = cellW * (col + colOffset + 0.5);
    const groundY = headerH + cellH * row + cellH * GROUND_FRAC;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 5, ent.w * scale * 0.5, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    // Entity
    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(scale, scale);
    ctx.translate(-ent.w / 2, -ent.h);
    ent.drawFn(ent.makeObj());
    ctx.restore();

    // Name
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${labelSize}px monospace`;
    ctx.fillText(ent.label, cx, groundY + labelSize * 1.8);

    // Description (wrapped to fit cell)
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `${descSize}px monospace`;
    fillTextWrapped(ctx, ent.desc, cx, groundY + labelSize * 1.8 + descSize * 1.7, cellW * 0.88, descSize * 1.35);
  }

  // ── Footer ────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.font = `${Math.max(10, Math.round(Math.min(W, H) * 0.022))}px monospace`;
  ctx.fillText('Tap "🎨 Gallery" again to return to the game', W / 2, H * 0.965);
}

// ── Shared lava drawing helper — used by both in-game and gallery renderers ──
function _drawLava(x, top, w, bottom, frame, seed) {
  const midX = x + w / 2;

  // Lava body: deep dark gradient filling the pit
  const body = ctx.createLinearGradient(0, top, 0, bottom);
  body.addColorStop(0,    '#ff5500');
  body.addColorStop(0.12, '#cc2200');
  body.addColorStop(0.45, '#7a0e00');
  body.addColorStop(1,    '#120000');
  ctx.fillStyle = body;
  ctx.fillRect(x, top, w, bottom - top + 2);

  // Wavy molten surface as a filled polygon
  ctx.beginPath();
  ctx.moveTo(x, bottom + 2);
  ctx.lineTo(x, top);
  for (let fx = x; fx <= x + w; fx += 2) {
    const ph  = seed * 2.3 + (fx - x) * 0.09;
    const wy  = top + 3 * Math.sin(frame * 1.6 + ph) + 2 * Math.sin(frame * 2.8 + ph * 1.7);
    ctx.lineTo(fx, wy);
  }
  ctx.lineTo(x + w, bottom + 2);
  ctx.closePath();
  const surf = ctx.createLinearGradient(0, top - 6, 0, bottom);
  surf.addColorStop(0,    '#ff7700');
  surf.addColorStop(0.06, '#ff4400');
  surf.addColorStop(0.22, '#cc2200');
  surf.addColorStop(0.55, '#7a0e00');
  surf.addColorStop(1,    '#120000');
  ctx.fillStyle = surf;
  ctx.fill();

  // Dark cooling crust patches drifting on the surface
  for (let i = 0; i < 4; i++) {
    const ph  = seed * 6.1 + i * 2.9;
    const t   = ((frame * 0.09 + ph) % 1 + 1) % 1;
    const cx  = x + w * t;
    const cy  = top + 2 * Math.sin(frame * 1.6 + ph * 1.4);
    const rw  = w * (0.06 + 0.05 * Math.abs(Math.sin(ph * 3.3)));
    const rh  = Math.max(1, (bottom - top) * 0.07 + 1.5 * Math.sin(ph * 2.7));
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,2,0,0.7)';
    ctx.fill();
  }

  // Glowing hot spots — bright orange/yellow circles on the surface
  for (let i = 0; i < 3; i++) {
    const ph  = seed * 4.3 + i * 3.7;
    const hx  = x + w * (0.1 + 0.8 * (((ph * 0.41) % 1) + 1) % 1);
    const hy  = top + 1.5 * Math.sin(frame * 2.0 + ph);
    const hr  = (bottom - top) * (0.12 + 0.08 * Math.abs(Math.sin(frame * 1.3 + ph)));
    const hg  = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 3);
    hg.addColorStop(0,   'rgba(255,240,80,0.95)');
    hg.addColorStop(0.3, 'rgba(255,120, 0,0.65)');
    hg.addColorStop(1,   'rgba(200, 40, 0,0)');
    ctx.beginPath(); ctx.arc(hx, hy, hr * 3, 0, Math.PI * 2);
    ctx.fillStyle = hg; ctx.fill();
  }

  // Bubbles rising and popping at the surface
  for (let i = 0; i < 4; i++) {
    const ph  = seed * 5.9 + i * 4.1;
    const bt  = ((frame * 0.55 + ph) % (Math.PI * 2)) / (Math.PI * 2);
    if (bt > 0.88) continue;
    const bx  = x + w * (0.08 + 0.84 * (((ph * 0.29) % 1) + 1) % 1);
    const by  = top + 2 - bt * (bottom - top) * 0.18;
    const br  = (bottom - top) * (0.04 + 0.04 * bt);
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,${Math.round(90 + bt * 120)},0,${0.75 - bt * 0.45})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,210,40,${0.55 - bt * 0.35})`;
    ctx.lineWidth = 0.7; ctx.stroke();
  }

  // Soft orange glow rising above the surface
  const glow = ctx.createRadialGradient(midX, top, 0, midX, top, w * 0.75);
  glow.addColorStop(0,   'rgba(255,80,0,0.38)');
  glow.addColorStop(0.5, 'rgba(200,40,0,0.13)');
  glow.addColorStop(1,   'rgba(150,20,0,0)');
  ctx.fillStyle = glow;
  const glowH = (bottom - top) * 0.8;
  ctx.fillRect(x - 12, top - glowH, w + 24, glowH);
}

function drawFirePoolLocal(obj) {
  const { x, y, w, h, frame, seed } = obj;
  const top    = y + h * 0.18;
  const bottom = y + h;
  _drawLava(x, top, w, bottom, frame, seed);
}

function drawFirePool(pool) {
  const { frame, seed } = pool;
  const s    = pool.worldStart - terrainOffset;
  const e    = pool.worldEnd   - terrainOffset;
  const left = s - POOL_SLOPE;
  const rght = e + POOL_SLOPE;
  if (rght < -10 || left > W + 10) return;
  const lavaTop = H - H * 0.15;
  _drawLava(left, lavaTop, rght - left, H, frame, seed);
}

function drawWelcome() {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const vfloor = H >= 450 ? Math.min(Math.min(W, H), 480) * 0.036 : 0;
  const fs = (fh, fw) => Math.round(Math.max(Math.min(H * fh, W * fw), vfloor));

  // Title
  const s1 = fs(0.10, 0.085);
  ctx.font = `bold ${s1}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFE600';
  ctx.fillText('HILL JUMPER', cx, H * 0.14 + s1);

  // Subtitle
  const s2 = fs(0.032, 0.026);
  ctx.font = `${s2}px monospace`;
  ctx.fillStyle = '#ccc';
  ctx.fillText('Run as far as you can!', cx, H * 0.14 + s1 + s2 * 1.6);

  // ── User display pill ──────────────────────────────────
  const ufs    = Math.max(fs(0.024, 0.019), 12);
  const uLabel = currentUser ? '👤  ' + currentUser + '   ▾' : '👤  Pick a player  →';
  ctx.font = `bold ${ufs}px monospace`;
  const uPillW = Math.min(ctx.measureText(uLabel).width + 28, W * 0.72);
  const uPillH = ufs + 18;
  const uPillX = cx - uPillW / 2;
  const uPillY = H * 0.14 + s1 + s2 * 4.0;
  ctx.fillStyle   = currentUser ? 'rgba(74,144,217,0.22)' : 'rgba(255,230,0,0.15)';
  ctx.strokeStyle = currentUser ? '#4A90D9' : '#FFE600';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.roundRect(uPillX, uPillY, uPillW, uPillH, uPillH / 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = currentUser ? '#90C8F0' : '#FFE600';
  ctx.textAlign = 'center';
  ctx.fillText(uLabel, cx, uPillY + uPillH * 0.68);
  welcomeSwitchBtn = { x: uPillX, y: uPillY, w: uPillW, h: uPillH };

  let gy = Math.max(H * 0.30, uPillY + uPillH + Math.max(H * 0.025, 14));

  const section = (title) => {
    const ss = fs(0.030, 0.024);
    ctx.font = `bold ${ss}px monospace`;
    ctx.fillStyle = '#FFE600';
    ctx.textAlign = 'left';
    ctx.fillText(title, W * 0.10, gy);
    gy += ss * 1.8;
  };
  const bullet = (txt) => {
    const bs = fs(0.026, 0.021);
    ctx.font = `${bs}px monospace`;
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'left';
    ctx.fillText('  • ' + txt, W * 0.10, gy);
    gy += bs * 1.7;
  };

  section('CONTROLS');
  bullet('SPACE / ↑ / Tap  →  Jump');
  bullet('Double-tap in air  →  Double jump!');
  bullet('Walk into the police car to ride it');
  bullet('Jump while riding  →  Car jumps');
  bullet('Double jump while riding  →  Bail out');
  gy += H * 0.02;

  section('SCORING');
  bullet('Distance  →  1 pt per 1000 px');
  bullet('Airtime   →  1 pt per 1000 px in the air');
  bullet('Car boops →  1 pt per critter hit');

  // ── Start button ───────────────────────────────────────
  gy += H * 0.03;
  const btnW = Math.min(W * 0.55, 280), btnH = Math.min(Math.max(H * 0.075, 46), 58);
  const btnX = cx - btnW / 2, btnY = gy;
  restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
  ctx.fillStyle = currentUser ? '#27ae60' : '#3a5a45';
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnW, btnH, btnH * 0.22);
  ctx.fill();
  const s4 = fs(0.032, 0.026);
  ctx.font = `bold ${s4}px monospace`;
  ctx.fillStyle = currentUser ? '#fff' : '#888';
  ctx.textAlign = 'center';
  ctx.fillText(currentUser ? '▶  Let\'s Go!' : '▶  Pick a player first', cx, btnY + btnH * 0.65);

  // ── Leaderboard button ─────────────────────────────────
  const lbfs = Math.max(fs(0.024, 0.019), 12);
  ctx.font = `${lbfs}px monospace`;
  const lbLabel = '🏆  Leaderboard';
  const lbW  = Math.min(ctx.measureText(lbLabel).width + 28, btnW);
  const lbH  = lbfs + 16;
  const lbX  = cx - lbW / 2;
  const lbY  = btnY + btnH + Math.max(H * 0.018, 10);
  ctx.fillStyle   = 'rgba(255,215,0,0.10)';
  ctx.strokeStyle = 'rgba(255,215,0,0.45)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.roundRect(lbX, lbY, lbW, lbH, lbH / 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center';
  ctx.fillText(lbLabel, cx, lbY + lbH * 0.68);
  welcomeLeaderBtn = { x: lbX, y: lbY, w: lbW, h: lbH };

  // Credits
  const sc = fs(0.022, 0.018);
  ctx.font = `${sc}px monospace`;
  ctx.fillStyle = 'rgba(170,170,170,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('Chava Leeba & Aaron Nachman', cx, lbY + lbH + sc * 2.0);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.68)';
  ctx.fillRect(0, 0, W, H);

  let title, sub, color;
  if (deathCause === 'firepool') {
    title = 'BURNED!'; sub = 'You fell into the fire pool!'; color = '#ff5500';
  } else {
    const def = ENEMY_TYPES[deathCause];
    title = def ? def.deathTitle : 'GAME OVER';
    sub   = def ? def.deathSub   : null;
    color = def ? def.deathColor : '#ff4444';
  }

  const distanceScore = Math.floor(terrainOffset / 1000);
  const airtimeScore  = Math.floor(airtimePixels / 1000);
  const finalScore    = distanceScore + airtimeScore + carKills;

  const cx = W / 2;
  ctx.textAlign = 'center';

  // Responsive font sizes — floor to ~14px on portrait phones to stay readable
  const vfloor = H >= 450 ? Math.min(Math.min(W, H), 480) * 0.036 : 0;
  const fs = (fh, fw) => Math.round(Math.max(Math.min(H * fh, W * fw), vfloor));
  const divider = (y) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W * 0.10, y); ctx.lineTo(W * 0.90, y); ctx.stroke();
  };

  let gy = H * 0.10;

  // ── FINAL SCORE ───────────────────────────────────────────
  const s1 = fs(0.074, 0.060);
  ctx.font = `bold ${s1}px monospace`;
  ctx.fillStyle = '#FFE600';
  ctx.fillText('FINAL SCORE: ' + finalScore, cx, gy + s1);
  gy += s1 * 1.5 + H * 0.018;
  divider(gy); gy += H * 0.042;

  // ── Death cause ───────────────────────────────────────────
  const s2 = fs(0.054, 0.044);
  ctx.font = `bold ${s2}px monospace`;
  ctx.fillStyle = color;
  ctx.fillText(title, cx, gy + s2);
  gy += s2 * 1.35;

  if (sub) {
    const s3 = fs(0.027, 0.022);
    ctx.font = `${s3}px monospace`;
    ctx.fillStyle = '#ccc';
    ctx.fillText(sub, cx, gy + s3);
    gy += s3 * 1.6;
  }
  gy += H * 0.038;
  divider(gy); gy += H * 0.042;

  // ── Score breakdown ───────────────────────────────────────
  const rs   = fs(0.030, 0.024);
  const lCol = cx - W * 0.28;
  const vCol = cx + W * 0.06;
  const pCol = cx + W * 0.30;

  // Column headers
  ctx.font = `${Math.round(rs * 0.78)}px monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'left';  ctx.fillText('CATEGORY',  lCol, gy);
  ctx.textAlign = 'right'; ctx.fillText('VALUE', vCol, gy);
  ctx.fillText('PTS', pCol, gy);
  gy += rs * 1.3;

  function scoreRow(label, value, pts, highlight) {
    ctx.font = `${rs}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = highlight ? '#fff' : '#aaa';
    ctx.fillText(label, lCol, gy);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText(value, vCol, gy);
    ctx.fillStyle = pts > 0 ? '#FFD700' : '#666';
    ctx.fillText('+' + pts, pCol, gy);
    gy += rs * 1.65;
  }

  scoreRow('Distance',
    Math.round(terrainOffset).toLocaleString() + ' px',
    distanceScore);
  scoreRow('Airtime',
    (airtimeFrames / 60).toFixed(1) + ' s',
    airtimeScore);
  scoreRow('Critters booped',
    carKills + (carKills === 1 ? ' critter' : ' critters'),
    carKills,
    carKills > 0);

  gy += H * 0.012;
  divider(gy); gy += H * 0.038;

  // ── Rank display ──────────────────────────────────────────
  if (lastSavedEntry) {
    const rank = UserDB.rank(lastSavedEntry);
    if (rank) {
      const rfs = Math.max(fs(0.028, 0.023), 13);
      const rankStr = rank === 1 ? '🏆 New #1 — you\'re on top!' :
                      rank <= 3  ? `🥇 You ranked #${rank} — great run!` :
                                   `📍 You ranked #${rank}`;
      ctx.font = `bold ${rfs}px monospace`;
      ctx.fillStyle = rank <= 3 ? '#FFD700' : 'rgba(255,255,255,0.65)';
      ctx.textAlign = 'center';
      ctx.fillText(rankStr, cx, gy + rfs);
      gy += rfs * 2.2;
    }
  }

  // ── Play Again button ─────────────────────────────────────
  gy += Math.max(H * 0.008, 4);
  const btnW = Math.min(W * 0.55, 280);
  const btnH = Math.min(Math.max(H * 0.072, 44), 58);
  const btnX = cx - btnW / 2;
  const btnY = gy;
  restartBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
  ctx.fillStyle = '#27ae60';
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnW, btnH, btnH * 0.22);
  ctx.fill();
  const s4 = fs(0.030, 0.024);
  ctx.font = `bold ${s4}px monospace`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('▶  Play Again', cx, btnY + btnH * 0.65);

  // ── Leaderboard button ────────────────────────────────────
  const lbfs = Math.max(fs(0.024, 0.019), 12);
  ctx.font = `${lbfs}px monospace`;
  const lbLabel = '🏆  See Leaderboard';
  const lbW  = Math.min(ctx.measureText(lbLabel).width + 28, btnW);
  const lbH  = lbfs + 16;
  const lbX  = cx - lbW / 2;
  const lbY  = btnY + btnH + Math.max(H * 0.018, 10);
  ctx.fillStyle   = 'rgba(255,215,0,0.10)';
  ctx.strokeStyle = 'rgba(255,215,0,0.45)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.roundRect(lbX, lbY, lbW, lbH, lbH / 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center';
  ctx.fillText(lbLabel, cx, lbY + lbH * 0.68);
  gameoverLeaderBtn = { x: lbX, y: lbY, w: lbW, h: lbH };
}

function draw() {
  drawSky();
  for (const p of firePools) drawFirePool(p);
  // Rocks drawn before terrain so the ground surface overlaps their base (embedded look)
  for (const e of enemies) { if (e.type === 'rock') drawRock(e); }
  drawTerrain();
  for (const e of enemies) {
    if (e.type === 'rock') continue;
    const def = ENEMY_TYPES[e.type];
    if (def && def.draw) def.draw(e);
  }
  for (const v of vehicles) drawCar(v);
  drawPlayer();
  const liveScore = Math.floor(terrainOffset / 1000) + Math.floor(airtimePixels / 1000) + carKills;
  if (liveScore !== lastScore) { lastScore = liveScore; scoreEl.textContent = 'Score: ' + liveScore; }
  const subStr = `${Math.round(terrainOffset / 50)}m  ·  ${(airtimeFrames / 60).toFixed(1)}s air  ·  ${carKills} boops`;
  if (subStr !== lastSubStats) { lastSubStats = subStr; subStatsEl.textContent = subStr; }
  if (gameOver) drawGameOver();
  if (showWelcome) drawWelcome();
}
