# Fits the keypad's engraved labels to ref.png.
#
#   python fit.py OUT_DIR [keys]    fit each glyph's shape, one process per glyph
#   python fit.py OUT_DIR --light   fit the groove's width and light, shapes held
#
# The labels are a squared, extended font (like Microgramma) engraved into the plate and filled with dark
# ink: flat-cut ends, sharp (mitred) corners where the letter turns sharply, rounded ones elsewhere, and
# nothing above the cap line or below the baseline. Light from above can't reach a groove's upper wall
# but catches its lower wall and the plate's edge just below it, so every edge that faces down has a thin
# bright lip. Each glyph is a few strokes along a centre line (points with corner radii, relative to the
# label's centre) given by named measurements; Nelder-Mead moves them until the drawing, box-filtered to
# the photo's resolution, matches the photo's pixels.
#
# OUT_DIR/font.json, if there, holds measurements every glyph shares (cap line, baseline, corner radius,
# hook length...): those stay put and only the rest are fitted.
# Writes OUT_DIR/fit.json, OUT_DIR/glyphs.js.txt (the GLYPHS table for lockey-2930-keypad.js) and
# OUT_DIR/fit-L.png / fit-R.png (photo | fit | overlay).
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PHOTO = np.asarray(Image.open(os.path.join(HERE, 'ref.png')).convert('L'), dtype=float)
LEFT, RIGHT = '12345XY', '67890ZC'
SS = 16  # supersampling per photo pixel

# The groove and its light, as the photo shows them (shared by every label; --light refits these).
LIGHT = {'w': 2.47, 'ink': 40.1, 'down': 0.58, 'up': 0.78, 'lip': 217.8, 'hl': 0.86}
MITER_LIMIT = 2  # as SVG's stroke-miterlimit


def centre(key):
    i = (LEFT + RIGHT).index(key) % 7
    return (60.5 if key in LEFT else 186.5), 186 + i * 43.6


def cell(key):
    # Integer pixel bounds of the label's crop; the button's hole next to it is left out.
    cx, cy = centre(key)
    x0, x1 = (45, 73) if key in LEFT else (177, 206)
    return x0, int(cy) - 12, x1, int(cy) + 13


# --- glyphs: params -> strokes [(points, closed)], point = (x, y, corner radius), relative to the label's
# centre. T and B are the centre lines of the top and bottom bars; strokes that run off the cap line or
# baseline are drawn long and cut flush there.

def P(x, y, r=0.0):
    return (x, y, max(0.0, r))


def past(a, b, k=4.0):
    # The point k beyond b, going from a to b.
    d = np.hypot(b[0] - a[0], b[1] - a[1])
    return P(b[0] + (b[0] - a[0]) / d * k, b[1] + (b[1] - a[1]) / d * k)


MODELS = {
    '0': ('L Rx T B r',
          lambda p: [([P(p.L, p.T, p.r), P(p.Rx, p.T, p.r), P(p.Rx, p.B, p.r), P(p.L, p.B, p.r)], True)]),
    '1': ('fx fy S vy T B',
          lambda p: [([P(p.fx, p.fy), P(p.S, p.vy), P(p.S, p.B + 4)], False)]),
    '2': ('L Rx M R2 T B r h rh rm',
          lambda p: [([P(p.L, p.T + p.h), P(p.L, p.T, p.rh), P(p.Rx, p.T, p.r), P(p.Rx, p.M, p.r),
                       P(p.L, p.M, p.rm), P(p.L, p.B), P(p.R2, p.B)], False)]),
    '3': ('L Rx M Ml T B r h rh',
          lambda p: [([P(p.L, p.T + p.h), P(p.L, p.T, p.rh), P(p.Rx, p.T, p.r), P(p.Rx, p.B, p.r),
                       P(p.L, p.B, p.rh), P(p.L, p.B - p.h)], False),
                     ([P(p.Ml, p.M), P(p.Rx, p.M)], False)]),
    '4': ('S L Rx C vy T B',
          lambda p: [([P(p.S, p.B + 4), P(p.S, p.vy), P(p.L, p.C), P(p.Rx, p.C)], False)]),
    '5': ('L Rx Rb M T B r h rh',
          lambda p: [([P(p.Rx, p.T), P(p.L, p.T), P(p.L, p.M), P(p.Rb, p.M, p.r), P(p.Rb, p.B, p.r),
                       P(p.L, p.B, p.rh), P(p.L, p.B - p.h)], False)]),
    '6': ('L Rx Rt M T B r h rh',
          lambda p: [([P(p.Rt, p.T + p.h), P(p.Rt, p.T, p.rh), P(p.L, p.T, p.r), P(p.L, p.B, p.r),
                       P(p.Rx, p.B, p.r), P(p.Rx, p.M, p.r), P(p.L, p.M)], False)]),
    '7': ('L Rx D T B',
          lambda p: [([P(p.L, p.T), P(p.Rx, p.T), past((p.Rx, p.T), (p.D, p.B))], False)]),
    '8': ('L1 R1 L Rx M T B r8',
          lambda p: [([P(p.L1, p.T, p.r8), P(p.R1, p.T, p.r8), P(p.R1, p.M, p.r8), P(p.L1, p.M, p.r8)], True),
                     ([P(p.L, p.M, p.r8), P(p.Rx, p.M, p.r8), P(p.Rx, p.B, p.r8), P(p.L, p.B, p.r8)], True)]),
    '9': ('L Rx Lb M T B r h rh',
          lambda p: [([P(p.Lb, p.B - p.h), P(p.Lb, p.B, p.rh), P(p.Rx, p.B, p.r), P(p.Rx, p.T, p.r),
                       P(p.L, p.T, p.r), P(p.L, p.M, p.r), P(p.Rx, p.M)], False)]),
    'X': ('a b c d T B',
          lambda p: [([past((p.b, p.B), (p.a, p.T)), past((p.a, p.T), (p.b, p.B))], False),
                     ([past((p.d, p.B), (p.c, p.T)), past((p.c, p.T), (p.d, p.B))], False)]),
    'Y': ('L Rx Cx J T B',
          lambda p: [([past((p.Cx, p.J), (p.L, p.T)), P(p.Cx, p.J), past((p.Cx, p.J), (p.Rx, p.T))], False),
                     ([P(p.Cx, p.J), P(p.Cx, p.B + 4)], False)]),
    'Z': ('L Rx L2 R2 T B',
          lambda p: [([P(p.L, p.T), P(p.Rx, p.T), P(p.L2, p.B), P(p.R2, p.B)], False)]),
    'C': ('L Rx Rb T B r h rh',
          lambda p: [([P(p.Rx, p.T + p.h), P(p.Rx, p.T, p.rh), P(p.L, p.T, p.r), P(p.L, p.B, p.r),
                       P(p.Rb, p.B, p.rh), P(p.Rb, p.B - p.h)], False)]),
}

# Where the earlier round-cutter fit left each glyph (relative to the label's centre).
START = {
    '1': dict(fx=-4.63, fy=-1.64, S=2.91, vy=-7.23, T=-7.0, B=8.7),
    '2': dict(L=-7.53, Rx=9.1, M=2.07, R2=9.88, T=-6.76, B=8.77, r=4.26, h=4.77, rh=3.34, rm=6.29),
    '3': dict(L=-7.87, Rx=9.11, M=.52, Ml=-.8, T=-6.85, B=8.68, r=2.63, h=3.8, rh=3.38),
    '4': dict(S=6.93, L=-9.1, Rx=10.44, C=4.64, vy=-8.08, T=-7.0, B=8.84),
    '5': dict(L=-7.85, Rx=9.27, Rb=9.46, M=-1.34, T=-6.9, B=8.71, r=4.16, h=3.55, rh=5.14),
    'X': dict(a=-6.55, b=9.49, c=8.9, d=-7.46, T=-7.21, B=8.8),
    'Y': dict(L=-7.44, Rx=8.71, Cx=.62, J=2.16, T=-6.99, B=8.65),
    '6': dict(L=-8.31, Rx=8.26, Rt=8.07, M=-.13, T=-7.14, B=8.42, r=3.75, h=3.3, rh=4.32),
    '7': dict(L=-8.8, Rx=10.09, D=-3.4, T=-7.22, B=8.4),
    '8': dict(L1=-8.21, R1=8.52, L=-8.33, Rx=8.58, M=.12, T=-7.56, B=8.17, r8=3.4),
    '9': dict(L=-8.08, Rx=8.46, Lb=-8.33, M=.8, T=-7.45, B=7.88, r=3.46, h=3.03, rh=2.31),
    '0': dict(L=-8.34, Rx=9.49, T=-7.8, B=7.97, r=4.53),
    'Z': dict(L=-8.01, Rx=9.59, L2=-8.42, R2=9.74, T=-7.62, B=7.66),
    'C': dict(L=-8.12, Rx=9.18, Rb=9.54, T=-7.94, B=7.77, r=4.3, h=3.75, rh=3.61),
}


class Params(dict):
    __getattr__ = dict.__getitem__


def shared_for(key, font):
    # The font's shared measurements that apply to this glyph ('T@L': only the left column's; 'L@7':
    # only the 7's).
    side = 'L' if key in LEFT else 'R'
    names = MODELS[key][0].split()
    out = {}
    for n, v in font.items():
        base, _, s = n.partition('@')
        if base in names and s in ('', side, key):
            out[base] = v
    return out


def polyline(pts, closed):
    # Centre line through the points; a corner with radius r becomes a quadratic curve from r before it
    # to r after it (never more than half a side, or all of a side that ends the stroke).
    n = len(pts)
    out = []
    for i, (x, y, r) in enumerate(pts):
        if r <= 0 or (not closed and (i == 0 or i == n - 1)):
            out.append((x, y))
            continue
        px, py, _ = pts[i - 1]
        nx, ny, _ = pts[(i + 1) % n]
        din, dout = np.hypot(x - px, y - py), np.hypot(nx - x, ny - y)
        if din < 1e-6 or dout < 1e-6:
            out.append((x, y))
            continue
        rin = min(r, din if (not closed and i == 1) else din / 2)
        rout = min(r, dout if (not closed and i == n - 2) else dout / 2)
        ax, ay = x - (x - px) / din * rin, y - (y - py) / din * rin
        bx, by = x + (nx - x) / dout * rout, y + (ny - y) / dout * rout
        for t in np.linspace(0, 1, 9):
            out.append(((1 - t) ** 2 * ax + 2 * t * (1 - t) * x + t * t * bx,
                        (1 - t) ** 2 * ay + 2 * t * (1 - t) * y + t * t * by))
    if closed:
        out.append(out[0])
    return np.array(out, dtype=float)


def outline(strokes, half):
    # The groove as convex pieces: a quad per segment (flat ends) and a mitre wedge at every bend, on both
    # sides — a bevel past the mitre limit (the photo's acute corners are blunt; right angles stay square).
    polys = []
    for pts, closed in strokes:
        line = polyline(pts, closed)
        dirs = []
        for a, b in zip(line[:-1], line[1:]):
            d = b - a
            L = np.hypot(*d)
            dirs.append(d / L if L > 1e-9 else None)
            if L > 1e-9:
                nrm = np.array([-d[1], d[0]]) / L * half
                polys.append([a + nrm, b + nrm, b - nrm, a - nrm])
        idx = range(len(dirs)) if closed else range(1, len(dirs))
        for i in idx:
            d1, d2, p = dirs[i - 1], dirs[i], line[i]
            if d1 is None or d2 is None:
                continue
            n1, n2 = np.array([-d1[1], d1[0]]) * half, np.array([-d2[1], d2[0]]) * half
            c = np.sqrt(max(0.0, (1 + np.dot(d1, d2)) / 2))  # cos of half the turn
            for s in (1, -1):
                if c > 1 / MITER_LIMIT and np.hypot(*(n1 + n2)) > 1e-9:
                    m = n1 + n2
                    tip = p + s * m / np.hypot(*m) * half / c
                    polys.append([p, p + s * n1, tip, p + s * n2])
                else:
                    polys.append([p, p + s * n1, p + s * n2])
    return polys


def raster(key, polys, dy=0.0, clip=None):
    # Coverage of the pieces, moved down by dy, at SSÃ— over the label's cell; rows outside clip (the cap
    # line and baseline edges, moved with the groove) are cut away.
    cx, cy = centre(key)
    x0, y0, x1, y1 = cell(key)
    im = Image.new('L', ((x1 - x0) * SS, (y1 - y0) * SS))
    draw = ImageDraw.Draw(im)
    ox, oy = (cx - x0) * SS, (cy + dy - y0) * SS
    for poly in polys:
        draw.polygon([(x * SS + ox, y * SS + oy) for x, y in poly], fill=255)
    a = np.asarray(im, dtype=bool)
    if clip:
        ys = y0 + (np.arange(a.shape[0]) + .5) / SS - cy - dy
        a = a & ((ys >= clip[0]) & (ys <= clip[1]))[:, None]
    return a


def draw(key, p, light, bg):
    strokes = MODELS[key][1](p)
    half = light['w'] / 2
    polys = outline(strokes, half)
    clip = (p.T - half, p.B + half)
    ink = raster(key, polys, 0, clip)
    lip = raster(key, polys, light['down'], clip) & ~raster(key, polys, -light['up'], clip)
    big = np.repeat(np.repeat(bg, SS, 0), SS, 1)
    img = np.where(ink, light['ink'], big)
    img = img * (1 - light['hl'] * lip) + light['lip'] * light['hl'] * lip
    h, w = bg.shape
    return img.reshape(h, SS, w, SS).mean(axis=(1, 3))


def background(key):
    # The plate under the label: a plane fitted to the cell's plain pixels.
    x0, y0, x1, y1 = cell(key)
    a = PHOTO[y0:y1, x0:x1]
    yy, xx = np.mgrid[y0:y1, x0:x1]
    ok = (a > 140) & (a < 200)
    A = np.c_[np.ones(ok.sum()), xx[ok], yy[ok]]
    c, *_ = np.linalg.lstsq(A, a[ok], rcond=None)
    return c[0] + c[1] * xx + c[2] * yy


def target(key):
    x0, y0, x1, y1 = cell(key)
    return PHOTO[y0:y1, x0:x1]


def nelder_mead(f, x0, step, iters=700):
    n = len(x0)
    pts = [np.array(x0, float)] + [np.array(x0, float) + np.eye(n)[i] * step for i in range(n)]
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = np.argsort(vals)
        pts, vals = [pts[i] for i in order], [vals[i] for i in order]
        if vals[-1] - vals[0] < 1e-4:
            break
        c = np.mean(pts[:-1], axis=0)
        xr = c + (c - pts[-1])
        fr = f(xr)
        if fr < vals[0]:
            xe = c + 2 * (c - pts[-1])
            fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = c + .5 * ((xr if fr < vals[-1] else pts[-1]) - c)
            fc = f(xc)
            if fc < min(fr, vals[-1]):
                pts[-1], vals[-1] = xc, fc
            else:
                pts = [pts[0]] + [pts[0] + .5 * (q - pts[0]) for q in pts[1:]]
                vals = [vals[0]] + [f(q) for q in pts[1:]]
    i = int(np.argmin(vals))
    return pts[i], vals[i]


def fit_glyph(key, light, font, start):
    # With 'H' in the font, every glyph is that tall (B = T + H) wherever it sits.
    fixed = shared_for(key, font)
    names = [n for n in MODELS[key][0].split() if n not in fixed and not (n == 'B' and 'H' in font)]
    bg, tg = background(key), target(key)

    def params(v):
        p = Params(fixed, **dict(zip(names, (round(float(x), 2) for x in v))))
        if 'H' in font:
            p['B'] = round(p['T'] + font['H'], 2)
        return p

    def f(v):
        return ((draw(key, params(v), light, bg) - tg) ** 2).mean()
    v = np.array([start[n] for n in names], float)
    best = f(v)
    for step in (.5, .25, .5, .15):
        v2, b2 = nelder_mead(f, v, step)
        if b2 <= best:
            v, best = v2, b2
    return dict(params(v)), best


def fit_light(fits):
    # The groove's width and light, shared by all labels, with each label's shape held.
    data = [(k, Params(fits[k]), background(k), target(k)) for k in fits]
    names = list(LIGHT)

    def f(v):
        light = dict(zip(names, v))
        return sum(((draw(k, p, light, bg) - tg) ** 2).mean() for k, p, bg, tg in data) / len(data)
    v, best = nelder_mead(f, [LIGHT[n] for n in names], .2, iters=250)
    return {n: round(float(x), 3) for n, x in zip(names, v)}, best


def sheet(fits, light, out):
    Z = 12
    for side, keys in (('L', LEFT), ('R', RIGHT)):
        rows = []
        for k in keys:
            if k not in fits:
                continue
            up = lambda a: Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize(
                (a.shape[1] * Z, a.shape[0] * Z), Image.NEAREST)
            p, o = up(target(k)), up(draw(k, Params(fits[k]), light, background(k)))
            rows.append([p.convert('RGB'), o.convert('RGB'), Image.merge('RGB', (p, o, o))])
        if not rows:
            continue
        w, h = rows[0][0].size
        im = Image.new('RGB', (3 * w + 20, len(rows) * (h + 6)), (40, 40, 40))
        for r, row in enumerate(rows):
            for c, tile in enumerate(row):
                im.paste(tile, (c * (w + 10), r * (h + 6)))
        im.save(os.path.join(out, f'fit-{side}.png'))


def js_table(fits):
    # The GLYPHS table for lockey-2930-keypad.js: each glyph's strokes, and the cap line and baseline
    # (bar centre lines) it's cut flush at.
    num = lambda v: re.sub(r'^(-?)0\.', r'\1.', f'{v:.2f}'.rstrip('0').rstrip('.')) if round(v, 2) else '0'
    pt = lambda q: '[' + ', '.join(num(v) for v in (q if q[2] else q[:2])) + ']'
    lines = []
    for k in LEFT + RIGHT:
        if k in fits:
            p = Params(fits[k])
            strokes = ', '.join('[' + ', '.join(pt(q) for q in pts) + (", 'Z'" if closed else '') + ']'
                                for pts, closed in MODELS[k][1](p))
            lines.append(f"{k if k.isdigit() else repr(k)}: {{ top: {num(p.T)}, bottom: {num(p.B)}, strokes: [{strokes}] }},")
    return '\n    '.join(lines)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    keys = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else LEFT + RIGHT
    path = os.path.join(out, 'fit.json')
    prev = json.load(open(path)) if os.path.exists(path) else {}
    font_path = os.path.join(out, 'font.json')
    font = json.load(open(font_path)) if os.path.exists(font_path) else {}
    light = prev.get('light', LIGHT)
    fits = prev.get('fits', {})
    if '--light' in sys.argv:
        light, best = fit_light(fits)
        print('light', light, round(best, 1))
    elif '--one' in sys.argv:  # one glyph, for the parallel run below
        fit, best = fit_glyph(keys, light, font, {**START[keys], **fits.get(keys, {})})
        json.dump({'fit': fit, 'loss': best}, open(os.path.join(out, f'one-{keys}.json'), 'w'))
        return
    else:  # each glyph in its own process
        procs = [subprocess.Popen([sys.executable, __file__, out, k, '--one']) for k in keys]
        for p in procs:
            p.wait()
        for k in keys:
            one = json.load(open(os.path.join(out, f'one-{k}.json')))
            fits[k] = one['fit']
            print(k, round(one['loss'], 1), fits[k])
    json.dump({'light': light, 'fits': fits}, open(path, 'w'), indent=1)
    sheet(fits, light, out)
    open(os.path.join(out, 'glyphs.js.txt'), 'w').write(js_table(fits))


if __name__ == '__main__':
    main()
