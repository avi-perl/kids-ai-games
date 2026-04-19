let gameOver      = false;
let restartBtn    = null;
let showWelcome   = true;
let score         = 0;
let baseSpeed     = 3;
let speed         = 3;
let designMode  = false;
let designFrame = 0;

let jumpPressed = false;
let jumpBuffer  = 0;   // frames remaining to honour a recent jump press
let coyoteTimer = 0;   // frames remaining where ground-jump is still allowed after leaving ground
let deathCause  = '';

let scoreSaved      = false;  // guard: save score exactly once per game
let lastSavedEntry  = null;   // the entry returned by UserDB.addScore

// Canvas hit-areas for non-restartBtn interactive regions
let welcomeSwitchBtn  = null;
let welcomeLeaderBtn  = null;
let gameoverLeaderBtn = null;

// ── Stats tracking ────────────────────────────────────────────
let airtimePixels = 0;   // px scrolled while player is airborne (same unit as distance)
let airtimeFrames = 0;   // raw frames airborne (used for display in seconds)
let carKills      = 0;   // enemies destroyed by car

const JUMP_BUFFER_FRAMES = 10;
const COYOTE_FRAMES      = 6;

// Settings: speed offset set by slider (0 = normal, higher = faster)
let settingsSpeedOffset = 0;

const player = {
  x: 120, y: 0, vy: 0,
  w: 36,  h: 48,
  onGround: false,
  canDoubleJump: true,
  jumped: false,        // true after first jump fires, prevents coyote being used twice
};

// All active enemies live in one flat array
let enemies  = [];
// One spawner object per enemy type, tracking its countdown
let spawners = [];

// ── Vehicles (separate from enemies — player can ride them) ───
let vehicles      = [];
let vehicleTimer  = 600;
// The vehicle the player is currently riding (null if on foot)
let boardedVehicle = null;
let boardingBoost  = 0;   // extra speed while riding

function initSpawners() {
  spawners = Object.entries(ENEMY_TYPES).map(([type, def]) => ({
    type,
    timer: (def.minDist + Math.random() * (def.maxDist - def.minDist)) * 4,
  }));
}

function reset() {
  stopCarRumble();
  gameOver      = false;
  score         = 0;
  baseSpeed     = 3;
  speed         = 3;
  terrainOffset = 0;
  deathCause    = '';
  airtimePixels = 0;
  airtimeFrames = 0;
  carKills      = 0;
  enemies       = [];
  firePools     = [];
  flatZones     = [];
  firePoolTimer = 4000 + Math.random() * 2000;
  vehicles      = [];
  boardedVehicle = null;
  boardingBoost  = 0;
  vehicleTimer  = 1200 + Math.random() * 800;
  jumpPressed    = false;
  jumpBuffer     = 0;
  coyoteTimer    = 0;
  scoreSaved     = false;
  lastSavedEntry = null;
  player.vy            = 0;
  player.onGround      = false;
  player.canDoubleJump = true;
  player.jumped        = false;
  initSpawners();
  player.y = getGroundAt(player.x + player.w / 2) - player.h;
}
