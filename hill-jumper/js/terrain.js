const GRAVITY    = 0.44;
const JUMP_FORCE = -11;

// terrainOffset tracks total world distance scrolled.
// terrainY(worldX) returns ground Y for any world position.
// getGroundAt(screenX) converts screen → world and evaluates.
let terrainOffset = 0;

let firePools    = [];
let firePoolTimer = 0;
const POOL_SLOPE  = 32;   // px of smooth slope on each side of the lava pit

let flatZones = [];        // flat pedestals under rocks: { worldX, flatY, hw, slope }

function terrainY(worldX) {
  return H * 0.75
    - Math.sin(worldX * 0.008)  * 40
    - Math.sin(worldX * 0.020)  * 20
    - Math.sin(worldX * 0.055)  * 10
    - Math.cos(worldX * 0.013)  * 15;
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

function getGroundAt(screenX) {
  let y = terrainY(screenX + terrainOffset);

  // Blend terrain flat under each rock pedestal
  for (const zone of flatZones) {
    const cx   = zone.worldX - terrainOffset;
    const left = cx - zone.hw - zone.slope;
    const rght = cx + zone.hw + zone.slope;
    if (screenX <= left || screenX >= rght) continue;
    let t = screenX < cx - zone.hw ? (screenX - left) / zone.slope
          : screenX > cx + zone.hw ? (rght - screenX) / zone.slope
          : 1;
    y = y + (zone.flatY - y) * smoothstep(t);
  }

  // Vertical drop into each lava pool pit — walls are perfectly vertical
  for (const pool of firePools) {
    const s = pool.worldStart - terrainOffset;
    const e = pool.worldEnd   - terrainOffset;
    if (screenX < s || screenX > e) continue;
    y = H + 80;
  }

  return y;
}
