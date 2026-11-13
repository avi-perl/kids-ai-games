// Client for a url-short applet, for static sites. Copy this file into your
// site and import it:
//
//   import { connect } from './applets.js';
//
//   const applet = connect({ endpoint, apiKey, secret });  // from the applet's page
//   if (!applet.member) await applet.register({ name: 'Ada' });
//   await applet.put('notes', { title: 'Hello' });
//   const { items } = await applet.records('notes');
//   const link = await applet.createLink('https://example.com/a/long/address');  // { code, shortUrl, ... }
//   const mine = await applet.myRecords();  // and myLinks(): everything this member made
//
//   // Lists across members, of types the owner lists: all of a type's
//   // records, or one group's, by the value of the type's group field (its
//   // groupBy), newest first or in order of its sortBy field.
//   const { items: votes } = await applet.listRecords('vote', { group: pollId });
//   const { items: top } = await applet.listRecords('entry', { group: '2026-W45', limit: 10 });
//
//   // With roomsEndpoint and roomsRealtime given to connect(), and a secret
//   // that grants rooms: everyone in the room gets each message. enter()
//   // rejects with LimitReached when the room is full.
//   const room = await applet.enter(roomId, { onMessage: ({ from, name, at, data }) => {} });
//   await room.send({ text: 'Hi' });
//   room.leave();
//
// Every secret is safe to put in your site's code. Any secret can register;
// records and short links each need a secret that grants them (applet() lists
// what this one does). Secrets expire: once one has, every call rejects with
// Unauthorized until the applet's owner extends it, and the secret keeps its
// value. The member's id and secret stay in localStorage, so this browser
// stays the same member until forget() (or until its storage is cleared, which
// loses the member for good). Acting as the member takes a Cognito token,
// which lasts an hour: this file keeps it with them, signs in for a new one
// (with their id and secret) shortly before it expires, and signs in once
// more if the API refuses the token itself. Every method returns a promise,
// and rejects with an AppletError whose `type` says why: "Unauthorized" (the
// secret, or what it grants, doesn't allow it, or the member is gone),
// "TokenRefused" (the member's token, refused even after signing in again),
// "BadRequest", "LimitReached", "ConditionFailed", "NotFound", "CodeTaken",
// "AlreadyExists", ... and `info`, the API's errorInfo, where it says more
// (AlreadyExists: { recordId }). Lists come a page at a time: pass the
// nextToken you got to get the next page, until it's null. Times come as ISO
// 8601 strings; give expiresAt as one, or as a Date.

export class AppletError extends Error {
  constructor(message, type, info = null) {
    super(message);
    this.name = 'AppletError';
    this.type = type;
    this.info = info;
  }
}

const MEMBER = 'id profile createdAt updatedAt';
const RECORD = 'id type memberId data version createdAt updatedAt';
const LINK = 'code shortUrl url permanent expiresAt status version createdAt updatedAt deletedAt';
const LINK_VERSION = 'version url permanent expiresAt createdBy createdAt supersededAt';
// How long before a token expires this signs in for a new one.
const RENEW_MS = 5 * 60 * 1000;

export function connect({ endpoint, apiKey, secret, roomsEndpoint, roomsRealtime, storage = globalThis.localStorage }) {
  if (!endpoint || !apiKey || !secret) throw new AppletError('connect() needs endpoint, apiKey and secret.', 'BadRequest');
  // One member per applet per browser: { id, secret, token, expiresAt }, the
  // last being when the token expires (in ms).
  const storageKey = `applets:${secret.split('.')[0]}`;
  let member = read();
  // A sign-in under way, which calls made at the same time share.
  let signingIn = null;

  function read() {
    try {
      return JSON.parse(storage?.getItem(storageKey) ?? 'null');
    } catch {
      return null;
    }
  }

  function remember(value) {
    member = value;
    try {
      if (value) storage?.setItem(storageKey, JSON.stringify(value));
      else storage?.removeItem(storageKey);
    } catch {
      // Private browsing can refuse storage; the member lasts for this page.
    }
  }

  // One request, with the applet's secret and `auth`: the API key, or the
  // member's token.
  async function send(query, variables, auth) {
    const headers = { 'Content-Type': 'application/json', 'x-applet-secret': secret, ...auth };
    let res;
    try {
      res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    } catch {
      throw new AppletError("Can't reach the applets API.", 'NetworkError');
    }
    const body = await res.json().catch(() => null);
    const error = body?.errors?.[0];
    if (error) throw new AppletError(error.message, error.errorType ?? 'Error', error.errorInfo ?? null);
    if (!res.ok || !body?.data) throw new AppletError(`The applets API answered ${res.status}.`, 'HttpError');
    return body.data;
  }

  // Swaps the member's id and secret for a new token.
  function signIn() {
    if (!signingIn) {
      const who = member;
      signingIn = send(
        'mutation ($memberId: ID!, $secret: String!) { signIn(memberId: $memberId, secret: $secret) { token expiresAt } }',
        { memberId: who.id, secret: who.secret },
        { 'x-api-key': apiKey },
      ).then(({ signIn: { token, expiresAt } }) => {
        // Unless this browser forgot them meanwhile.
        if (member === who) remember({ id: who.id, secret: who.secret, token, expiresAt: Date.parse(expiresAt) });
      }).finally(() => {
        signingIn = null;
      });
    }
    return signingIn;
  }

  // With the API key, or as the member, with their token: signed in first
  // when it's about to expire, and again if the API refuses the
  // token itself. That's TokenRefused from the applet's checks, or AppSync's
  // own refusal (expired, say: a 401, as UnauthorizedException). Other
  // refusals, such as a secret that doesn't grant the feature, would come
  // back the same after signing in.
  // The member's token, signed in for a new one first if it's about to
  // expire (or with `force`).
  async function freshToken({ force = false } = {}) {
    if (!member) throw new AppletError("This browser isn't a member yet: call register() first.", 'Unauthorized');
    if (force || !(member.expiresAt - Date.now() > RENEW_MS)) await signIn();
    return member.token;
  }

  async function call(query, variables = {}, { needsMember = false } = {}) {
    if (!needsMember) return send(query, variables, { 'x-api-key': apiKey });
    if (!member) throw new AppletError("This browser isn't a member yet: call register() first.", 'Unauthorized');
    let fresh = false;
    if (!(member.expiresAt - Date.now() > RENEW_MS)) {
      await signIn();
      fresh = true;
    }
    try {
      return await send(query, variables, { Authorization: member.token });
    } catch (err) {
      // A token it just got would be refused again.
      if (fresh || (err.type !== 'TokenRefused' && err.type !== 'UnauthorizedException')) throw err;
      await signIn();
      return send(query, variables, { Authorization: member.token });
    }
  }

  return {
    // { id } once this browser has registered, else null.
    get member() {
      return member ? { id: member.id } : null;
    },

    // The applet's name, its profile fields, its record types as
    // { name: { visibility, listed, maxPerMember, fields } }, and the features
    // this secret grants ("records", "links", "rooms").
    async applet() {
      const { applet } = await call('query { applet { id name profile types features } }');
      return { ...applet, profile: json(applet.profile), types: json(applet.types) };
    },

    // Makes this browser a member, with a profile that fits the applet's
    // profile fields. Only the member (and the applet's owner) sees it.
    async register(profile = {}) {
      const { register } = await call(
        `mutation ($profile: AWSJSON) { register(profile: $profile) { secret token expiresAt member { ${MEMBER} } } }`,
        { profile: JSON.stringify(profile) },
      );
      remember({ id: register.member.id, secret: register.secret, token: register.token, expiresAt: Date.parse(register.expiresAt) });
      return toMember(register.member);
    },

    async me() {
      const { me } = await call(`query { me { ${MEMBER} } }`, {}, { needsMember: true });
      return toMember(me);
    },

    // Replaces the whole profile.
    async updateProfile(profile) {
      const { updateProfile } = await call(
        `mutation ($profile: AWSJSON!) { updateProfile(profile: $profile) { ${MEMBER} } }`,
        { profile: JSON.stringify(profile) },
        { needsMember: true },
      );
      return toMember(updateProfile);
    },

    // Your records of a type, or (with memberId) another member's records of
    // a public type that isn't grouped. Newest first.
    async records(type, { memberId, limit, nextToken } = {}) {
      const { records } = await call(
        `query ($type: String!, $memberId: ID, $limit: Int, $nextToken: String) {
          records(type: $type, memberId: $memberId, limit: $limit, nextToken: $nextToken) { items { ${RECORD} } nextToken }
        }`,
        { type, memberId, limit, nextToken },
        { needsMember: !memberId },
      );
      return { items: records.items.map(toRecord), nextToken: records.nextToken };
    },

    // All your records, of every type: grouped by type (in reverse order of
    // the type's name), newest first within each.
    async myRecords({ limit, nextToken } = {}) {
      const { myRecords } = await call(
        `query ($limit: Int, $nextToken: String) {
          myRecords(limit: $limit, nextToken: $nextToken) { items { ${RECORD} } nextToken }
        }`,
        { limit, nextToken },
        { needsMember: true },
      );
      return { items: myRecords.items.map(toRecord), nextToken: myRecords.nextToken };
    },

    // Every member's records of a type the applet's owner lists (else
    // Unauthorized): all of them, or for a grouped type (its groupBy, in
    // applet().types), those in one group, whose value `group` is. A grouped
    // type's records can't be listed without one, nor read by member, so a
    // group whose value nobody could guess is seen only by those it's shared
    // with. Newest first, or in order of the type's sortBy field (highest
    // first, or lowest when its sortOrder is "asc"), ties going to whichever
    // got its value first: limit 10 gives a top 10. `newest` lists a type
    // with sortBy newest first instead (not a group). Works before this
    // browser registers.
    async listRecords(type, { group, newest, limit, nextToken } = {}) {
      const { listRecords } = await call(
        `query ($type: String!, $group: String, $newest: Boolean, $limit: Int, $nextToken: String) {
          listRecords(type: $type, group: $group, newest: $newest, limit: $limit, nextToken: $nextToken) { items { ${RECORD} } nextToken }
        }`,
        { type, group, newest, limit, nextToken },
      );
      return { items: listRecords.items.map(toRecord), nextToken: listRecords.nextToken };
    },

    // Adds a record, or with `id` replaces that one's data. With
    // `expectedVersion` too, the replace fails (ConditionFailed) if the record
    // changed since you read that version. A record keeps its group. On a
    // type with onePerGroup, adding one to a group you already have one in
    // fails as AlreadyExists, with that one's id as err.info.recordId, to
    // replace instead.
    async put(type, data, { id, expectedVersion } = {}) {
      const { putRecord } = await call(
        `mutation ($type: String!, $data: AWSJSON!, $id: ID, $expectedVersion: Int) {
          putRecord(type: $type, data: $data, id: $id, expectedVersion: $expectedVersion) { ${RECORD} }
        }`,
        { type, data: JSON.stringify(data), id, expectedVersion },
        { needsMember: true },
      );
      return toRecord(putRecord);
    },

    async remove(type, id) {
      await call('mutation ($type: String!, $id: ID!) { deleteRecord(type: $type, id: $id) }', { type, id }, { needsMember: true });
    },

    // A new short link to `url`. Works when the applet's owner turned short
    // links on, `url` starts with one of their addresses, and this secret
    // grants short links (else Unauthorized or BadRequest), up to the owner's
    // limit per member (LimitReached). Its code is random, or `code` where the
    // owner lets members choose (CodeTaken if any link ever had it).
    // `permanent` makes it a permanent redirect, which browsers may keep;
    // `expiresAt` is when it stops working, at most 10 years away, and can't
    // be on a permanent one.
    async createLink(url, { code, permanent, expiresAt } = {}) {
      const { createLink } = await call(
        `mutation ($url: String!, $code: ID, $permanent: Boolean, $expiresAt: AWSDateTime) {
          createLink(url: $url, code: $code, permanent: $permanent, expiresAt: $expiresAt) { ${LINK} }
        }`,
        { url, code, permanent, expiresAt },
        { needsMember: true },
      );
      return createLink;
    },

    // Points your link with `code` at `url`, by the same rules, as a new
    // version. Left out, `permanent` and `expiresAt` stay as they are;
    // `expiresAt: null` removes the expiry. With `expectedVersion`, it fails
    // (ConditionFailed) if the link changed since you read that version.
    // Edited links can lead to the old address for a while: the owner sets
    // how long.
    async updateLink(code, url, { permanent, expiresAt, expectedVersion } = {}) {
      const { updateLink } = await call(
        `mutation ($code: ID!, $url: String!, $permanent: Boolean, $expiresAt: AWSDateTime, $expectedVersion: Int) {
          updateLink(code: $code, url: $url, permanent: $permanent, expiresAt: $expiresAt, expectedVersion: $expectedVersion) {
            ${LINK}
          }
        }`,
        { code, url, permanent, expiresAt, expectedVersion },
        { needsMember: true },
      );
      return updateLink;
    },

    // Stops your link working, which frees a place under your limit. No other
    // link ever gets its code, and restoreLink() brings it back.
    async deleteLink(code) {
      const { deleteLink } = await call(`mutation ($code: ID!) { deleteLink(code: $code) { ${LINK} } }`, { code }, { needsMember: true });
      return deleteLink;
    },

    // Makes a link you deleted work again, as it was, if you're under your
    // limit. One the applet's owner or an admin deleted is theirs to restore
    // (Unauthorized).
    async restoreLink(code) {
      const { restoreLink } = await call(`mutation ($code: ID!) { restoreLink(code: $code) { ${LINK} } }`, { code }, { needsMember: true });
      return restoreLink;
    },

    // Your link's versions, newest first: where it led, from when, and who
    // set it (your member id, or "owner" or "admin").
    async linkHistory(code, { limit, nextToken } = {}) {
      const { linkHistory } = await call(
        `query ($code: ID!, $limit: Int, $nextToken: String) {
          linkHistory(code: $code, limit: $limit, nextToken: $nextToken) { items { ${LINK_VERSION} } nextToken }
        }`,
        { code, limit, nextToken },
        { needsMember: true },
      );
      return linkHistory;
    },

    // Your short links, each as it is now: with `status` "ACTIVE" (the
    // default) the working ones, newest first, or with "DELETED" the deleted
    // ones, most recently deleted first. A change can take a moment to show.
    async myLinks({ status, limit, nextToken } = {}) {
      const { myLinks } = await call(
        `query ($status: LinkStatus, $limit: Int, $nextToken: String) {
          myLinks(status: $status, limit: $limit, nextToken: $nextToken) { items { ${LINK} } nextToken }
        }`,
        { status, limit, nextToken },
        { needsMember: true },
      );
      return myLinks;
    },

    // Enters a room on this applet by its id (the applet's owner shares it),
    // as this member: see enterRoom below.
    async enter(roomId, handlers = {}) {
      if (!roomsEndpoint || !roomsRealtime) {
        throw new AppletError('enter() needs roomsEndpoint and roomsRealtime given to connect().', 'BadRequest');
      }
      const takePlace = async () => {
        const { takePlace: place } = await call(
          'mutation ($roomId: ID!) { takePlace(roomId: $roomId) { now until } }',
          { roomId },
          { needsMember: true },
        );
        return place;
      };
      return enterRoom({ ...handlers, roomId, secret, takePlace, http: roomsEndpoint, realtime: roomsRealtime, token: freshToken });
    },

    // Stops being the member in this browser. What they made stays.
    forget() {
      remember(null);
    },
  };
}

// AWSJSON comes back as a JSON string.
function json(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

const toMember = (m) => ({ ...m, profile: json(m.profile) });
const toRecord = (r) => ({ ...r, data: json(r.data) });

// --- Rooms ------------------------------------------------------------------
// A room holds so many people at once. Entering takes a place in it through
// the applets API (takePlace), which lasts to the end of the next minute, and
// this renews it once a minute while in the room: at a random moment in the
// minute, so a room's members don't all renew together, and as soon as it can
// after a background tab's timers or a dropped connection held it up. A place
// can't be given up early: it frees itself about two minutes after leaving.
// The room's channel on the rooms API (AppSync Events) moves every minute,
// /rooms/<applet>/<room>/<minute>, so only people with a place hear it. This
// opens one WebSocket per room, and on it subscribes to each minute's channel
// the place covers (this one and the next), unsubscribes from each once it's
// over, and sends to this minute's, timing minutes by the server's clock.
// Every message reaches everyone subscribed at that moment, the sender too,
// as { from, name, at, data }: the sender's member id and profile name, set
// by the API, when it was sent, and what they sent. Nothing is kept, so
// someone who isn't connected misses it. Each place, subscribe and send
// carries the member's token (renewed as `call` renews it) and the applet
// secret; the APIs check them, and the room, every time. If the connection
// drops, this connects and enters again on its own, a few times; onClose
// says when it gives up, or when the room stops letting them in.
//
// Resolves once in, or rejects with an AppletError: "LimitReached" when the
// room is full, "NotFound" when there's no such room, "Unauthorized" when the
// room, the secret, or the member isn't allowed (an expired room, say).
// Handlers: onMessage(message), onStatus("connecting" | "open" |
// "reconnecting"), onClose(error, or null after leave()).

const ROOMS_PROTOCOL = 'aws-appsync-event-ws';
const RECONNECT_TRIES = 5;
const MINUTE_MS = 60 * 1000;
// When in each minute to renew the place and move on: a random moment in this
// window, which starts after the rooms API stops taking sends for the minute
// before (a few seconds after it ends).
const TURN_FROM_MS = 10 * 1000;
const TURN_TO_MS = 40 * 1000;
// How soon to try a turn again after one that couldn't reach the API.
const TURN_RETRY_MS = 5 * 1000;
// How many times takePlace may find the room changed as it ran.
const PLACE_TRIES = 4;
// Errors that may pass if asked again; any other means the room won't have them.
const PASSING = ['NetworkError', 'HttpError', 'ConditionFailed'];

function enterRoom({
  roomId, secret, takePlace, http, realtime, token, onMessage = () => {}, onStatus = () => {}, onClose = () => {},
}) {
  const aid = secret.split('.')[0];
  const channelAt = (minute) => `/rooms/${aid}/${roomId}/${minute}`;
  const host = new URL(http).host;
  const auth = (t) => ({ host, Authorization: t, 'x-applet-secret': secret });
  let ws = null;
  let left = false;
  let tries = 0;
  let kaTimer = null;
  // The server's clock minus this browser's, and the last minute the place covers.
  let skew = 0;
  let lastMinute = 0;
  // The connection's subscriptions, by minute: { id, resolve, reject }.
  let subs = new Map();
  let turnTimer = null;
  let nextTurnAt = 0;
  let turning = false;
  // Sends waiting for the API's answer, by publish id.
  const pending = new Map();
  const nowMinute = () => Math.floor((Date.now() + skew) / MINUTE_MS);

  function fail(err) {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  }

  // Takes the place, or renews it, asking again when the room changed as it ran.
  async function place() {
    for (let attempt = 1; ; attempt++) {
      const sent = Date.now();
      try {
        const { now, until } = await takePlace();
        // The server's clock, as of halfway through the call.
        skew = Date.parse(now) - (sent + Date.now()) / 2;
        lastMinute = Math.round(Date.parse(until) / MINUTE_MS) - 1;
        return;
      } catch (err) {
        if (err.type !== 'ConditionFailed' || attempt >= PLACE_TRIES) throw err;
        await sleep(100 + Math.random() * 400 * attempt);
      }
    }
  }

  // One connection, once the API has acknowledged it.
  function connectSocket(t) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutMs = 300000;
      const socketSubs = new Map();
      const socket = new WebSocket(realtime, [ROOMS_PROTOCOL, `header-${base64url(JSON.stringify(auth(t)))}`]);
      const subscription = (id) => [...socketSubs.values()].find((s) => s.id === id);
      // The API sends keep-alives; without one in time, the connection is gone.
      const watch = () => {
        clearTimeout(kaTimer);
        kaTimer = setTimeout(() => socket.close(), timeoutMs);
      };
      socket.onopen = () => socket.send(JSON.stringify({ type: 'connection_init' }));
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'connection_ack') {
          timeoutMs = m.connectionTimeoutMs ?? timeoutMs;
          watch();
          settled = true;
          ws = socket;
          subs = socketSubs;
          resolve(socket);
        } else if (m.type === 'connection_error') {
          settled = true;
          clearTimeout(kaTimer);
          socket.onclose = null;
          socket.close();
          reject(new AppletError(m.errors?.[0]?.message ?? "Couldn't enter the room.", 'Unauthorized'));
        } else if (m.type === 'ka') {
          watch();
          catchUp();
        } else if (m.type === 'subscribe_success') {
          subscription(m.id)?.resolve();
        } else if (m.type === 'subscribe_error') {
          subscription(m.id)?.reject(new AppletError(m.errors?.[0]?.message ?? "Couldn't enter the room.", 'Unauthorized'));
        } else if (m.type === 'data' && subscription(m.id)) {
          onMessage(typeof m.event === 'string' ? JSON.parse(m.event) : m.event);
        } else if (m.type === 'publish_success' || m.type === 'publish_error') {
          const waiting = pending.get(m.id);
          pending.delete(m.id);
          if (!waiting) return;
          if (m.type === 'publish_success' && m.successful?.length) waiting.resolve();
          else waiting.reject(new AppletError(m.errors?.[0]?.message ?? "The room didn't take that message.", 'Unauthorized'));
        }
      };
      socket.onclose = () => {
        clearTimeout(kaTimer);
        const gone = new AppletError('The connection to the room dropped.', 'NetworkError');
        for (const s of socketSubs.values()) s.reject(gone);
        if (!settled) reject(new AppletError("Can't reach the room.", 'NetworkError'));
        else if (socket === ws) dropped();
      };
    });
  }

  // Subscribes the connection to one minute's channel; resolves once on it.
  function subscribe(socket, minute, t) {
    return new Promise((resolve, reject) => {
      const id = uuid();
      subs.set(minute, { id, resolve, reject });
      socket.send(JSON.stringify({ type: 'subscribe', id, channel: channelAt(minute), authorization: auth(t) }));
    });
  }

  // On every minute's channel the place covers, from this one on, and off
  // the ones that are over.
  async function follow(socket, t) {
    const current = nowMinute();
    const joining = [];
    for (let m = current; m <= lastMinute; m++) {
      if (!subs.has(m)) joining.push(subscribe(socket, m, t));
    }
    for (const [m, sub] of subs) {
      if (m < current) {
        subs.delete(m);
        socket.send(JSON.stringify({ type: 'unsubscribe', id: sub.id }));
      }
    }
    await Promise.all(joining);
  }

  // A place, then one connection on the minutes it covers: resolves once in,
  // rejects if refused.
  async function open({ forceToken = false } = {}) {
    await place();
    const t = await token({ force: forceToken });
    const socket = await connectSocket(t);
    try {
      await follow(socket, t);
    } catch (err) {
      socket.onclose = null;
      socket.close();
      throw err;
    }
  }

  // Each minute: renew the place, and follow the room into the minute it now
  // covers.
  function schedule(delay = null) {
    clearTimeout(turnTimer);
    const at = delay === null
      ? (nowMinute() + 1) * MINUTE_MS + TURN_FROM_MS + Math.random() * (TURN_TO_MS - TURN_FROM_MS) - skew
      : Date.now() + delay;
    nextTurnAt = at;
    turnTimer = setTimeout(turn, at - Date.now());
  }

  async function turn() {
    if (left || turning) return;
    turning = true;
    let retry = false;
    try {
      await place();
      if (ws?.readyState === WebSocket.OPEN) await follow(ws, await token());
    } catch (err) {
      // Removed, the room deleted or expired, the secret revoked: they can't
      // stay. Offline, say: the place still covers this minute, so soon again.
      if (!PASSING.includes(err.type)) {
        turning = false;
        close(err);
        return;
      }
      retry = true;
    }
    turning = false;
    if (!left) schedule(retry ? TURN_RETRY_MS : null);
  }

  // Background tabs run timers late, so a keep-alive from the API (one a
  // minute) or the tab showing again runs a turn that's due.
  function catchUp() {
    if (!left && nextTurnAt && Date.now() >= nextTurnAt) {
      clearTimeout(turnTimer);
      turn();
    }
  }

  // Connects and enters again, unless the room says no.
  async function dropped() {
    fail(new AppletError('The connection to the room dropped.', 'NetworkError'));
    while (tries < RECONNECT_TRIES && !left) {
      tries++;
      onStatus('reconnecting');
      await sleep(1000 * 2 ** (tries - 1));
      if (left) return;
      try {
        // A token past its hour may be why it dropped.
        await open({ forceToken: true });
        tries = 0;
        onStatus('open');
        return;
      } catch (err) {
        if (!PASSING.includes(err.type)) {
          close(err);
          return;
        }
      }
    }
    close(new AppletError('Lost the connection to the room.', 'NetworkError'));
  }

  // For good: on leave() (err null), or when the room won't have them.
  function close(err) {
    if (left) return;
    left = true;
    clearTimeout(turnTimer);
    clearTimeout(kaTimer);
    globalThis.document?.removeEventListener('visibilitychange', catchUp);
    fail(err ?? new AppletError('Left the room.', 'NetworkError'));
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    onClose(err);
  }

  onStatus('connecting');
  globalThis.document?.addEventListener('visibilitychange', catchUp);
  return open().then(() => {
    onStatus('open');
    schedule();
    return {
      id: roomId,
      // Sends `data` (any JSON value, up to 4000 characters of it) to
      // everyone in the room; resolves once the API has passed it on.
      async send(data) {
        if (left || !ws || ws.readyState !== WebSocket.OPEN) throw new AppletError('Not in the room.', 'NetworkError');
        const t = await token();
        const id = uuid();
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          ws.send(JSON.stringify({
            type: 'publish', id, channel: channelAt(nowMinute()), events: [JSON.stringify(data)], authorization: auth(t),
          }));
        });
      },
      // Leaves the room and closes its connection. Its place frees itself.
      leave() {
        close(null);
      },
    };
  }, (err) => {
    left = true;
    globalThis.document?.removeEventListener('visibilitychange', catchUp);
    throw err;
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A random (v4) UUID. Browsers only have crypto.randomUUID on HTTPS pages,
// and sites can be plain HTTP, so it's made from getRandomValues, which every
// page has.
function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The API wants its auth header in a WebSocket subprotocol, as base64url.
function base64url(text) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
