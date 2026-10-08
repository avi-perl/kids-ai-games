// Lockey 2930 rules — what makes the real lock open or stay shut. No DOM, so it also runs in Node.
// Implements the rules side of lock-contract.js.
//
// From LockeyUSA's instructions and Locksmith Ledger's review of the Lockey 2835 DC, which has the
// same 14-button keypad and tumbler chamber:
// • Buttons 1–0, X, Y, Z, C. A code uses 1–0, X and Z, each at most once. Y is the passage
//   button and C clears; neither can be in a code.
// • Each button pushes in its own tumbler, which stays in until C. So the code is the SET of
//   tumblers that are in: order doesn't matter and pressing a button twice changes nothing.
//   Pressing buttons together is the same as one after another (inferred from that design).
// • The knob turns only if exactly the code's tumblers are in. A wrong button blocks it until C.
// • The knob "can be rotated only once" per code entry: turning it drops the tumblers back out
//   (that this is what resets it is inferred).
// • Passage: Y pushed in along with the code holds the lock open — the knob turns every time —
//   until C ("C, Y, code" to turn it on; "Y, then C" to lock again).
// • Code length 2–7 with the tumblers in the box, 0–9 with Lockey's tumbler kit.
const Lockey2930Rules = (() => {
  const BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'X', 'Y', 'Z', 'C'];
  const CODE_BUTTONS = BUTTONS.filter(b => b !== 'Y' && b !== 'C');
  const MIN_LENGTH = 0, MAX_LENGTH = 9;

  const info = {
    model: 'Lockey 2930',
    maker: 'LockeyUSA',
    controls: [
      ...BUTTONS.map(id => ({ id, kind: 'button', label: id })),
      { id: 'knob', kind: 'knob', label: 'Knob' },
    ],
    code: { buttons: CODE_BUTTONS, minLength: MIN_LENGTH, maxLength: MAX_LENGTH, ordered: false, repeats: false },
    rules: [
      'Press C to clear, then the code buttons in any order, then turn the knob.',
      'Each button pushes in its own tumbler, which stays in until C — pressing a button twice does nothing.',
      'Pressing buttons together counts the same as one at a time (inferred from the design).',
      'The knob turns only if exactly the code\'s tumblers are in. One wrong button blocks it until C.',
      'Turning the knob drops the tumblers back out, so the code is needed again next time (inferred).',
      'Passage: press Y along with the code and the knob turns every time, until C. Press Y then C to lock it again.',
      'Codes use 1–0, X and Z, each once: 2–7 buttons with the tumblers in the box, 0–9 with Lockey\'s tumbler kit.',
    ],
  };

  const inOrder = ids => BUTTONS.filter(b => ids.has(b));

  class Lockey2930Rules {
    static info = info;

    static validateCode(raw) {
      const chars = String(raw ?? '').toUpperCase().replace(/[\s,.\-+]/g, '');
      const seen = new Set();
      for (const ch of chars) {
        if (ch === 'Y') return { ok: false, error: 'Y can\'t be in a code — it\'s the passage button.' };
        if (ch === 'C') return { ok: false, error: 'C can\'t be in a code — it\'s the clear button.' };
        if (!CODE_BUTTONS.includes(ch)) return { ok: false, error: `There's no "${ch}" button. Codes use 1–0, X and Z.` };
        if (seen.has(ch)) return { ok: false, error: `${ch} is in there twice — each button can only be in a code once.` };
        seen.add(ch);
      }
      if (seen.size < MIN_LENGTH || seen.size > MAX_LENGTH) {
        return { ok: false, error: `Codes are ${MIN_LENGTH}–${MAX_LENGTH} buttons long.` };
      }
      return { ok: true, code: inOrder(seen).join('') };
    }

    constructor(code = '') {
      this._seated = new Set();
      this.setCode(code);
    }

    get code() { return inOrder(this._code).join(''); }

    setCode(raw) {
      const v = Lockey2930Rules.validateCode(raw);
      if (!v.ok) throw new Error(v.error);
      this._code = new Set(v.code);
      this._seated.clear(); // re-coding means taking the lock apart with C held down
    }

    reset() { this._seated.clear(); }

    get state() {
      const { ok } = this._check();
      return { locked: !ok, passage: ok && this._seated.has('Y'), seated: inOrder(this._seated) };
    }

    input({ id, action }) {
      if (action === 'down') {
        if (id === 'C') this._seated.clear();
        else if (BUTTONS.includes(id)) this._seated.add(id);
        return null;
      }
      if (action === 'turn') return this._turn();
      return null; // 'up': the button springs back out, but its tumbler stays in
    }

    _check() {
      const wrong = [...this._seated].filter(b => b !== 'Y' && !this._code.has(b));
      const missing = [...this._code].filter(b => !this._seated.has(b));
      return { ok: !wrong.length && !missing.length, wrong: inOrder(new Set(wrong)), missing: inOrder(new Set(missing)) };
    }

    _turn() {
      const { ok, wrong, missing } = this._check();
      if (ok && this._seated.has('Y')) {
        return { opened: true, reason: 'passage', message: 'Passage mode — it stays unlocked until C.' };
      }
      if (ok) {
        this._seated.clear();
        return { opened: true, reason: 'code', message: 'The tumblers dropped back out.' };
      }
      const parts = [];
      if (wrong.length) parts.push(`wrong button pushed in: ${wrong.join(' ')} — press C and start over`);
      if (missing.length) parts.push(`not pushed in: ${missing.join(' ')}`);
      return { opened: false, reason: wrong.length ? 'wrong' : 'incomplete', wrong, missing, message: parts.join('; ') + '.' };
    }
  }

  return Lockey2930Rules;
})();

if (typeof module !== 'undefined') module.exports = Lockey2930Rules;
