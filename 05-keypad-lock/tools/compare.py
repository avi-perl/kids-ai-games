# Engraved-label check: renders the keypad (render.html, in headless Chrome at 8x) in the photo's own
# pixel coordinates and lines every label up against ref.png.
#
#   python compare.py OUT_DIR [ZOOM] [QUERY]     QUERY goes to render.html, e.g. edge=.9,.5
#
# Writes OUT_DIR/labels-L.png and labels-R.png — one row per label: photo | ours at the photo's
# resolution | ours sharp | overlay (photo in red, ours in cyan: grey where they agree, red where only
# ours is dark, cyan where only the photo is) — and prints a per-label error score.
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get('CHROME', r'C:\Program Files\Google\Chrome\Application\chrome.exe')
SCALE = 8
LEFT, RIGHT = '12345XY', '67890ZC'
CELL = (15, 12)  # half-width, half-height of a label's crop, in photo pixels


def render(out_dir, query=''):
    shot = os.path.join(out_dir, 'r8.png')
    url = 'file:///' + os.path.join(HERE, 'render.html').replace('\\', '/') + (f'?{query}' if query else '')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    f'--force-device-scale-factor={SCALE}', '--window-size=248,800',
                    '--user-data-dir=' + os.path.join(out_dir, 'chrome-prof'),
                    '--screenshot=' + shot, url], capture_output=True)
    return Image.open(shot).convert('L')


def cells():
    for i in range(7):
        cy = 186 + i * 43.6
        yield LEFT[i], 60.5, cy
        yield RIGHT[i], 186.5, cy


def box(cx, cy, s=1):
    hw, hh = CELL
    return tuple(round(v * s) for v in (cx - hw, cy - hh, cx + hw, cy + hh))


def highpass(a):
    # The plate's slow light differs a little between photo and drawing; compare only the detail.
    img = Image.fromarray(a.astype(np.uint8))
    return a - np.asarray(img.filter(ImageFilter.GaussianBlur(4)), dtype=float)


def main():
    out_dir = sys.argv[1]
    zoom = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    os.makedirs(out_dir, exist_ok=True)
    big = render(out_dir, sys.argv[3] if len(sys.argv) > 3 else '')
    ours = big.reduce(SCALE)  # box filter down to the photo's resolution
    photo = Image.open(os.path.join(HERE, 'ref.png')).convert('L')
    P, O = np.asarray(photo, dtype=float), np.asarray(ours, dtype=float)
    hp_p, hp_o = highpass(P), highpass(O)

    w, h = 2 * CELL[0] * zoom, 2 * CELL[1] * zoom
    sheets = {k: Image.new('RGB', (4 * w + 30, 7 * (h + 6)), (40, 40, 40)) for k in 'LR'}
    total = 0
    print('label  detail-err  ink-IoU')
    for n, (key, cx, cy) in enumerate(cells()):
        b = box(cx, cy)
        p = photo.crop(b).resize((w, h), Image.LANCZOS)
        o = ours.crop(b).resize((w, h), Image.LANCZOS)
        s = big.crop(box(cx, cy, SCALE)).resize((w, h), Image.LANCZOS)
        over = Image.merge('RGB', (p, o, o))
        sl = (slice(b[1], b[3]), slice(b[0], b[2]))
        err = np.abs(hp_p[sl] - hp_o[sl]).mean()
        ink_p, ink_o = hp_p[sl] < -30, hp_o[sl] < -30
        iou = (ink_p & ink_o).sum() / max(1, (ink_p | ink_o).sum())
        total += err
        print(f'  {key}     {err:6.2f}     {iou:5.2f}')
        sheet = sheets['L' if key in LEFT else 'R']
        row = (n // 2) * (h + 6)
        for c, im in enumerate((p, o, s, over)):
            sheet.paste(im.convert('RGB'), (c * (w + 10), row))
        ImageDraw.Draw(sheet).text((4, row + 2), key, fill=(255, 80, 80))
    print(f'total  {total:6.2f}')
    for k, sheet in sheets.items():
        sheet.save(os.path.join(out_dir, f'labels-{k}.png'))


if __name__ == '__main__':
    main()
