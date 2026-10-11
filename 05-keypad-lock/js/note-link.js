// Note links — a check of the lock's code and the note's text packed into one short base64url string:
//   /#<payload>  (the games page passes it on to 05-keypad-lock/#<payload>)
//   payload = [~]<check><text>
// • check: 2 characters, 12 bits of a hash of a salt, the note and the code, so the link doesn't
//   give the code away. The door hashes each try the same way and opens when they match (a wrong
//   try also matches about 1 time in 4096, which is fine for a game).
//   Links from before the hash put the payload after "?" instead, and their 2 characters are the
//   code itself: a 12-bit mask of the buttons 1–9, 0, X, Z. Those still work.
// • text: the note, then — only if it isn't the usual "You're in!" — a record separator (U+001E)
//   and the message to show once the door opens.
//   As base64url of the text's bytes, unpadded. Windows-1255 when every character is in it
//   (Hebrew then takes one byte a letter instead of two), else UTF-8. Those Windows-1255 bytes are
//   only used when they aren't also valid UTF-8, so the reader can tell which it got.
// • ~: the text bytes are raw-deflated first. Only used when that's shorter (longer texts).
// No DOM, so it also runs in Node:  node js/note-link.js <code> "<note text>" ["<message>"]
const NoteLink = (() => {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'X', 'Z'];
  const SALT = 'lockey-2930';
  const MESSAGE = "You're in!"; // shown once the door opens, unless the link brings its own
  const RS = String.fromCharCode(0x1e); // between the note and its own message
  const cp1255 = new TextDecoder('windows-1255');
  let byteOf; // character → its Windows-1255 byte, built on first use

  const isUtf8 = bytes => {
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch { return false; }
  };

  function textBytes(text) {
    const utf8 = new TextEncoder().encode(text);
    if (!byteOf) {
      byteOf = new Map();
      for (let b = 255; b >= 0; b--) {
        const ch = cp1255.decode(Uint8Array.of(b));
        if (ch.charCodeAt(0) !== 0xfffd) byteOf.set(ch, b); // skip bytes Windows-1255 leaves unused
      }
    }
    const chars = [...text];
    if (chars.every(c => byteOf.has(c))) {
      const one = Uint8Array.from(chars, c => byteOf.get(c));
      if (one.length < utf8.length && !isUtf8(one) && cp1255.decode(one) === text) return one;
    }
    return utf8;
  }

  // Raw deflate / inflate, with the streams browsers and Node both have.
  const squeeze = async (bytes, Stream) =>
    new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'))).arrayBuffer());

  function toB64(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }

  // The code's buttons in the lock's order, each once (it's a set: order and repeats don't matter).
  function normalize(code) {
    const pressed = String(code).toUpperCase().replace(/[\s,.\-+]/g, '');
    for (const ch of pressed) {
      if (!BUTTONS.includes(ch)) throw new Error(`"${ch}" can't be in a code. Codes use 1–0, X and Z.`);
    }
    return BUTTONS.filter(b => pressed.includes(b)).join('');
  }

  // 12 bits of FNV-1a over the salt, the note and the code.
  function check(text, code) {
    const s = SALT + String.fromCharCode(0) + text + String.fromCharCode(0) + normalize(code);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return (h ^ (h >>> 12) ^ (h >>> 24)) & 0xfff;
  }

  // { code: '2367', text: '…', message: '…' } → (a promise of) the string that goes after the "#".
  async function encode({ code, text, message = '' }) {
    const note = String(text).split(RS).join('');
    message = String(message).split(RS).join('').trim();
    const sum = check(note, code);
    const head = B64[sum >> 6] + B64[sum & 63];
    const bytes = textBytes(message && message !== MESSAGE ? note + RS + message : note);
    const plain = head + toB64(bytes), packed = '~' + head + toB64(await squeeze(bytes, CompressionStream));
    return packed.length < plain.length ? packed : plain;
  }

  // A payload → (a promise of) { head: its 12-bit head, text }, or null if it isn't one of ours.
  async function decode(s) {
    try {
      s = decodeURIComponent(s); // in case something on the way escaped the ~
      const packed = s[0] === '~';
      if (packed) s = s.slice(1);
      if (!/^[\w-]{2,}$/.test(s)) return null;
      const sum = (B64.indexOf(s[0]) << 6) | B64.indexOf(s[1]);
      let bytes = fromB64(s.slice(2));
      if (packed) bytes = await squeeze(bytes, DecompressionStream);
      return {
        head: sum,
        text: isUtf8(bytes) ? new TextDecoder().decode(bytes) : cp1255.decode(bytes),
      };
    } catch {
      return null;
    }
  }

  // A page address (location, or a URL) → (a promise of) the door it describes, or null:
  //   { text, message, opens(code) }  for links after "#": tries are checked against the hash
  //   { text, message, code }         for old links after "?": the code itself
  async function read({ hash, search }) {
    const link = await decode((hash.length > 1 ? hash : search).slice(1));
    if (!link) return null;
    const [text, message = MESSAGE] = link.text.split(RS);
    if (hash.length > 1) return { text, message, opens: code => check(text, code) === link.head };
    return { text, message, code: BUTTONS.filter((_, i) => link.head & (1 << i)).join('') };
  }

  return { MESSAGE, encode, decode, read };
})();

if (typeof module !== 'undefined') {
  module.exports = NoteLink;
  if (require.main === module) {
    NoteLink.encode({ code: process.argv[2], text: process.argv[3] ?? '', message: process.argv[4] }).then(console.log);
  }
}
