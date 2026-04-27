function update() {
  if (gameOver || showWelcome) return;

  // Scroll world
  terrainOffset += speed;

  // Update all enemies: move, animate, stick to ground
  for (const e of enemies) {
    e.x -= speed + e.walkSpeed;
    e.frame += 0.1;
    e.y = getGroundAt(e.x + e.w / 2) - e.h + (e.groundOffset || 0);
    if (e.type === 'mouse') e.nearPlayer = (e.x - player.x) < 100;
    if (e.type === 'car' && e.state === 'available' && e.x + e.w < player.x) e.state = 'missed';
  }
  enemies = enemies.filter(e => e.x + e.w > -80 && e.y + e.h < H);
  // Remove flat zones whose rock has scrolled off-screen or been destroyed
  if (flatZones.length) {
    const alive = new Set(enemies.filter(e => e.zoneWorldX).map(e => e.zoneWorldX));
    flatZones = flatZones.filter(z => alive.has(z.worldX));
  }

  // Tick spawners; create new enemy when timer expires
  for (const s of spawners) {
    s.timer -= speed;
    if (s.timer <= 0) {
      const def    = ENEMY_TYPES[s.type];
      const ex     = W + 60 + Math.random() * 80;
      const worldX = ex + terrainOffset;
      if (def.spawnOk && !def.spawnOk(worldX)) {
        s.timer = 200;  // blocked by lava proximity — retry after a short delay
      } else {
        enemies.push(def.spawn(getGroundAt(ex)));
        const ease = 1 + (1 - Math.min(1, terrainOffset / 12000)) * 3;
        s.timer = (def.minDist + Math.random() * (def.maxDist - def.minDist)) * ease;
      }
    }
  }

  // ── Vehicle spawning & movement ───────────────────────────
  vehicleTimer -= speed;
  if (vehicleTimer <= 0) {
    const vx = W + 80 + Math.random() * 60;
    const vwx = terrainOffset + vx;
    const inPool = firePools.some(p =>
      vwx + CAR_W > p.worldStart - 250 && vwx < p.worldEnd + 250);
    // Exclude the full rock flat zone + slope on both sides so the car never
    // spawns on the ramp or overlapping the rock itself.
    const nearRock = flatZones.some(z =>
      vwx + CAR_W > z.worldX - z.hw - z.slope &&
      vwx         < z.worldX + z.hw + z.slope);
    if (!inPool && !nearRock) {
      vehicles.push({ x: vx, y: getGroundAt(vx + CAR_W / 2) - CAR_H,
                      w: CAR_W, h: CAR_H, frame: 0, state: 'available', vy: 0, onGround: false });
      vehicleTimer = 1800 + Math.random() * 1000;
    } else {
      vehicleTimer = 300; // retry soon
    }
  }
  for (const v of vehicles) {
    if (v.state !== 'boarded') v.x -= speed;
    v.frame += 0.1;
    if (v.state !== 'boarded') v.y = getGroundAt(v.x + v.w / 2) - v.h;
    if (v.state === 'available' && v.x + v.w < player.x) v.state = 'missed';
  }
  vehicles = vehicles.filter(v => v.x + v.w > -120);

  // ── Boarding detection ────────────────────────────────────
  if (!boardedVehicle) {
    const { x: px, y: py, w: pw, h: ph } = player;
    for (const v of vehicles) {
      if (v.state !== 'available') continue;
      if (px + pw > v.x + 6 && px < v.x + v.w - 6 && py + ph > v.y + 6 && py < v.y + v.h) {
        boardedVehicle = v;
        v.state = 'boarded';
        v.vy = 0;
        v.x = player.x + player.w / 2 - v.w / 2;
        boardingBoost = 2;
        sfxBoard(); startCarRumble();
        break;
      }
    }
  }

  // ── Boarded vehicle physics ───────────────────────────────
  if (boardedVehicle) {
    const bv = boardedVehicle;
    if (!vehicles.includes(bv)) {
      boardedVehicle = null;
      stopCarRumble(); deathCause = 'firepool'; gameOver = true; sfxDeath();
    } else {
      // Apply gravity and ground collision to the vehicle
      bv.vy += GRAVITY;
      bv.y  += bv.vy;
      const vGroundY = getGroundAt(bv.x + bv.w / 2) - bv.h;
      // Eject player if car is over lava
      if (vGroundY > H * 0.86) {
        vehicles = vehicles.filter(v => v !== bv);
        boardedVehicle = null;
        boardingBoost  = 0;
        player.vy           = JUMP_FORCE * 1.1;
        player.onGround     = false;
        player.jumped       = true;
        player.canDoubleJump = true;
        stopCarRumble(); sfxJump();
      } else if (bv.y >= vGroundY) {
        bv.y  = vGroundY;
        bv.vy = 0;
        bv.onGround = true;
      } else {
        bv.onGround = false;
      }

      if (jumpBuffer > 0) {
        if (bv.onGround) {
          // First jump: vehicle and player jump together
          bv.vy = JUMP_FORCE;
          bv.onGround = false;
          jumpBuffer = 0;
        } else {
          // Second jump (already in air): player exits with a jump
          stopCarRumble();
          boardedVehicle = null;
          bv.state = 'missed';
          boardingBoost = 0;
          player.vy = JUMP_FORCE;
          player.onGround = false;
          player.jumped = true;
          player.canDoubleJump = false;
          jumpBuffer = 0;
        }
      }

      if (boardedVehicle) {
        // Lock player on top of car roof
        player.x  = Math.round(bv.x + (bv.w - player.w) / 2);
        player.y  = bv.y - player.h;
        player.vy = 0;
        player.onGround = bv.onGround;
        if (bv.onGround) coyoteTimer = COYOTE_FRAMES;
      }
    }
  }

  // ── Player physics (skipped while riding) ─────────────────
  if (!boardedVehicle) {
  const groundY = Math.min(
    getGroundAt(player.x + 2),
    getGroundAt(player.x + player.w - 2)
  );
  player.vy += GRAVITY;
  player.y  += player.vy;

  if (player.y + player.h >= groundY) {
    player.y             = groundY - player.h;
    player.vy            = 0;
    if (!player.onGround) sfxLand();
    player.onGround      = true;
    player.jumped        = false;
    player.canDoubleJump = true;
    coyoteTimer          = COYOTE_FRAMES;
  } else {
    player.onGround = false;
    if (coyoteTimer > 0) coyoteTimer--;
  }

  // Jump buffer: honour a press that happened up to JUMP_BUFFER_FRAMES ago
  if (jumpBuffer > 0) {
    jumpBuffer--;
    const canGroundJump = player.onGround || (coyoteTimer > 0 && !player.jumped);
    if (canGroundJump) {
      player.vy       = JUMP_FORCE;
      player.onGround = false;
      player.jumped   = true;
      coyoteTimer     = 0;
      jumpBuffer      = 0;
      sfxJump();
    } else if (player.canDoubleJump) {
      player.vy            = JUMP_FORCE;
      player.canDoubleJump = false;
      jumpBuffer           = 0;
      sfxJump();
    }
  }
  } // end !boardedVehicle

  // Fire pool spawning — size capped so a single jump at current speed can clear it
  firePoolTimer -= speed;
  if (firePoolTimer <= 0) {
    const airTime  = (2 * Math.abs(JUMP_FORCE)) / GRAVITY;         // ~44 frames
    const maxTotal = airTime * speed * 0.82;                        // 82% of max distance
    const flatW    = Math.min(60, Math.max(28, maxTotal - 2 * POOL_SLOPE));
    const wx = terrainOffset + W + 100 + Math.random() * 60;
    firePools.push({ worldStart: wx, worldEnd: wx + flatW, frame: 0, seed: Math.random() * 100 });
    const poolEase = 1 + (1 - Math.min(1, terrainOffset / 12000)) * 2;
    firePoolTimer = (1500 + Math.random() * 1200) * poolEase;
  }
  for (const p of firePools) p.frame += 0.06;
  firePools = firePools.filter(p => p.worldEnd - terrainOffset + POOL_SLOPE > -60);

  // Die if player falls to the bottom (into a fire pool)
  if (player.y + player.h >= H) {
    deathCause = 'firepool';
    gameOver   = true;
    sfxDeath();
  }

  // Collision — vehicles only boop enemies while the player is riding
  let survivingEnemies = [...enemies];
  for (const v of vehicles) {
    if (v !== boardedVehicle) continue;
    const { x: bx, y: by, w: bw, h: bh } = v;
    const next = [];
    for (const e of survivingEnemies) {
      const pad = ENEMY_TYPES[e.type].hitboxPad;
      const hit = bx + bw > e.x + pad && bx < e.x + e.w - pad &&
                  by + bh > e.y + pad && by < e.y + e.h;
      if (hit && e.type === 'rock') {
        if (v === boardedVehicle) {
          // Rock crashes the boarded car — eject the player upward
          sfxCrash(); stopCarRumble();
          v.state = 'missed';
          boardingBoost  = 0;
          boardedVehicle = null;
          player.vy           = JUMP_FORCE * 0.75;
          player.onGround     = false;
          player.jumped       = true;
          player.canDoubleJump = true;
        }
        next.push(e);
      } else if (!hit) {
        next.push(e);
      } else {
        carKills++; sfxBoop();
      }
    }
    survivingEnemies = next;
  }
  enemies = survivingEnemies;

  // Player-enemy collision (only when not riding)
  if (!boardedVehicle) {
    const { x: px, y: py, w: pw, h: ph } = player;
    for (const e of enemies) {
      if (gameOver) break;
      const pad = ENEMY_TYPES[e.type].hitboxPad;
      if (px + pw > e.x + pad && px < e.x + e.w - pad &&
          py + ph > e.y + pad && py < e.y + e.h) {
        deathCause = e.type;
        gameOver   = true;
        sfxDeath();
      }
    }
  }

  // Airtime — accumulate same pixel-unit as distance so scoring is comparable
  const airborne = boardedVehicle ? !boardedVehicle.onGround : !player.onGround;
  if (airborne) { airtimePixels += speed; airtimeFrames++; }

  // Score & progressive difficulty
  score++;
  baseSpeed = 3 + Math.min(3, score / 5000);
  speed = Math.max(1, baseSpeed + settingsSpeedOffset + boardingBoost);

  // Save score exactly once when the game ends
  if (gameOver && !scoreSaved && currentUser) {
    scoreSaved = true;
    lastSavedEntry = UserDB.addScore({
      name:     currentUser,
      score:    Math.floor(terrainOffset / 1000) + Math.floor(airtimePixels / 1000) + carKills,
      distance: terrainOffset,
      airtime:  airtimeFrames,
      boops:    carKills,
    });
    sbPostScore(lastSavedEntry);
  }
}
