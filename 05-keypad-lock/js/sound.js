// Sound — a mechanical click for the buttons, made on the fly (no audio files).
// The mute choice is remembered on this device.
const Sound = (() => {
  const KEY = 'door-muted';
  let ac;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch {}

  const audio = () => {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };

  // A short burst of noise through a filter, fading out fast.
  function burst(a, seconds, type, freq, gain) {
    const len = Math.round(a.sampleRate * seconds);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = type; f.frequency.value = freq; g.gain.value = gain;
    src.buffer = buf;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }

  // A button press. `volume` 0..1: a press that changes nothing only taps faintly.
  function click(volume = 1) {
    if (muted) return;
    burst(audio(), 0.03, 'bandpass', 2600, 0.6 * volume);
  }

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
  }

  return { click, setMuted, get muted() { return muted; } };
})();
