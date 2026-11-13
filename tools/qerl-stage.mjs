// Copies one game into its own folder, ready to publish as its own qerl.app applet site
// (each game is its own applet there: hill-jumper, puppy-room, cosmic-sling, math-sprints,
// the-door). The games were written to live under this hub, so a game alone loses the
// hub's bits: the shared manifest and service worker, and links back to the hub.
//
//   node tools/qerl-stage.mjs <game folder> <out folder>
//   node tools/qerl-stage.mjs 04-times-sprint %TEMP%/math-sprints
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [game, out] = process.argv.slice(2);
if (!game || !out) throw new Error('Usage: node tools/qerl-stage.mjs <game folder> <out folder>');
const src = resolve(import.meta.dirname, '..', game);
rmSync(out, { recursive: true, force: true });
// Not part of the game: the lock-drawing harness, design rounds, notes, local config.
const SKIP = /([\\/](tools|design)([\\/]|$))|CLAUDE\.md$|README\.md$|\.local\.js$|Gemini_Generated_Image/;
cpSync(src, out, { recursive: true, filter: (p) => !SKIP.test(p.slice(src.length)) });

const edit = (file, fn) => {
  const p = join(out, file);
  if (!existsSync(p)) return;
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`${file}: nothing changed; has the hub wiring moved?`);
  writeFileSync(p, after);
};

// The hub's manifest and offline cache, which a game alone doesn't have.
if (game === '01-hill-jumper') {
  edit('index.html', (s) => s.replace(/\s*<link rel="manifest" href="\.\.\/manifest\.json">/, ''));
  edit('js/ui.js', (s) => s.replace(/\r?\nif \('serviceWorker' in navigator\) \{\r?\n\s*navigator\.serviceWorker\.register\('\.\.\/sw\.js', \{ scope: '\.\.\/' \}\);\r?\n\}/, ''));
}
// "← Games" back to the hub.
if (game === '04-times-sprint') {
  edit('index.html', (s) => s.replace(/\s*<a class="home-link" href="\.\.\/">← Games<\/a>/, ''));
}
console.log(`staged ${game} in ${out}`);
