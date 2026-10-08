# Kids Game — Claude Guidelines

## Project structure
```
kids-game/
  index.html          ← homepage / game hub (neal.fun-inspired grid of game cards)
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
    door.jpg
    js/
      lock-contract.js     ← lock contract docs + LockElement base class
      lockey-2930-rules.js ← Lockey 2930 rules (no DOM; runs in Node)
      lockey-2930-keypad.js← <lockey-2930-keypad> SVG input surface (raw down/up/turn only)
      lockey-2930-lock.js  ← <lockey-2930-lock>: keypad + rules
      sound.js             ← button-click sound + remembered mute
      door.js              ← page wiring: green/red glow, note expand, sound button
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
- Locks (05): every lock follows `lock-contract.js` — a rule-free input surface emitting `lock-input` (down/up/turn), wrapped by a `LockElement` subclass whose DOM-free rules class decides `lock-attempt` results. The rules class loads in Node (`require`) for quick checks.
- Shared lava drawing helper: `_drawLava(x, top, w, bottom, frame, seed)` — used by both in-game and gallery renderers.
