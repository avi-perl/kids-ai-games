// The Door — wires the page together: lock feedback, the note photo and the sound switch.
const WIDE = matchMedia('(min-width: 760px) and (min-aspect-ratio: 1/1)'); // keep in sync with the CSS

const lock = document.getElementById('lock');
const note = document.getElementById('note');
const soundBtn = document.getElementById('sound');

// Every button press clicks.
lock.addEventListener('lock-input', e => {
  if (e.detail.action === 'down') Sound.click();
});

// Right or wrong shows only as a green or red glow around the lock.
lock.addEventListener('lock-attempt', e => {
  lock.classList.remove('right', 'wrong');
  void lock.offsetWidth; // restart the animation
  lock.classList.add(e.detail.opened ? 'right' : 'wrong');
});

// Tap the note to grow it to the whole photo, tap again to shrink it (wide screens show it whole).
note.addEventListener('click', () => {
  if (WIDE.matches) return;
  note.setAttribute('aria-expanded', String(note.classList.toggle('open')));
});

function showSound() {
  soundBtn.classList.toggle('muted', Sound.muted);
  soundBtn.setAttribute('aria-pressed', String(Sound.muted));
  soundBtn.setAttribute('aria-label', Sound.muted ? 'Sound off' : 'Sound on');
}
soundBtn.addEventListener('click', () => {
  Sound.setMuted(!Sound.muted);
  showSound();
});
showSound();
