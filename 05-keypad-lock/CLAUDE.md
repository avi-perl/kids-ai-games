# The Door — Claude Guidelines

The game's files are listed in the root `CLAUDE.md`. This file covers `tools/`: the harness for checking
the Lockey 2930 keypad drawing (`js/lockey-2930-keypad.js`) against a photo of the real lock, and for
measuring the engraved labels.

## tools/
```
tools/
  ref.png       ← 248×800 product photo of the lock; the keypad's geometry was measured from it
                   (1 SVG unit = 1 photo pixel, so the keypad's coordinates are this photo's pixels)
  render.html   ← the keypad alone, drawn over the whole photo frame (viewBox 0 0 248 800), so a
                   screenshot lines up pixel for pixel with ref.png. ?edge=.8,.45 tries another pale edge
                   under the labels (how far down, how strong)
  compare.py    ← screenshots render.html in headless Chrome at 8× and lines every label up with the photo
  contour.py    ← our ink's outline in red over the upscaled photo: the best view for judging shapes by eye
  fit.py        ← measures the labels' shapes from the photo (Nelder-Mead) and writes the GLYPHS table
  knob.py       ← lines the knob, its housing and the ledge up with the photo: side by side, and the grip
                   unwrapped around the face's centre
```
Python 3 with numpy and Pillow only (no scipy, no cairo). Chrome is expected at
`C:\Program Files\Google\Chrome\Application\chrome.exe`; set `CHROME` to use another. Every tool writes
into the `OUT_DIR` you give it — use a scratch directory outside the repo, not `tools/`.

```bash
python tools/compare.py OUT_DIR [ZOOM] [QUERY]
```
Writes `OUT_DIR/r8.png` (the 8× screenshot) and `labels-L.png` / `labels-R.png`: one row per label —
photo | ours at the photo's resolution | ours sharp | overlay (photo in the red channel, ours in green and
blue: grey where they agree, red where only ours is dark, cyan where only the photo is). Prints a
per-label detail error (high-passed, so the plate's slow light doesn't count). `QUERY` goes to
render.html, e.g. `edge=1,.6`.

```bash
python tools/contour.py OUT_DIR KEYS [ZOOM]
```
Needs `OUT_DIR/r8.png` from compare.py. Writes `OUT_DIR/contour-KEYS.png`, e.g. `contour.py OUT 4Z7`.

```bash
python tools/fit.py OUT_DIR [KEYS]     # fit glyph shapes, one process per glyph (~40 s for all 14)
python tools/fit.py OUT_DIR --light    # fit the stroke width and light, shapes held (~5 min)
```
Each glyph is a few strokes along a centre line — points with corner radii, relative to the label's
centre — named by measurements (`L`, `Rx`, `T`, `B`, `M`, hook `h`, corner `r`...; see `MODELS`).
Strokes are flat-ended with mitred joins (mitre limit 2, so acute corners are blunt) and cut flush at the
cap line and baseline, as in the keypad. It rasterizes them itself (PIL polygons at 16×) and moves the
measurements until the drawing, box-filtered to the photo's resolution, matches the photo. A rerun into
the same `OUT_DIR` starts from that directory's `fit.json`. Optional `OUT_DIR/font.json` holds measurements
every glyph shares, held fixed: e.g. `{"H": 15.58, "r": 4.1, "h": 4.6, "rh": 3.9, "L@7": -9.53}` —
`H` fixes every glyph's height (`B = T + H`), `name@L` / `name@R` applies to one column, `name@7` to one
glyph. Writes `fit.json`, `fit-L.png` / `fit-R.png` (photo | fit | overlay) and `glyphs.js.txt`, which
pastes straight into `GLYPHS` in `js/lockey-2930-keypad.js`.

```bash
python tools/knob.py OUT_DIR [ZOOM] [QUERY]
python tools/knob.py OUT_DIR --reuse [ZOOM]     # check an OUT_DIR/r8.png already there (an older keypad)
```
Writes `OUT_DIR/knob.png` (photo | ours at the photo's resolution | ours sharp, then the same with the
contrast stretched so faint shading shows) and `knob-polar.png` (the grip unwrapped: x = angle clockwise
from straight up, y = radius; photo above ours). Prints the mean brightness error for the ledge, face,
grip and housing. For an older keypad, render it with `git show` into a scratch copy, never `git stash`.

The knob (`gripSvg` in the keypad) is drawn in screen angles because the light and camera stay put: a
turn redraws the grip each frame (`spinKnob`) rather than rotating a picture of it. The grip is one ring of
bumps with four sweeping cuts (`CUT`), as a front outline plus a back outline lifted by `GRIP.lift`; the
edges that face up show the wall, or a cut's sloping floor, between them.

## Working with the photo
- ref.png is a small, sharpened JPEG. Use it for placement and overall shape, not detail: its bright halos
  and blurred corners are artifacts. The labels' current look (solid ink plus a soft pale edge below) is
  deliberately simpler than the photo — don't refit the lighting to match it.
- After changing the keypad, `compare.py` + `contour.py` and a look at the sheets are the check; pick
  values by rendering a few side by side, not by handing over sliders.
- `design/` (old review pages and screenshots) is local only, excluded in `.git/info/exclude`.
