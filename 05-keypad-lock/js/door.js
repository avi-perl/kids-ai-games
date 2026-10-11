// The Door — wires the page together: lock feedback, the note photo, the message once it opens
// and the sound switch.
const WIDE = matchMedia('(min-width: 760px) and (min-aspect-ratio: 1/1)'); // keep in sync with the CSS

const lock = document.getElementById('lock');
const note = document.getElementById('note');
const soundBtn = document.getElementById('sound');
let message = NoteLink.MESSAGE; // shown once it opens
let photo = 'door.jpg'; // the note's photo (or a promise of it), to share once it opens
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
  photo = new Promise(done => {
    const blank = new Image();
    blank.onload = async () => {
      const url = await NoteText.paintURL(blank, custom.text);
      if (!solved) note.style.backgroundImage = `url(${url})`;
      done(url);
    };
    blank.onerror = () => done('door-blank.jpg');
    blank.src = 'door-blank.jpg';
  });
});

// Opening another link while already on the door only changes the part after "#": start over.
addEventListener('hashchange', () => location.reload());

// Every button press clicks.
lock.addEventListener('lock-input', e => {
  if (e.detail.action === 'down') Sound.click();
});

// A wrong try flashes red around the lock. The right one lights it green for good, and the note
// gives way to the message, with a button to send the door to someone else.
lock.addEventListener('lock-attempt', e => {
  if (solved) return;
  lock.classList.remove('wrong');
  void lock.offsetWidth; // restart the animation
  if (e.detail.opened) solve();
  else lock.classList.add('wrong');
});

const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

function solve() {
  solved = true;
  lock.classList.add('solved');
  // The note is a button, and buttons can't hold the share button: a card takes its place.
  const card = document.createElement('div');
  card.className = 'note solved';
  card.setAttribute('role', 'status');
  const text = card.appendChild(document.createElement('span'));
  text.className = 'message';
  text.textContent = message;
  const share = card.appendChild(document.createElement('button'));
  share.className = 'share';
  share.type = 'button';
  share.innerHTML = `${SHARE_ICON}<span>Share</span>`;
  // The photo is made into a file now, so a tap on Share can open the share sheet at once
  // (browsers only let a share start right after the tap).
  let file = null;
  Promise.resolve(photo).then(src => fetch(src)).then(res => res.blob())
    .then(blob => { file = new File([blob], 'the-door.jpg', { type: 'image/jpeg' }); })
    .catch(() => {});
  share.addEventListener('click', () => shareDoor(share.lastChild, file));
  note.replaceWith(card);
}

// The phone's own share sheet: the note's photo with this door's short link as its text (/#…,
// which holds only a hash of the code). Without image sharing, just the link; without a share
// sheet at all, the link is copied.
async function shareDoor(label, file) {
  const link = location.hash.length > 1 || location.search.length > 1;
  const url = link ? new URL(`../${location.search}${location.hash}`, location.href).href : location.href;
  const data = file && navigator.canShare?.({ files: [file] })
    ? { files: [file], title: 'The Door', text: url }
    : { title: 'The Door', text: 'Can you open the door?', url };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // they closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    label.textContent = 'Link copied';
    setTimeout(() => (label.textContent = 'Share'), 1800);
  } catch {
    prompt('Copy this link:', url);
  }
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
