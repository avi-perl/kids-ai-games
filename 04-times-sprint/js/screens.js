// Screens — home menu, player picker and player editor. Also boots the app.
// (The history screens live in history.js.)
const Screens = (() => {
  const initial = name => [...name.trim()][0]?.toUpperCase() || '?';

  // ── Home ─────────────────────────────────────────────
  function menu() {
    const p = App.profile;
    const s = p.settings;
    const st = Brain.stats(App.model, s.sprintSecs);
    const on = Store.enabledKeys(s).length;
    $('whoName').textContent = p.name;
    $('whoAvatar').textContent = initial(p.name);
    $('menuSub').textContent =
      `${fmtLength(s.sprintSecs)} sprint · ${s.maxTries} ${s.maxTries === 1 ? 'try' : 'tries'} per question` +
      (on < 81 ? ` · ${on} of 81 questions` : '');
    $('menuStats').innerHTML = st.sprints
      ? `<div><b>${st.best}</b><small>Best ⭐</small></div>
         <div><b>${st.fluent}/81</b><small>Fast &amp; sure</small></div>
         <div><b>${st.sprints}</b><small>Sprints</small></div>`
      : '';
    renderMasteryGrid($('menuGrid'), $('menuLegend'));
    $('muteBtn').textContent = s.sound ? '🔊' : '🔇';
    showScreen('menu');
  }

  function toggleSound() {
    const p = App.profile;
    Store.update(p.id, p.name, { sound: !p.settings.sound });
    Sound.muted = !p.settings.sound;
    $('muteBtn').textContent = p.settings.sound ? '🔊' : '🔇';
  }

  // ── Player picker ────────────────────────────────────
  function players() {
    $('playerList').innerHTML = Store.list().map(p => {
      const st = Brain.stats(Store.loadModel(p.id), p.settings.sprintSecs);
      const sub = st.sprints ? `${st.sprints} sprint${st.sprints === 1 ? '' : 's'} · best ⭐ ${st.best}` : 'No sprints yet';
      const cur = App.profile && p.id === App.profile.id;
      return `<button class="player${cur ? ' current' : ''}" data-id="${p.id}">
        <span class="avatar">${esc(initial(p.name))}</span>
        <span class="pname">${esc(p.name)}<small>${sub}</small></span>
        ${cur ? '<span class="tick">✓</span>' : ''}
      </button>`;
    }).join('');
    $('playersBack').style.visibility = App.profile ? '' : 'hidden';
    showScreen('players');
  }

  // ── Player editor ────────────────────────────────────
  let draft = null;        // { id (null = new), name, settings }
  let editorReturn = 'menu';

  function editor(profile, returnTo = 'menu') {
    editorReturn = returnTo;
    const base = profile ? profile.settings : Store.DEFAULT_SETTINGS;
    draft = {
      id: profile ? profile.id : null,
      name: profile ? profile.name : '',
      settings: { ...base, disabled: [...base.disabled] },
    };
    const first = !Store.list().length;
    $('edTitle').textContent = profile ? `Edit ${profile.name}` : first ? 'Who’s playing?' : 'New player';
    $('edCancel').style.visibility = first ? 'hidden' : '';
    $('edDanger').style.display = profile ? '' : 'none';
    $('edName').value = draft.name;
    renderSeg('edLen', Store.SPRINT_CHOICES, draft.settings.sprintSecs, fmtLength);
    renderSeg('edTries', Store.TRIES_CHOICES, draft.settings.maxTries, String);
    renderSwitch('edSound', draft.settings.sound);
    renderSwitch('edHints', draft.settings.hints);
    renderToggleGrid();
    showScreen('editor');
    $('editor').scrollTop = 0;
    if (!profile) setTimeout(() => $('edName').focus(), 50);
  }

  function renderSeg(id, choices, value, label) {
    $(id).innerHTML = choices
      .map(v => `<button data-v="${v}" class="${v === value ? 'on' : ''}">${label(v)}</button>`).join('');
  }

  function renderSwitch(id, on) {
    const el = $(id);
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on);
  }

  function renderToggleGrid() {
    const off = new Set(draft.settings.disabled);
    let html = '<button class="hdr all" data-all="1" aria-label="All on or off">×</button>';
    for (let b = 1; b <= 9; b++) html += `<button class="hdr" data-col="${b}">${b}</button>`;
    for (let a = 1; a <= 9; a++) {
      html += `<button class="hdr" data-row="${a}">${a}</button>`;
      for (let b = 1; b <= 9; b++) {
        const k = `${a}x${b}`;
        html += `<button class="cell${off.has(k) ? '' : ' on'}" data-k="${k}" aria-label="${a} times ${b}">${a * b}</button>`;
      }
    }
    $('edGrid').innerHTML = html;
    const n = 81 - off.size;
    $('edCount').textContent = `${n} of 81 questions on`;
    $('edCount').classList.toggle('warn', n === 0);
  }

  // Switch a group of facts off if most of it is on, otherwise switch it all on.
  function toggleGroup(keys) {
    const off = new Set(draft.settings.disabled);
    const turnOff = keys.filter(k => !off.has(k)).length * 2 >= keys.length;
    keys.forEach(k => (turnOff ? off.add(k) : off.delete(k)));
    draft.settings.disabled = Store.ALL_KEYS.filter(k => off.has(k));
    renderToggleGrid();
  }

  function onGridTap(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const d = btn.dataset;
    if (d.k) toggleGroup([d.k]);
    else if (d.row) toggleGroup(Store.ALL_KEYS.filter(k => k.startsWith(`${d.row}x`)));
    else if (d.col) toggleGroup(Store.ALL_KEYS.filter(k => k.endsWith(`x${d.col}`)));
    else if (d.all) toggleGroup(Store.ALL_KEYS);
  }

  function saveEditor() {
    const name = $('edName').value.trim();
    if (!name) { toast('Type a name first'); $('edName').focus(); return; }
    if (draft.settings.disabled.length >= 81) { toast('Turn on at least one question'); return; }
    const p = draft.id ? Store.update(draft.id, name, draft.settings) : Store.create(name, draft.settings);
    useProfile(p);
    menu();
  }

  function cancelEditor() {
    if (editorReturn === 'players') players(); else menu();
  }

  function resetProgress() {
    const p = Store.get(draft.id);
    if (!confirm(`Reset ${p.name}’s learning progress? Their sprint history is kept.`)) return;
    Store.resetModel(p.id);
    useProfile(p);
    toast('Progress reset');
  }

  function deletePlayer() {
    const p = Store.get(draft.id);
    if (!confirm(`Delete ${p.name} and all of their history? This can’t be undone.`)) return;
    Store.remove(p.id);
    App.profile = null;
    const next = Store.current();
    if (next) { useProfile(next); players(); } else editor(null);
  }

  // ── Wiring ───────────────────────────────────────────
  $('whoBtn').addEventListener('click', players);
  $('startBtn').addEventListener('click', Game.start);
  $('settingsBtn').addEventListener('click', () => editor(App.profile, 'menu'));
  $('historyBtn').addEventListener('click', () => History.open());
  $('muteBtn').addEventListener('click', toggleSound);

  $('playerList').addEventListener('click', e => {
    const b = e.target.closest('.player');
    if (!b) return;
    useProfile(Store.get(b.dataset.id));
    menu();
  });
  $('addPlayer').addEventListener('click', () => editor(null, 'players'));
  $('playersBack').addEventListener('click', menu);

  $('edLen').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    draft.settings.sprintSecs = Number(b.dataset.v);
    renderSeg('edLen', Store.SPRINT_CHOICES, draft.settings.sprintSecs, fmtLength);
  });
  $('edTries').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    draft.settings.maxTries = Number(b.dataset.v);
    renderSeg('edTries', Store.TRIES_CHOICES, draft.settings.maxTries, String);
  });
  $('edSound').addEventListener('click', () => renderSwitch('edSound', draft.settings.sound = !draft.settings.sound));
  $('edHints').addEventListener('click', () => renderSwitch('edHints', draft.settings.hints = !draft.settings.hints));
  $('edGrid').addEventListener('click', onGridTap);
  $('edAllOn').addEventListener('click', () => { draft.settings.disabled = []; renderToggleGrid(); });
  $('edAllOff').addEventListener('click', () => { draft.settings.disabled = [...Store.ALL_KEYS]; renderToggleGrid(); });
  $('edSave').addEventListener('click', saveEditor);
  $('edCancel').addEventListener('click', cancelEditor);
  $('edName').addEventListener('keydown', e => { if (e.key === 'Enter') $('edName').blur(); });
  $('edReset').addEventListener('click', resetProgress);
  $('edDelete').addEventListener('click', deletePlayer);

  $('againBtn').addEventListener('click', Game.again);
  $('menuLink').addEventListener('click', e => { e.preventDefault(); menu(); });
  $('sumHistory').addEventListener('click', e => { e.preventDefault(); History.open(); });

  addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.repeat) return;
    if (App.screen === 'menu') { e.preventDefault(); Game.start(); }
    else if (App.screen === 'summary') { e.preventDefault(); Game.again(); }
  });

  // ── Boot: straight to the last player, or set one up ─
  Store.init();
  const last = Store.current();
  if (last) { useProfile(last); menu(); } else editor(null);

  return { menu };
})();
