// ─── Input ────────────────────────────────────────────────────
function hitRestartBtn(x, y) {
  return hits(restartBtn, x, y);
}

document.addEventListener('keydown', e => {
  ensureAudio();
  if (showWelcome) { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); showWelcome = false; } return; }
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (gameOver) return;
    if (!jumpPressed) jumpBuffer = JUMP_BUFFER_FRAMES;
    jumpPressed = true;
  }
  if (e.code === 'Enter' && gameOver) { reset(); return; }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') jumpPressed = false;
});
function hits(btn, x, y) {
  return btn && x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
}

function handleCanvasPress(x, y) {
  ensureAudio();
  if (showWelcome) {
    if (hits(welcomeSwitchBtn, x, y))  { showUserModal('switch'); return; }
    if (hits(welcomeLeaderBtn, x, y))  { showScoreboard();        return; }
    if (!currentUser) { showUserModal(); return; }
    showWelcome = false;
    return;
  }
  if (gameOver) {
    if (hits(gameoverLeaderBtn, x, y)) { showScoreboard(); return; }
    if (hitRestartBtn(x, y))           { reset();          return; }
    return;
  }
  jumpBuffer  = JUMP_BUFFER_FRAMES;
  jumpPressed = true;
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  handleCanvasPress(e.touches[0].clientX, e.touches[0].clientY);
});
canvas.addEventListener('touchend',  () => { jumpPressed = false; });
canvas.addEventListener('click', e => { handleCanvasPress(e.clientX, e.clientY); });

// ─── Main loop ────────────────────────────────────────────────
function loop() {
  if (designMode) {
    drawGallery();
  } else {
    update();
    draw();
  }
  requestAnimationFrame(loop);
}

// ─── Gallery button ───────────────────────────────────────────
const designBtn = document.getElementById('design-btn');
const uiEl = document.getElementById('ui');
designBtn.addEventListener('click', e => {
  e.stopPropagation();
  designMode = !designMode;
  designBtn.classList.toggle('active', designMode);
  uiEl.classList.toggle('hidden', designMode);
  settingsPanel.classList.remove('open');
});

// ─── Settings UI ──────────────────────────────────────────────
const settingsBtn    = document.getElementById('settings-btn');
const settingsPanel  = document.getElementById('settings-panel');
const speedSlider    = document.getElementById('speed-slider');
const speedValLabel  = document.getElementById('speed-val');

const SPEED_LABELS = ['Slow', 'Normal', 'Fast', 'Faster', 'Max'];
const SPEED_OFFSETS = [-2, 0, 2, 4, 6]; // added to baseSpeed

function applySpeedSetting(val) {
  settingsSpeedOffset = SPEED_OFFSETS[val - 1];
  speedValLabel.textContent = SPEED_LABELS[val - 1];
}

speedSlider.addEventListener('input', () => applySpeedSetting(Number(speedSlider.value)));

settingsBtn.addEventListener('click', e => {
  e.stopPropagation();
  settingsPanel.classList.toggle('open');
});

// Close panel when clicking outside
document.addEventListener('click', e => {
  if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    settingsPanel.classList.remove('open');
  }
});

// Prevent panel clicks from bubbling to canvas click handler
settingsPanel.addEventListener('click', e => e.stopPropagation());

applySpeedSetting(3); // default: Normal

// SFX toggle
document.getElementById('sfx-toggle').addEventListener('change', function() {
  sfxMuted = !this.checked;
  if (_rumbleGain) _rumbleGain.gain.value = sfxMuted ? 0 : 0.05;
});

// ─── User & Scoreboard modal logic ────────────────────────────

function updateUserBtn() {
  const n = UserDB.current();
  document.getElementById('user-btn-name').textContent = n ? n : '?';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const userModal      = document.getElementById('user-modal');
const userModalTitle = document.getElementById('user-modal-title');
const userListEl     = document.getElementById('user-list');
const newNameInput   = document.getElementById('new-name-input');
const addUserBtn     = document.getElementById('add-user-btn');
const userPlayBtn    = document.getElementById('user-play-btn');
const scoreboardModal = document.getElementById('scoreboard-modal');
const sbContent      = document.getElementById('sb-content');

let userModalForced = false;  // true = must pick/create before dismissing

function renderUserList() {
  const users = UserDB.users();
  const cur   = UserDB.current();
  userListEl.innerHTML = '';
  users.forEach(u => {
    const card = document.createElement('div');
    card.className = 'user-card' + (u.name === cur ? ' active' : '');
    card.innerHTML = `<span class="user-name">${escHtml(u.name)}</span>${u.name === cur ? '<span class="user-check">✓</span>' : ''}`;
    card.addEventListener('click', () => {
      UserDB.setCurrent(u.name);
      currentUser = u.name;
      renderUserList();
      updateUserBtn();
      userPlayBtn.disabled = false;
    });
    userListEl.appendChild(card);
  });
  userPlayBtn.disabled = !cur;
}

function showUserModal(mode) {
  userModalForced = !UserDB.current();
  userModalTitle.textContent = mode === 'switch' ? 'Switch Player' : 'Who\'s Playing?';
  renderUserList();
  newNameInput.value = '';
  userModal.classList.add('open');
  if (UserDB.users().length === 0) setTimeout(() => newNameInput.focus(), 80);
}

function hideUserModal() {
  if (userModalForced && !UserDB.current()) return;
  userModal.classList.remove('open');
  currentUser = UserDB.current();
  updateUserBtn();
}

const newUserError = document.getElementById('new-user-error');

async function addUserFromInput() {
  const name = newNameInput.value.trim();
  if (!name) return;
  if (UserDB.users().some(u => u.name.toLowerCase() === name.toLowerCase())) {
    newUserError.textContent = 'That name is already taken.';
    newNameInput.select();
    return;
  }
  addUserBtn.disabled = true;
  addUserBtn.textContent = '…';
  const taken = await sbNameTaken(name);
  addUserBtn.disabled = false;
  addUserBtn.textContent = 'Add';
  if (taken) {
    newUserError.textContent = 'That name is already taken.';
    newNameInput.select();
    return;
  }
  newUserError.textContent = '';
  UserDB.addUser(name);
  currentUser = name;
  newNameInput.value = '';
  renderUserList();
  updateUserBtn();
  userPlayBtn.disabled = false;
}

addUserBtn.addEventListener('click', addUserFromInput);
newNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addUserFromInput(); }
});
newNameInput.addEventListener('input', () => { newUserError.textContent = ''; });

userPlayBtn.addEventListener('click', () => {
  currentUser = UserDB.current();
  hideUserModal();
});

userModal.addEventListener('click', e => {
  if (e.target === userModal && !userModalForced) hideUserModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (userModal.classList.contains('open') && !userModalForced) hideUserModal();
    if (scoreboardModal.classList.contains('open')) hideScoreboard();
  }
});

function renderScoreboard(scores) {
  scores = scores ?? UserDB.scores(20);
  const fmtDist = d => { const m = Math.round(d / 50); return m >= 1000 ? (m/1000).toFixed(1)+'km' : m+'m'; };
  const fmtAir  = f => (f / 60).toFixed(1) + 's';
  const rankCls = r => r === 1 ? 'sb-gold' : r === 2 ? 'sb-silver' : r === 3 ? 'sb-bronze' : 'sb-rank-num';
  const medal   = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r;

  if (scores.length === 0) {
    sbContent.innerHTML = '<div class="sb-empty">No scores yet!<br>Play a game to get on the board 🎮</div>';
    return;
  }

  let html = `<div class="sb-head">
    <span></span><span>Player</span><span>Score</span>
  </div>`;
  scores.forEach((s, i) => {
    const rank = i + 1;
    const hi   = lastSavedEntry &&
                 s.name === lastSavedEntry.name &&
                 s.score === lastSavedEntry.score &&
                 s.playedAt === lastSavedEntry.playedAt;
    const extra = rank <= 3 ? ' sb-top3' : '';
    const boop  = s.boops === 1 ? '1 boop' : `${s.boops} boops`;
    html += `<div class="sb-row${extra}${hi ? ' sb-hi' : ''}">
      <span class="sb-rank ${rankCls(rank)}">${medal(rank)}</span>
      <span class="sb-name">${escHtml(s.name)}</span>
      <span class="sb-score">${s.score} pts</span>
      <span class="sb-stats">${fmtDist(s.distance)} &nbsp;·&nbsp; ${fmtAir(s.airtime)} air &nbsp;·&nbsp; ${boop}</span>
    </div>`;
  });
  sbContent.innerHTML = html;
}

async function showScoreboard() {
  renderScoreboard();
  scoreboardModal.classList.add('open');
  const remote = await sbFetchScores();
  if (remote) renderScoreboard(remote);
}
function hideScoreboard() {
  scoreboardModal.classList.remove('open');
}

document.getElementById('close-sb-btn').addEventListener('click', hideScoreboard);
scoreboardModal.addEventListener('click', e => {
  if (e.target === scoreboardModal) hideScoreboard();
});

const userToolbarBtn = document.getElementById('user-btn');
userToolbarBtn.addEventListener('click', e => {
  e.stopPropagation();
  settingsPanel.classList.remove('open');
  showUserModal('switch');
});

// ── Init ──────────────────────────────────────────────────────
reset();
updateUserBtn();
if (!currentUser) showUserModal();
loop();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../sw.js', { scope: '../' });
}
