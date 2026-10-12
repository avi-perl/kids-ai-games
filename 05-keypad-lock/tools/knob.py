# Knob check: renders the keypad (render.html, via compare.py) and lines the knob and its housing up
# against ref.png.
#
#   python knob.py OUT_DIR [ZOOM] [QUERY]
#   python knob.py OUT_DIR --reuse [ZOOM]       check the OUT_DIR/r8.png already there (e.g. an older keypad)
#
# Writes OUT_DIR/knob.png — photo | ours at the photo's resolution | ours sharp, then the same three with
# the contrast stretched (grey 90..220) so the faint shading shows — and OUT_DIR/knob-polar.png: the grip
# unwrapped around the face's centre, photo above ours (x = angle clockwise from straight up, y = radius).
# Prints the mean brightness error per area.
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

from compare import HERE, SCALE, render

BOX = (34, 505, 212, 707)        # the ledge, the housing and the knob, in photo pixels
CENTRE = (124.6, 613.8)          # the knob face's centre (KNOB in the keypad)
AREAS = {                        # (name, test on photo pixel coords) for the error table
    'ledge':   lambda x, y, r: (y >= 514) & (y < 527),
    'face':    lambda x, y, r: r < 68,
    'grip':    lambda x, y, r: (r >= 68) & (r < 88) & (y >= 527),
    'housing': lambda x, y, r: (r >= 88) & (y >= 527),
}


def stretch(im, lo=90, hi=220):
    a = np.asarray(im, dtype=float)
    return Image.fromarray(np.clip((a - lo) / (hi - lo) * 255, 0, 255).astype(np.uint8))


def unwrap(a, scale, r0=60, r1=96, za=2, zr=6):
    cx, cy = CENTRE
    th = np.radians((np.arange(360 * za) + .5) / za)
    r = r1 - (np.arange((r1 - r0) * zr) + .5) / zr
    T, R = np.meshgrid(th, r)
    X, Y = (cx + R * np.sin(T)) * scale - .5, (cy - R * np.cos(T)) * scale - .5
    x0, y0 = np.floor(X).astype(int), np.floor(Y).astype(int)
    fx, fy = X - x0, Y - y0
    g = lambda yy, xx: a[np.clip(yy, 0, a.shape[0] - 1), np.clip(xx, 0, a.shape[1] - 1)]
    v = (g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy)
         + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy)
    return Image.fromarray(np.clip(v, 0, 255).astype(np.uint8))


def main():
    out_dir, args = sys.argv[1], sys.argv[2:]
    reuse = '--reuse' in args
    args = [a for a in args if a != '--reuse']
    zoom = int(args[0]) if args else 3
    os.makedirs(out_dir, exist_ok=True)
    if reuse:
        big = Image.open(os.path.join(out_dir, 'r8.png')).convert('L')
    else:
        big = render(out_dir, args[1] if len(args) > 1 else '')
    ours = big.reduce(SCALE)
    photo = Image.open(os.path.join(HERE, 'ref.png')).convert('L')

    w, h = BOX[2] - BOX[0], BOX[3] - BOX[1]
    size = (w * zoom, h * zoom)
    p = photo.crop(BOX).resize(size, Image.LANCZOS)
    o = ours.crop(BOX).resize(size, Image.LANCZOS)
    s = big.crop(tuple(v * SCALE for v in BOX)).resize(size, Image.LANCZOS)
    sheet = Image.new('L', (3 * size[0] + 20, 2 * size[1] + 10), 255)
    for c, im in enumerate((p, o, s)):
        sheet.paste(im, (c * (size[0] + 10), 0))
        sheet.paste(stretch(im), (c * (size[0] + 10), size[1] + 10))
    sheet.save(os.path.join(out_dir, 'knob.png'))

    P, O = np.asarray(photo, dtype=float), np.asarray(ours, dtype=float)
    pu, ou = unwrap(P, 1), unwrap(np.asarray(big, dtype=float), SCALE)
    W, H = pu.size
    polar = Image.new('RGB', (W + 30, 2 * H + 24), 'white')
    polar.paste(stretch(pu).convert('RGB'), (30, 0))
    polar.paste(stretch(ou).convert('RGB'), (30, H + 24))
    d = ImageDraw.Draw(polar)
    for deg in range(0, 361, 45):
        d.line([(30 + deg * 2, H), (30 + deg * 2, H + 24)], fill='red')
        d.text((32 + deg * 2, H + 6), str(deg), fill='black')
    for r in range(60, 97, 10):
        for top in (0, H + 24):
            d.text((2, top + (96 - r) * 6 - 5), str(r), fill='black')
    polar.save(os.path.join(out_dir, 'knob-polar.png'))

    ys, xs = np.mgrid[BOX[1]:BOX[3], BOX[0]:BOX[2]]
    rs = np.hypot(xs - CENTRE[0], ys - CENTRE[1])
    inside = P[BOX[1]:BOX[3], BOX[0]:BOX[2]] > 40  # not the black body or the white page
    err = np.abs(P - O)[BOX[1]:BOX[3], BOX[0]:BOX[2]]
    sign = (O - P)[BOX[1]:BOX[3], BOX[0]:BOX[2]]
    print('area      mean-err  ours-minus-photo')
    total = []
    for name, test in AREAS.items():
        m = test(xs, ys, rs) & inside
        total.append(err[m])
        print(f'{name:8s}  {err[m].mean():7.2f}  {sign[m].mean():+7.2f}')
    print(f'all       {np.concatenate(total).mean():7.2f}')


if __name__ == '__main__':
    main()
