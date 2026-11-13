// Saved doors — the doors this browser made, kept in The Door's qerl.app applet (js/applets.js is
// that project's client, copied as it is). The applet has one record type, "doors": the note's
// text, the code, the message and the door's short link, private, so only the browser that made
// them can read them back. A browser becomes a member of the applet the first time it saves a
// door, and not before.
//
// Which applet comes from js/applet-config.js: the published one, or on a local address the one in
// js/applet.local.js (git-ignored), `export default { endpoint, apiKey, secret }`, from a local
// url-short manage server. When the server can't be reached, nothing is saved and list() and
// save() reject, as they do offline.
//
// Short links need a secret the applet's owner let make them, which never goes in the code:
// they hand it out as a setup link, make.html#maker=<secret>, and this browser keeps it. Without
// one doors save with their long link only.
import { connect } from './applets.js';
import config from './applet-config.js';

const applet = config ? connect(config) : null;
const offline = () => Promise.reject(new Error('No applet is set up (js/applet-config.js).'));

const TYPE = 'doors';
const CACHE = 'saved-doors'; // the last list the server gave, so the door can tell it's yours offline
const MAKER = 'door-maker-secret';

// A setup link leaves its secret here for good, if it's one of this applet's.
if (location.hash.startsWith('#maker=')) {
  const secret = decodeURIComponent(location.hash.slice('#maker='.length));
  if (config && secret.split('.')[0] === config.secret.split('.')[0]) {
    try { localStorage.setItem(MAKER, secret); } catch {}
  }
  history.replaceState(null, '', location.pathname + location.search);
}
const maker = (() => { try { return localStorage.getItem(MAKER); } catch { return null; } })();
// Short links go through the maker's secret when there is one (connected when needed, so it sees
// the member this browser has by then). Records always use the site's.
const linker = () => (maker ? connect({ ...config, secret: maker }) : applet);

const toDoor = record => ({ id: record.id, text: '', code: '', message: '', link: '', ...record.data });

export const SavedDoors = {
  // Whether this browser has saved a door (and so is a member of the applet).
  get member() {
    return Boolean(applet?.member);
  },

  // All of this browser's doors, newest first. Rejects when the server can't be reached.
  async list() {
    if (!applet) return offline();
    const doors = [];
    let nextToken;
    do {
      const page = await applet.records(TYPE, { limit: 100, nextToken });
      doors.push(...page.items.map(toDoor));
      nextToken = page.nextToken;
    } while (nextToken);
    try { localStorage.setItem(CACHE, JSON.stringify(doors)); } catch {}
    return doors;
  },

  // The doors as the server last listed them (maybe stale, maybe empty).
  cached() {
    try { return JSON.parse(localStorage.getItem(CACHE)) ?? []; } catch { return []; }
  },

  // Saves { text, code, message, link } as a new door, or over the door with that id, and points its
  // short link (`link`, made now if it has none) at `url`, the door's long link. Joins the applet
  // first if this browser hasn't yet. Rejects when the server can't be reached; a short link the
  // server won't make just leaves the door without one.
  async save(door, id, url) {
    if (!applet) return offline();
    if (!applet.member) await applet.register({});
    let link = door.link || '';
    if (url) {
      const code = link ? link.slice(link.lastIndexOf('/') + 1) : undefined;
      try {
        link = (await (code ? linker().updateLink(code, url) : linker().createLink(url))).shortUrl;
      } catch (err) {
        if (err.type === 'NetworkError' || err.type === 'HttpError') throw err;
        // Its link is gone (or was never this browser's): it gets a new one.
        if (err.type === 'NotFound' && code) link = await linker().createLink(url).then(l => l.shortUrl, () => link);
      }
    }
    const data = { text: door.text, code: door.code, message: door.message, ...(link ? { link } : {}) };
    return toDoor(await applet.put(TYPE, data, id ? { id } : {}));
  },

  // Whether a door link (what NoteLink.read gives) is this saved door.
  is(link, door) {
    return Boolean(link?.opens) && link.text === door.text && link.opens(door.code)
      && link.message(door.code) === (door.message.trim() || NoteLink.MESSAGE);
  },
};
