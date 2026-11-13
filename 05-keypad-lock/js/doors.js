// Your Doors — the doors this browser made (js/saved-doors.js), newest first: tap one to open it,
// or Edit to change it in make.html. Needs the server; without it, says so and lists nothing.
import { SavedDoors } from './saved-doors.js';

const status = document.getElementById('status');
const list = document.getElementById('doors');

function row(door, payload) {
  const li = document.createElement('li');
  li.className = 'door';
  const open = li.appendChild(document.createElement('a'));
  open.className = 'open';
  open.href = `./#${payload}`;
  const words = open.appendChild(document.createElement('span'));
  words.className = 'words';
  words.dir = 'auto';
  words.textContent = NoteText.plain(door.text) || 'A blank note';
  const answer = open.appendChild(document.createElement('span'));
  answer.className = 'answer';
  answer.textContent = `Answer: ${door.code}`;
  if (door.link) {
    const short = open.appendChild(document.createElement('span'));
    short.className = 'answer';
    short.textContent = door.link.replace(/^https?:\/\//, '');
  }
  const edit = li.appendChild(document.createElement('a'));
  edit.className = 'button';
  edit.href = `make.html?edit=${encodeURIComponent(door.id)}`;
  edit.textContent = 'Edit';
  return li;
}

if (!SavedDoors.member) {
  status.textContent = "You haven't made a door yet. Make one, copy its link, and it shows up here.";
} else {
  try {
    const doors = await SavedDoors.list();
    const payloads = await Promise.all(doors.map(door => NoteLink.encode(door)));
    list.replaceChildren(...doors.map((door, i) => row(door, payloads[i])));
    status.textContent = doors.length ? '' : 'No doors yet.';
  } catch {
    status.textContent = "Can't reach the server right now, so your doors can't be shown.";
  }
}
