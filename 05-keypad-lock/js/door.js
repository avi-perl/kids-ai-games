// The Door — wires the page together: lock feedback, the note photo, the message once it opens
// and the sound switch.
const WIDE = matchMedia('(min-width: 760px) and (min-aspect-ratio: 1/1)'); // keep in sync with the CSS

const lock = document.getElementById('lock');
const note = document.getElementById('note');
const soundBtn = document.getElementById('sound');
let message = NoteLink.MESSAGE; // shown once it opens
let solved = false;

// A link can set the code and print its own words on the note (#… or, from before, ?…; see note-link.js).
NoteLink.read(location).then(custom => {
  if (!custom) return document.documentElement.classList.remove('custom-note'); // not one of ours: the usual note
  if (custom.opens) {
    lock.codeCheck = custom.opens; // the link only has a hash of the code
    lock.removeAttribute('code'); // not the usual note's code either
  } else {
    lock.code = custom.code;
  }
  message = custom.message;
  note.setAttribute('aria-label', `Note on the door: ${NoteText.plain(custom.text)}`);
  const blank = new Image();
  blank.onload = async () => {
    const url = await NoteText.paintURL(blank, custom.text);
    if (!solved) note.style.backgroundImage = `url(${url})`;
  };
  blank.src = 'door-blank.jpg';
});

// Opening another link while already on the door only changes the part after "#": start over.
addEventListener('hashchange', () => location.reload());

// Every button press clicks.
lock.addEventListener('lock-input', e => {
  if (e.detail.action === 'down') Sound.click();
});

// A wrong try flashes red around the lock. The right one lights it green for good, and the note
// gives way to the message.
lock.addEventListener('lock-attempt', e => {
  if (solved) return;
  lock.classList.remove('wrong');
  void lock.offsetWidth; // restart the animation
  if (e.detail.opened) solve();
  else lock.classList.add('wrong');
});

function solve() {
  solved = true;
  lock.classList.add('solved');
  const text = document.createElement('span');
  text.className = 'message';
  text.textContent = message;
  note.style.backgroundImage = '';
  note.classList.remove('open');
  note.classList.add('solved');
  note.setAttribute('aria-expanded', 'false');
  note.setAttribute('aria-label', message);
  note.replaceChildren(text);
}

// Tap the note to grow it to the whole photo, tap again to shrink it (wide screens show it whole).
note.addEventListener('click', () => {
  if (WIDE.matches || solved) return;
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
