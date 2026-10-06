// Game — one sprint: countdown, cards, keypad, answer reveal, summary, and the sprint log.
// Learning logic lives in brain.js; saving lives in store.js.
const Game = (() => {
  const REVEAL_MS = 2200;
  const MAX_DIGITS = 2; // biggest answer is 81
  const STREAK_MILESTONES = [5, 10, 15, 20, 25, 30, 40, 50];
  // ?secs=20 overrides the sprint length, for testing
  const TEST_SECS = Number(new URLSearchParams(location.search).get('secs')) || 0;

  let settings = null;    // snapshot of the profile's settings for this sprint
  let sprintMs = 0;
  let sprint = null;
  let log = null;         // everything that happened, saved to the profile's history
  let card = null;        // { a, b, answer, key, why, tries, t0, log, ... }
  let input = '';
  let locked = true;      // keypad ignores digits while true
  let clockPaused = true; // clock only runs while a question is waiting for an answer
  let timeLeft = 0;
  let lastFrame = 0;
  let running = false;
  let lastTick = 99;
  let revealTimer = null;
  let summaryAt = 0;      // when the summary appeared; guards against carried-over taps

  // ── Sprint lifecycle ─────────────────────────────────
  function start() {
    Sound.unlock();
    clearTimeout(revealTimer);
    revealTimer = null;
    settings = { ...App.profile.settings, disabled: [...App.profile.settings.disabled] };
    Sound.muted = !settings.sound;
    sprintMs = (TEST_SECS || settings.sprintSecs) * 1000;
    sprint = Brain.newSprint(App.model, { enabled: Store.enabledKeys(settings) });
    log = {
      id: 's' + Date.now().toString(36),
      startedAt: null,
      endedAt: null,
      settings: {
        sprintSecs: sprintMs / 1000, maxTries: settings.maxTries, sound: settings.sound,
        hints: settings.hints, disabled: settings.disabled,
      },
      cards: [],
    };
    timeLeft = sprintMs;
    lastTick = 99;
    $('play').style.setProperty('--rows', settings.maxTries);
    setEnterLabel(false);
    updateHud();
    paintClock();
    $('question').textContent = '';
    $('rows').innerHTML = '';
    showScreen('play');
    locked = true;
    clockPaused = true;
    countdown(() => {
      log.startedAt = Date.now();
      running = true;
      lastFrame = performance.now();
      requestAnimationFrame(frame);
      nextCard();
    });
  }

  function countdown(done) {
    const ov = $('overlay');
    const steps = ['3', '2', '1', 'Go!'];
    let i = 0;
    ov.classList.add('show');
    (function step() {
      if (i === steps.length) { ov.classList.remove('show'); done(); return; }
      ov.innerHTML = `<span>${steps[i]}</span>`;
      Sound.count(steps.length - 1 - i);
      i++;
      setTimeout(step, i === steps.length ? 450 : 650);
    })();
  }

  function frame(now) {
    if (!running) return;
    // Cap dt so a backgrounded tab doesn't eat the clock.
    const dt = Math.min(now - lastFrame, 100);
    lastFrame = now;
    if (!clockPaused) timeLeft -= dt;
    paintClock();
    const secs = Math.ceil(timeLeft / 1000);
    if (secs <= 10 && secs < lastTick && secs > 0 && !clockPaused) { Sound.tick(); lastTick = secs; }
    if (timeLeft <= 0) { endSprint(); return; }
    requestAnimationFrame(frame);
  }

  function paintClock() {
    const t = Math.max(0, timeLeft);
    const s = Math.ceil(t / 1000);
    $('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('timefill').style.transform = `scaleX(${t / sprintMs})`;
    $('timebar').classList.toggle('low', t <= 10000);
  }

  function endSprint() {
    running = false;
    locked = true;
    clockPaused = true;
    clearTimeout(revealTimer);
    revealTimer = null;
    // The question on screen when time ran out is logged too. If they'd already missed it,
    // that still counts as evidence for the brain.
    if (card && !card.done) {
      card.log.result = 'time-up';
      card.log.tries = card.tries;
      if (card.tries > 0) {
        const r = Brain.record(App.model, sprint, card, {
          tries: card.tries, solved: false, firstMs: card.firstMs, rtValid: card.rtValid, incomplete: true,
        });
        Object.assign(card.log, { sBefore: round2(r.sBefore), sAfter: round2(r.sAfter), level: r.level });
      }
    }
    card = null;
    const ov = $('overlay');
    ov.innerHTML = '<span style="font-size:0.6em">Time’s up!</span>';
    ov.classList.add('show');
    Sound.done();

    const result = Brain.finish(App.model, sprint, sprintMs / 1000);
    Object.assign(log, {
      v: 2,
      mastery: Brain.snapshot(App.model),
      endedAt: Date.now(),
      score: result.score,
      answered: result.count,
      firstTryRate: Math.round(result.firstTryRate * 1000) / 1000,
      bestStreak: result.bestStreak,
      medianMs: result.medianMs == null ? null : Math.round(result.medianMs),
      isBest: result.isBest,
    });
    const savedModel = Store.saveModel(App.profile.id, App.model);
    const savedLog = Store.addSprint(App.profile.id, log);
    setTimeout(() => {
      ov.classList.remove('show');
      renderSummary(result);
      savedLog.then(ok => {
        if (!ok || !savedModel) toast('Couldn’t save this sprint — the browser’s storage is full or blocked.', 5000);
      });
    }, 1300);
  }

  // ── Cards ────────────────────────────────────────────
  // The answer box never hints at how many digits the answer has: no empty slots, just a
  // caret. Digits grow out from the centre. Wrong guesses stay stacked above it.
  function nextCard() {
    if (!running) return;
    card = Brain.next(App.model, sprint);
    card.tries = 0;
    card.firstMs = null;
    card.rtValid = !document.hidden;
    card.done = false;
    card.log = {
      n: log.cards.length + 1, a: card.a, b: card.b, answer: card.answer, why: card.why,
      shownAt: Date.now(),
      clock: Math.round(sprintMs - timeLeft), // sprint-clock ms used so far (clock pauses between questions)
      attempts: [], result: 'unanswered',
    };
    log.cards.push(card.log);
    input = '';

    const q = $('question');
    q.classList.remove('enter', 'revealed');
    void q.offsetWidth;
    q.textContent = `${card.a} × ${card.b}`;
    q.classList.add('enter');

    $('rows').innerHTML = '';
    addEntryRow();
    locked = false;
    clockPaused = false;
    card.t0 = performance.now();
  }

  function addEntryRow() {
    const r = document.createElement('div');
    r.className = 'row entry';
    $('rows').appendChild(r);
    paintInput();
  }

  const currentRow = () => $('rows').lastElementChild;

  function paintInput() {
    currentRow().innerHTML = input
      ? input.split('').map(d => `<div class="tile filled">${d}</div>`).join('')
      : '<i class="caret"></i>';
  }

  function press(k) {
    if (App.screen !== 'play') return;
    if (revealTimer && k === 'enter') { skipReveal(); return; }
    if (locked || !card) return;
    if (k === 'back') {
      if (input) { input = input.slice(0, -1); Sound.back(); paintInput(); }
    } else if (k === 'enter') {
      submit();
    } else if (/^\d$/.test(k)) {
      if (input.length >= MAX_DIGITS) { Sound.nope(); bump(currentRow()); return; }
      if (input === '' && k === '0') { Sound.nope(); return; }
      input += k;
      Sound.key();
      paintInput();
    }
  }

  function bump(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  // Wordle colouring by place value (ones vs ones, tens vs tens): green = right digit in the
  // right place, yellow = that digit is in the answer but in the other place.
  function digitColors(guess, target) {
    const g = guess.split('').reverse();
    const t = target.split('').reverse();
    const res = g.map(() => 'x');
    const left = {};
    t.forEach((d, i) => { if (g[i] === d) res[i] = 'g'; else left[d] = (left[d] || 0) + 1; });
    g.forEach((d, i) => { if (res[i] !== 'g' && left[d]) { res[i] = 'y'; left[d]--; } });
    return res.reverse();
  }

  function flipRow(row, colors) {
    row.querySelectorAll('.tile').forEach((t, i) => {
      t.classList.remove('filled');
      t.classList.add('flip');
      setTimeout(() => t.classList.add(colors[i]), 210 + i * 120);
    });
  }

  const round2 = v => Math.round(v * 100) / 100;

  function logResult(r, result) {
    const last = card.log.attempts[card.log.attempts.length - 1];
    Object.assign(card.log, {
      result,
      tries: card.tries,
      ms: last ? last.ms : null,
      points: r.points,
      fast: r.fast,
      timingOk: card.rtValid,
      sBefore: round2(r.sBefore),
      sAfter: round2(r.sAfter),
      level: r.level,
    });
  }

  function submit() {
    const row = currentRow();
    if (!input) {
      Sound.nope();
      bump(row);
      toast('Type your answer');
      return;
    }
    const now = performance.now();
    card.tries++;
    if (card.firstMs == null) card.firstMs = now - card.t0;
    const target = String(card.answer);
    const guess = input;
    const correct = guess === target;
    card.log.attempts.push({ v: Number(guess), at: Date.now(), ms: Math.round(now - card.t0), ok: correct });
    row.classList.remove('entry');
    flipRow(row, digitColors(guess, target));
    locked = true;

    if (correct) {
      clockPaused = true;
      card.done = true;
      const res = Brain.record(App.model, sprint, card, { tries: card.tries, solved: true, firstMs: card.firstMs, rtValid: card.rtValid });
      logResult(res, card.tries === 1 ? 'first-try' : `try-${card.tries}`);
      setTimeout(() => {
        row.classList.add('win');
        Sound.correct(sprint.streak);
        if (res.fast) Sound.fast();
        floater(`${res.fast ? '⚡ ' : ''}+${res.points} ⭐`);
        updateHud(true);
        celebrateStreak();
      }, 380);
      setTimeout(nextCard, 950);
      return;
    }

    if (settings.hints) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = Number(guess) < card.answer ? '↑ bigger' : '↓ smaller';
      row.appendChild(hint);
      setTimeout(() => hint.classList.add('show'), 20);
    }
    setTimeout(() => Sound.wrong(), 300);
    if (navigator.vibrate) navigator.vibrate(60);

    if (card.tries >= settings.maxTries) {
      clockPaused = true;
      card.done = true;
      const res = Brain.record(App.model, sprint, card, { tries: card.tries, solved: false, firstMs: card.firstMs, rtValid: card.rtValid });
      logResult(res, 'shown-answer');
      updateHud();
      setTimeout(reveal, 650);
    } else {
      setTimeout(() => {
        input = '';
        addEntryRow();
        locked = false;
      }, 260);
    }
  }

  function setEnterLabel(next) {
    const enter = document.querySelector('.key.enter');
    enter.textContent = next ? 'NEXT →' : 'ENTER';
    enter.classList.toggle('next', next);
  }

  function reveal() {
    if (!running) return;
    const q = $('question');
    q.innerHTML = `${card.a} × ${card.b} = <span class="ans">${card.answer}</span>`;
    q.classList.add('revealed');
    Sound.reveal();
    setEnterLabel(true);
    revealTimer = setTimeout(skipReveal, REVEAL_MS);
  }

  function skipReveal() {
    clearTimeout(revealTimer);
    revealTimer = null;
    setEnterLabel(false);
    nextCard();
  }

  function floater(text) {
    const f = document.createElement('div');
    f.className = 'floater';
    f.textContent = text;
    $('board').appendChild(f);
    setTimeout(() => f.remove(), 950);
  }

  function updateHud(pop) {
    $('scorePill').textContent = `⭐ ${sprint.score}`;
    const sp = $('streakPill');
    sp.textContent = `🔥 ${sprint.streak}`;
    sp.classList.toggle('off', sprint.streak === 0);
    if (pop && sprint.streak > 0) {
      sp.classList.add('pop');
      setTimeout(() => sp.classList.remove('pop'), 160);
    }
  }

  function celebrateStreak() {
    if (!STREAK_MILESTONES.includes(sprint.streak)) return;
    Sound.milestone();
    toast(`🔥 ${sprint.streak} in a row!`, 1300);
    Confetti.burst(60);
  }

  // ── Summary ──────────────────────────────────────────
  function renderSummary(r) {
    const len = fmtLength(sprintMs / 1000);
    let badge = '';
    if (r.isBest && r.prevBest > 0) badge = `<div class="badge">🏆 New best for ${len} sprints!</div>`;
    else if (r.isBest) badge = `<div class="badge">🎉 First ${len} sprint!</div>`;
    else if (r.prevScore != null && r.score > r.prevScore) badge = `<div class="badge">+${r.score - r.prevScore} more than last time</div>`;

    const strip = r.cards.map(c => {
      const cls = !c.solved ? 'b' : c.tries === 1 ? 'g' : 'y';
      return `<i class="${cls}${c.fast ? ' z' : ''}" title="${c.a} × ${c.b}"></i>`;
    }).join('');

    const chip = (f, cls, sub) => `<div class="chip ${cls}">${f.a} × ${f.b} = ${f.a * f.b}<small>${sub}</small></div>`;
    const fastHtml = r.fastFacts.length
      ? r.fastFacts.map(f => chip(f, 'good', fmtSec(f.ms))).join('')
      : `<div class="empty-note">Get it on the first try in under ${fmtSec(r.fluentMs)} for a ⚡</div>`;
    const practiceHtml = r.practice.length
      ? r.practice.map(f => chip(f, 'bad', f.reason)).join('')
      : '<div class="empty-note">Nothing tricky this time — amazing! 🌟</div>';

    $('sumInner').innerHTML = `
      <div class="sum-head">
        <div class="sum-who">${esc(App.profile.name)} · ${len} sprint</div>
        <div class="cheer">${r.cheer}</div>
        <div class="sum-score">${r.score} <small>stars</small></div>
        ${badge}
      </div>
      <div class="sum-stats">
        <div><b>${r.count}</b><small>Answered</small></div>
        <div><b>${r.count ? Math.round(r.firstTryRate * 100) + '%' : '–'}</b><small>First try</small></div>
        <div><b>${r.medianMs ? fmtSec(r.medianMs) : '–'}</b><small>Per answer</small></div>
        <div><b>${r.bestStreak}</b><small>Best 🔥</small></div>
      </div>
      <div class="panel">
        <h3>Your sprint</h3>
        <div class="strip">${strip || '<div class="empty-note">No answers this time.</div>'}</div>
        <div class="legend" style="justify-content:flex-start">
          <span><i style="background:var(--green)"></i>First try</span>
          <span><i style="background:var(--yellow)"></i>Later try</span>
          <span><i style="background:var(--blue)"></i>Shown answer</span>
          <span><i style="box-shadow:inset 0 0 0 2px #ffcf3f"></i>⚡ Fast</span>
        </div>
      </div>
      <div class="panel"><h3>⚡ Lightning fast</h3><div class="chips">${fastHtml}</div></div>
      <div class="panel"><h3>💪 Let’s practice</h3><div class="chips">${practiceHtml}</div></div>
      <div class="panel">
        <h3>Times table map</h3>
        <div class="mgrid" id="sumGrid"></div>
        <div class="legend" id="sumLegend"></div>
      </div>`;
    renderMasteryGrid($('sumGrid'), $('sumLegend'), new Set(r.practice.map(f => `${f.a}x${f.b}`)));
    showScreen('summary');
    summaryAt = performance.now();
    $('summary').scrollTop = 0;
    if (r.isBest || r.firstTryRate >= 0.9) Confetti.burst(120);
  }

  // A tap or Enter meant for the last question shouldn't skip the summary.
  function again() {
    if (App.screen === 'summary' && performance.now() - summaryAt < 1500) return;
    start();
  }

  // ── Confetti ─────────────────────────────────────────
  const Confetti = (() => {
    const cv = $('fx');
    const cx = cv.getContext('2d');
    const COLORS = ['#6aaa64', '#c9b458', '#4a90d9', '#e05a4f', '#ffcf3f', '#a06cd5'];
    let parts = [];
    let anim = false;
    function size() {
      const d = window.devicePixelRatio || 1;
      cv.width = innerWidth * d; cv.height = innerHeight * d;
      cx.setTransform(d, 0, 0, d, 0, 0);
    }
    function tick() {
      cx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter(p => p.y < innerHeight + 20 && p.life-- > 0);
      for (const p of parts) {
        p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r);
        cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        cx.restore();
      }
      if (parts.length) requestAnimationFrame(tick); else { anim = false; cx.clearRect(0, 0, innerWidth, innerHeight); }
    }
    addEventListener('resize', size);
    size();
    return {
      burst(n) {
        for (let i = 0; i < n; i++) {
          parts.push({
            x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.35,
            vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 9,
            w: 6 + Math.random() * 6, h: 4 + Math.random() * 4,
            r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
            c: COLORS[i % COLORS.length], life: 160,
          });
        }
        if (!anim) { anim = true; requestAnimationFrame(tick); }
      },
    };
  })();

  // ── Input wiring ─────────────────────────────────────
  $('pad').addEventListener('pointerdown', e => {
    const btn = e.target.closest('.key');
    if (!btn) return;
    e.preventDefault();
    btn.classList.add('down');
    setTimeout(() => btn.classList.remove('down'), 90);
    press(btn.dataset.k);
  });
  addEventListener('keydown', e => {
    if (e.repeat || App.screen !== 'play') return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter') press('enter');
    else return;
    e.preventDefault();
  });
  // Tapping the board also skips the answer reveal.
  $('board').addEventListener('pointerdown', () => { if (revealTimer) skipReveal(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && card) card.rtValid = false; });

  return { start, again };
})();
