// Brain — the adaptive engine for Times Sprint. No DOM or storage access (store.js persists
// the model per profile), so it also runs in Node.
//
// What the research says, and how it's used here
// ───────────────────────────────────────────────
// • Score each answer by correctness AND speed (Math Garden's "high speed, high stakes" rule,
//   Maris & van der Maas 2012). A fast first-try answer is strong evidence (+1), a slow one
//   less so (down to 0 at the time limit), and misses push strength negative (-0.4 / -0.7 / -1).
//   Wrong answers say much more about future trouble than slow right ones (Pelánek 2018).
// • "Fluent" means right on the first try within ~2–4 s (Burns 2005 incremental rehearsal; MTC
//   uses 6 s for a typed answer). The cutoff is personal: the kid's own read+type time on easy
//   ×1 facts plus 1.5 s, so a slow typist isn't marked weak on everything.
// • Speed is also compared with the kid's OWN typical time (Pelánek 2023): a fact that takes
//   twice their usual time is flagged. Slowness on the card right after a miss is ignored
//   (post-error slowing, Mooij et al. 2022).
// • Mostly known facts, a few hard ones: incremental rehearsal works at 50–90% known
//   (Burns 2004). The known share starts at 80% and drifts 60–90% to keep first-try success
//   around 75–90% (Math Garden: easier settings → more practice, more gains; Jansen et al. 2013).
// • Only ≤3 weak facts are worked on at once, and a new one joins only after the current ones
//   were answered right (incremental rehearsal).
// • A miss comes back 2 cards later, then ~7 cards later, then early next sprint (ARTS, Mettler
//   et al. 2016; expanding spacing, Pyc & Rawson 2009). A fact revealed twice in a sprint is
//   rested until the next one. A miss is always followed by a known fact.
// • 7×8 and 8×7 are separate cards (as in Math Garden and the MTC) but evidence on one nudges
//   the other at half weight, and they're never shown back-to-back.
const Brain = (() => {
  // ── Tunables ─────────────────────────────────────────
  // Speed
  const D_MS = 6000;               // time limit used to grade speed (MTC: 6 s per typed answer)
  const FLUENT_EXTRA_MS = 1500;    // fluent = kid's own read+type time + this
  const FLUENT_MIN_MS = 2000;
  const FLUENT_MAX_MS = 4000;
  const DEFAULT_BASE_MS = 1500;    // read+type time assumed before we've measured it
  const EXTRA_DIGIT_MS = 250;      // allowance for typing a 2-digit answer
  // Strength
  const ALPHAS = [0.5, 0.4, 0.3]; // learning rate for a fact's 1st, 2nd, and later answers
  const MIRROR_SHARE = 0.5;        // 8×7 gets this share of 7×8's update
  const S_SLOW_UNKNOWN = 0.7;      // right first try, but timing can't be trusted
  const S_SECOND = -0.4;
  const S_THIRD = -0.7;
  const S_REVEALED = -1;
  const GOOD_S = 0.4;
  const KNOWN_PRIOR = 0.3;         // an unseen fact with at least this prior counts as known
  // Choosing cards
  const P_KNOWN_START = 0.8;
  const P_KNOWN_MIN = 0.6;
  const P_KNOWN_MAX = 0.9;
  const P_KNOWN_STEP = 0.05;
  const ACC_LOW = 0.75;
  const ACC_HIGH = 0.9;
  const ACC_WINDOW = 10;
  const ADJUST_EVERY = 5;
  const WORKING_MAX = 3;
  const GRADUATE_AFTER = 2;        // first-try rights in one sprint that free a working-set slot
  const EXPLORE_CHANCE = 0.3;      // chance a working-set slot goes to an unseen fact…
  const EXPLORE_CRUISING = 0.75;   // …or this, when recent success is above ACC_HIGH
  const REQUEUE_GAPS = [3, 8];     // a miss returns on the 3rd card after, then the 8th
  const CARRY_MAX = 3;             // misses to revisit early next sprint
  const RETIRE_AFTER_REVEALS = 2;  // rest a fact for the sprint after this many shown answers…
  const RETIRE_AFTER_MISSES = 3;   // …or this many misses, so it never becomes a wall
  const RECENT_PICK = 4;           // no fact family repeats within this many cards…
  const RECENT_REVIEW = 2;         // …except scheduled reviews, which only need 2
  const WARMUP = 3;
  const HISTORY = 5;

  const keyOf = (a, b) => `${a}x${b}`;
  const famOf = (a, b) => (a < b ? `${a}x${b}` : `${b}x${a}`);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Starting strength in [-1, 1]: ×1 easiest, ×2/×5/small squares easy, 6–9 tables hardest
  // (MTC framework; problem-size effect).
  function prior(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo === 1) return 0.6;
    if (lo === 2 || a === 5 || b === 5) return 0.3;
    if (a === b) return hi <= 4 ? 0.3 : 0;
    if (hi <= 4) return 0.1;
    return -0.2;
  }

  // ── Model ────────────────────────────────────────────
  function freshModel() {
    const cards = {};
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        cards[keyOf(a, b)] = { a, b, key: keyOf(a, b), s: prior(a, b), n: 0, hist: [], lastSeen: -1 };
      }
    }
    return {
      v: 3, cards, clock: 0,
      rtSamples: [],      // first-try-right times (ms), all facts
      onesRt: [],         // first-try-right times on ×1 facts = read+type speed
      recentOk: [],       // last ACC_WINDOW first-try results
      pKnown: P_KNOWN_START,
      carry: [],          // keys to revisit early next sprint
      sprints: 0,
      bestBy: {},         // sprint length (secs) -> best score, so 1-min and 5-min don't compete
      history: [],        // { t, secs, score, count, firstTryRate }
    };
  }

  // Bring an older saved model up to date.
  function upgrade(m) {
    if (!m || !m.cards) return freshModel();
    if (m.v === 2) {
      m.bestBy = m.best ? { 120: m.best } : {};
      m.history = (m.history || []).map(h => ({ secs: 120, ...h }));
      delete m.best;
      delete m.muted;
      m.v = 3;
    }
    return m;
  }

  function quantile(arr, q) {
    if (!arr.length) return null;
    const s = [...arr].sort((x, y) => x - y);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
  }
  const median = arr => quantile(arr, 0.5);
  const pushCapped = (arr, v, cap) => { arr.push(v); if (arr.length > cap) arr.shift(); };

  // ── Speed ────────────────────────────────────────────
  function readTypeMs(model) {
    if (model.onesRt.length >= 3) return median(model.onesRt);
    if (model.rtSamples.length >= 8) return quantile(model.rtSamples, 0.2);
    return DEFAULT_BASE_MS;
  }

  function fluentMs(model, answer) {
    const base = clamp(readTypeMs(model) + FLUENT_EXTRA_MS, FLUENT_MIN_MS, FLUENT_MAX_MS);
    return base + (answer >= 10 ? EXTRA_DIGIT_MS : 0);
  }

  // ── Fact status ──────────────────────────────────────
  function struggling(model, c) {
    if (c.n === 0) return false;
    if (c.s < 0) return true;
    const h = c.hist;
    if (h.slice(-5).filter(x => !x.ok).length >= 2) return true;
    if (h.slice(-3).some(x => !x.solved)) return true;
    const times = h.filter(x => x.ok && x.t != null).slice(-3).map(x => x.t);
    const usual = median(model.rtSamples);
    // Twice the kid's usual time, on at least 2 answers (one hesitation isn't a pattern).
    return !!(times.length >= 2 && usual && model.rtSamples.length >= 8 && Math.log2(median(times) / usual) >= 1);
  }

  function fluent(c) {
    const last3 = c.hist.slice(-3);
    return last3.length === 3 && last3.every(x => x.fast) && new Set(last3.map(x => x.sp)).size >= 2;
  }

  // 0 not seen · 1 tricky · 2 learning · 3 good · 4 fast & sure
  function levelOf(model, c) {
    if (c.n === 0) return 0;
    if (struggling(model, c)) return 1;
    if (fluent(c)) return 4;
    return c.s >= GOOD_S ? 3 : 2;
  }

  function isKnown(model, c) {
    return c.n === 0 ? c.s >= KNOWN_PRIOR : levelOf(model, c) >= 3;
  }

  function levels(model) {
    const out = [];
    for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) out.push(levelOf(model, model.cards[keyOf(a, b)]));
    return out;
  }

  // Every fact's level (1×1…9×9) and the count at each level — saved with each sprint so
  // "fast & sure" can be charted over time.
  function snapshot(model) {
    const lv = levels(model);
    const counts = [0, 0, 0, 0, 0];
    lv.forEach(l => counts[l]++);
    return { levels: lv.join(''), counts };
  }

  function stats(model, secs) {
    return { sprints: model.sprints, best: model.bestBy[secs] || 0, fluent: levels(model).filter(l => l === 4).length };
  }

  // ── Sprint ───────────────────────────────────────────
  // opts: { enabled: keys allowed this sprint (default all), rng }
  function newSprint(model, opts = {}) {
    const rng = opts.rng || Math.random;
    const enabled = new Set(opts.enabled && opts.enabled.length ? opts.enabled : Object.keys(model.cards));
    const sp = {
      enabled,
      idx: 0,            // cards served so far
      recent: [],        // fact families of recent cards
      queue: [],         // scheduled reviews: { key, due, step, carry }
      working: [],       // weak facts being rehearsed this sprint
      lastOk: {},        // key -> was the last showing right first try?
      okCount: {},       // key -> first-try rights this sprint
      reveals: {},       // key -> answers shown this sprint
      misses: {},        // key -> misses this sprint
      retired: {},       // key -> rested until next sprint
      pending: null,     // the queue entry currently on screen
      forceKnown: false,
      afterMiss: false,
      results: [],
      score: 0, streak: 0, bestStreak: 0,
      sprintNo: model.sprints,
      rng,
    };
    model.carry.filter(k => enabled.has(k)).slice(0, CARRY_MAX).forEach((key, i) => {
      sp.queue.push({ key, due: WARMUP + i * 2, step: REQUEUE_GAPS.length, carry: true });
    });
    model.carry = [];
    return sp;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function weightedPick(items, weightFn, rng) {
    let total = 0;
    const ws = items.map(it => { const w = Math.max(0, weightFn(it)); total += w; return w; });
    if (total <= 0) return items[Math.floor(rng() * items.length)];
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  // A known fact, preferring the ones not seen for longest (keeps old facts reviewed).
  function pickKnown(model, sp, pool) {
    let known = pool.filter(c => isKnown(model, c));
    if (!known.length) known = [...pool].sort((x, y) => y.s - x.s).slice(0, 6);
    const oldest = shuffle(known, sp.rng).sort((x, y) => x.lastSeen - y.lastSeen).slice(0, 5);
    return weightedPick(oldest, c => (Math.min(c.a, c.b) === 1 ? 0.4 : 1), sp.rng);
  }

  function refillWorking(model, sp) {
    // A fact leaves the working set once it's rested, answered right enough, or now known.
    sp.working = sp.working.filter(k => !sp.retired[k] && (sp.okCount[k] || 0) < GRADUATE_AFTER &&
      !(sp.lastOk[k] && isKnown(model, model.cards[k])));
    if (sp.working.length >= WORKING_MAX) return;
    // Incremental rehearsal: only add a new weak fact once the current ones were answered right.
    if (!sp.working.every(k => sp.lastOk[k] === true)) return;
    const cands = Object.values(model.cards).filter(c => sp.enabled.has(c.key) &&
      !sp.working.includes(c.key) && !sp.retired[c.key] && (sp.okCount[c.key] || 0) < GRADUATE_AFTER && !isKnown(model, c));
    const seen = cands.filter(c => c.n > 0)
      .sort((x, y) => levelOf(model, x) - levelOf(model, y) || x.s - y.s);
    const unseen = cands.filter(c => c.n === 0).sort((x, y) => y.s - x.s);
    const ok = model.recentOk;
    const cruising = ok.length >= ACC_WINDOW && ok.reduce((x, y) => x + y, 0) / ok.length > ACC_HIGH;
    let add = null;
    if (unseen.length && (!seen.length || sp.rng() < (cruising ? EXPLORE_CRUISING : EXPLORE_CHANCE))) {
      add = unseen[Math.floor(sp.rng() * Math.min(3, unseen.length))];
    } else if (seen.length) {
      add = seen[0];
    }
    if (add) sp.working.push(add.key);
  }

  // A fact from the working set, rotating to the one seen longest ago. Like the
  // interleaved unknowns in incremental rehearsal, these may come back 2 cards later.
  function pickPractice(model, sp) {
    refillWorking(model, sp);
    const close = new Set(sp.recent.slice(-RECENT_REVIEW));
    const inPool = new Set(Object.values(model.cards)
      .filter(c => sp.enabled.has(c.key) && !close.has(famOf(c.a, c.b))).map(c => c.key));
    const ws = sp.working.filter(k => inPool.has(k)).map(k => model.cards[k]);
    if (!ws.length) return null;
    return ws.sort((x, y) => x.lastSeen - y.lastSeen)[0];
  }

  function next(model, sp) {
    const enabled = Object.values(model.cards).filter(c => sp.enabled.has(c.key));
    const all = enabled.filter(c => !sp.retired[c.key]);
    const avoid = new Set(sp.recent.slice(-RECENT_PICK));
    let pool = all.filter(c => !avoid.has(famOf(c.a, c.b)));
    if (!pool.length) pool = all.length ? all : enabled;

    let card = null;
    let why = 'known';
    sp.pending = null;

    if (sp.idx < WARMUP || sp.forceKnown) {
      card = pickKnown(model, sp, pool);
      why = sp.idx < WARMUP ? 'warmup' : 'after-miss';
    } else {
      const close = new Set(sp.recent.slice(-RECENT_REVIEW));
      const qi = sp.queue.findIndex(q => q.due <= sp.idx && !sp.retired[q.key] && sp.enabled.has(q.key) &&
        !close.has(famOf(model.cards[q.key].a, model.cards[q.key].b)));
      if (qi >= 0) {
        sp.pending = sp.queue.splice(qi, 1)[0];
        card = model.cards[sp.pending.key];
        why = sp.pending.carry ? 'from-last-sprint' : 'review';
      } else if (sp.rng() >= model.pKnown) {
        card = pickPractice(model, sp);
        if (card) why = card.n === 0 ? 'new' : 'practice';
      }
      if (!card) card = pickKnown(model, sp, pool);
    }

    sp.forceKnown = false;
    sp.idx++;
    pushCapped(sp.recent, famOf(card.a, card.b), 12);
    return { a: card.a, b: card.b, answer: card.a * card.b, key: card.key, why };
  }

  function schedule(sp, key, step) {
    sp.queue = sp.queue.filter(q => q.key !== key);
    if (step < REQUEUE_GAPS.length) sp.queue.push({ key, due: sp.idx + REQUEUE_GAPS[step] - 1, step });
  }

  // res: { tries, solved, firstMs, rtValid, incomplete }
  function record(model, sp, card, res) {
    const c = model.cards[card.key];
    const sBefore = c.s;
    const firstTry = res.solved && res.tries === 1;
    const T = fluentMs(model, card.answer);
    const timed = res.rtValid && res.firstMs != null;
    const fast = firstTry && timed && res.firstMs <= T;
    // Post-error slowing: a slow answer right after a miss says nothing about this fact.
    const timeTrusted = timed && (fast || !sp.afterMiss);

    let S;
    if (firstTry) S = !timeTrusted ? S_SLOW_UNKNOWN : fast ? 1 : clamp((D_MS - res.firstMs) / (D_MS - T), 0, 1);
    else if (res.solved) S = res.tries === 2 ? S_SECOND : S_THIRD;
    else if (res.incomplete) S = res.tries >= 2 ? S_THIRD : S_SECOND; // time ran out mid-card
    else S = S_REVEALED;

    const alpha = ALPHAS[Math.min(c.n, ALPHAS.length - 1)];
    c.s = clamp(c.s + alpha * (S - c.s), -1, 1);
    if (card.a !== card.b) {
      const m = model.cards[keyOf(card.b, card.a)];
      m.s = clamp(m.s + alpha * MIRROR_SHARE * (S - m.s), -1, 1);
    }
    c.n++;
    c.lastSeen = model.clock++;
    pushCapped(c.hist, {
      ok: firstTry, solved: !!res.solved, tries: res.tries,
      t: firstTry && timeTrusted ? Math.round(res.firstMs) : null, fast, sp: sp.sprintNo,
    }, HISTORY);
    if (firstTry && timeTrusted) {
      pushCapped(model.rtSamples, Math.round(res.firstMs), 60);
      if (Math.min(card.a, card.b) === 1) pushCapped(model.onesRt, Math.round(res.firstMs), 15);
    }

    // Keep first-try success in the 75–90% band by nudging the known share.
    pushCapped(model.recentOk, firstTry ? 1 : 0, ACC_WINDOW);
    if (model.recentOk.length >= ACC_WINDOW && model.clock % ADJUST_EVERY === 0) {
      const acc = model.recentOk.reduce((x, y) => x + y, 0) / model.recentOk.length;
      if (acc < ACC_LOW) model.pKnown = Math.min(P_KNOWN_MAX, model.pKnown + P_KNOWN_STEP);
      else if (acc > ACC_HIGH) model.pKnown = Math.max(P_KNOWN_MIN, model.pKnown - P_KNOWN_STEP);
    }

    let points = 0;
    if (!res.incomplete) {
      sp.lastOk[card.key] = firstTry;
      if (firstTry) {
        sp.okCount[card.key] = (sp.okCount[card.key] || 0) + 1;
        if (sp.pending && sp.pending.key === card.key) schedule(sp, card.key, sp.pending.step + 1);
      } else {
        if (!res.solved) sp.reveals[card.key] = (sp.reveals[card.key] || 0) + 1;
        sp.misses[card.key] = (sp.misses[card.key] || 0) + 1;
        if ((sp.reveals[card.key] || 0) >= RETIRE_AFTER_REVEALS || sp.misses[card.key] >= RETIRE_AFTER_MISSES) {
          sp.retired[card.key] = true;
          sp.queue = sp.queue.filter(q => q.key !== card.key);
        } else {
          schedule(sp, card.key, 0);
          if (!sp.working.includes(card.key) && sp.working.length < WORKING_MAX) sp.working.push(card.key);
        }
      }
      sp.pending = null;
      sp.afterMiss = !firstTry;
      sp.forceKnown = !firstTry;

      // Kid-facing points: only ever positive. 3 / 2 / 1 by try, +1 for ⚡.
      if (res.solved) points = Math.max(1, 4 - res.tries) + (fast ? 1 : 0);
      sp.score += points;
      if (firstTry) {
        sp.streak++;
        sp.bestStreak = Math.max(sp.bestStreak, sp.streak);
      } else {
        sp.streak = 0;
      }
      sp.results.push({
        a: card.a, b: card.b, key: card.key, tries: res.tries, solved: !!res.solved,
        fast, ms: res.firstMs, rtValid: !!res.rtValid, why: card.why, S: Math.round(S * 100) / 100,
      });
    }
    return { points, fast, S, sBefore, sAfter: c.s, level: levelOf(model, c) };
  }

  function cheerFor(rate, count) {
    if (!count) return 'Let’s try again!';
    if (rate === 1) return 'Perfect sprint! 🌟';
    if (rate >= 0.9) return 'Superstar! 🌟';
    if (rate >= 0.8) return 'Awesome job! 🎉';
    if (rate >= 0.65) return 'Great work! 💪';
    return 'Nice effort! Keep going 🙌';
  }

  // secs: the sprint length, so bests are compared like with like.
  function finish(model, sp, secs) {
    const r = sp.results;
    const count = r.length;
    const firstTries = r.filter(x => x.solved && x.tries === 1);
    const firstTryRate = count ? firstTries.length / count : 0;
    const medianMs = median(firstTries.filter(x => x.rtValid).map(x => x.ms));

    const seenFast = new Set();
    const fastFacts = r.filter(x => x.fast)
      .sort((x, y) => x.ms - y.ms)
      .filter(x => !seenFast.has(x.key) && seenFast.add(x.key))
      .slice(0, 6);

    // "Let's practice": this sprint's facts that are still tricky/learning, with a plain reason.
    // A fact whose last showing was a fast first-try right is left off — they fixed it.
    const byKey = {};
    for (const x of r) (byKey[x.key] = byKey[x.key] || []).push(x);
    const practice = Object.entries(byKey)
      .map(([key, xs]) => {
        const c = model.cards[key];
        const level = levelOf(model, c);
        const last = xs[xs.length - 1];
        let reason = '';
        if (xs.some(x => !x.solved)) reason = 'Shown the answer';
        else if (xs.some(x => x.tries > 1)) reason = `Took ${Math.max(...xs.map(x => x.tries))} tries`;
        else {
          const slowest = Math.max(...xs.map(x => (x.rtValid ? x.ms : 0)));
          if (slowest > 1.5 * fluentMs(model, c.a * c.b)) reason = `Slow: ${(slowest / 1000).toFixed(1)}s`;
        }
        return { a: c.a, b: c.b, s: c.s, level, reason, fixed: last.fast };
      })
      .filter(x => x.reason && x.level <= 2 && !x.fixed)
      .sort((x, y) => x.level - y.level || x.s - y.s)
      .slice(0, 6);

    // Misses get one more look early next sprint.
    model.carry = Object.keys(byKey)
      .filter(k => byKey[k].some(x => !(x.solved && x.tries === 1)))
      .sort((x, y) => model.cards[x].s - model.cards[y].s)
      .slice(0, CARRY_MAX);

    const score = sp.score;
    const prevBest = model.bestBy[secs] || 0;
    const sameLength = model.history.filter(h => h.secs === secs);
    const prevScore = sameLength.length ? sameLength[sameLength.length - 1].score : null;
    const isBest = count > 0 && score > prevBest;
    model.bestBy[secs] = Math.max(prevBest, score);
    model.sprints++;
    pushCapped(model.history, { t: Date.now(), secs, score, count, firstTryRate: Math.round(firstTryRate * 100) / 100 }, 100);

    return {
      score, count, firstTryRate, medianMs, bestStreak: sp.bestStreak,
      cards: r, fastFacts, practice, isBest, prevBest, prevScore,
      fluentMs: fluentMs(model, 1),
      cheer: cheerFor(firstTryRate, count),
    };
  }

  return {
    freshModel, upgrade, newSprint, next, record, finish, levels, stats, fluentMs, snapshot,
    _internals: { prior, fluentMs, readTypeMs, levelOf, isKnown, struggling, fluent, freshModel },
  };
})();

if (typeof module !== 'undefined') module.exports = Brain;
