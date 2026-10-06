// Report — numbers from the sprint logs, for the History screen and the CSV/JSON exports.
// Pure functions: no DOM, no storage.
const Report = (() => {
  const KEYS = [];
  const TABLE_PRODUCTS = new Set();
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) { KEYS.push(`${a}x${b}`); TABLE_PRODUCTS.add(a * b); }
  }
  const LEVELS = ['not seen', 'tricky', 'learning', 'good', 'fast & sure'];

  function quantile(arr, q) {
    if (!arr.length) return null;
    const s = [...arr].sort((x, y) => x - y);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
  }

  const isAnswered = c => c.result !== 'unanswered' && c.result !== 'time-up';
  const isFirstTry = c => c.result === 'first-try';
  // Time to the first answer; skipped if the app was in the background.
  const firstRt = c => (c.attempts.length && c.timingOk !== false ? c.attempts[0].ms : null);

  // Kinds of wrong answer (after Campbell & Graham, 1985).
  // neighbour = answer to a question sharing a number (49 or 48 for 7×8); added = 15 for 7×8.
  const MISTAKES = [
    ['neighbour', 'Neighbour'],
    ['added', 'Added'],
    ['swapped', 'Swapped digits'],
    ['close', 'Close'],
    ['table', 'Other table'],
    ['other', 'Other'],
  ];

  function mistakeType(a, b, v) {
    const p = a * b;
    if (v === p) return null;
    if (v === a + b) return 'added';
    for (let k = 1; k <= 9; k++) {
      if ((k !== b && a * k === v) || (k !== a && k * b === v)) return 'neighbour';
    }
    if (p >= 10 && String(v) === String(p).split('').reverse().join('')) return 'swapped';
    if (Math.abs(v - p) <= Math.max(2, Math.round(p * 0.1))) return 'close';
    if (TABLE_PRODUCTS.has(v)) return 'table';
    return 'other';
  }

  function sprintStats(l, no) {
    const secs = l.settings.sprintSecs;
    const answered = l.cards.filter(isAnswered);
    const first = answered.filter(isFirstTry);
    const rts = first.map(firstRt).filter(v => v != null);
    return {
      no, id: l.id, start: l.startedAt, secs,
      maxTries: l.settings.maxTries, hints: l.settings.hints,
      answered: answered.length,
      firstTry: first.length,
      revealed: answered.filter(c => c.result === 'shown-answer').length,
      accuracy: answered.length ? first.length / answered.length : null,
      cpm: first.length / (secs / 60),
      rtMedian: quantile(rts, 0.5),
      bestStreak: l.bestStreak,
      score: l.score,
      fluent: l.mastery ? l.mastery.counts[4] : null,
    };
  }

  function factStats(logs) {
    const f = {};
    for (const k of KEYS) {
      const [a, b] = k.split('x').map(Number);
      f[k] = { key: k, a, b, product: a * b, asked: 0, answered: 0, firstTry: 0, revealed: 0, rts: [], wrong: {} };
    }
    logs.forEach(l => l.cards.forEach(c => {
      const s = f[`${c.a}x${c.b}`];
      s.asked++;
      if (isAnswered(c)) s.answered++;
      if (isFirstTry(c)) { s.firstTry++; const rt = firstRt(c); if (rt != null) s.rts.push(rt); }
      if (c.result === 'shown-answer') s.revealed++;
      for (const at of c.attempts) if (!at.ok) s.wrong[at.v] = (s.wrong[at.v] || 0) + 1;
    }));
    for (const s of Object.values(f)) {
      s.accuracy = s.answered ? s.firstTry / s.answered : null;
      s.missRate = s.accuracy == null ? null : 1 - s.accuracy;
      s.rtMedian = quantile(s.rts, 0.5);
      s.topWrong = Object.entries(s.wrong).sort((x, y) => y[1] - x[1])
        .map(([v, n]) => ({ v: Number(v), n, type: mistakeType(s.a, s.b, Number(v)) }));
    }
    return f;
  }

  // ── Export ───────────────────────────────────────────
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  // Local time to the millisecond: 2026-10-05 16:12:09.482
  function stamp(ms) {
    if (ms == null) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }
  const sec = ms => (ms == null ? '' : (ms / 1000).toFixed(2));
  const pctNum = v => (v == null ? '' : Math.round(v * 100));

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  // cols: [[header, row => value], …]
  const toCSV = (cols, rows) =>
    [cols.map(c => c[0]), ...rows.map(r => cols.map(c => c[1](r)))].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

  // One row per answer typed (a question with no answer before time ran out still gets a row).
  function answersCSV(p, logs) {
    const rows = [];
    logs.forEach((l, i) => l.cards.forEach(c => {
      if (!c.attempts.length) rows.push({ no: i + 1, c, at: null, k: 0 });
      c.attempts.forEach((at, k) => rows.push({ no: i + 1, c, at, k }));
    }));
    return toCSV([
      ['player', () => p.name],
      ['sprint', r => r.no],
      ['question', r => `${r.c.a}x${r.c.b}`],
      ['correct_answer', r => r.c.answer],
      ['shown_at', r => stamp(r.c.shownAt)],
      ['try', r => (r.at ? r.k + 1 : '')],
      ['answer', r => (r.at ? r.at.v : '')],
      ['answered_at', r => (r.at ? stamp(r.at.at) : '')],
      ['seconds', r => (r.at ? sec(r.at.ms) : '')],
      ['correct', r => (r.at ? (r.at.ok ? 1 : 0) : '')],
      ['mistake', r => (r.at && !r.at.ok ? mistakeType(r.c.a, r.c.b, r.at.v) : '')],
      ['result', r => r.c.result],
    ], rows);
  }

  const sprintsCSV = (p, logs) => toCSV([
    ['player', () => p.name],
    ['sprint', s => s.no],
    ['started', s => stamp(s.start)],
    ['length_s', s => s.secs],
    ['tries_allowed', s => s.maxTries],
    ['hints', s => (s.hints ? 1 : 0)],
    ['answered', s => s.answered],
    ['first_try', s => s.firstTry],
    ['first_try_pct', s => pctNum(s.accuracy)],
    ['correct_per_min', s => s.cpm.toFixed(1)],
    ['median_s', s => sec(s.rtMedian)],
    ['answers_shown', s => s.revealed],
    ['best_streak', s => s.bestStreak],
    ['stars', s => s.score],
    ['fast_and_sure', s => s.fluent ?? ''],
  ], logs.map((l, i) => sprintStats(l, i + 1)));

  function questionsCSV(p, logs, model) {
    const facts = factStats(logs);
    const lv = Brain.levels(model);
    return toCSV([
      ['player', () => p.name],
      ['question', r => r.f.key],
      ['asked', r => r.f.asked],
      ['first_try', r => r.f.firstTry],
      ['first_try_pct', r => pctNum(r.f.accuracy)],
      ['median_s', r => sec(r.f.rtMedian)],
      ['answers_shown', r => r.f.revealed],
      ['wrong_answers', r => r.f.topWrong.map(w => `${w.v}x${w.n}`).join(' ')],
      ['status', r => LEVELS[r.level]],
    ], KEYS.map((k, i) => ({ f: facts[k], level: lv[i] })));
  }

  const json = (p, logs) => JSON.stringify({
    player: p.name,
    settings: p.settings,
    exported: stamp(Date.now()),
    sprints: logs.map(({ profileId, ...l }) => l),
  });

  return { MISTAKES, mistakeType, sprintStats, factStats, stamp, answersCSV, sprintsCSV, questionsCSV, json };
})();

if (typeof module !== 'undefined') module.exports = Report;
