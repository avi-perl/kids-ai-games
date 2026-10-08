// Sound — a mechanical click for each button press, made on the fly (no audio files).
// The mute choice is remembered on this device.
const Sound = (() => {
  const KEY = 'door-muted';
  let ac;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch {}

  function click() {
    if (muted) return;
    const a = (ac ||= new (window.AudioContext || window.webkitAudioContext)());
    const len = a.sampleRate * 0.03;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 2600; g.gain.value = 0.6;
    src.buffer = buf;
    src.connect(bp).connect(g).connect(a.destination);
    src.start();
  }

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
  }

  return { click, setMuted, get muted() { return muted; } };
})();
