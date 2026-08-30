# the bespoke marine glyphs of src/icon-paths.ts, generated: python3 scripts/icon_glyphs.py prints the TS constants.
# every glyph is ONE filled path on the 24-px grid (nonzero fill): solid subpaths are emitted clockwise-on-screen so
# overlaps union, holes (an eye) the other way; strokes are quads + round joins, waves are ribbons of two sampled
# cubics. paste the output over the "bespoke" block of src/icon-paths.ts, then node scripts/build_icons.mjs.
import math
f = lambda v: ('%.2f' % v).rstrip('0').rstrip('.')
def area(pts): return sum(pts[i][0]*pts[(i+1)%len(pts)][1]-pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts)))
def poly(pts, hole=False):
    if (area(pts) < 0) != hole: pts = pts[::-1]
    return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts) + 'Z'
def circle(cx, cy, r, hole=False):
    s = 0 if hole else 1
    return f'M{f(cx-r)} {f(cy)}a{f(r)} {f(r)} 0 1 {s} {f(2*r)} 0a{f(r)} {f(r)} 0 1 {s} {f(-2*r)} 0Z'
def seg(a, b, w):  # a stroked segment as a quad
    dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy); nx, ny = -dy/L*w/2, dx/L*w/2
    return poly([(a[0]+nx, a[1]+ny), (b[0]+nx, b[1]+ny), (b[0]-nx, b[1]-ny), (a[0]-nx, a[1]-ny)])
def stroke(pts, w, closed=False, caps=True):  # a polyline stroked with quads + round joins
    d = ''
    n = len(pts)
    for i in range(n if closed else n-1): d += seg(pts[i], pts[(i+1) % n], w)
    js = pts if closed else (pts if caps else pts[1:-1])
    for p in js: d += circle(p[0], p[1], w/2)
    return d
def bez(p0, p1, p2, p3, n=8):  # sample a cubic
    return [((1-t)**3*p0[0]+3*(1-t)**2*t*p1[0]+3*(1-t)*t*t*p2[0]+t**3*p3[0], (1-t)**3*p0[1]+3*(1-t)**2*t*p1[1]+3*(1-t)*t*t*p2[1]+t**3*p3[1]) for t in [i/n for i in range(n+1)]]
def wave_pts(x0, x1, y, amp, period, n_per_half=6, phase=0):
    # a smooth wave: alternating S-curves crest <-> trough, each half period a cubic with horizontal tangents
    pts = []; x = x0; up = phase == 0
    while x < x1 - 1e-6:
        xe = min(x1, x + period/2)
        ya, yb = (y+amp, y-amp) if up else (y-amp, y+amp)
        # partial last half: keep the cubic shape of a full half and cut it
        full = x + period/2
        seg_pts = bez((x, ya), (x+period/4, ya), (x+period/4, yb), (full, yb), n_per_half)
        seg_pts = [p for p in seg_pts if p[0] <= xe + 1e-6]
        pts += seg_pts[1:] if pts else seg_pts
        x = full; up = not up
    return pts
def ribbon(x0, x1, y, amp, period, t, phase=0):
    top = wave_pts(x0, x1, y - t/2, amp, period, phase=phase); bot = wave_pts(x0, x1, y + t/2, amp, period, phase=phase)
    return poly(top + bot[::-1])
def curve(p0, p1, p2, p3, n=10): return bez(p0, p1, p2, p3, n)

ICON = {}
# realm-env: three stacked water surfaces
ICON['realm-env'] = ''.join(ribbon(2.5, 21.5, y, 1.25, 9.5, 2.1) for y in (6.5, 12, 17.5))
# lens-sections: the surface, three lines down, bottles/sensors as dots
d = ribbon(2, 22, 4.5, 1.1, 10, 2)
for x, ys in ((6, (10, 16)), (12, (12.5, 19)), (18, (9, 15))):
    d += poly([(x-.8, 7.3), (x+.8, 7.3), (x+.8, 21.5), (x-.8, 21.5)])
    for y in ys: d += circle(x, y, 2)
ICON['lens-sections'] = d
# lens-cruises: a research vessel in profile — raked bow right, bridge forward, the A-frame leaning out over the stern
d = ribbon(1, 23, 20.3, 1, 8.5, 1.9)
d += poly([(2, 13), (23, 13), (21.5, 15.5), (19.5, 17.6), (4.5, 17.6), (3, 15.5)])       # hull
d += poly([(11.5, 8.8), (18.5, 8.8), (18.5, 13.1), (11.5, 13.1)])                       # bridge deck
d += poly([(13, 5.8), (17, 5.8), (17, 8.9), (13, 8.9)])                                 # wheelhouse
d += poly([(14.6, 2.2), (15.4, 2.2), (15.4, 5.9), (14.6, 5.9)])                         # mast
d += stroke([(4.2, 13), (3.3, 5.2), (8.3, 13)], 1.7)                                    # A-frame over the stern
d += seg((3.9, 10.2), (7.2, 10.2), 1.3)                                                 # its brace
ICON['lens-cruises'] = d
# lens-regions: an abstract polygon, thin edges, small vertices
V = [(3.5, 9), (12, 3.5), (21, 7.5), (17.5, 20), (7, 17.5)]
ICON['lens-regions'] = stroke(V, 1.6, closed=True) + ''.join(circle(x, y, 2.2) for x, y in V)
# cat-whale: a whale in profile — head left, the peduncle curving up to raised flukes at the right, an eye, a pectoral fin
body = []
body += curve((1.5, 12.8), (1.5, 10), (3.8, 8.8), (7.5, 8.8))
body += curve((7.5, 8.8), (11.5, 8.8), (13.8, 9.4), (15.8, 8.6))[1:]
body += curve((15.8, 8.6), (17.2, 8), (18, 7), (18.6, 5.8))[1:]
body += [(22.4, 1.6), (23.8, 2.8), (21.2, 6.4), (23.9, 9.4), (22.9, 10.9), (19.9, 8.3)]
body += curve((19.9, 8.3), (19, 9.9), (18.2, 11.2), (16.8, 12.6))[1:]
body += curve((16.8, 12.6), (14.8, 14.8), (12, 16.8), (8, 16.8))[1:]
body += curve((8, 16.8), (5, 16.8), (2.5, 15.9), (1.5, 12.8))[1:]
ICON['cat-whale'] = poly(body) + poly([(7.6, 16.2), (9.2, 19.9), (11.8, 16.5)]) + circle(4.6, 11.7, 1, hole=True)
# cat-zooplankton: a copepod — the egg-shaped prosome, the first antennae sweeping out sideways, the segmented urosome and the forked tail
d = poly(curve((12, 3), (15.3, 3), (16.2, 7.5), (14.8, 11.5)) + curve((14.8, 11.5), (14, 13.4), (10, 13.4), (9.2, 11.5))[1:] + curve((9.2, 11.5), (7.8, 7.5), (8.7, 3), (12, 3))[1:])
d += stroke(curve((10.2, 6), (7, 5.5), (4, 6.5), (1.5, 9.5), 5), 1.5) + stroke(curve((13.8, 6), (17, 5.5), (20, 6.5), (22.5, 9.5), 5), 1.5)
for y0 in (13.4, 15.6, 17.8): d += poly([(10.9, y0), (13.1, y0), (13.1, y0 + 1.8), (10.9, y0 + 1.8)])
d += stroke([(11.6, 19.6), (9.8, 22.6)], 1.3) + stroke([(12.4, 19.6), (14.2, 22.6)], 1.3)
ICON['cat-zooplankton'] = d
# cat-krill: carapace at the left, a curved abdomen ending in a tail fan, antennae forward, swimming legs beneath, an eye
d = ''
car = curve((3, 11), (3, 7.5), (6.5, 6.5), (9.5, 6.8)) + curve((9.5, 6.8), (12.5, 7), (13.5, 9), (13.5, 11))[1:] + curve((13.5, 11), (13.5, 13.3), (11.5, 14.6), (8.5, 14.6))[1:] + curve((8.5, 14.6), (5.5, 14.6), (3, 13.5), (3, 11))[1:]
d += poly(car)
ab = curve((12.5, 9.8), (17, 9.8), (19.5, 12), (20.6, 16))
d += stroke(ab, 2.8, caps=False) + circle(20.6, 16, 1.4)
d += poly([(19.6, 15), (23.2, 12.8), (23.4, 15), (21, 16.2)]) + poly([(19.6, 17), (23.4, 17.6), (22.4, 19.6), (19.8, 18)])   # tail fan
d += stroke([(3.6, 9.2), (1.2, 5.2)], 1.2) + stroke([(4.8, 8), (3.2, 3.5)], 1.2)         # antennae
for x0, x1 in ((6.5, 5.5), (9.5, 8.8), (13.2, 12.8), (16.2, 16)): d += stroke([(x0, 14.2 if x0 < 12 else 13.4), (x1, 17.8 if x0 < 12 else 17.2)], 1.3)  # legs
d += circle(5.6, 10.2, 0.95, hole=True)
ICON['cat-krill'] = d
NAMES = {'realm-env': 'WAVES', 'lens-sections': 'SECTION', 'lens-cruises': 'VESSEL', 'lens-regions': 'POLYGON', 'cat-whale': 'WHALE', 'cat-zooplankton': 'COPEPOD', 'cat-krill': 'KRILL'}
for k, v in ICON.items(): print(f'const {NAMES[k]} = "{v}";')

