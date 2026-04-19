# Kids Game — Claude Guidelines

## Gallery rule
Every designed element (enemies, obstacles, hazards, power-ups, etc.) must appear in the Design Gallery. When adding a new element:
1. Implement a local-coordinate draw function (receives `{x, y, w, h, frame, seed, ...}`) so it renders correctly inside the gallery's scaled cell system.
2. Add an entry to the `entries` array in `drawGallery()` with `label`, `desc`, `w`, `h`, `drawFn`, and `makeObj`.

## Architecture notes
- Single-file HTML5 Canvas game — no frameworks.
- `terrainY(worldX)` — O(1) ground lookup via `terrainOffset`.
- Entity registry: `ENEMY_TYPES` object; `enemies[]` array; `spawners[]` timer array.
- Double jump with coyote time (6 frames) and jump buffer (10 frames).
- Lava pools use smoothstep blending in `getGroundAt`; drawn before terrain so terrain walls frame the pit.
- Shared lava drawing helper: `_drawLava(x, top, w, bottom, frame, seed)` — used by both in-game and gallery renderers.
