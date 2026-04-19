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
let isRotated   = false;

function resizeCanvas() {
  DPR = window.devicePixelRatio || 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  isRotated = vh > vw && vw < 600;
  document.body.classList.toggle('portrait-mode', isRotated);

  if (isRotated) {
    W = vh;
    H = vw;
    canvas.style.position      = 'fixed';
    canvas.style.top           = '0';
    canvas.style.left          = '0';
    canvas.style.width         = vh + 'px';
    canvas.style.height        = vw + 'px';
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform     = `translateX(${vw}px) rotate(90deg)`;
  } else {
    W = vw;
    H = vh;
    canvas.style.position      = '';
    canvas.style.top           = '';
    canvas.style.left          = '';
    canvas.style.width         = vw + 'px';
    canvas.style.height        = vh + 'px';
    canvas.style.transformOrigin = '';
    canvas.style.transform     = '';
  }

  canvas.width  = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  skyCache    = null;
  terrainGrad = null;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
