// History — a player's numbers: Progress (over time), Questions (per question), Sprints (every
// sprint in full), plus CSV/JSON export. All numbers come from report.js.
const History = (() => {
  let logs = [];           // this player's sprints, oldest first
  let tab = 'progress';
  let range = 'all';       // '7' | '30' | 'all' (days)
  let selected = null;     // question open in the Questions tab
  let sort = { key: 'need', dir: 1 };

  const TABS = [['progress', 'Progress'], ['questions', 'Questions'], ['sprints', 'Sprints']];
  const RANGES = [['7', '7 days'], ['30', '30 days'], ['all', 'All']];
  const RESULT = {
    'first-try': '1st try', 'try-2': '2nd try', 'try-3': '3rd try', 'try-4': '4th try', 'try-5': '5th try',
    'shown-answer': 'shown', 'time-up': 'time up', unanswered: 'time up',
  };

  const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
  const secs = ms => (ms == null ? '–' : `${(ms / 1000).toFixed(1)}s`);
  const when = t => `${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ` +
    new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
  const levelAt = (lv, f) => lv[(f.a - 1) * 9 + (f.b - 1)];

  function seg(items, value, group) {
    return `<div class="seg small" data-group="${group}">` +
      items.map(([v, l]) => `<button data-v="${v}" class="${v === value ? 'on' : ''}">${l}</button>`).join('') + '</div>';
  }

  // Sprint numbers always count from the player's first sprint, whatever the range.
  function inRange() {
    const since = range === 'all' ? -Infinity : Date.now() - Number(range) * 864e5;
    return logs.map((l, i) => ({ l, no: i + 1 })).filter(x => x.l.startedAt >= since);
  }

  async function open() {
    logs = await Store.loadHistory(App.profile.id);
    selected = null;
    $('histTitle').textContent = App.profile.name;
    $('exportMenu').hidden = true;
    showScreen('history');
    render();
  }

  function render() {
    $('histTabs').innerHTML = seg(TABS, tab, 'tab');
    $('histFilters').innerHTML = logs.length ? seg(RANGES, range, 'range') : '';
    const body = $('histBody');
    body.innerHTML = '';
    const rows = inRange();
    if (!rows.length) {
      body.innerHTML = `<div class="empty-note center">${logs.length ? 'No sprints in this range.' : 'No sprints yet.'}</div>`;
      return;
    }
    ({ progress, questions, sprints })[tab](body, rows);
  }

  // ── Progress ─────────────────────────────────────────
  function progress(body, rows) {
    const st = rows.map(r => Report.sprintStats(r.l, r.no));
    const answered = sum(st, s => s.answered);
    body.insertAdjacentHTML('beforeend', `
      <div class="tiles">
        <div><b>${st.length}</b><small>Sprints</small></div>
        <div><b>${Math.round(sum(st, s => s.secs) / 60)} min</b><small>Playing</small></div>
        <div><b>${answered}</b><small>Answered</small></div>
        <div><b>${pct(answered ? sum(st, s => s.firstTry) / answered : null)}</b><small>First try</small></div>
      </div>`);

    const xTicks = (a, b) => [...new Set([a, Math.round((a + b) / 2), b])].map(v => ({ x: v, text: `#${v}` }));
    const series = (title, y, o) => chartCard(body, {
      title, xTicks, ...o,
      pts: st.map(s => ({ x: s.no, y: y(s), label: `#${s.no} · ${when(s.start)}` })),
    });
    series('Correct per minute', s => s.cpm, { fmt: (v, tick) => (tick ? `${v}` : v.toFixed(1)), betterUp: true });
    series('First try', s => (s.accuracy == null ? null : s.accuracy * 100), {
      fmt: (v, tick) => `${Math.round(v)}${tick ? '' : '%'}`, ticks: [0, 50, 100], betterUp: true,
    });
    series('Answer time', s => (s.rtMedian == null ? null : s.rtMedian / 1000), {
      fmt: (v, tick) => (tick ? `${v}` : `${v.toFixed(1)}s`), betterUp: false,
    });
  }

  function chartCard(body, o) {
    const card = document.createElement('div');
    card.className = 'panel';
    const valid = o.pts.filter(p => p.y != null);
    const last = valid[valid.length - 1];
    let delta = '';
    if (valid.length >= 2) {
      const ch = last.y - valid[0].y;
      if (Math.abs(ch) >= 0.05) {
        const good = (ch > 0) === o.betterUp;
        delta = `<span class="delta ${good ? 'good' : 'bad'}">${ch > 0 ? '▲' : '▼'} ${o.fmt(Math.abs(ch))}</span>`;
      }
    }
    card.innerHTML = `
      <div class="chead"><h3>${o.title}</h3><div class="cstat"><b>${last ? o.fmt(last.y) : '–'}</b>${delta}</div></div>
      <div class="chost"></div>`;
    body.appendChild(card);
    Charts.line(card.querySelector('.chost'), o.pts, { yFmt: o.fmt, xTicks: o.xTicks, ticks: o.ticks, label: o.title });
  }

  // ── Questions ────────────────────────────────────────
  function questions(body, rows) {
    const facts = Report.factStats(rows.map(r => r.l));
    const lv = Brain.levels(App.model);
    const asked = Object.values(facts).filter(f => f.asked);
    if (!selected || !facts[selected].asked) selected = needsWork(asked, lv)[0]?.key || null;

    body.insertAdjacentHTML('beforeend', `
      <div class="panel"><div class="chost" id="qHeat"></div></div>
      ${selected ? '<div class="panel" id="qDetail"></div>' : ''}
      <div class="panel"><div class="qtable-wrap" id="qTable"></div></div>`);

    // Misses per question; scaled to the highest so differences show.
    const misses = Object.values(facts).map(f => f.missRate).filter(v => v != null);
    const cells = {};
    for (const f of Object.values(facts)) {
      cells[f.key] = { value: f.missRate, tip: f.missRate == null ? '–' : `${pct(f.missRate)} missed · asked ${f.asked}` };
    }
    Charts.heat($('qHeat'), cells, {
      min: 0, max: Math.max(0.1, Math.ceil(Math.max(0, ...misses) * 10) / 10),
      fmt: v => `${pct(v)} missed`, selected, label: 'Misses',
      onSelect: key => { selected = key; render(); setTimeout(() => $('qDetail').scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); },
    });
    if (selected) factDetail($('qDetail'), facts[selected], lv);
    questionTable($('qTable'), asked, lv);
  }

  // Tricky first, then most missed, then slowest.
  function needsWork(facts, lv) {
    return [...facts].sort((x, y) =>
      (levelAt(lv, x) || 9) - (levelAt(lv, y) || 9) || (y.missRate ?? -1) - (x.missRate ?? -1) || (y.rtMedian ?? 0) - (x.rtMedian ?? 0));
  }

  function factDetail(host, f, lv) {
    const level = levelAt(lv, f);
    const label = k => (Report.MISTAKES.find(t => t[0] === k) || [k, k])[1];
    host.innerHTML = `
      <div class="fhead">
        <span class="fq">${f.a} × ${f.b} = ${f.product}</span>
        <span class="lvl m${level}">${LEVEL_NAMES[level]}</span>
      </div>
      <div class="ftiles">
        <div><b>${f.asked}</b><small>Asked</small></div>
        <div><b>${pct(f.accuracy)}</b><small>First try</small></div>
        <div><b>${secs(f.rtMedian)}</b><small>Time</small></div>
        <div><b>${f.revealed}</b><small>Shown</small></div>
      </div>
      ${f.topWrong.length ? `<div class="chips">${f.topWrong.map(w =>
        `<div class="chip bad">${w.v}${w.n > 1 ? ` ×${w.n}` : ''}<small>${label(w.type)}</small></div>`).join('')}</div>` : ''}`;
  }

  // [key, header, value, first-click direction]. Missing values sort last.
  const COLS = [
    ['q', '×', f => f.a * 10 + f.b, 1],
    ['asked', 'Asked', f => f.asked, -1],
    ['acc', '1st try', f => f.accuracy, 1],
    ['rt', 'Time', f => f.rtMedian, -1],
    ['need', 'Status', null, 1],
  ];

  function questionTable(host, asked, lv) {
    let rows;
    if (sort.key === 'need') {
      rows = needsWork(asked, lv);
      if (sort.dir < 0) rows.reverse();
    } else {
      const get = COLS.find(c => c[0] === sort.key)[2];
      rows = [...asked].sort((x, y) => {
        const vx = get(x);
        const vy = get(y);
        if (vx == null || vy == null) return (vx == null) - (vy == null);
        return (vx - vy) * sort.dir;
      });
    }
    const arrow = k => (sort.key !== k ? '' : sort.dir > 0 ? ' ↑' : ' ↓');
    host.innerHTML = `<table class="qtable"><thead><tr>${COLS.map(([k, l]) =>
      `<th><button data-sort="${k}" class="${sort.key === k ? 'on' : ''}">${l}${arrow(k)}</button></th>`).join('')}</tr></thead><tbody>${rows.map(f => {
      const l = levelAt(lv, f);
      return `<tr data-k="${f.key}" class="${f.key === selected ? 'sel' : ''}">
        <td><b>${f.a} × ${f.b}</b></td><td>${f.asked}</td><td>${pct(f.accuracy)}</td><td>${secs(f.rtMedian)}</td>
        <td><span class="lvl m${l}">${LEVEL_NAMES[l]}</span></td></tr>`;
    }).join('')}</tbody></table>`;
  }

  // ── Sprints ──────────────────────────────────────────
  function sprints(body, rows) {
    body.innerHTML = [...rows].reverse().map(({ l, no }) => {
      const s = Report.sprintStats(l, no);
      return `<details class="sprint" data-i="${no - 1}">
        <summary>
          <span class="sdate">#${no}<small>${when(s.start)}</small></span>
          <span class="sscore">⭐ ${s.score}</span>
          <span class="sline">${fmtLength(s.secs)} · ${s.answered} answered · ${pct(s.accuracy)} · ${s.cpm.toFixed(1)}/min · ${secs(s.rtMedian)}</span>
        </summary>
        <div class="sbody"></div>
      </details>`;
    }).join('');
  }

  const clock = ms => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function sprintDetail(l) {
    return l.cards.map(c => {
      const answers = c.attempts.length
        ? c.attempts.map(a => `<span class="${a.ok ? 'ok' : 'no'}">${a.v}</span><small>${fmtSec(a.ms)}</small>`).join(' ')
        : '<small>–</small>';
      return `<div class="hrow ${c.result}">
        <span class="ht">${clock(c.clock != null ? c.clock : c.shownAt - l.startedAt)}</span>
        <span class="hq">${c.a} × ${c.b}</span>
        <span class="ha">${answers}</span>
        <span class="hr">${RESULT[c.result] || c.result}${c.fast ? ' ⚡' : ''}</span>
      </div>`;
    }).join('');
  }

  // ── Export ───────────────────────────────────────────
  function exportFile(kind) {
    const p = App.profile;
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
    const name = `times-sprint_${slug}_${kind}_${Report.stamp(Date.now()).slice(0, 10)}`;
    if (kind === 'answers') downloadFile(`${name}.csv`, Report.answersCSV(p, logs), 'text/csv');
    if (kind === 'sprints') downloadFile(`${name}.csv`, Report.sprintsCSV(p, logs), 'text/csv');
    if (kind === 'questions') downloadFile(`${name}.csv`, Report.questionsCSV(p, logs, App.model), 'text/csv');
    if (kind === 'all') downloadFile(`${name}.json`, Report.json(p, logs), 'application/json');
  }

  async function clearHistory() {
    if (!confirm(`Delete all of ${App.profile.name}’s history?`)) return;
    await Store.clearHistory(App.profile.id);
    logs = [];
    $('exportMenu').hidden = true;
    render();
  }

  // ── Wiring ───────────────────────────────────────────
  $('histBack').addEventListener('click', () => Screens.menu());
  $('exportBtn').addEventListener('click', e => { e.stopPropagation(); $('exportMenu').hidden = !$('exportMenu').hidden; });
  $('exportMenu').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.export) exportFile(b.dataset.export);
    if (b.id === 'histClear') { clearHistory(); return; }
    $('exportMenu').hidden = true;
  });
  $('history').addEventListener('click', e => {
    if (!$('exportMenu').hidden && !e.target.closest('#exportMenu, #exportBtn')) $('exportMenu').hidden = true;
  });
  $('histTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    tab = b.dataset.v;
    render();
    $('history').scrollTop = 0;
  });
  $('histFilters').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    range = b.dataset.v;
    render();
  });
  $('histBody').addEventListener('click', e => {
    const th = e.target.closest('[data-sort]');
    if (th) {
      const k = th.dataset.sort;
      sort = sort.key === k ? { key: k, dir: -sort.dir } : { key: k, dir: COLS.find(c => c[0] === k)[3] };
      render();
      return;
    }
    const tr = e.target.closest('tr[data-k]');
    if (tr) {
      selected = tr.dataset.k;
      render();
      setTimeout(() => $('qDetail').scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
    }
  });
  // Sprint details are built the first time they're opened.
  $('histBody').addEventListener('toggle', e => {
    const d = e.target;
    if (!d.matches || !d.matches('details.sprint') || !d.open || d.dataset.built) return;
    d.querySelector('.sbody').innerHTML = sprintDetail(logs[Number(d.dataset.i)]);
    d.dataset.built = '1';
  }, true);
  // Charts are drawn to the screen's width, so redraw on rotate / resize.
  let resizeTimer = null;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (App.screen === 'history' && tab !== 'sprints') render(); }, 150);
  });

  return { open };
})();
