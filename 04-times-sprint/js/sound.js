// Tiny WebAudio synth — no audio files needed.
const Sound = (() => {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, { type = 'sine', vol = 0.18, slideTo = null } = {}) {
    const a = ac();
    if (!a || muted) return;
    const t0 = a.currentTime + start;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // C major pentatonic, so rising streak chimes always sound nice
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

  return {
    unlock() { ac(); },
    get muted() { return muted; },
    set muted(v) { muted = !!v; },

    key()   { tone(420, 0, 0.05, { type: 'triangle', vol: 0.06 }); },
    back()  { tone(300, 0, 0.05, { type: 'triangle', vol: 0.05 }); },
    nope()  { tone(180, 0, 0.12, { type: 'square', vol: 0.04 }); },

    // pitch climbs with the streak
    correct(streak = 0) {
      const i = Math.min(streak, SCALE.length - 2);
      tone(SCALE[i], 0, 0.14, { type: 'triangle', vol: 0.16 });
      tone(SCALE[i + 1] * 1.5, 0.08, 0.22, { type: 'sine', vol: 0.12 });
    },
    fast() { tone(1760, 0.16, 0.12, { type: 'sine', vol: 0.07 }); tone(2349, 0.22, 0.14, { type: 'sine', vol: 0.06 }); },
    wrong() { tone(220, 0, 0.22, { type: 'sawtooth', vol: 0.05, slideTo: 160 }); },
    reveal() { tone(392, 0, 0.18, { type: 'triangle', vol: 0.1 }); tone(523.25, 0.16, 0.3, { type: 'triangle', vol: 0.1 }); },
    tick()  { tone(1000, 0, 0.03, { type: 'square', vol: 0.03 }); },
    count(n) { tone(n > 0 ? 660 : 990, 0, n > 0 ? 0.12 : 0.3, { type: 'triangle', vol: 0.14 }); },
    milestone() { [3, 5, 7, 9].forEach((s, i) => tone(SCALE[s], i * 0.07, 0.18, { type: 'triangle', vol: 0.12 })); },
    done() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.3, { type: 'triangle', vol: 0.13 }));
    },
  };
})();
