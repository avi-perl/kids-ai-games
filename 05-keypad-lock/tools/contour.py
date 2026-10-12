# Our ink's outline (red) drawn over the photo, upscaled, for judging shapes by eye.
#
#   python contour.py OUT_DIR KEYS [ZOOM]     (after compare.py OUT_DIR, which leaves OUT_DIR/r8.png)
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
LEFT, RIGHT = '12345XY', '67890ZC'


def main():
    out, keys = sys.argv[1], sys.argv[2]
    Z = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    photo = Image.open(os.path.join(HERE, 'ref.png')).convert('L')
    ours = Image.open(os.path.join(out, 'r8.png')).convert('L')
    tiles = []
    for k in keys:
        i = (LEFT + RIGHT).index(k) % 7
        cx, cy = (60.5 if k in LEFT else 186.5), 186 + i * 43.6
        b = (cx - 13, cy - 12, cx + 13, cy + 12)
        size = (26 * Z, 24 * Z)
        p = photo.crop(tuple(round(v) for v in b)).resize(size, Image.BICUBIC).convert('RGB')
        ink = ours.crop(tuple(round(v * 8) for v in b)).resize(size, Image.LANCZOS)
        m = np.asarray(ink) < 100
        edge = m & ~np.asarray(Image.fromarray(m).filter(ImageFilter.MinFilter(3)))
        a = np.asarray(p).copy()
        a[edge] = (255, 0, 0)
        tiles.append(Image.fromarray(a))
    w, h = tiles[0].size
    sheet = Image.new('RGB', (len(tiles) * (w + 6), h), 'white')
    for n, t in enumerate(tiles):
        sheet.paste(t, (n * (w + 6), 0))
    sheet.save(os.path.join(out, f'contour-{keys}.png'))


if __name__ == '__main__':
    main()
