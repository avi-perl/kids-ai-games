// Make a Door — write the note and its answer, watch it appear on the photo, copy the link.
const note = document.getElementById('note');
const textIn = document.getElementById('text');
const codeIn = document.getElementById('code');
const codeHint = document.getElementById('code-hint');
const linkOut = document.getElementById('link');
const copyBtn = document.getElementById('copy');
const tryLink = document.getElementById('try');

const { buttons, maxLength } = Lockey2930Rules.info.code;
const DRAFT = 'door-maker-draft';

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

// The link, rebuilt on every change; only the newest one is shown.
let linkJob = 0;
async function makeLink() {
  const mine = ++linkJob;
  const payload = await NoteLink.encode({ code: codeIn.value, text: textIn.value });
  if (mine !== linkJob) return;
  const href = new URL(`../?${payload}`, location.href).href;
  linkOut.value = href;
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

function changed() {
  makeLink();
  clearTimeout(paintTimer);
  paintTimer = setTimeout(paint, 250);
  try { localStorage.setItem(DRAFT, JSON.stringify({ text: textIn.value, code: codeIn.value })); } catch {}
}

textIn.addEventListener('input', changed);
codeIn.addEventListener('input', () => { cleanCode(); changed(); });

note.addEventListener('click', () => {
  note.setAttribute('aria-expanded', String(note.classList.toggle('open')));
});

linkOut.addEventListener('focus', () => linkOut.select());
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(linkOut.value);
  } catch {
    linkOut.select();
    document.execCommand('copy');
  }
  copyBtn.textContent = 'Copied';
  setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
});

// Pick up where the last visit left off.
try {
  const draft = JSON.parse(localStorage.getItem(DRAFT));
  if (draft) { textIn.value = draft.text ?? ''; codeIn.value = draft.code ?? ''; cleanCode(); }
} catch {}
makeLink();
paint();
