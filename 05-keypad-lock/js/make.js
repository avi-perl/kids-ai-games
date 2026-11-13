// Make a Door — write the note and its answer, watch it appear on the photo, copy the link.
// Copying the link or trying it keeps the door in "your doors" (js/saved-doors.js), with a short
// link when this browser may make them; make.html?edit=<id> opens one of those to change it.
import { SavedDoors } from './saved-doors.js';

const note = document.getElementById('note');
const textIn = document.getElementById('text');
const codeIn = document.getElementById('code');
const codeHint = document.getElementById('code-hint');
const messageIn = document.getElementById('message');
const linkOut = document.getElementById('link');
const copyBtn = document.getElementById('copy');
const tryLink = document.getElementById('try');
const savedHint = document.getElementById('saved');

const { buttons, maxLength } = Lockey2930Rules.info.code;
const DRAFT = 'door-maker-draft';
const editId = new URLSearchParams(location.search).get('edit');

// The answer only takes the lock's code buttons, each once, as many as the lock holds.
function cleanCode() {
  const typed = codeIn.value.toUpperCase().replace(/\s/g, '');
  const keep = new Set();
  for (const ch of typed) if (buttons.includes(ch) && keep.size < maxLength) keep.add(ch);
  const clean = [...keep].join('');
  if (clean === codeIn.value) return;
  codeIn.value = clean;
  if (clean !== typed) { // something was turned away: point at the rule
    codeHint.classList.add('warn');
    clearTimeout(cleanCode.timer);
    cleanCode.timer = setTimeout(() => codeHint.classList.remove('warn'), 1200);
  }
}

// The link, rebuilt on every change; only the newest one is shown. Once the door has a short
// link, that's the one to hand out: saving points it at the newest long one.
let linkJob = 0, shortLink = null;
const longLink = async door => new URL(`../#${await NoteLink.encode(door)}`, location.href).href;
async function makeLink() {
  const mine = ++linkJob;
  const href = await longLink({ code: codeIn.value, text: textIn.value, message: messageIn.value });
  if (mine !== linkJob) return;
  linkOut.value = shortLink || href;
  tryLink.href = href;
}

// The note on the photo, repainted a moment after typing stops.
const blank = new Promise(res => { const img = new Image(); img.onload = () => res(img); img.src = 'door-blank.jpg'; });
let shown = null, paintJob = 0, painted = null, paintTimer;
async function paint() {
  const text = textIn.value;
  if (text === shown) return;
  shown = text;
  const mine = ++paintJob;
  const url = text.trim() ? await NoteText.paintURL(await blank, text) : null;
  if (mine !== paintJob) { if (url) URL.revokeObjectURL(url); return; }
  if (painted) URL.revokeObjectURL(painted);
  painted = url;
  note.style.backgroundImage = url ? `url(${url})` : '';
}

// --- Your doors -------------------------------------------------------------------------------
// A door is kept once its link leaves the page (Copy, Try it). Within one visit it's the same door
// however often it's copied; a door opened with ?edit=<id> is that one. Without the server, the
// link still works, and the hint says it wasn't kept.
let editing = null; // the saved door these fields are, once there is one
let savedAs = null; // what it was saved with, to skip saving it again unchanged
let touched = false; // whether they've typed anything this visit
const current = () => ({ text: textIn.value, code: codeIn.value, message: messageIn.value });
const same = (a, b) => a.text === b.text && a.code === b.code && a.message === b.message;

function say(state) {
  say.state = state;
  savedHint.textContent = {
    idle: 'Copying it or trying it keeps it in your doors.',
    changed: 'Copy it or try it again to keep the changes.',
    saving: 'Keeping it in your doors…',
    offline: "Can't reach the server, so it isn't kept in your doors.",
    missing: "That door isn't in your doors any more.",
  }[state] ?? '';
  if (state === 'saved') {
    savedHint.innerHTML = `Kept in <a href="doors.html">your doors</a>.${shortLink ? ' Its short link follows your changes.' : ''}`;
  }
}

let saving = Promise.resolve();
const save = () => (saving = saving.then(saveNow)); // one at a time, so a double tap joins once
async function saveNow() {
  const door = current();
  if (!door.text.trim() || !door.code) return;
  if (savedAs && same(door, savedAs)) return say('saved');
  say('saving');
  try {
    // A door that's already kept, word for word, isn't kept twice.
    if (!editing && SavedDoors.member) {
      const kept = (await SavedDoors.list()).find(d => same(d, door));
      if (kept) { editing = kept.id; shortLink = kept.link || null; }
    }
    const saved = await SavedDoors.save({ ...door, link: shortLink }, editing, await longLink(door));
    editing = saved.id;
    shortLink = saved.link || null;
    savedAs = door;
    say('saved');
    makeLink();
  } catch {
    say('offline');
  }
}

function changed() {
  touched = true;
  makeLink();
  clearTimeout(paintTimer);
  paintTimer = setTimeout(paint, 250);
  if (say.state === 'saved') say('changed');
  // The draft is the door being made from scratch; editing a kept door leaves it be.
  if (!editId) try { localStorage.setItem(DRAFT, JSON.stringify(current())); } catch {}
}

textIn.addEventListener('input', changed);
messageIn.addEventListener('input', changed);
codeIn.addEventListener('input', () => { cleanCode(); changed(); });

note.addEventListener('click', () => {
  note.setAttribute('aria-expanded', String(note.classList.toggle('open')));
});

linkOut.addEventListener('focus', () => linkOut.select());
copyBtn.addEventListener('click', async () => {
  // A door with a short link copies it at once (the save re-points it); a new door's comes from
  // the save, so the clipboard is handed a promise of it while the tap still counts.
  const saved = save();
  const text = shortLink ? Promise.resolve(shortLink) : saved.then(() => shortLink || linkOut.value);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(t => new Blob([t], { type: 'text/plain' })) })]);
  } catch {
    try {
      await navigator.clipboard.writeText(await text);
    } catch {
      linkOut.select();
      document.execCommand('copy');
    }
  }
  copyBtn.textContent = 'Copied';
  setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
});
tryLink.addEventListener('click', save);

function fill(door) {
  textIn.value = door.text ?? ''; codeIn.value = door.code ?? ''; messageIn.value = door.message ?? '';
  cleanCode();
}

// The usual message, unless they write their own (which then rides along in the link).
messageIn.placeholder = NoteLink.MESSAGE;
document.getElementById('message-hint').textContent = `Hidden until the door opens. Leave empty for “${NoteLink.MESSAGE}”`;

if (editId) {
  // One of your doors: as it was last listed, at once, then as the server has it (unless they've
  // started changing it by then).
  const open = door => { fill(door); editing = door.id; shortLink = door.link || null; savedAs = current(); makeLink(); paint(); };
  const cached = SavedDoors.cached().find(d => d.id === editId);
  if (cached) open(cached);
  else { makeLink(); paint(); }
  SavedDoors.list().then(doors => {
    const door = doors.find(d => d.id === editId);
    if (!door) {
      editing = savedAs = shortLink = null;
      makeLink();
      return say('missing');
    }
    if (!touched) open(door);
    say(same(current(), door) ? 'saved' : 'changed');
  }, () => say('offline'));
} else {
  // Pick up where the last visit left off.
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT));
    if (draft) fill(draft);
  } catch {}
  say('idle');
  makeLink();
  paint();
}
