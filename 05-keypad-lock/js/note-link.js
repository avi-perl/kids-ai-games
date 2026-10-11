// Note links — the lock's code and the note's text packed into one short base64url string:
//   /?<payload>  (the games page passes it on to 05-keypad-lock/?<payload>)
//   payload = [~]<code><text>
// • code: 2 characters. The Lockey's code is a set of buttons (no order, none twice), so it's a
//   12-bit mask of 1–9, 0, X, Z: one base64 digit for the high 6 bits, one for the low 6.
// • text: base64url of the text's bytes, unpadded. Windows-1255 when every character is in it
//   (Hebrew then takes one byte a letter instead of two), else UTF-8. Those Windows-1255 bytes are
//   only used when they aren't also valid UTF-8, so the reader can tell which it got.
// • ~: the text bytes are raw-deflated first. Only used when that's shorter (longer texts).
// No DOM, so it also runs in Node:  node js/note-link.js <code> "<note text>"
const NoteLink = (() => {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'X', 'Z'];
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

  // { code: '2367', text: '…' } → (a promise of) the string that goes after the "?".
  async function encode({ code, text }) {
    let mask = 0;
    for (const ch of String(code).toUpperCase().replace(/[\s,.\-+]/g, '')) {
      const i = BUTTONS.indexOf(ch);
      if (i < 0) throw new Error(`"${ch}" can't be in a code. Codes use 1–0, X and Z.`);
      mask |= 1 << i;
    }
    const head = B64[mask >> 6] + B64[mask & 63], bytes = textBytes(String(text));
    const plain = head + toB64(bytes), packed = '~' + head + toB64(await squeeze(bytes, CompressionStream));
    return packed.length < plain.length ? packed : plain;
  }

  // The string after the "?" → (a promise of) { code, text }, or null if it isn't one of ours.
  async function decode(s) {
    try {
      s = decodeURIComponent(s); // in case something on the way escaped the ~
      const packed = s[0] === '~';
      if (packed) s = s.slice(1);
      if (!/^[\w-]{2,}$/.test(s)) return null;
      const mask = (B64.indexOf(s[0]) << 6) | B64.indexOf(s[1]);
      let bytes = fromB64(s.slice(2));
      if (packed) bytes = await squeeze(bytes, DecompressionStream);
      return {
        code: BUTTONS.filter((_, i) => mask & (1 << i)).join(''),
        text: isUtf8(bytes) ? new TextDecoder().decode(bytes) : cp1255.decode(bytes),
      };
    } catch {
      return null;
    }
  }

  return { encode, decode };
})();

if (typeof module !== 'undefined') {
  module.exports = NoteLink;
  if (require.main === module) NoteLink.encode({ code: process.argv[2], text: process.argv[3] ?? '' }).then(console.log);
}
