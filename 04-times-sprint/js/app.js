// App — state and helpers shared by the menus (screens.js) and the sprint (game.js).
const App = {
  profile: null,   // the active profile from Store
  model: null,     // its Brain model
  screen: '',
};

const $ = id => document.getElementById(id);

function showScreen(id) {
  App.screen = id;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

function useProfile(p) {
  App.profile = p;
  App.model = Store.loadModel(p.id);
  Store.select(p.id);
  Sound.muted = !p.settings.sound;
}

const fmtSec = ms => (ms / 1000).toFixed(1) + 's';
const fmtLength = secs => (secs < 60 ? `${secs}s` : `${secs / 60} min`);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

let toastTimer = null;
function toast(msg, ms = 1100) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

const LEVEL_NAMES = ['Not yet', 'Tricky', 'Learning', 'Good', 'Fast & sure'];

// The 9×9 "how well do I know it" map. Questions switched off for this player are faded.
function renderMasteryGrid(gridEl, legendEl, highlight = new Set()) {
  const lv = Brain.levels(App.model);
  const off = new Set(App.profile.settings.disabled);
  let html = '<div class="hdr">×</div>';
  for (let b = 1; b <= 9; b++) html += `<div class="hdr">${b}</div>`;
  for (let a = 1; a <= 9; a++) {
    html += `<div class="hdr">${a}</div>`;
    for (let b = 1; b <= 9; b++) {
      const key = `${a}x${b}`;
      const cls = `m${lv[(a - 1) * 9 + (b - 1)]}${off.has(key) ? ' off' : ''}${highlight.has(key) ? ' ring' : ''}`;
      html += `<div class="${cls}" title="${a} × ${b}">${a * b}</div>`;
    }
  }
  gridEl.innerHTML = html;
  if (legendEl) {
    legendEl.innerHTML = [1, 2, 3, 4, 0].map(l => `<span><i class="m${l}"></i>${LEVEL_NAMES[l]}</span>`).join('') +
      (off.size ? '<span><i class="m0 off"></i>Turned off</span>' : '');
  }
}

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
