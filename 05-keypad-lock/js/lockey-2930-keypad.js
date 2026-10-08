// <lockey-2930-keypad> — the face of a Lockey 2930 as an interactive SVG.
//
// An input surface (see lock-contract.js): it reports raw presses and knob turns as 'lock-input'
// events and knows none of the lock's rules — <lockey-2930-lock> wraps it with those.
//   keypad.controls   keypad.down(id)   keypad.up(id)   keypad.tap(id)   keypad.turn('knob')
//   keypad.spinKnob(turned)   animate the knob turning (true) or catching on the lock (false)
//   keypad.setPushedIn(ids)   show these buttons as staying pushed in (the lock passes its seated tumblers)
//
// Size it with CSS `width` on the element; height follows the lock's aspect ratio.
(() => {
  const LEFT  = ['1', '2', '3', '4', '5', 'X', 'Y'];
  const RIGHT = ['6', '7', '8', '9', '0', 'Z', 'C'];
  const CONTROLS = [
    ...[...LEFT, ...RIGHT].map(id => ({ id, kind: 'button', label: id })),
    { id: 'knob', kind: 'knob', label: 'Knob' },
  ];

  // Geometry in the source image's 240×800 space; the viewBox crops the white margins.
  const VB = '14 84 212 632';
  const ROW_Y0 = 186, ROW_DY = 43.6;
  const CAP_W = 33, CAP_H = 23;
  const KNOB = { cx: 120, cy: 628 };
  const PRESS_MS = 110;

  const CSS = `
    :where(lockey-2930-keypad) { display: inline-block; width: 200px; aspect-ratio: 212 / 632; }
    lockey-2930-keypad svg {
      display: block; width: 100%; height: 100%;
      touch-action: none; user-select: none; -webkit-user-select: none;
      -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
    }
    .kl-key, .kl-knob { cursor: pointer; outline: none; }
    .kl-hit { fill: transparent; }
    .kl-label { font: 600 23px Arial, Helvetica, sans-serif; fill: #2a2b2d; pointer-events: none; }
    .kl-cap { transition: transform 60ms; }
    .kl-cap-shade { opacity: 0; transition: opacity 60ms; }
    .kl-key.down .kl-cap { transform: translateY(1.6px); }
    .kl-key.down .kl-cap-shine { opacity: .35; }
    .kl-key.down .kl-cap-shade { opacity: .12; }
    .kl-key.in .kl-cap { transform: translateY(2.6px); }
    .kl-key.in .kl-cap-shine { opacity: .15; }
    .kl-key.in .kl-cap-shade { opacity: .28; }
    .kl-key:focus-visible .kl-socket, .kl-knob:focus-visible .kl-knob-face { stroke: #2f7de1; stroke-width: 2.5; }
    .kl-knurl { transform-box: fill-box; transform-origin: 50% 50%; }
    .kl-knob.turned .kl-knurl { animation: kl-turn 650ms ease-in-out; }
    .kl-knob.caught .kl-knurl { animation: kl-catch 300ms ease-out; }
    @keyframes kl-turn { 50% { transform: rotate(80deg); } }
    @keyframes kl-catch { 30% { transform: rotate(7deg); } 60% { transform: rotate(-3deg); } 85% { transform: rotate(1.5deg); } }
  `;

  let instance = 0;

  function keySvg(p, key, side, row) {
    const cy = ROW_Y0 + row * ROW_DY;
    const left = side === 'L';
    const capX = left ? 76 : 140;
    const hitX = left ? 38 : 120;
    return `
      <g class="kl-key" data-key="${key}" role="button" tabindex="0" aria-label="${key}">
        <rect class="kl-hit" x="${hitX}" y="${cy - ROW_DY / 2}" width="82" height="${ROW_DY}"/>
        <rect class="kl-socket" x="${capX - 3}" y="${cy - CAP_H / 2 - 3}" width="${CAP_W + 6}" height="${CAP_H + 6}" rx="12"
              fill="url(#${p}socket)" stroke="none"/>
        <g class="kl-cap">
          <rect x="${capX}" y="${cy - CAP_H / 2}" width="${CAP_W}" height="${CAP_H}" rx="10"
                fill="url(#${p}cap)" stroke="#7a7e83" stroke-width=".8"/>
          <rect class="kl-cap-shine" x="${capX + 6}" y="${cy - CAP_H / 2 + 3}" width="${CAP_W - 12}" height="6" rx="3"
                fill="#fff" opacity=".75"/>
          <rect class="kl-cap-shade" x="${capX}" y="${cy - CAP_H / 2}" width="${CAP_W}" height="${CAP_H}" rx="10" fill="#000"/>
        </g>
        <text class="kl-label" x="${left ? 71 : 177}" y="${cy}" dy=".36em" text-anchor="${left ? 'end' : 'start'}">${key}</text>
      </g>`;
  }

  function lockSvg(p) {
    const { cx, cy } = KNOB;
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" role="group" aria-label="Combination lock keypad">
  <defs>
    <linearGradient id="${p}face" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#a9adb2"/>
      <stop offset=".18" stop-color="#d6d8db"/>
      <stop offset=".5" stop-color="#eceef0"/>
      <stop offset=".82" stop-color="#d3d6d9"/>
      <stop offset="1" stop-color="#a3a7ac"/>
    </linearGradient>
    <linearGradient id="${p}housing" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#b9bcc0"/>
      <stop offset=".5" stop-color="#f1f2f3"/>
      <stop offset="1" stop-color="#b6b9bd"/>
    </linearGradient>
    <linearGradient id="${p}socket" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#3f4246"/>
      <stop offset="1" stop-color="#8d9196"/>
    </linearGradient>
    <linearGradient id="${p}cap" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fbfbfc"/>
      <stop offset=".45" stop-color="#d9dbde"/>
      <stop offset="1" stop-color="#9da1a6"/>
    </linearGradient>
    <radialGradient id="${p}knobFace" cx=".4" cy=".35" r=".7">
      <stop offset="0" stop-color="#fbfbfc"/>
      <stop offset=".6" stop-color="#dcdee1"/>
      <stop offset="1" stop-color="#a9adb2"/>
    </radialGradient>
    <linearGradient id="${p}knurl" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#e4e6e8"/>
      <stop offset="1" stop-color="#8e9297"/>
    </linearGradient>
    <filter id="${p}brush" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9 .004" numOctaves="2" seed="4"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .32 0 0 0 -.1"/>
    </filter>
    <filter id="${p}blur"><feGaussianBlur stdDeviation="4"/></filter>
    <clipPath id="${p}plate"><rect x="36" y="106" width="168" height="590" rx="66"/></clipPath>
  </defs>

  <!-- body -->
  <rect x="18" y="88" width="204" height="626" rx="84" fill="#0c0c0d"/>
  <rect x="21" y="91" width="198" height="620" rx="81" fill="none" stroke="#3a3b3d" stroke-width="1.5"/>

  <!-- face plate -->
  <g clip-path="url(#${p}plate)">
    <rect x="36" y="106" width="168" height="590" fill="url(#${p}face)"/>
    <rect x="36" y="106" width="168" height="590" filter="url(#${p}brush)"/>
    <rect x="36" y="516" width="168" height="190" fill="url(#${p}housing)"/>
    <line x1="36" x2="204" y1="514.5" y2="514.5" stroke="#5d6166" stroke-opacity=".5" stroke-width="1.5"/>
    <line x1="36" x2="204" y1="516.5" y2="516.5" stroke="#fff" stroke-opacity=".9" stroke-width="1.5"/>
  </g>
  <rect x="36" y="106" width="168" height="590" rx="66" fill="none" stroke="#6c7075" stroke-width="1.2"/>

  <!-- keys -->
  ${LEFT.map((k, i) => keySvg(p, k, 'L', i)).join('')}
  ${RIGHT.map((k, i) => keySvg(p, k, 'R', i)).join('')}

  <!-- knob -->
  <g class="kl-knob" role="button" tabindex="0" aria-label="Turn knob">
    <circle class="kl-hit" cx="${cx}" cy="${cy}" r="80"/>
    <ellipse cx="${cx}" cy="${cy + 20}" rx="70" ry="64" fill="#000" opacity=".28" filter="url(#${p}blur)"/>
    <g class="kl-knurl">
      <circle cx="${cx}" cy="${cy - 6}" r="72" fill="url(#${p}knurl)"/>
      <circle cx="${cx}" cy="${cy - 6}" r="68.5" fill="none" stroke="#5f6368" stroke-width="7"
              pathLength="100" stroke-dasharray=".5 .5" opacity=".8"/>
    </g>
    <circle class="kl-knob-face" cx="${cx}" cy="${cy + 6}" r="64" fill="url(#${p}knobFace)" stroke="#8f9398" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy + 6}" r="57" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy + 6}" r="59" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="1.5"/>
  </g>
</svg>`;
  }

  class Lockey2930Keypad extends HTMLElement {
    get controls() { return CONTROLS; }

    connectedCallback() {
      if (this._svg) return;
      if (!document.getElementById('lockey-2930-keypad-css')) {
        const style = document.createElement('style');
        style.id = 'lockey-2930-keypad-css';
        style.textContent = CSS;
        document.head.prepend(style); // page styles win over these defaults
      }
      const prefix = `kl${++instance}-`;
      this.innerHTML = lockSvg(prefix);
      this._svg = this.querySelector('svg');
      this._knob = this._svg.querySelector('.kl-knob');
      this._keys = new Map([...this._svg.querySelectorAll('.kl-key')].map(el => [el.dataset.key, el]));
      this._held = new Set();      // button ids currently down
      this._pointers = new Map();  // pointerId -> button id
      this._tapTimers = new Map(); // button id -> pending up()

      this._svg.addEventListener('pointerdown', e => this._onPointerDown(e));
      this._svg.addEventListener('keydown', e => this._onKeyDown(e));
      this._svg.addEventListener('contextmenu', e => e.preventDefault());
      this._onPointerUp = e => this._onPointerRelease(e);
      window.addEventListener('pointerup', this._onPointerUp);
      window.addEventListener('pointercancel', this._onPointerUp);
    }

    disconnectedCallback() {
      window.removeEventListener('pointerup', this._onPointerUp);
      window.removeEventListener('pointercancel', this._onPointerUp);
    }

    down(id) {
      const el = this._keys?.get(id);
      if (!el || this._held.has(id)) return;
      this._held.add(id);
      el.classList.add('down');
      this._emit(id, 'button', 'down');
    }

    up(id) {
      if (!this._held?.delete(id)) return;
      this._keys.get(id).classList.remove('down');
      this._emit(id, 'button', 'up');
    }

    tap(id) {
      this.down(id);
      clearTimeout(this._tapTimers.get(id));
      this._tapTimers.set(id, setTimeout(() => this.up(id), PRESS_MS));
    }

    turn(id = 'knob') {
      if (id === 'knob' && this._svg) this._emit('knob', 'knob', 'turn');
    }

    setPushedIn(ids) {
      const pushed = new Set(ids);
      this._keys?.forEach((el, id) => el.classList.toggle('in', pushed.has(id)));
    }

    spinKnob(turned) {
      const knob = this._knob;
      if (!knob) return;
      knob.classList.remove('turned', 'caught');
      void knob.getBoundingClientRect(); // restart the animation
      knob.classList.add(turned ? 'turned' : 'caught');
    }

    _onPointerDown(e) {
      if (e.button !== 0) return;
      const target = e.target.closest('.kl-key, .kl-knob');
      if (!target) return;
      e.preventDefault(); // no focus ring / text selection on tap
      if (target === this._knob) { this.turn(); return; }
      this._pointers.set(e.pointerId, target.dataset.key);
      this.down(target.dataset.key);
    }

    _onPointerRelease(e) {
      const id = this._pointers.get(e.pointerId);
      if (id === undefined) return;
      this._pointers.delete(e.pointerId);
      if (![...this._pointers.values()].includes(id)) this.up(id);
    }

    _onKeyDown(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest('.kl-key, .kl-knob');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (target === this._knob) this.turn();
      else this.tap(target.dataset.key);
    }

    _emit(id, kind, action) {
      this.dispatchEvent(new CustomEvent('lock-input', {
        detail: { id, kind, action, t: performance.now() }, bubbles: true, composed: true,
      }));
    }
  }

  customElements.define('lockey-2930-keypad', Lockey2930Keypad);
})();
