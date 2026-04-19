const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const scoreEl    = document.getElementById('score');
const subStatsEl = document.getElementById('substats');
let   lastSubStats = '';

let W = window.innerWidth;
let H = window.innerHeight;
let DPR = window.devicePixelRatio || 1;

// Cached render objects — invalidated on resize
let skyCache    = null;
let terrainGrad = null;
let lastScore   = -1;

function resizeCanvas() {
  DPR = window.devicePixelRatio || 1;
  W   = window.innerWidth;
  H   = window.innerHeight;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  skyCache    = null;
  terrainGrad = null;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
