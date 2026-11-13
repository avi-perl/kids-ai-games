// The Door, for whoever made doors here: "your doors" beside "make your own", and Edit beside Share
// when this door is one of them (js/saved-doors.js). Both wait for the server, and stay greyed out
// while it can't be reached. A browser that never made a door shows neither, and asks nothing.
// On one of your doors with a short link, Share hands out that link (door.js reads it).
import { SavedDoors } from './saved-doors.js';

const listLink = document.getElementById('my-doors');
const editBtn = document.getElementById('edit');
const OFFLINE = "Can't reach the server right now";

if (SavedDoors.member) {
  const link = await NoteLink.read(location); // null on the usual door
  const show = (doors, reached) => {
    listLink.hidden = false;
    if (reached) listLink.setAttribute('href', 'doors.html');
    else listLink.removeAttribute('href');
    listLink.title = reached === false ? OFFLINE : '';
    const mine = link && doors.find(door => SavedDoors.is(link, door));
    editBtn.hidden = !mine;
    editBtn.disabled = !reached;
    editBtn.title = reached === false ? OFFLINE : '';
    editBtn.dataset.id = mine?.id ?? '';
    if (mine?.link) document.documentElement.dataset.shortLink = mine.link;
    else delete document.documentElement.dataset.shortLink;
  };
  show(SavedDoors.cached(), null); // as last listed, greyed out until the server answers
  SavedDoors.list().then(doors => show(doors, true), () => show(SavedDoors.cached(), false));
}

editBtn.addEventListener('click', () => {
  location.href = `make.html?edit=${encodeURIComponent(editBtn.dataset.id)}`;
});
