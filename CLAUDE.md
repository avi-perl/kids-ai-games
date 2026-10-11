# Kids Game — Claude Guidelines

## Project structure
```
kids-game/
  index.html          ← homepage / game hub (neal.fun-inspired grid of game cards); /#<payload> (or older /?<payload>) redirects to The Door
  sw.js               ← service worker: network first, cache for offline; precache list + cache version (bump it and list new files when a game changes)
  01-hill-jumper/
    index.html        ← Hill Jumper game (HTML + CSS + <script> imports only)
    js/
      canvas.js       ← canvas, ctx, W/H/DPR, resizeCanvas
      db.js           ← UserDB (localStorage) + Supabase API
      terrain.js      ← terrainY, getGroundAt, firePools, flatZones
      audio.js        ← audio system, all SFX functions
      entities.js     ← ENEMY_TYPES + drawCar/Rock/Trex/Mouse
      state.js        ← game state vars, player, reset(), initSpawners()
      update.js       ← update() game loop tick
      draw.js         ← all draw functions + main draw()
      ui.js           ← input, settings panel, modals, loop(), init
  04-times-sprint/
    index.html        ← all screens (menu, players, editor, history, play, summary) + CSS
    js/
      brain.js        ← adaptive engine: fact strength, weak-fact detection, card picking (no DOM; runs in Node)
      store.js        ← profiles + settings + models (localStorage), sprint logs (IndexedDB)
      report.js       ← stats from sprint logs + CSV/JSON exports
      sound.js        ← WebAudio SFX
      app.js          ← shared state ($, showScreen, useProfile, mastery grid, toast)
      charts.js       ← SVG line chart + 9×9 heatmap for History
      game.js         ← one sprint: keypad, answer rows, reveal, per-attempt log, summary
      history.js      ← History screen: Progress / Questions / Sprints tabs + export menu
      screens.js      ← menu, player picker/editor, boot
  05-keypad-lock/
    index.html        ← The Door: photo of the note (door.jpg) + Lockey 2930 lock, code 2367 (HTML + CSS + <script> imports)
                         #<payload> (or /#<payload> on the hub) sets its own code check + note text instead (see note-link.js);
                         older ?<payload> links carry the code itself and still work
    make.html         ← Make a Door: write a note (Markdown) + answer (+ optional message), live preview, copy the link;
                         linked from the door's faint "make your own"
    door.jpg          ← the note with the original handwriting
    door-blank.jpg    ← the same photo, note left blank, for printed text
    js/
      lock-contract.js     ← lock contract docs + LockElement base class
      lockey-2930-rules.js ← Lockey 2930 rules (no DOM; runs in Node)
      lockey-2930-keypad.js← <lockey-2930-keypad> SVG input surface (raw down/up/turn only)
      lockey-2930-lock.js  ← <lockey-2930-lock>: keypad + rules
      sound.js             ← button-click sound + remembered mute
      note-link.js         ← link payload: 2-char salted hash of note + code (never the code) + base64url text
                             (no DOM; `node js/note-link.js <code> "<text>"`)
      note-text.js         ← prints a Markdown note onto door-blank.jpg: browser lays it out on a hidden stage,
                             then each word is drawn, perspective-warped and inked into the photo's pixels
      door.js              ← page wiring: link payload, red glow on a wrong try; opened = steady green + the
                             message ("You're in!" or the link's own) in place of the photo; note expand, sound
      make.js              ← make.html wiring: answer limited to the lock's buttons, preview, link
  CLAUDE.md
```
When adding a new game, create a new subfolder (e.g. `word-blast/index.html`) and add a card to the root `index.html` grid.

## Gallery rule
Every designed element (enemies, obstacles, hazards, power-ups, etc.) must appear in the Design Gallery. When adding a new element:
1. Implement a local-coordinate draw function (receives `{x, y, w, h, frame, seed, ...}`) so it renders correctly inside the gallery's scaled cell system.
2. Add an entry to the `entries` array in `drawGallery()` with `label`, `desc`, `w`, `h`, `drawFn`, and `makeObj`.

## Architecture notes
- HTML5 Canvas game — no frameworks. Script files loaded in order via `<script src>` tags.
- `terrainY(worldX)` — O(1) ground lookup via `terrainOffset`.
- Entity registry: `ENEMY_TYPES` object; `enemies[]` array; `spawners[]` timer array.
- Double jump with coyote time (6 frames) and jump buffer (10 frames).
- Lava pools use smoothstep blending in `getGroundAt`; drawn before terrain so terrain walls frame the pit.
- Locks (05): every lock follows `lock-contract.js` — a rule-free input surface emitting `lock-input` (down/up/turn), wrapped by a `LockElement` subclass whose DOM-free rules class decides `lock-attempt` results. The rules class loads in Node (`require`) for quick checks. A lock can take `lock.codeCheck = fn` instead of a code, so a page only needs a hash of it (how door links work).
- Shared lava drawing helper: `_drawLava(x, top, w, bottom, frame, seed)` — used by both in-game and gallery renderers.
