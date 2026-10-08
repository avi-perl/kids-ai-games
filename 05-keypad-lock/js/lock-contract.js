// Lock contract — shared by every lock, so a page can swap one lock for another.
//
// A lock comes in two layers:
//
// 1. INPUT SURFACE — the physical controls, drawn and touchable, with no rules.
//    e.g. <lockey-2930-keypad>
//      surface.controls              [{ id, kind: 'button' | 'knob', label }]
//      surface.down(id) / .up(id)    push / release a button
//      surface.tap(id)               down, then up a moment later
//      surface.turn(id)              try to turn a knob
//      event 'lock-input'            detail { id, kind, action: 'down' | 'up' | 'turn', t }
//    It reports what was physically done, never what it means. Buttons pressed together show
//    up as overlapping down/up pairs, so a lock where timing matters can see it.
//
// 2. LOCK — a surface plus the real lock's rules. This is what pages use.
//    e.g. <lockey-2930-lock code="2367">
//      lock.info                     { model, maker, controls, code: { buttons, minLength, maxLength, ordered, repeats }, rules }
//      lock.code                     the correct passcode (also the `code` attribute); setting an invalid one throws
//      lock.validateCode(code)       → { ok, code, error }  — `code` comes back normalized
//      lock.state                    → { locked, ...model-specific details }
//      lock.input(id, action)        one raw input, exactly as if a finger did it
//      lock.turn()                   try the knob → { opened, reason, message, state }
//      lock.reset()                  clear everything that's been pressed; keeps the code
//      events (all bubble):
//        'lock-input'    detail = the surface's input
//        'lock-change'   detail { state }                            whenever state changes
//        'lock-attempt'  detail { opened, reason, message, state }   every try at opening it
//
// Each lock's rules live in a DOM-free class (runs in Node) that LockElement drives:
//      Rules.info   Rules.validateCode(raw)   new Rules(code)
//      rules.code   rules.setCode(raw)   rules.state   rules.reset()
//      rules.input({ id, kind, action }) → { opened, reason, message } for an open attempt, else null

// Base for every <…-lock> element. A subclass sets `static Rules` (its rules class) and
// `static surfaceTag` (its input surface element), then calls `Subclass.define('tag-name')`.
class LockElement extends HTMLElement {
  static observedAttributes = ['code'];

  static define(tag) {
    const style = document.createElement('style');
    style.textContent = `:where(${tag}) { display: inline-block; width: 200px; }`;
    document.head.prepend(style); // page styles win over these defaults
    customElements.define(tag, this);
  }

  constructor() {
    super();
    this._rules = new this.constructor.Rules();
    this._lastAttempt = null;
  }

  connectedCallback() {
    if (this._surface) return;
    this._surface = document.createElement(this.constructor.surfaceTag);
    this._surface.style.cssText = 'display:block;width:100%';
    this._surface.addEventListener('lock-input', e => {
      e.stopPropagation(); // re-sent from the lock itself, in order with the events it causes
      this._handle(e.detail);
    });
    this.append(this._surface);
    this.showState(this.state);
  }

  attributeChangedCallback(name, old, value) {
    if (name !== 'code' || value === this.code) return;
    try { this.code = value; } catch (err) { console.error(`<${this.localName} code="${value}">: ${err.message}`); }
  }

  get info() { return this.constructor.Rules.info; }
  get code() { return this._rules.code; }
  set code(value) { this._rules.setCode(value); this._stateChanged(); }
  get state() { return this._rules.state; }
  validateCode(code) { return this.constructor.Rules.validateCode(code); }

  input(id, action) {
    if (!['down', 'up', 'turn'].includes(action)) throw new Error(`Unknown action "${action}".`);
    const control = this.info.controls.find(c => c.id === id);
    if (!control) throw new Error(`There's no "${id}" control on this lock.`);
    if (this._surface) this._surface[action](id); // the surface shows it, then reports back
    else this._handle({ id, kind: control.kind, action, t: performance.now() });
  }

  turn(id = this.info.controls.find(c => c.kind === 'knob').id) {
    this._lastAttempt = null;
    this.input(id, 'turn');
    return this._lastAttempt;
  }

  reset() {
    this._rules.reset();
    this._lastAttempt = null;
    this._stateChanged();
  }

  // Subclasses override to make the surface show the lock's state (e.g. buttons staying pushed in)…
  showState(state) {}
  // …and to animate it after an attempt (e.g. the knob turning or catching).
  showAttempt(input, attempt) {}

  _stateChanged() {
    const state = this.state;
    this.showState(state);
    this._emit('lock-change', { state });
  }

  _handle(input) {
    const before = JSON.stringify(this._rules.state);
    this._emit('lock-input', input);
    const attempt = this._rules.input(input);
    if (JSON.stringify(this._rules.state) !== before) this._stateChanged();
    if (attempt) {
      this._lastAttempt = { ...attempt, state: this._rules.state };
      this.showAttempt(input, attempt);
      this._emit('lock-attempt', this._lastAttempt);
    }
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}
