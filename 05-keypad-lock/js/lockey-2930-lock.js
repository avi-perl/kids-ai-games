// <lockey-2930-lock code="1560"> — a complete Lockey 2930: the keypad plus the real lock's rules.
// Its API and events are the common lock contract (lock-contract.js).
class Lockey2930Lock extends LockElement {
  static Rules = Lockey2930Rules;
  static surfaceTag = 'lockey-2930-keypad';

  // Our version keeps pushed buttons visibly in until C (or the knob opening) drops the tumblers.
  showState(state) {
    this._surface?.setPushedIn(state.seated);
  }

  showAttempt(input, attempt) {
    if (input.kind === 'knob') this._surface?.spinKnob(attempt.opened);
  }
}

Lockey2930Lock.define('lockey-2930-lock');
