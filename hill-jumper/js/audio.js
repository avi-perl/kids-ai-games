let audioCtx   = null;
let musicGain  = null;
let musicMuted = true;
let sfxMuted   = true;
let _mLoopId   = null;
let _rumbleOsc = null, _rumbleGain = null;

const _BPM  = 132;
const _B    = 60 / _BPM;
const _h    = _B * 0.5;

// Simple 8-bar loop in C pentatonic
const _MEL = [
  [329.63,_h],[392,_h],[440,_h],[523.25,_h],  // bar 1 rising
  [440,_h],[392,_h],[329.63,_B],               // bar 2 fall
  [293.66,_h],[329.63,_h],[392,_h],[329.63,_h],// bar 3 bounce
  [261.63,_B],[293.66,_h],[261.63,_h],         // bar 4 resolve
  [329.63,_h],[392,_h],[440,_h],[523.25,_h],   // bar 5 repeat
  [587.33,_h],[523.25,_h],[440,_B],            // bar 6 high
  [392,_h],[440,_h],[392,_h],[329.63,_h],      // bar 7 descend
  [261.63,_B],[0,_h],[261.63,_h],              // bar 8 rest+end
];

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioCtx.createGain();
    musicGain.gain.value = musicMuted ? 0 : 0.015;
    musicGain.connect(audioCtx.destination);
    _scheduleMusic(audioCtx.currentTime + 0.15);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function _scheduleMusic(t0) {
  if (!audioCtx || !musicGain) return;
  const total = _MEL.reduce((s,[,d])=>s+d, 0);
  let t = t0;
  for (const [freq, dur] of _MEL) {
    if (freq > 0) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(musicGain);
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.01);
      g.gain.setValueAtTime(1, t + dur * 0.72);
      g.gain.linearRampToValueAtTime(0, t + dur * 0.88);
      o.start(t); o.stop(t + dur);
    }
    t += dur;
  }
  // Bass pulse every quarter beat
  const bass = [130.81, 196.00, 130.81, 196.00];
  let bt = t0, bi = 0;
  while (bt < t0 + total - _B * 0.4) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(musicGain);
    o.type = 'triangle'; o.frequency.value = bass[bi % bass.length];
    g.gain.setValueAtTime(0, bt);
    g.gain.linearRampToValueAtTime(0.5, bt + 0.01);
    g.gain.linearRampToValueAtTime(0, bt + _B * 0.38);
    o.start(bt); o.stop(bt + _B * 0.45);
    bt += _B; bi++;
  }
  _mLoopId = setTimeout(() => _scheduleMusic(t0 + total), (total - 0.2) * 1000);
}

// SFX primitives
function _osc(f0, f1, dur, type, vol) {
  if (sfxMuted || !audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type = type;
  const t = audioCtx.currentTime;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
  o.start(t); o.stop(t + dur + 0.01);
}
function _noise(dur, cutoff, vol) {
  if (sfxMuted || !audioCtx) return;
  const sr = audioCtx.sampleRate;
  const buf = audioCtx.createBuffer(1, Math.ceil(sr * dur), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*(1-i/d.length);
  const src = audioCtx.createBufferSource();
  const flt = audioCtx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=cutoff;
  const g = audioCtx.createGain();
  src.buffer=buf; src.connect(flt); flt.connect(g); g.connect(audioCtx.destination);
  const t = audioCtx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t+dur);
  src.start(t);
}

function sfxJump()  { _osc(200, 440, 0.09, 'square', 0.10); }
function sfxLand()  { _noise(0.07, 220, 0.14); }
function sfxBoop()  { _osc(650,950,0.06,'square',0.11); setTimeout(()=>_osc(950,1100,0.05,'square',0.09),65); }
function sfxBoard() { [300,420,600].forEach((f,i)=>setTimeout(()=>_osc(f,f,0.06,'square',0.085),i*65)); }
function sfxCrash() { _noise(0.3,800,0.225); _osc(220,55,0.25,'sawtooth',0.14); }
function sfxDeath() {
  if (sfxMuted || !audioCtx) return;
  const t = audioCtx.currentTime;
  [[392,0],[349,0.13],[311,0.26],[262,0.39]].forEach(([f,dt])=>{
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type='square'; o.frequency.value=f;
    g.gain.setValueAtTime(0.10,t+dt); g.gain.linearRampToValueAtTime(0,t+dt+0.12);
    o.start(t+dt); o.stop(t+dt+0.14);
  });
}

function startCarRumble() {
  if (!audioCtx || _rumbleOsc) return;
  _rumbleGain = audioCtx.createGain();
  _rumbleGain.gain.value = sfxMuted ? 0 : 0.05;
  _rumbleGain.connect(audioCtx.destination);
  _rumbleOsc = audioCtx.createOscillator();
  _rumbleOsc.type = 'triangle';
  _rumbleOsc.frequency.value = 72;
  _rumbleOsc.connect(_rumbleGain);
  _rumbleOsc.start();
}
function stopCarRumble() {
  if (_rumbleOsc) { try { _rumbleOsc.stop(); } catch(e){} _rumbleOsc = null; }
  if (_rumbleGain) { try { _rumbleGain.disconnect(); } catch(e){} _rumbleGain = null; }
}
