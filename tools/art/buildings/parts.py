# Plan 110 (docs/plan/110-the-buildings.md, phase 0) — the buildings' kit: its parts.
#
# Each part is a function writing into bkit's buffers under its name, in the part frame (x along the wall, y up,
# z out; the wall's face at z = 0). An opening's part has its origin at the bottom middle of the opening; a
# free-standing one at its footprint's middle. A name ending `~x` (or `~y`) is made 1 m long that way and stretched
# by the grammar; every other part is used at its size. The numbers: design/buildings/refs.md.
import math

from bkit import arc_band, at, beam, begin, box, cbox, cyl, disc, face, lathe, pane, prism_x, prism_y, prism_z, quad

PARTS = {}
FAMILY = {}


def part(name, family):
    def reg(fn):
        PARTS[name] = fn
        FAMILY[name] = family
        return fn

    return reg


# ── shared bits ──────────────────────────────────────────────────────────────────────────────────────────────

REVEAL = 0.12  # how deep a window's set into its wall (to its outer sash)


def reveal(x0, x1, y0, y1, d=REVEAL, role="trim"):
    """The opening's jambs, head and stool, from the wall's face back `d` (facing into the opening)."""
    quad(role, (x0, y0, -d), (x0, y1, -d), (x0, y1, 0), (x0, y0, 0), (1, 0, 0))
    quad(role, (x1, y0, -d), (x1, y1, -d), (x1, y1, 0), (x1, y0, 0), (-1, 0, 0))
    quad(role, (x0, y1, -d), (x1, y1, -d), (x1, y1, 0), (x0, y1, 0), (0, -1, 0))
    quad(role, (x0, y0, -d), (x1, y0, -d), (x1, y0, 0), (x0, y0, 0), (0, 1, 0))


def sash(x0, x1, y0, y1, z, cols=1, rows=1, stile=0.05, top=0.05, bottom=0.07, bar=0.018, d=0.04, role="sash"):
    """A glazed sash: its frame, its muntins (cols × rows lites), its glass just behind."""
    box(role, x0, x0 + stile, y0, y1, z - d / 2, z + d / 2)
    box(role, x1 - stile, x1, y0, y1, z - d / 2, z + d / 2)
    box(role, x0 + stile, x1 - stile, y1 - top, y1, z - d / 2, z + d / 2)
    box(role, x0 + stile, x1 - stile, y0, y0 + bottom, z - d / 2, z + d / 2)
    gx0, gx1, gy0, gy1 = x0 + stile, x1 - stile, y0 + bottom, y1 - top
    for i in range(1, cols):
        x = gx0 + (gx1 - gx0) * i / cols
        box(role, x - bar / 2, x + bar / 2, gy0, gy1, z - d / 4, z + d / 4)
    for j in range(1, rows):
        y = gy0 + (gy1 - gy0) * j / rows
        box(role, gx0, gx1, y - bar / 2, y + bar / 2, z - d / 4, z + d / 4)
    pane("glass", gx0, gx1, gy0, gy1, z - d / 4)


def double_hung(W, H, cols, rows, lower=None):
    """Two sashes, the upper outside the lower, meeting a little over half."""
    x0, x1 = -W / 2, W / 2
    m = H * 0.52
    reveal(x0, x1, 0, H)
    sash(x0 + 0.03, x1 - 0.03, m - 0.03, H - 0.03, -0.055, cols, rows, bottom=0.04)
    lc, lr = lower if lower else (cols, rows)
    sash(x0 + 0.03, x1 - 0.03, 0.03, m + 0.02, -0.095, lc, lr, top=0.04)
    box("sash", x0, x0 + 0.03, 0, H, -REVEAL, -0.03)  # the frame's jambs
    box("sash", x1 - 0.03, x1, 0, H, -REVEAL, -0.03)
    box("sash", x0, x1, H - 0.03, H, -REVEAL, -0.03)
    box("sash", x0, x1, 0, 0.03, -REVEAL, -0.02)


def flat_casing(W, H, w=0.1, d=0.024, head=0.0, sill=True, apron=False, role="trim"):
    """Boards round an opening (head `head` m taller than the sides' width: a craftsman's), a sill, an apron."""
    x0, x1 = -W / 2, W / 2
    box(role, x0 - w, x0, 0, H, 0, d)
    box(role, x1, x1 + w, 0, H, 0, d)
    hh = w + head
    box(role, x0 - w, x1 + w, H, H + hh, 0, d)
    if head:
        box(role, x0 - w - 0.03, x1 + w + 0.03, H + hh, H + hh + 0.035, 0, d + 0.03)  # its cap
    if sill:
        box(role, x0 - w - 0.04, x1 + w + 0.04, -0.045, 0.0, -0.02, d + 0.05)
    if apron:
        box(role, x0 - 0.02, x1 + 0.02, -0.2, -0.045, 0, d)


def wood_sill(W, w=0.1, role="trim"):
    box(role, -W / 2 - w - 0.04, W / 2 + w + 0.04, -0.045, 0.0, -0.02, 0.07)


def pediment(cx, y, w, h, d=0.06, role="trim", z0=0.0):
    """A triangle on the wall (its raking cornices proud), base w at height y."""
    prism_z(role, [(cx - w / 2, y), (cx + w / 2, y), (cx, y + h)], z0, z0 + d)
    s = math.atan2(h, w / 2)
    for sg in (-1, 1):
        a = (cx - sg * (w / 2 + 0.03), y - 0.01, z0 + d + 0.02)
        b = (cx, y + h + 0.03 / math.cos(s), z0 + d + 0.02)
        beam(role, a, b, 0.07, 0.05)
    box(role, cx - w / 2 - 0.04, cx + w / 2 + 0.04, y - 0.06, y, z0, z0 + d + 0.05)


def louvres(x0, x1, y0, y1, z, n, role="trim", tilt=0.6):
    """Slats across a frame (a shutter's, a belfry's, a vent's)."""
    for j in range(n):
        yc = y0 + (y1 - y0) * (j + 0.5) / n
        h = (y1 - y0) / n
        a = (x0, yc - h * 0.35, z - 0.012)
        b = (x0, yc + h * 0.35, z + 0.012)
        quad(role, (x0, a[1], a[2]), (x1, a[1], a[2]), (x1, b[1], b[2]), (x0, b[1], b[2]), (0, 1, tilt))
        quad(role, (x0, a[1], a[2] - 0.004), (x1, a[1], a[2] - 0.004), (x1, b[1], b[2] - 0.004), (x0, b[1], b[2] - 0.004), (0, -1, -tilt))


def panel_door(x0, x1, y0, y1, z, cols=2, rows=3, glass_rows=0, role="door"):
    """A door leaf: stiles and rails round raised panels (or lites in its top `glass_rows`)."""
    d = 0.045
    st = 0.11
    box(role, x0, x1, y0, y1, z - d, z)  # its back
    box(role, x0, x0 + st, y0, y1, z, z + 0.012)
    box(role, x1 - st, x1, y0, y1, z, z + 0.012)
    box(role, x0 + st, x1 - st, y0, y0 + 0.22, z, z + 0.012)
    box(role, x0 + st, x1 - st, y1 - st, y1, z, z + 0.012)
    gx0, gx1, gy0, gy1 = x0 + st, x1 - st, y0 + 0.22, y1 - st
    for i in range(1, cols):
        x = gx0 + (gx1 - gx0) * i / cols
        box(role, x - 0.05, x + 0.05, gy0, gy1, z, z + 0.012)
    for j in range(1, rows):
        y = gy0 + (gy1 - gy0) * j / rows
        box(role, gx0, gx1, y - 0.05, y + 0.05, z, z + 0.012)
    for i in range(cols):
        for j in range(rows):
            px0 = gx0 + (gx1 - gx0) * i / cols + (0.05 if i else 0)
            px1 = gx0 + (gx1 - gx0) * (i + 1) / cols - (0.05 if i < cols - 1 else 0)
            py0 = gy0 + (gy1 - gy0) * j / rows + (0.05 if j else 0)
            py1 = gy0 + (gy1 - gy0) * (j + 1) / rows - (0.05 if j < rows - 1 else 0)
            if j >= rows - glass_rows:
                pane("glass", px0, px1, py0, py1, z - 0.01)
            else:
                box(role, px0 + 0.025, px1 - 0.025, py0 + 0.025, py1 - 0.025, z, z + 0.008)


def knob(x, y, z, role="gold"):
    cyl(role, 0.028, y - 0.01, y + 0.01, 8, x, z + 0.03)
    box(role, x - 0.015, x + 0.015, y - 0.08, y + 0.04, z, z + 0.01)


# ── windows ──────────────────────────────────────────────────────────────────────────────────────────────────


@part("win-dh66", "windows")
def _():
    double_hung(0.85, 1.55, 3, 2)


@part("win-dh66-cased", "windows")
def _():
    double_hung(0.85, 1.55, 3, 2)
    flat_casing(0.85, 1.55, head=0.04)


@part("win-dh22", "windows")
def _():
    double_hung(0.85, 1.55, 1, 2)


@part("win-dh22-cased", "windows")
def _():
    double_hung(0.85, 1.55, 1, 2)
    flat_casing(0.85, 1.55)


@part("win-vic11-hood", "windows")
def _():
    # tall one-over-one under an Italianate hood on brackets
    W, H = 0.85, 1.95
    double_hung(W, H, 1, 1)
    flat_casing(W, H, w=0.09, sill=False)
    box("trim", -W / 2 - 0.16, W / 2 + 0.16, -0.06, 0, -0.02, 0.08)
    prism_x("trim", [(0, H + 0.09), (0.05, H + 0.09), (0.05, H + 0.3), (0.14, H + 0.36), (0.14, H + 0.41), (0, H + 0.41)], -W / 2 - 0.2, W / 2 + 0.2)
    for sg in (-1, 1):
        x = sg * (W / 2 + 0.12)
        prism_z("trim", [(x - 0.04, H - 0.1), (x + 0.04, H - 0.1), (x + 0.04, H + 0.09), (x - 0.04, H + 0.09)], 0, 0.13)


@part("win-vic11-ped", "windows")
def _():
    W, H = 0.85, 1.95
    double_hung(W, H, 1, 1)
    flat_casing(W, H, w=0.11)
    pediment(0, H + 0.11, W + 0.42, 0.32)


@part("win-cr31", "windows")
def _():
    # craftsman: three lites over one, a wide flat casing, its head cap, an apron
    W, H = 0.8, 1.4
    double_hung(W, H, 3, 1, lower=(1, 1))
    flat_casing(W, H, w=0.14, head=0.06, apron=True)


@part("win-cr31-trio", "windows")
def _():
    W, H = 0.8, 1.4
    for i in (-1, 0, 1):
        at((i * (W + 0.12), 0, 0))
        double_hung(W, H, 3, 1, lower=(1, 1))
    at()
    full = 3 * W + 2 * 0.12
    flat_casing(full, H, w=0.14, head=0.06, apron=True)
    for sg in (-1, 1):
        box("trim", sg * (W / 2 + 0.06) - 0.06, sg * (W / 2 + 0.06) + 0.06, 0, H, 0, 0.024)


@part("win-sq", "windows")
def _():
    reveal(-0.3, 0.3, 0, 0.6)
    sash(-0.3, 0.3, 0, 0.6, -0.07, 2, 2, stile=0.05, top=0.05, bottom=0.05)


@part("win-sq-cased", "windows")
def _():
    reveal(-0.3, 0.3, 0, 0.6)
    sash(-0.3, 0.3, 0, 0.6, -0.07, 2, 2, stile=0.05, top=0.05, bottom=0.05)
    flat_casing(0.6, 0.6, w=0.09)


def arch_window(W, H, r, z=-0.08):
    """A rectangle under a half-round head: the reveal, a sash, a fan of bars in the head."""
    x0, x1 = -W / 2, W / 2
    reveal(x0, x1, 0, H)
    arc_band("trim", 0, H, r, r + 0.001, -REVEAL, 0, 0, math.pi, 14, caps=False)  # the head's soffit
    sash(x0 + 0.03, x1 - 0.03, 0.03, H, z, 2, 3, top=0.04)
    arc_band("sash", 0, H, r - 0.08, r - 0.03, z - 0.02, z + 0.02, 0, math.pi, 14)
    box("sash", -0.01, 0.01, H, H + r - 0.08, z - 0.01, z + 0.01)
    disc("glass", 0, H, r - 0.06, z - 0.01, 0, math.pi, 14)


@part("win-arch", "windows")
def _():
    arch_window(0.9, 1.95, 0.45)


@part("win-arch-brick", "windows")
def _():
    # in brick: two rings of headers over it, a stone sill
    W, H, r = 0.9, 1.95, 0.45
    arch_window(W, H, r)
    for k in range(13):
        a0, a1 = math.pi * k / 13, math.pi * (k + 1) / 13 - 0.01
        arc_band("brick", 0, H, r, r + 0.22, 0, 0.03, a0, a1, 2)
    box("stone", -W / 2 - 0.08, W / 2 + 0.08, -0.1, 0, -0.03, 0.06)


@part("win-pointed", "windows")
def _():
    # a lancet: 1.0 × 3.2 to the spring, a Y of tracery, a stone surround
    W, H = 1.0, 2.6
    r = W  # equilateral arch: each side's centre on the other's spring
    x0, x1 = -W / 2, W / 2
    reveal(x0, x1, 0, H, 0.2, "stone")
    a = math.acos(0.5)  # the arc's sweep from each spring to the point
    for sg in (-1, 1):
        cx = -sg * W / 2
        lo, hi = (0, a) if sg > 0 else (math.pi - a, math.pi)
        arc_band("stone", cx, H, r, r + 0.18, 0, 0.04, lo, hi, 10, caps=False)
        arc_band("stone", cx, H, r - 0.001, r, -0.2, 0, lo, hi, 10, caps=False)
    pts = [(x0, 0), (x1, 0), (x1, H)]
    for i in range(1, 11):
        t = a * i / 10
        pts.append((-W / 2 + r * math.cos(t), H + r * math.sin(t)))
    for i in range(1, 10):
        t = math.pi - a + a * i / 10
        pts.append((W / 2 + r * math.cos(t), H + r * math.sin(t)))
    pts.append((x0, H))
    face("glass", [(x, y, -0.12) for x, y in pts], (0, 0, 1))
    box("stone", -0.03, 0.03, 0, H, -0.16, -0.08)  # the mullion
    for sg in (-1, 1):  # the Y
        beam("stone", (0, H, -0.12), (sg * W * 0.38, H + 0.62, -0.12), 0.05, 0.08)
    for j in range(1, 6):
        box("metal", x0, x1, j * H / 6 - 0.006, j * H / 6 + 0.006, -0.125, -0.115)  # lead cames
    box("stone", x0 - 0.1, x1 + 0.1, -0.12, 0, -0.04, 0.07)


@part("win-oculus", "windows")
def _():
    r = 0.45
    arc_band("trim", 0, r, r, r + 0.12, 0, 0.03, 0, 2 * math.pi, 24, caps=False)
    arc_band("trim", 0, r, r - 0.001, r, -REVEAL, 0, 0, 2 * math.pi, 24, caps=False)
    disc("glass", 0, r, r, -0.08, 0, 2 * math.pi, 24)
    box("sash", -r, r, r - 0.012, r + 0.012, -0.08, -0.06)
    box("sash", -0.012, 0.012, 0, 2 * r, -0.08, -0.06)


@part("win-ribbon~x", "windows")
def _():
    # an office's ribbon, 1 m of it: aluminium frame, a mullion at each end (the grammar's module 1.5)
    H = 1.7
    reveal(-0.5, 0.5, 0, H, 0.08, "metal")
    box("metal", -0.5, 0.5, 0, 0.05, -0.08, 0)
    box("metal", -0.5, 0.5, H - 0.05, H, -0.08, 0)
    for x in (-0.5, 0.5):
        box("metal", x - 0.025, x + 0.025, 0, H, -0.08, 0.0)
    pane("glass", -0.5, 0.5, 0.05, H - 0.05, -0.05)


@part("win-curtain", "windows")
def _():
    # a curtain wall's module: 1.5 × 3.8, vision glass over a spandrel panel, caps proud
    W, H, sp = 1.5, 3.8, 1.1
    pane("glass", -W / 2, W / 2, sp, H, 0)
    box("metal", -W / 2, W / 2, 0, sp, -0.02, 0)
    for x in (-W / 2, W / 2):
        box("chrome", x - 0.03, x + 0.03, 0, H, 0, 0.09)
    for y in (0, sp, H):
        box("chrome", -W / 2, W / 2, y - 0.03, y + 0.03, 0, 0.05)


@part("win-steel", "windows")
def _():
    # industrial steel sash, 1.8 × 2.4, 4 × 6 lites, a hopper in the middle
    W, H = 1.8, 2.4
    reveal(-W / 2, W / 2, 0, H, 0.22, "brick")
    sash(-W / 2, W / 2, 0, H, -0.16, 4, 6, stile=0.04, top=0.04, bottom=0.04, bar=0.022, role="metal")
    box("stone", -W / 2 - 0.06, W / 2 + 0.06, -0.12, 0, -0.04, 0.06)


@part("win-bay", "windows")
def _():
    # a three-sided bay: 2.4 across the wall, 0.65 out, 45° sides, 1/1 windows over panels, a hipped roof
    W, D, H, base = 2.4, 0.65, 1.95, 0.75
    front = W - 2 * D
    sides = [(0.0, (0, 0, D), front), (math.radians(45), (-front / 2 - D / 2, 0, D / 2), D * math.sqrt(2)), (math.radians(-45), (front / 2 + D / 2, 0, D / 2), D * math.sqrt(2))]
    for turn, o, w in sides:
        at(o, turn)
        box("trim", -w / 2, w / 2, 0, base, -0.08, 0)
        box("trim", -w / 2 + 0.1, w / 2 - 0.1, 0.12, base - 0.12, 0, 0.012)
        box("trim", -w / 2, w / 2, base - 0.05, base, 0, 0.05)
        ww = min(w - 0.2, 0.85)
        at((o[0], base, o[2]), turn)
        sash(-ww / 2, ww / 2, H * 0.5, H, -0.03, 1, 1, bottom=0.04)
        sash(-ww / 2, ww / 2, 0, H * 0.52, -0.05, 1, 1, top=0.04)
        for sg in (-1, 1):
            box("trim", sg * ww / 2 - (0.0 if sg > 0 else (w - ww) / 2), sg * ww / 2 + ((w - ww) / 2 if sg > 0 else 0.0), 0, H, -0.08, 0.0)
        box("trim", -w / 2, w / 2, H, H + 0.25, -0.08, 0.0)
    at()
    top = base + H + 0.25
    box("trim", -W / 2 - 0.05, W / 2 + 0.05, top, top + 0.08, 0, D + 0.12)
    # the hipped roof: a front slope and two corners down from the wall
    rh = 0.45
    quad("roof", (-front / 2 - 0.1, top + 0.08, D + 0.12), (front / 2 + 0.1, top + 0.08, D + 0.12), (front / 2, top + 0.08 + rh, 0), (-front / 2, top + 0.08 + rh, 0), (0, 1, 1))
    for sg in (-1, 1):
        face("roof", [(sg * (front / 2 + 0.1), top + 0.08, D + 0.12), (sg * (W / 2 + 0.05), top + 0.08, 0), (sg * front / 2, top + 0.08 + rh, 0)], (sg, 1, 1))
    box("trim", -W / 2 + 0.05, W / 2 - 0.05, -0.05, 0, 0, D + 0.04)


def skin_round(x0, x1, y0, y1, holes, z=0.0):
    """The wall's own skin over x0–x1, y0–y1, with rectangular holes [(hx0, hx1, hy0, hy1)] (in a row)."""
    hs = sorted(holes)
    lo, hi = min(h[2] for h in hs), max(h[3] for h in hs)
    pane("skin", x0, x1, y0, lo, z)
    pane("skin", x0, x1, hi, y1, z)
    x = x0
    for hx0, hx1, hy0, hy1 in hs:
        pane("skin", x, hx0, lo, hi, z)
        if hy0 > lo:
            pane("skin", hx0, hx1, lo, hy0, z)
        if hy1 < hi:
            pane("skin", hx0, hx1, hy1, hi, z)
        x = hx1
    pane("skin", x, x1, lo, hi, z)


def gable_dormer(W=1.3, pitch=50):
    # a gable dormer standing out of a 45° roof: its front and cheeks in the wall's skin, a window, its own little
    # roof running back into the main one (the grammar sinks what's past the roof)
    wh = 1.35
    rh = (W / 2 + 0.15) * math.tan(math.radians(pitch))
    ww, wy0, wy1 = 0.75, 0.15, 1.17
    skin_round(-W / 2, W / 2, 0, wh, [(-ww / 2, ww / 2, wy0, wy1)])
    face("skin", [(-W / 2, wh, 0), (W / 2, wh, 0), (0, wh + rh - 0.04, 0)], (0, 0, 1))
    for sg in (-1, 1):
        face("skin", [(sg * W / 2, 0, 0), (sg * W / 2, wh, 0), (sg * W / 2, wh, -wh)], (sg, 0, 0))
        box("trim", sg * W / 2 - (0.1 if sg > 0 else 0), sg * W / 2 + (0.1 if sg < 0 else 0), 0, wh, 0, 0.025)
    D = wh + rh + 0.2
    for sg in (-1, 1):
        a, b = (sg * (W / 2 + 0.15), wh - 0.05), (0, wh + rh)
        quad("roof", (a[0], a[1], 0.12), (b[0], b[1], 0.12), (b[0], b[1], -D), (a[0], a[1], -D), (sg, 1, 0))
        beam("trim", (a[0] * 0.97, a[1] + 0.03, 0.08), (0, b[1] - 0.02, 0.08), 0.05, 0.16)
        face("trim", [(sg * W / 2, wh - 0.05, 0), (sg * (W / 2 + 0.15), wh - 0.05, 0.12), (sg * (W / 2 + 0.15), wh - 0.05, -wh), (sg * W / 2, wh - 0.05, -wh)], (0, -1, 0))
    at((0, wy0, 0))
    double_hung(ww, wy1 - wy0, 2, 2)
    flat_casing(ww, wy1 - wy0, w=0.08)
    at()


@part("dormer-gable", "windows")
def _():
    gable_dormer()


@part("dormer-shed", "windows")
def _():
    # a shed dormer, 2.6 wide with two windows, on a 45° roof (a cape's or a bungalow's)
    W, wh, k = 2.6, 1.25, 0.18
    L = wh / (1 - k)
    holes = [(x - 0.4, x + 0.4, 0.15, 1.1) for x in (-0.62, 0.62)]
    skin_round(-W / 2, W / 2, 0, wh, holes)
    for sg in (-1, 1):
        face("skin", [(sg * W / 2, 0, 0), (sg * W / 2, wh, 0), (sg * W / 2, L, -L)], (sg, 0, 0))
        box("trim", sg * W / 2 - (0.1 if sg > 0 else 0), sg * W / 2 + (0.1 if sg < 0 else 0), 0, wh, 0, 0.025)
    quad("roof", (-W / 2 - 0.15, wh + 0.02, 0.3), (W / 2 + 0.15, wh + 0.02, 0.3), (W / 2 + 0.15, wh + 0.02 + (L + 0.6) * k, -L - 0.3), (-W / 2 - 0.15, wh + 0.02 + (L + 0.6) * k, -L - 0.3), (0, 1, k))
    box("trim", -W / 2 - 0.15, W / 2 + 0.15, wh - 0.14, wh + 0.02, 0.15, 0.3)
    quad("trim", (-W / 2 - 0.15, wh - 0.14, 0.15), (W / 2 + 0.15, wh - 0.14, 0.15), (W / 2 + 0.15, wh - 0.14, 0.0), (-W / 2 - 0.15, wh - 0.14, 0.0), (0, -1, 0))
    for x in (-0.62, 0.62):
        at((x, 0.15, 0))
        double_hung(0.8, 0.95, 2, 2)
        flat_casing(0.8, 0.95, w=0.08)
    at()


# ── window dress ─────────────────────────────────────────────────────────────────────────────────────────────


@part("sill-stone~x", "dress")
def _():
    prism_x("stone", [(-0.04, 0), (0.07, 0), (0.07, 0.03), (0.04, 0.09), (-0.04, 0.09)], -0.5, 0.5)


@part("lintel-stone~x", "dress")
def _():
    box("stone", -0.5, 0.5, 0, 0.22, -0.02, 0.02)
    box("stone", -0.12, 0.12, 0.0, 0.22, 0.02, 0.035)  # its keystone


@part("lintel-jack~x", "dress")
def _():
    # a flat arch of bricks on end, splayed
    n = 9
    for i in range(n):
        x0 = -0.5 + i / n
        x1 = x0 + 1 / n - 0.008
        k0, k1 = (x0) * 0.25, (x1) * 0.25
        face("brick", [(x0, 0, 0.012), (x1, 0, 0.012), (x1 + k1, 0.22, 0.012), (x0 + k0, 0.22, 0.012)], (0, 0, 1))


@part("shutter-louvred~y", "dress")
def _():
    # one leaf, 0.42 wide: stiles and rails, louvres in two fields
    W = 0.42
    box("door", -W / 2, -W / 2 + 0.06, 0, 1, 0, 0.03)
    box("door", W / 2 - 0.06, W / 2, 0, 1, 0, 0.03)
    for y0, y1 in ((0, 0.06), (0.47, 0.53), (0.94, 1.0)):
        box("door", -W / 2 + 0.06, W / 2 - 0.06, y0, y1, 0, 0.03)
    louvres(-W / 2 + 0.06, W / 2 - 0.06, 0.06, 0.47, 0.012, 8, "door")
    louvres(-W / 2 + 0.06, W / 2 - 0.06, 0.53, 0.94, 0.012, 8, "door")


@part("shutter-panel~y", "dress")
def _():
    W = 0.42
    box("door", -W / 2, W / 2, 0, 1, 0, 0.022)
    for y0, y1 in ((0.07, 0.45), (0.53, 0.93)):
        box("door", -W / 2 + 0.07, W / 2 - 0.07, y0, y1, 0.022, 0.032)


@part("windowbox", "dress")
def _():
    box("trim", -0.5, 0.5, -0.3, -0.08, 0, 0.22)
    box("trim", -0.52, 0.52, -0.1, -0.06, -0.01, 0.24)
    for i in range(9):
        x = -0.42 + i * 0.105
        lathe("wood", [(0.0, -0.08), (0.07, -0.02), (0.06, 0.05), (0.0, 0.1)], 6, x, 0.11)


@part("ac-unit", "dress")
def _():
    # a window unit in the lower sash's place, its back out over the sill
    box("galv", -0.33, 0.33, 0.02, 0.4, -0.1, 0.32)
    for j in range(7):
        box("metal", -0.28, 0.28, 0.07 + j * 0.045, 0.085 + j * 0.045, 0.32, 0.327)
    box("metal", -0.36, -0.3, 0.38, 0.42, -0.1, 0.0)
    box("metal", 0.3, 0.36, 0.38, 0.42, -0.1, 0.0)


# ── doors ────────────────────────────────────────────────────────────────────────────────────────────────────


@part("door-front", "doors")
def _():
    # a six-panel door with sidelights and a transom, pilasters and an entablature: 2.1 wide, 2.9 tall
    D, H, sl, tr = 0.95, 2.15, 0.36, 0.42
    full = D + 2 * sl + 0.1
    reveal(-full / 2, full / 2, 0, H + tr + 0.05, 0.16)
    panel_door(-D / 2, D / 2, 0, H, -0.14, 2, 3)
    knob(D / 2 - 0.09, 0.98, -0.14)
    for sg in (-1, 1):
        x0 = sg * (D / 2 + 0.05)
        x1 = sg * (D / 2 + 0.05 + sl)
        box("trim", min(x0, x1), max(x0, x1), 0, 0.75, -0.15, -0.12)
        sash(min(x0, x1), max(x0, x1), 0.75, H, -0.13, 1, 4, stile=0.035, top=0.035, bottom=0.035)
        box("trim", sg * D / 2, sg * (D / 2 + 0.05), 0, H + tr, -0.16, -0.1)
    sash(-full / 2 + 0.04, full / 2 - 0.04, H + 0.05, H + tr, -0.13, 5, 1, stile=0.035, top=0.035, bottom=0.035)
    box("trim", -full / 2, full / 2, H, H + 0.05, -0.16, -0.1)
    # the surround: fluted pilasters, a frieze, a cornice
    tp = H + tr + 0.05
    for sg in (-1, 1):
        x = sg * (full / 2 + 0.09)
        box("trim", x - 0.11, x + 0.11, 0, tp, 0, 0.05)
        for k in (-1, 0, 1):
            box("trim", x + k * 0.06 - 0.012, x + k * 0.06 + 0.012, 0.25, tp - 0.15, 0.05, 0.058)
        box("trim", x - 0.13, x + 0.13, 0, 0.22, 0, 0.07)
    box("trim", -full / 2 - 0.22, full / 2 + 0.22, tp, tp + 0.28, 0, 0.06)
    prism_x("trim", [(0, tp + 0.28), (0.1, tp + 0.28), (0.18, tp + 0.38), (0.18, tp + 0.44), (0, tp + 0.44)], -full / 2 - 0.3, full / 2 + 0.3)
    box("stone", -full / 2 - 0.3, full / 2 + 0.3, -0.18, 0, -0.16, 0.45)


@part("door-fan", "doors")
def _():
    # the colonial door: a fanlight over a six-panel door, pilasters, a pediment
    D, H = 0.95, 2.15
    r = D / 2 + 0.05
    reveal(-r, r, 0, H, 0.16)
    arc_band("trim", 0, H, r - 0.001, r, -0.16, 0, 0, math.pi, 14, caps=False)
    panel_door(-D / 2, D / 2, 0, H, -0.14, 2, 3)
    knob(D / 2 - 0.09, 0.98, -0.14)
    disc("glass", 0, H, r - 0.02, -0.13, 0, math.pi, 14)
    for k in range(1, 6):
        a = math.pi * k / 6
        beam("sash", (0.08 * math.cos(a), H + 0.08 * math.sin(a), -0.125), ((r - 0.04) * math.cos(a), H + (r - 0.04) * math.sin(a), -0.125), 0.02, 0.02)
    arc_band("sash", 0, H, 0.06, 0.1, -0.135, -0.115, 0, math.pi, 8)
    arc_band("trim", 0, H, r, r + 0.12, 0, 0.04, 0, math.pi, 14)
    box("stone", -0.07, 0.07, H + r - 0.02, H + r + 0.16, 0.0, 0.07)  # keystone
    for sg in (-1, 1):
        x = sg * (r + 0.24)
        box("trim", x - 0.12, x + 0.12, 0, H + r + 0.2, 0, 0.05)
        box("trim", x - 0.14, x + 0.14, 0, 0.22, 0, 0.07)
    tp = H + r + 0.2
    box("trim", -r - 0.4, r + 0.4, tp, tp + 0.22, 0, 0.06)
    pediment(0, tp + 0.22, 2 * r + 1.0, 0.5, 0.08)
    box("stone", -r - 0.45, r + 0.45, -0.18, 0, -0.16, 0.45)


@part("door-shop", "doors")
def _():
    # a shop's door: a glazed leaf, its kick plate, a transom over
    D, H, tr = 0.95, 2.15, 0.5
    reveal(-D / 2, D / 2, 0, H + tr, 0.08, "metal")
    box("door", -D / 2, D / 2, 0, H, -0.08, -0.04, skip=("front",))
    for x0, x1, y0, y1 in ((-D / 2, -D / 2 + 0.1, 0, H), (D / 2 - 0.1, D / 2, 0, H), (-D / 2, D / 2, 0, 0.3), (-D / 2, D / 2, H - 0.1, H)):
        box("door", x0, x1, y0, y1, -0.06, -0.03)
    box("chrome", -D / 2 + 0.1, D / 2 - 0.1, 0.02, 0.28, -0.03, -0.027)
    pane("glass", -D / 2 + 0.1, D / 2 - 0.1, 0.3, H - 0.1, -0.05)
    beam("chrome", (D / 2 - 0.16, 0.95, -0.02), (-D / 2 + 0.16, 0.95, -0.02), 0.03, 0.03)
    box("door", -D / 2, D / 2, H, H + 0.06, -0.08, -0.02)
    pane("glass", -D / 2, D / 2, H + 0.06, H + tr, -0.05)


@part("door-double", "doors")
def _():
    # civic doors: a pair, glazed above panels, under an arched transom in a stone surround; 2.0 × 3.6
    W, H = 1.8, 2.6
    r = W / 2
    reveal(-r, r, 0, H, 0.25, "stone")
    arc_band("stone", 0, H, r - 0.001, r, -0.25, 0, 0, math.pi, 16, caps=False)
    for sg in (-1, 1):
        x0, x1 = (-r, -0.005) if sg < 0 else (0.005, r)
        panel_door(x0, x1, 0, H, -0.2, 1, 3, glass_rows=1)
        knob(sg * 0.1, 1.1, -0.2, "chrome")
    disc("glass", 0, H, r - 0.05, -0.2, 0, math.pi, 16)
    arc_band("door", 0, H, r - 0.08, r, -0.22, -0.18, 0, math.pi, 16)
    for k in range(1, 4):
        a = math.pi * k / 4
        beam("door", (0, H, -0.2), ((r - 0.05) * math.cos(a), H + (r - 0.05) * math.sin(a), -0.2), 0.03, 0.03)
    for k in range(15):
        a0, a1 = math.pi * k / 15, math.pi * (k + 1) / 15 - 0.008
        arc_band("stone", 0, H, r, r + 0.35, 0, 0.06, a0, a1, 2)
    for sg in (-1, 1):
        box("stone", sg * r - 0.3 * (sg < 0), sg * r + 0.3 * (sg > 0), 0, H, 0, 0.06)
    box("stone", -r - 0.5, r + 0.5, -0.17, 0, -0.25, 0.6)


@part("door-pointed", "doors")
def _():
    # the church's: a pair of boarded leaves with strap hinges under a pointed head, a stone surround
    W, H = 1.8, 2.5
    r = W
    a = math.acos(0.5)
    reveal(-W / 2, W / 2, 0, H, 0.3, "stone")
    pts = [(-W / 2, 0), (W / 2, 0), (W / 2, H)]
    for i in range(1, 11):
        t = a * i / 10
        pts.append((-W / 2 + r * math.cos(t), H + r * math.sin(t)))
    for i in range(1, 10):
        t = math.pi - a + a * i / 10
        pts.append((W / 2 + r * math.cos(t), H + r * math.sin(t)))
    pts.append((-W / 2, H))
    face("door", [(x, y, -0.25) for x, y in pts], (0, 0, 1))
    for i in range(1, 12):
        x = -W / 2 + W * i / 12
        c = W / 2 if x < 0 else -W / 2  # (each side's arc is centred on the other side's spring)
        hi = H + math.sqrt(max(0.0, r * r - (x - c) ** 2))
        box("door", x - 0.006, x + 0.006, 0, hi - 0.04, -0.25, -0.24)
    box("door", -0.008, 0.008, 0, H + 1.5, -0.25, -0.235)
    for y in (0.35, 1.25, 2.15):
        for sg in (-1, 1):
            box("metal", sg * 0.05 if sg > 0 else -0.8, 0.8 if sg > 0 else -0.05, y, y + 0.06, -0.24, -0.228)
    for sg in (-1, 1):
        cx = -sg * W / 2
        lo, hi = (0, a) if sg > 0 else (math.pi - a, math.pi)
        arc_band("stone", cx, H, r, r + 0.3, 0, 0.08, lo, hi, 10, caps=False)
        arc_band("stone", cx, H, r - 0.001, r, -0.3, 0, lo, hi, 10, caps=False)
        box("stone", sg * W / 2 + (0 if sg > 0 else -0.3), sg * W / 2 + (0.3 if sg > 0 else 0), 0, H, 0, 0.08)
    box("stone", -W / 2 - 0.6, W / 2 + 0.6, -0.17, 0, -0.3, 0.7)


@part("door-garage", "doors")
def _():
    # a house's sectional door, 2.7 × 2.15, four sections of raised panels, its casing
    W, H = 2.7, 2.15
    reveal(-W / 2, W / 2, 0, H, 0.12)
    for j in range(4):
        y0, y1 = H * j / 4 + 0.005, H * (j + 1) / 4 - 0.005
        box("door", -W / 2, W / 2, y0, y1, -0.11, -0.07)
        for i in range(4):
            x0 = -W / 2 + 0.08 + i * (W - 0.16) / 4 + 0.03
            x1 = -W / 2 + 0.08 + (i + 1) * (W - 0.16) / 4 - 0.03
            if j == 3:
                pane("glass", x0, x1, y0 + 0.1, y1 - 0.1, -0.068)
            else:
                box("door", x0, x1, y0 + 0.1, y1 - 0.1, -0.07, -0.06)
    flat_casing(W, H, w=0.12, sill=False)


@part("door-rollup", "doors")
def _():
    # a roll-up door, 3.6 × 4.3: slats, guides, its drum box
    W, H = 3.6, 4.3
    reveal(-W / 2, W / 2, 0, H, 0.2, "concrete")
    box("galv", -W / 2, W / 2, 0, H, -0.18, -0.16)
    for j in range(int(H / 0.08)):
        y = j * 0.08
        prism_x("galv", [(-0.16, y), (-0.135, y + 0.02), (-0.135, y + 0.06), (-0.16, y + 0.08)], -W / 2 + 0.04, W / 2 - 0.04, caps=False)
    for sg in (-1, 1):
        box("metal", sg * W / 2 - 0.06, sg * W / 2 + 0.06, 0, H, -0.2, -0.1)
    box("metal", -W / 2 - 0.05, W / 2 + 0.05, 0, 0.06, -0.17, -0.12)
    box("galv", -W / 2 - 0.2, W / 2 + 0.2, H, H + 0.55, 0, 0.55)
    box("metal", W / 2 + 0.25, W / 2 + 0.4, 1.0, 1.35, 0, 0.12)  # its switch box


@part("door-apparatus", "doors")
def _():
    # a fire station's bay door: 3.7 × 4.3 sectional, a band of lites, the frame painted
    W, H = 3.7, 4.3
    reveal(-W / 2, W / 2, 0, H, 0.25, "brick")
    n = 6
    for j in range(n):
        y0, y1 = H * j / n + 0.004, H * (j + 1) / n - 0.004
        if j in (3, 4):
            for i in range(5):
                x0 = -W / 2 + W * i / 5
                x1 = x0 + W / 5
                box("red", x0, x0 + 0.06, y0, y1, -0.2, -0.16)
                box("red", x1 - 0.06, x1, y0, y1, -0.2, -0.16)
                box("red", x0, x1, y0, y0 + 0.07, -0.2, -0.16)
                box("red", x0, x1, y1 - 0.07, y1, -0.2, -0.16)
                pane("glass", x0 + 0.06, x1 - 0.06, y0 + 0.07, y1 - 0.07, -0.18)
        else:
            box("red", -W / 2, W / 2, y0, y1, -0.2, -0.16)
            box("red", -W / 2 + 0.1, W / 2 - 0.1, y0 + 0.12, y1 - 0.12, -0.16, -0.15)
    box("metal", -W / 2 - 0.03, W / 2 + 0.03, H - 0.02, H + 0.08, -0.25, -0.15)


@part("door-barn", "doors")
def _():
    # a barn's sliding pair: boarded, X-braced in white, on a track
    W, H = 3.6, 4.0
    reveal(-W / 2, W / 2, 0, H, 0.15, "wood")
    for sg in (-1, 1):
        x0, x1 = (-W / 2 - 0.1, 0) if sg < 0 else (0, W / 2 + 0.1)
        box("red", x0, x1, 0.02, H + 0.05, 0.06, 0.1)
        for i in range(1, 10):
            x = x0 + (x1 - x0) * i / 10
            box("red", x - 0.006, x + 0.006, 0.02, H + 0.05, 0.1, 0.104)
        z = 0.1
        for y0, y1 in ((0.02, 0.2), (H / 2 - 0.09, H / 2 + 0.09), (H - 0.13, H + 0.05)):
            box("trim", x0, x1, y0, y1, z, z + 0.035)
        for x in (x0, x1):
            box("trim", x - 0.09 if x == x1 else x, x if x == x1 else x + 0.09, 0.02, H + 0.05, z, z + 0.035)
        for (ya, yb) in ((0.2, H / 2 - 0.09), (H / 2 + 0.09, H - 0.13)):
            beam("trim", (x0 + 0.12, ya + 0.08, z + 0.02), (x1 - 0.12, yb - 0.08, z + 0.02), 0.13, 0.035)
            beam("trim", (x1 - 0.12, ya + 0.08, z + 0.02), (x0 + 0.12, yb - 0.08, z + 0.02), 0.13, 0.035)
    box("metal", -W - 0.3, W + 0.3, H + 0.12, H + 0.2, 0.0, 0.12)  # the track
    for x in (-W / 2 + 0.3, -0.3, 0.3, W / 2 - 0.3):
        box("metal", x - 0.04, x + 0.04, H, H + 0.16, 0.1, 0.12)


@part("door-service", "doors")
def _():
    # a back door: flush steel in a pressed frame, a flat canopy on tie rods, a bulkhead lamp
    D, H = 0.95, 2.1
    reveal(-D / 2, D / 2, 0, H, 0.12, "metal")
    for x0, x1, y0, y1 in ((-D / 2 - 0.06, -D / 2, 0, H + 0.06), (D / 2, D / 2 + 0.06, 0, H + 0.06), (-D / 2, D / 2, H, H + 0.06)):
        box("metal", x0, x1, y0, y1, 0, 0.02)
    box("galv", -D / 2, D / 2, 0, H, -0.08, -0.04)
    box("galv", -D / 2 + 0.08, D / 2 - 0.08, 1.2, 1.9, -0.04, -0.035)
    box("chrome", D / 2 - 0.2, D / 2 - 0.08, 0.98, 1.02, -0.04, -0.01)
    box("metal", -0.8, 0.8, H + 0.35, H + 0.45, 0, 1.0)
    for sg in (-1, 1):
        beam("metal", (sg * 0.75, H + 0.45, 0.95), (sg * 0.75, H + 1.15, 0.0), 0.02, 0.02)
    box("metal", 0.65, 0.85, H + 0.0, H + 0.18, 0, 0.1)
    box("lamp", 0.67, 0.83, H + 0.02, H + 0.16, 0.1, 0.11)


@part("door-slider", "doors")
def _():
    # automatic glass doors: two leaves under a header box, fixed side lites
    W, H = 3.6, 2.4
    reveal(-W / 2, W / 2, 0, H + 0.4, 0.1, "chrome")
    box("chrome", -W / 2, W / 2, H, H + 0.4, -0.1, 0.05)
    for x0, x1 in ((-W / 2, -0.9), (-0.9, 0), (0, 0.9), (0.9, W / 2)):
        box("chrome", x0, x0 + 0.05, 0, H, -0.08, -0.02)
        box("chrome", x1 - 0.05, x1, 0, H, -0.08, -0.02)
        box("chrome", x0, x1, 0, 0.1, -0.08, -0.02)
        pane("glass", x0 + 0.05, x1 - 0.05, 0.1, H, -0.05)


# ── shopfronts ───────────────────────────────────────────────────────────────────────────────────────────────


@part("shop-bulkhead~x", "shopfront")
def _():
    box("door", -0.5, 0.5, 0, 0.55, -0.12, 0)
    box("door", -0.42, 0.42, 0.1, 0.45, 0, 0.012)
    box("door", -0.38, 0.38, 0.14, 0.41, 0.012, 0.02)
    prism_x("door", [(-0.04, 0.55), (0.06, 0.55), (0.06, 0.58), (-0.04, 0.6)], -0.5, 0.5)


@part("shop-plate~x", "shopfront")
def _():
    # the display glass over the bulkhead: 2.5 tall, its frame top and bottom (the mullions are their own)
    box("door", -0.5, 0.5, 0.6, 0.66, -0.1, -0.02)
    box("door", -0.5, 0.5, 3.04, 3.1, -0.1, -0.02)
    pane("glass", -0.5, 0.5, 0.66, 3.04, -0.07)


@part("shop-transom~x", "shopfront")
def _():
    # the transom band over the display: prism-glass lites in a frame
    y0, y1 = 3.1, 3.55
    box("door", -0.5, 0.5, y0, y0 + 0.04, -0.1, -0.02)
    box("door", -0.5, 0.5, y1 - 0.04, y1, -0.1, -0.02)
    pane("canvas2", -0.5, 0.5, y0 + 0.04, y1 - 0.04, -0.075)
    for i in range(5):
        x = -0.5 + (i + 0.5) / 5
        box("door", x - 0.01, x + 0.01, y0, y1, -0.08, -0.05)


@part("shop-mullion", "shopfront")
def _():
    box("door", -0.04, 0.04, 0.6, 3.55, -0.1, 0.0)


@part("shop-pilaster", "shopfront")
def _():
    # a cast-iron pilaster between bays: base, fluted shaft, capital; 0.42 wide, 3.6 tall
    w = 0.42
    box("metal", -w / 2, w / 2, 0, 3.6, 0, 0.06)
    box("metal", -w / 2 - 0.03, w / 2 + 0.03, 0, 0.4, 0, 0.1)
    for k in (-2, -1, 0, 1, 2):
        box("metal", k * 0.07 - 0.015, k * 0.07 + 0.015, 0.5, 3.3, 0.06, 0.07)
    prism_x("metal", [(0, 3.3), (0.08, 3.3), (0.14, 3.45), (0.14, 3.6), (0, 3.6)], -w / 2 - 0.05, w / 2 + 0.05)
    for sg in (-1, 1):  # rosettes
        cyl("metal", 0.035, 3.48, 3.5, 8, sg * 0.1, 0.14)


@part("shop-recess", "shopfront")
def _():
    # a recessed entry 1.8 wide, 1.2 deep: splayed glass sides, a tiled floor, a panelled soffit, the door at the back
    W, D, H = 1.8, 1.2, 3.55
    D2 = 0.95 / 2
    face("concrete", [(-W / 2, 0.01, 0), (W / 2, 0.01, 0), (D2, 0.01, -D), (-D2, 0.01, -D)], (0, 1, 0))
    face("door", [(-W / 2, 3.1, 0), (W / 2, 3.1, 0), (D2, 3.1, -D), (-D2, 3.1, -D)], (0, -1, 0))
    for sg in (-1, 1):
        a, b = (sg * W / 2, 0), (sg * D2, -D)
        quad("door", (a[0], 0, a[1]), (b[0], 0, b[1]), (b[0], 0.55, b[1]), (a[0], 0.55, a[1]), (-sg, 0, 0.3))
        quad("glass", (a[0], 0.6, a[1]), (b[0], 0.6, b[1]), (b[0], 3.04, b[1]), (a[0], 3.04, a[1]), (-sg, 0, 0.3))
        beam("door", (a[0], 0.58, a[1]), (b[0], 0.58, b[1]), 0.06, 0.05)
        beam("door", (a[0], 3.06, a[1]), (b[0], 3.06, b[1]), 0.06, 0.05)
    at((0, 0, -D))
    PARTS["door-shop"]()
    at()
    box("door", -W / 2, W / 2, 3.1, H, -0.1, -0.02)
    pane("canvas2", -W / 2, W / 2, 3.14, H - 0.04, -0.075)


@part("shop-fascia~x", "shopfront")
def _():
    # the sign band over a shopfront: a board 0.75 tall, a moulded cornice over it
    box("sign", -0.5, 0.5, 0, 0.75, 0, 0.06)
    box("trim", -0.5, 0.5, -0.06, 0, 0, 0.1)
    prism_x("trim", [(0, 0.75), (0.08, 0.75), (0.08, 0.8), (0.2, 0.9), (0.2, 0.96), (0, 0.96)], -0.5, 0.5)


# ── entries ──────────────────────────────────────────────────────────────────────────────────────────────────


@part("stoop", "entries")
def _():
    # a brownstone's stoop: six steps up 1.1 m to a landing at the door, stone cheeks, iron rails
    W, n, rise, run = 1.6, 6, 1.1 / 6, 0.3
    land = 1.0
    box("stone", -W / 2, W / 2, 0, rise * n, 0, land)
    for i in range(n - 1):
        box("stone", -W / 2, W / 2, 0, rise * (n - 1 - i), land + i * run, land + (i + 1) * run)
        box("stone", -W / 2 - 0.0, W / 2, rise * (n - 1 - i) - 0.02, rise * (n - 1 - i), land + (i + 1) * run, land + (i + 1) * run + 0.03)
    L = land + (n - 1) * run
    for sg in (-1, 1):
        x = sg * (W / 2 + 0.15)
        prism_x("stone", [(0, 0), (L + 0.1, 0), (L + 0.1, 0.5), (land, rise * n + 0.25), (0, rise * n + 0.25)], x - 0.15, x + 0.15)
        y0, y1 = rise * n + 0.25, 0.5
        for k in range(10):
            z = land * 0.2 + (L - land * 0.2) * k / 9
            yy = y0 + (y1 - y0) * max(0, (z - land)) / (L + 0.1 - land) if z > land else y0
            box("metal", x - 0.012, x + 0.012, yy, yy + 0.85, z - 0.012, z + 0.012)
        beam("metal", (x, y0 + 0.9, 0), (x, y0 + 0.9, land), 0.05, 0.04)
        beam("metal", (x, y0 + 0.9, land), (x, y1 + 0.9, L + 0.05), 0.05, 0.04)
        lathe("metal", [(0.05, y1), (0.05, y1 + 0.9), (0.08, y1 + 1.0), (0.0, y1 + 1.12)], 8, x, L + 0.05)


@part("steps-wood~x", "entries")
def _():
    # porch steps: three risers up 0.6 m, 1 m wide (stretched), stringers each side
    for i in range(3):
        box("wood", -0.5, 0.5, 0.2 * (2 - i) + 0.16, 0.2 * (2 - i) + 0.2, 0.28 * i, 0.28 * i + 0.32)
        box("trim", -0.5, 0.5, 0.2 * (2 - i), 0.2 * (2 - i) + 0.16, 0.28 * i + 0.28, 0.28 * i + 0.3)
    for sg in (-1, 1):
        prism_x("trim", [(0, 0.6), (0, 0.4), (0.9, 0.0), (0.95, 0.0), (0.95, 0.1)], sg * 0.5 - 0.02, sg * 0.5 + 0.02)


@part("post-turned", "entries")
def _():
    # a Victorian porch post, 2.6 m: square blocks, turned between
    box("trim", -0.07, 0.07, 0, 0.75, -0.07, 0.07)
    lathe("trim", [(0.05, 0.75), (0.065, 0.8), (0.04, 0.9), (0.055, 1.05), (0.045, 1.25), (0.04, 1.6), (0.06, 1.85), (0.04, 1.95), (0.065, 2.05), (0.05, 2.1)], 10)
    box("trim", -0.07, 0.07, 2.1, 2.6, -0.07, 0.07)
    for sg in (-1, 1):  # gingerbread brackets: a quarter-round web under the beam
        pts = [(sg * 0.07, 2.6), (sg * 0.07, 2.28)] + [(sg * (0.07 + 0.32 * (1 - math.cos(a))), 2.28 + 0.32 * math.sin(a)) for a in [math.pi / 2 * k / 6 for k in range(1, 7)]]
        prism_z("trim", pts, -0.015, 0.015)


@part("post-craftsman", "entries")
def _():
    # a tapered square post on a fieldstone pier: pier 0.55 sq × 1.0, post 0.34 → 0.22 × 1.6, a cap
    box("stone", -0.28, 0.28, 0, 1.0, -0.28, 0.28)
    box("concrete", -0.31, 0.31, 1.0, 1.08, -0.31, 0.31)
    prism_y("trim", [(-0.17, -0.17), (0.17, -0.17), (0.17, 0.17), (-0.17, 0.17)], 1.08, 1.1)
    lathe("trim", [(0.17 * math.sqrt(2), 1.1), (0.11 * math.sqrt(2), 2.6)], 4, 0, 0, smooth=False, caps=False)
    box("trim", -0.17, 0.17, 2.6, 2.72, -0.17, 0.17)


@part("column-tuscan", "entries")
def _():
    # a Tuscan column, 0.3 across, 2.7 m: plinth, torus, a shaft with entasis, a capital and abacus
    box("trim", -0.2, 0.2, 0, 0.08, -0.2, 0.2)
    shaft = [(0.17, 0.08), (0.18, 0.12), (0.155, 0.16)]
    for k in range(1, 9):
        y = 0.16 + (2.4 - 0.16) * k / 8
        shaft.append((0.155 - 0.03 * (k / 8) ** 1.6, y))
    shaft += [(0.15, 2.45), (0.17, 2.52), (0.15, 2.56)]
    lathe("trim", shaft, 16)
    box("trim", -0.2, 0.2, 2.56, 2.7, -0.2, 0.2)


@part("column-civic", "entries")
def _():
    # a portico's column: 0.6 across, 6 m, fluted (a civic front's, the Carnegie library's)
    box("stone", -0.42, 0.42, 0, 0.3, -0.42, 0.42)
    lathe("stone", [(0.4, 0.3), (0.36, 0.4), (0.32, 0.45)], 20)
    n = 20
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        for (r0, r1, y0, y1) in ((0.32, 0.27, 0.45, 5.5),):
            am = (a0 + a1) / 2
            rf = 0.9  # a flute's inset
            quad("stone", (r0 * math.cos(a0), y0, r0 * math.sin(a0)), (r0 * rf * math.cos(am), y0, r0 * rf * math.sin(am)), (r1 * rf * math.cos(am), y1, r1 * rf * math.sin(am)), (r1 * math.cos(a0), y1, r1 * math.sin(a0)), (math.cos((a0 + am) / 2), 0, math.sin((a0 + am) / 2)), True)
            quad("stone", (r0 * rf * math.cos(am), y0, r0 * rf * math.sin(am)), (r0 * math.cos(a1), y0, r0 * math.sin(a1)), (r1 * math.cos(a1), y1, r1 * math.sin(a1)), (r1 * rf * math.cos(am), y1, r1 * rf * math.sin(am)), (math.cos((am + a1) / 2), 0, math.sin((am + a1) / 2)), True)
    lathe("stone", [(0.27, 5.5), (0.3, 5.6), (0.36, 5.72)], 20)
    box("stone", -0.4, 0.4, 5.72, 6.0, -0.4, 0.4)


@part("rail", "entries")
def _():
    # a porch rail, 1.8 m between posts: top and bottom rails, square balusters every 0.11
    L, h = 1.8, 0.9
    box("trim", -L / 2, L / 2, h - 0.06, h, -0.05, 0.05)
    prism_x("trim", [(-0.07, h), (0.07, h), (0.05, h + 0.04), (-0.05, h + 0.04)], -L / 2, L / 2)
    box("trim", -L / 2, L / 2, 0.06, 0.12, -0.04, 0.04)
    n = int(L / 0.11)
    for i in range(n):
        x = -L / 2 + (i + 0.5) * L / n
        box("trim", x - 0.02, x + 0.02, 0.12, h - 0.06, -0.02, 0.02)


@part("portico", "entries")
def _():
    # a small portico over a front door: two Tuscan columns, an entablature, a pediment; 2.6 wide, 1.4 out
    W, D, H = 2.6, 1.4, 2.7
    box("stone", -W / 2 - 0.1, W / 2 + 0.1, 0, 0.18, 0, D + 0.2)
    for x in (-W / 2 + 0.2, W / 2 - 0.2):
        at((x, 0.18, D - 0.2))
        PARTS["column-tuscan"]()
    at()
    y = H + 0.18
    box("trim", -W / 2, W / 2, y, y + 0.32, 0, D)
    box("trim", -W / 2 - 0.06, W / 2 + 0.06, y + 0.32, y + 0.4, 0, D + 0.06)
    rh = 0.6
    face("trim", [(-W / 2, y + 0.4, D), (W / 2, y + 0.4, D), (0, y + 0.4 + rh, D)], (0, 0, 1))
    for sg in (-1, 1):
        quad("roof", (sg * (W / 2 + 0.1), y + 0.38, D + 0.1), (0, y + 0.42 + rh, D + 0.1), (0, y + 0.42 + rh, 0), (sg * (W / 2 + 0.1), y + 0.38, 0), (sg, 1, 0))
        beam("trim", (sg * (W / 2 + 0.08), y + 0.4, D + 0.08), (0, y + 0.44 + rh, D + 0.08), 0.08, 0.06)
    quad("trim", (-W / 2, y, 0), (W / 2, y, 0), (W / 2, y, D), (-W / 2, y, D), (0, -1, 0))


@part("canopy-steel~x", "entries")
def _():
    # a flat steel canopy, 1.4 out, on tie rods
    box("metal", -0.5, 0.5, 0, 0.22, 0, 1.4)
    box("lamp", -0.06, 0.06, -0.005, 0.0, 0.6, 0.8)
    beam("metal", (0, 0.22, 1.3), (0, 1.1, 0.0), 0.025, 0.025)


def awning(stripes):
    D, drop, val = 1.1, 0.75, 0.22
    n = 8 if stripes else 1
    for i in range(n):
        x0, x1 = -0.5 + i / n, -0.5 + (i + 1) / n
        role = "canvas" if (not stripes or i % 2 == 0) else "canvas2"
        quad(role, (x0, 0, 0), (x1, 0, 0), (x1, -drop, D), (x0, -drop, D), (0, 1, 0.8))
        quad(role, (x0, -drop, D), (x1, -drop, D), (x1, -drop - val, D), (x0, -drop - val, D), (0, 0, 1))
        for k in range(2):  # the valance's scallops
            xa, xb = x0 + (x1 - x0) * k / 2, x0 + (x1 - x0) * (k + 1) / 2
            face(role, [(xa, -drop - val, D), (xb, -drop - val, D), ((xa + xb) / 2, -drop - val - 0.07, D)], (0, 0, 1))
    beam("metal", (-0.5, -drop - 0.02, D - 0.02), (0.5, -drop - 0.02, D - 0.02), 0.025, 0.025)


@part("awning-striped~x", "entries")
def _():
    awning(True)


@part("awning-plain~x", "entries")
def _():
    awning(False)


@part("marquee", "entries")
def _():
    # a hotel's marquee: 3.2 wide, 1.8 out, its fascia lit with bulbs, chains to the wall
    W, D = 3.2, 1.8
    box("metal", -W / 2, W / 2, 0, 0.55, 0, D)
    box("sign", -W / 2 + 0.05, W / 2 - 0.05, 0.08, 0.47, D, D + 0.02)
    for i in range(16):
        x = -W / 2 + 0.1 + i * (W - 0.2) / 15
        lathe("lamp", [(0.0, 0.5), (0.03, 0.52), (0.0, 0.55)], 6, x, D + 0.03)
        lathe("lamp", [(0.0, 0.0), (0.03, 0.02), (0.0, 0.05)], 6, x, D + 0.03)
    for i in range(4):
        for j in range(2):
            box("lamp", -1.2 + i * 0.8, -1.0 + i * 0.8, -0.01, 0, 0.4 + j * 0.8, 0.6 + j * 0.8)
    for sg in (-1, 1):
        beam("metal", (sg * (W / 2 - 0.2), 0.55, D - 0.1), (sg * (W / 2 - 0.2), 2.2, 0), 0.03, 0.03)


# ── edges ────────────────────────────────────────────────────────────────────────────────────────────────────


@part("corner-board~y", "edges")
def _():
    # an outside corner's boards: the wall runs +x (face z = 0) and back −z (face x = 0)
    box("trim", -0.025, 0.13, 0, 1, -0.0, 0.025)
    box("trim", -0.025, 0.0, 0, 1, -0.13, 0.0)


@part("quoin~y", "edges")
def _():
    # stone quoins up a corner, 1 m of them: long and short in turn
    for j in range(3):
        y0, y1 = j / 3 + 0.004, (j + 1) / 3 - 0.004
        L = 0.45 if j % 2 == 0 else 0.3
        box("stone", -0.03, L, y0, y1, 0, 0.03)
        box("stone", -0.03, 0.0, y0, y1, -(0.75 - L), 0.0)


@part("pilaster~y", "edges")
def _():
    box("trim", -0.15, 0.15, 0, 1, 0, 0.045)


@part("pilaster-cap", "edges")
def _():
    prism_x("trim", [(0, 0), (0.05, 0), (0.05, 0.06), (0.1, 0.12), (0.1, 0.18), (0, 0.18)], -0.2, 0.2)


@part("frieze~x", "edges")
def _():
    box("trim", -0.5, 0.5, 0, 0.25, 0, 0.025)
    box("trim", -0.5, 0.5, -0.03, 0, 0, 0.045)


@part("water-table~x", "edges")
def _():
    box("trim", -0.5, 0.5, 0, 0.2, 0, 0.025)
    prism_x("trim", [(0, 0.2), (0.07, 0.2), (0.025, 0.24), (0, 0.24)], -0.5, 0.5)


@part("belt-course~x", "edges")
def _():
    prism_x("stone", [(0, 0), (0.04, 0), (0.06, 0.03), (0.06, 0.16), (0.04, 0.2), (0, 0.2)], -0.5, 0.5)


@part("coping~x", "edges")
def _():
    # a parapet's cap: the wall's top 0.35 thick (z −0.35 to 0), the stone over it with drips
    prism_x("stone", [(-0.4, 0), (0.05, 0), (0.05, 0.08), (-0.4, 0.12)], -0.5, 0.5)


@part("cornice-bracketed~x", "edges")
def _():
    # a Main Street cornice, 1 m of it: frieze panel, bed mould, a deep soffit, crown — brackets are their own
    box("trim", -0.5, 0.5, 0, 0.55, 0, 0.05)
    box("trim", -0.45, 0.45, 0.1, 0.45, 0.05, 0.065)
    prism_x("trim", [(0, 0.55), (0.1, 0.55), (0.12, 0.6), (0.62, 0.6), (0.62, 0.66), (0.7, 0.72), (0.74, 0.82), (0.74, 0.88), (0, 0.88)], -0.5, 0.5)


@part("bracket", "edges")
def _():
    # a scroll bracket under a cornice's soffit: 0.14 thick, 0.6 out, 0.55 tall
    prof = [(0.0, 0.0), (0.06, 0.0), (0.1, 0.06), (0.14, 0.2), (0.26, 0.34), (0.48, 0.42), (0.6, 0.47), (0.6, 0.55), (0.0, 0.55)]
    prism_x("trim", [(z, y + 0.05) for z, y in prof], -0.07, 0.07)
    lathe("trim", [(0.0, 0.0), (0.04, 0.0), (0.04, 0.04), (0.0, 0.05)], 6, 0, 0.05)


@part("cornice-dentil~x", "edges")
def _():
    # a classical cornice, 1 m: frieze, a row of dentils, the corona and crown
    box("trim", -0.5, 0.5, 0, 0.3, 0, 0.04)
    box("trim", -0.5, 0.5, 0.3, 0.34, 0, 0.08)
    for i in range(8):
        x = -0.5 + (i + 0.5) / 8
        box("trim", x - 0.035, x + 0.035, 0.34, 0.44, 0.04, 0.13)
    box("trim", -0.5, 0.5, 0.34, 0.44, 0, 0.04)
    prism_x("trim", [(0, 0.44), (0.3, 0.44), (0.3, 0.54), (0.36, 0.6), (0.38, 0.66), (0, 0.66)], -0.5, 0.5)


@part("cornice-box~x", "edges")
def _():
    # a house's boxed eave: fascia, soffit, a crown, the gutter on its face
    prism_x("trim", [(0, -0.2), (0.35, -0.2), (0.35, 0.05), (0.4, 0.1), (0, 0.1)], -0.5, 0.5)
    prism_x("trim", [(0.4, -0.08), (0.52, -0.08), (0.55, 0.08), (0.4, 0.08)], -0.5, 0.5)


@part("rake~x", "edges")
def _():
    box("trim", -0.5, 0.5, -0.22, 0, 0, 0.03)
    box("trim", -0.5, 0.5, -0.02, 0.03, 0, 0.06)


@part("return", "edges")
def _():
    # a cornice return at a gable's foot: the boxed eave carried 0.45 round the corner, a little hip roof on it
    prism_x("trim", [(0, -0.2), (0.35, -0.2), (0.35, 0.05), (0.4, 0.1), (0, 0.1)], 0, 0.45)
    face("roof", [(0, 0.1, 0.4), (0.45, 0.1, 0.4), (0.45, 0.3, 0.0), (0, 0.3, 0.0)], (0, 1, 1))
    face("roof", [(0.45, 0.1, 0.4), (0.45, 0.1, 0), (0.45, 0.3, 0.0)], (1, 0, 0))


@part("gutter~x", "edges")
def _():
    prism_x("metal", [(0, 0), (0.02, -0.0), (0.12, 0.0), (0.14, 0.05), (0.13, 0.12), (0.0, 0.12)], -0.5, 0.5)


@part("downpipe~y", "edges")
def _():
    box("metal", -0.04, 0.04, 0, 1, 0.03, 0.09)


@part("downpipe-shoe", "edges")
def _():
    box("metal", -0.04, 0.04, 0.15, 0.5, 0.03, 0.09)
    beam("metal", (0, 0.2, 0.06), (0, 0.05, 0.3), 0.08, 0.06)
    box("concrete", -0.15, 0.15, 0, 0.04, 0.1, 0.6)


# ── roof parts ───────────────────────────────────────────────────────────────────────────────────────────────


def chimney(role, cap=True):
    W, D = 0.62, 0.9
    box(role, -W / 2, W / 2, -2.0, 1.5, -D / 2, D / 2)
    for k, g in ((0, 0.05), (1, 0.09)):
        box(role, -W / 2 - g, W / 2 + g, 1.4 + k * 0.08, 1.48 + k * 0.08, -D / 2 - g, D / 2 + g)
    if cap:
        box("stone", -W / 2 - 0.1, W / 2 + 0.1, 1.56, 1.62, -D / 2 - 0.1, D / 2 + 0.1)
        for z in (-0.2, 0.2):
            lathe("brick", [(0.11, 1.62), (0.09, 1.9), (0.1, 1.95)], 8, 0, z)
    box("metal", -W / 2 - 0.02, W / 2 + 0.02, -0.1, 0.12, -D / 2 - 0.02, D / 2 + 0.02)  # flashing


@part("chimney-brick", "roof")
def _():
    chimney("brick")


@part("chimney-stone", "roof")
def _():
    chimney("stone", cap=False)
    box("concrete", -0.42, 0.42, 1.5, 1.58, -0.56, 0.56)


@part("cupola", "roof")
def _():
    # a cupola on a ridge: a base 1.2 sq, louvred sides, a hipped cap, a weathervane
    W = 1.2
    box("trim", -W / 2, W / 2, -0.4, 0.5, -W / 2, W / 2)
    for k in range(4):
        at((0, 0, 0), k * math.pi / 2)
        box("trim", -W / 2 + 0.05, W / 2 - 0.05, 0.5, 1.3, -W / 2 + 0.05, -W / 2 + 0.1, skip=("back",))
        louvres(-W / 2 + 0.12, W / 2 - 0.12, 0.58, 1.22, W / 2 - 0.02, 7, "trim")
        box("trim", -W / 2 + 0.05, -W / 2 + 0.12, 0.5, 1.3, W / 2 - 0.08, W / 2)
        box("trim", W / 2 - 0.12, W / 2 - 0.05, 0.5, 1.3, W / 2 - 0.08, W / 2)
    at()
    box("trim", -W / 2 - 0.1, W / 2 + 0.1, 1.3, 1.42, -W / 2 - 0.1, W / 2 + 0.1)
    lathe("copper", [(W / 2 + 0.12 * math.sqrt(2), 1.42), (0.05, 2.0)], 4, smooth=False)
    cyl("metal", 0.015, 2.0, 2.8, 6)
    beam("metal", (-0.3, 2.6, 0), (0.3, 2.6, 0), 0.02, 0.02)
    beam("metal", (0, 2.6, -0.3), (0, 2.6, 0.3), 0.02, 0.02)
    prism_z("metal", [(-0.35, 2.68), (0.25, 2.68), (0.35, 2.75), (0.25, 2.82), (-0.35, 2.82), (-0.28, 2.75)], -0.01, 0.01)


@part("belfry", "roof")
def _():
    # a steeple's belfry: 2.6 sq, an arched opening a side with louvres, corner pilasters, an urn at each corner
    W, H = 2.6, 3.0
    for k in range(4):
        at((0, 0, 0), k * math.pi / 2)
        z = W / 2
        for sg in (-1, 1):
            box("trim", sg * W / 2 - (0.4 if sg > 0 else 0), sg * W / 2 + (0.4 if sg < 0 else 0), 0, H, z - 0.2, z)
            box("trim", sg * (W / 2 - 0.2) - 0.14, sg * (W / 2 - 0.2) + 0.14, 0, H, z, z + 0.05)
        box("trim", -W / 2, W / 2, 0, 0.5, z - 0.2, z)
        r = W / 2 - 0.4
        box("trim", -W / 2, W / 2, 0.5 + 1.4 + r, H, z - 0.2, z)
        face("trim", [(-r, 0.5 + 1.4, z), (-r, 0.5 + 1.4 + r, z), (-r * 0.7, 0.5 + 1.4 + r * 0.7, z)], (0, 0, 1))
        arc_band("trim", 0, 0.5 + 1.4, r, r + 0.12, z, z + 0.03, 0, math.pi, 10)
        louvres(-r, r, 0.5, 0.5 + 1.4, z - 0.15, 9, "trim")
    at()
    box("trim", -W / 2 - 0.15, W / 2 + 0.15, H, H + 0.3, -W / 2 - 0.15, W / 2 + 0.15)
    for sx in (-1, 1):
        for sz in (-1, 1):
            lathe("trim", [(0.0, H + 0.3), (0.12, H + 0.35), (0.06, H + 0.45), (0.14, H + 0.6), (0.0, H + 0.8)], 8, sx * (W / 2 - 0.05), sz * (W / 2 - 0.05))


@part("spire", "roof")
def _():
    # an octagonal spire, 2.0 across and 8 m tall, a ball and a weathervane
    lathe("roof", [(1.0, 0), (0.05, 8.0)], 8, smooth=False)
    lathe("trim", [(1.08, -0.15), (1.08, 0.05), (1.0, 0.05)], 8, smooth=False, caps=False)
    lathe("gold", [(0.0, 7.9), (0.14, 8.05), (0.0, 8.2)], 10)
    cyl("metal", 0.02, 8.2, 9.2, 6)
    prism_z("gold", [(-0.5, 9.0), (0.35, 9.0), (0.5, 9.1), (0.35, 9.2), (-0.5, 9.2), (-0.4, 9.1)], -0.01, 0.01)


@part("cross", "roof")
def _():
    box("gold", -0.04, 0.04, 0, 1.2, -0.04, 0.04)
    box("gold", -0.3, 0.3, 0.75, 0.83, -0.04, 0.04)


@part("vent-pipe", "roof")
def _():
    cyl("galv", 0.06, -0.3, 0.45, 10)
    cyl("rubber", 0.12, -0.02, 0.04, 10)


@part("rooftop-ac", "roof")
def _():
    # a packaged unit on a flat roof, on its curb
    box("galv", -0.7, 0.7, 0.15, 1.2, -1.0, 1.0)
    box("metal", -0.75, 0.75, 0, 0.15, -1.05, 1.05)
    for z in (-0.5, 0.5):
        cyl("metal", 0.32, 1.2, 1.24, 14, 0, z)
        for k in range(6):
            a = k * math.pi / 3
            beam("galv", (0, 1.25, z), (0.3 * math.cos(a), 1.25, z + 0.3 * math.sin(a)), 0.02, 0.02)
    for j in range(8):
        box("metal", 0.7, 0.71, 0.25 + j * 0.11, 0.3 + j * 0.11, -0.9, 0.9)
    beam("galv", (-0.6, 0.6, 1.0), (-0.6, 0.0, 1.6), 0.15, 0.15)


@part("water-tank", "roof")
def _():
    # a wooden water tank on a steel stand: 3 m across, 3.2 tall, a conical cap
    for sx in (-1, 1):
        for sz in (-1, 1):
            box("metal", sx * 1.1 - 0.06, sx * 1.1 + 0.06, 0, 2.4, sz * 1.1 - 0.06, sz * 1.1 + 0.06)
    for y in (0.8, 1.7):
        for k in range(4):
            at((0, 0, 0), k * math.pi / 2)
            beam("metal", (-1.1, y, 1.1), (1.1, y + 0.6, 1.1), 0.03, 0.03)
            beam("metal", (1.1, y, 1.1), (-1.1, y + 0.6, 1.1), 0.03, 0.03)
    at()
    box("metal", -1.6, 1.6, 2.4, 2.55, -1.6, 1.6)
    lathe("wood", [(1.5, 2.55), (1.45, 5.6)], 20)
    for y in (2.9, 3.6, 4.3, 5.0):
        lathe("metal", [(1.5, y), (1.5, y + 0.05)], 20, caps=False)
    lathe("wood", [(1.55, 5.6), (0.05, 6.4)], 20)
    lathe("metal", [(0.0, 6.35), (0.12, 6.45), (0.0, 6.6)], 8)


@part("stair-bulkhead", "roof")
def _():
    # a roof's stair house: 2.6 × 3.6 × 2.7, a door, a cap
    box("brick", -1.3, 1.3, 0, 2.7, -3.6, 0)
    box("stone", -1.38, 1.38, 2.7, 2.85, -3.68, 0.08)
    at((0, 0.1, 0))
    PARTS["door-service"]()
    at()


@part("skylight~x", "roof")
def _():
    # a ridge skylight on a flat roof, 1 m of it, 1.4 wide
    box("metal", -0.5, 0.5, 0, 0.35, -0.7, 0.7)
    for sg in (-1, 1):
        quad("glass", (-0.5, 0.35, sg * 0.7), (0.5, 0.35, sg * 0.7), (0.5, 0.75, 0), (-0.5, 0.75, 0), (0, 1, sg))
    box("metal", -0.5, 0.5, 0.73, 0.79, -0.04, 0.04)
    for x in (-0.5, 0.0, 0.5):
        for sg in (-1, 1):
            beam("metal", (x, 0.35, sg * 0.7), (x, 0.75, 0), 0.03, 0.02)


@part("flagpole", "roof")
def _():
    lathe("chrome", [(0.07, 0), (0.035, 9.0)], 10)
    lathe("gold", [(0, 9.0), (0.08, 9.08), (0, 9.18)], 8)
    for j in range(13):
        role = "red" if j % 2 == 0 else "canvas2"
        y0 = 8.9 - (j + 1) * 1.15 / 13
        y1 = 8.9 - j * 1.15 / 13
        x0 = 0.05 + (0.8 if j < 7 else 0)
        quad(role, (x0, y0, 0), (2.2, y0, 0), (2.2, y1, 0), (x0, y1, 0), (0, 0, 1))
        quad(role, (x0, y0, -0.003), (2.2, y0, -0.003), (2.2, y1, -0.003), (x0, y1, -0.003), (0, 0, -1))
    quad("sign", (0.05, 8.9 - 7 * 1.15 / 13, 0.002), (0.85, 8.9 - 7 * 1.15 / 13, 0.002), (0.85, 8.9, 0.002), (0.05, 8.9, 0.002), (0, 0, 1))
    box("concrete", -0.3, 0.3, -0.1, 0.12, -0.3, 0.3)


@part("clock", "roof")
def _():
    # a civic clock, 1.1 across, in a moulded ring
    arc_band("trim", 0, 0, 0.55, 0.68, 0, 0.08, 0, 2 * math.pi, 28, caps=False)
    disc("canvas2", 0, 0, 0.55, 0.03, 0, 2 * math.pi, 28)
    for k in range(12):
        a = k * math.pi / 6
        cbox("metal", 0.47 * math.cos(a), 0.47 * math.sin(a), 0.04, 0.04, 0.04, 0.01)
    beam("metal", (0, 0, 0.05), (0.18, 0.28, 0.05), 0.035, 0.01)
    beam("metal", (0, 0, 0.055), (-0.38, 0.12, 0.055), 0.025, 0.01)


# ── backs and services ───────────────────────────────────────────────────────────────────────────────────────


@part("meter-electric", "backs")
def _():
    box("galv", -0.17, 0.17, 1.4, 1.85, 0, 0.12)
    lathe("glass", [(0.0, 0.12), (0.09, 0.12), (0.09, 0.2), (0.0, 0.24)], 12, 0, 0)
    for o in [(0, 1.63, 0.12)]:
        pass
    cyl("galv", 0.025, 1.85, 3.0, 8, 0, 0.05)


@part("meter-gas", "backs")
def _():
    box("metal", -0.15, 0.15, 0.4, 0.75, 0.05, 0.3)
    box("canvas2", -0.08, 0.08, 0.55, 0.66, 0.3, 0.305)
    cyl("galv", 0.025, 0, 0.4, 8, -0.1, 0.18)
    beam("galv", (-0.1, 0.75, 0.18), (-0.1, 0.9, 0.0), 0.05, 0.05)


@part("fire-escape", "backs")
def _():
    # one storey of an iron fire escape: a grated landing 3.2 × 1.2 at the floor, a rail, a stair down to the
    # one below (3.0 m a storey)
    L, D, h = 3.2, 1.2, 3.0
    box("metal", -L / 2, L / 2, -0.04, 0, 0, D)
    for k in range(1, 16):
        x = -L / 2 + L * k / 16
        box("metal", x - 0.008, x + 0.008, 0.0, 0.01, 0.02, D - 0.02)
    for sg in (-1, 1):
        beam("metal", (sg * L / 2, -0.02, D), (sg * L / 2, -0.6, 0.0), 0.04, 0.04)  # its brackets
    box("metal", -L / 2, L / 2, 0.98, 1.02, D - 0.02, D + 0.02)
    box("metal", -L / 2, L / 2, 0.45, 0.47, D - 0.01, D + 0.01)
    for sg in (-1, 1):
        box("metal", sg * L / 2 - 0.02, sg * L / 2 + 0.02, 0, 1.02, 0, D + 0.02)
        box("metal", sg * L / 2 - 0.01, sg * L / 2 + 0.01, 0.98, 1.02, 0, D)
    for i in range(1, 16):
        x = -L / 2 + L * i / 16
        box("metal", x - 0.008, x + 0.008, 0, 1.0, D - 0.008, D + 0.008)
    # the stair: from this landing's right end, down to the next one's left
    n = 16
    run = (L - 0.9) / n
    for i in range(n):
        x = L / 2 - 0.45 - run * (i + 1)
        y = -h * (i + 1) / (n + 1)
        box("metal", x, x + run, y - 0.02, y, 0.15, 0.85)
    for z in (0.12, 0.88):
        beam("metal", (L / 2 - 0.45, 0, z), (-L / 2 + 0.45, -h, z), 0.03, 0.18)
        beam("metal", (L / 2 - 0.45, 0.9, z), (-L / 2 + 0.45, -h + 0.9, z), 0.03, 0.03)


@part("bins", "backs")
def _():
    for x, role in ((-0.38, "door"), (0.38, "metal")):
        box(role, x - 0.3, x + 0.3, 0.06, 1.0, -0.35, 0.35)
        box(role, x - 0.32, x + 0.32, 1.0, 1.06, -0.4, 0.37)
        for sg in (-1, 1):
            cyl("rubber", 0.1, -0.03, 0.03, 10, x + sg * 0.22, -0.32)


@part("dumpster", "backs")
def _():
    W, D, H = 1.9, 1.1, 1.25
    face("door", [(-W / 2, 0.15, -D / 2), (W / 2, 0.15, -D / 2), (W / 2, H, -D / 2), (-W / 2, H, -D / 2)], (0, 0, -1))
    face("door", [(-W / 2, 0.15, D / 2), (W / 2, 0.15, D / 2), (W / 2, H - 0.25, D / 2 + 0.25), (-W / 2, H - 0.25, D / 2 + 0.25)], (0, 0, 1))
    for sg in (-1, 1):
        face("door", [(sg * W / 2, 0.15, -D / 2), (sg * W / 2, 0.15, D / 2), (sg * W / 2, H - 0.25, D / 2 + 0.25), (sg * W / 2, H, -D / 2)], (sg, 0, 0))
    face("door", [(-W / 2, 0.15, -D / 2), (W / 2, 0.15, -D / 2), (W / 2, 0.15, D / 2), (-W / 2, 0.15, D / 2)], (0, -1, 0))
    for k in range(2):
        x0, x1 = -W / 2 + k * W / 2, -W / 2 + (k + 1) * W / 2
        quad("rubber", (x0, H, -D / 2), (x1, H, -D / 2), (x1, H - 0.2, D / 2 + 0.28), (x0, H - 0.2, D / 2 + 0.28), (0, 1, 0.2))
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl("rubber", 0.07, 0.0, 0.15, 8, sx * (W / 2 - 0.15), sz * (D / 2 - 0.12))
    for sg in (-1, 1):
        box("door", sg * W / 2 - 0.02 if sg > 0 else -W / 2 - 0.06, sg * W / 2 + 0.06 if sg > 0 else -W / 2 + 0.02, 0.6, 0.75, -0.3, 0.3)


# ── signs and lamps ──────────────────────────────────────────────────────────────────────────────────────────


@part("sign-blade", "signs")
def _():
    # a projecting sign on a scrolled iron arm: a board 0.9 × 0.6 hung 0.15 under the arm
    box("metal", -0.08, 0.08, -0.1, 0.25, 0, 0.03)
    beam("metal", (0, 0.2, 0.03), (0, 0.2, 1.25), 0.03, 0.04)
    beam("metal", (0, -0.05, 0.03), (0, 0.2, 0.8), 0.025, 0.025)
    for z in (0.3, 1.15):
        beam("metal", (0, 0.18, z), (0, 0.05, z), 0.01, 0.01)
    box("sign", -0.02, 0.02, -0.55, 0.05, 0.27, 1.18)
    box("gold", -0.025, 0.025, -0.52, 0.02, 0.3, 1.15, skip=("left", "right"))
    box("sign", -0.023, 0.023, -0.5, 0.0, 0.32, 1.13)


@part("sign-neon", "signs")
def _():
    # a window's OPEN in tubes on a little frame
    box("metal", -0.45, 0.45, 0, 0.3, -0.02, 0)
    for x0 in (-0.38, -0.18, 0.02, 0.22):
        for (a, b) in (((0, 0.05), (0, 0.25)), ((0.14, 0.05), (0.14, 0.25)), ((0, 0.25), (0.14, 0.25)), ((0, 0.05), (0.14, 0.05))):
            beam("neon", (x0 + a[0], a[1], 0.03), (x0 + b[0], b[1], 0.03), 0.018, 0.018)
    box("metal", -0.47, 0.47, -0.02, 0.0, -0.02, 0.02)


@part("lantern", "signs")
def _():
    # a wall lantern: a back plate, an arm, a glazed lamp with a cap
    box("metal", -0.07, 0.07, 0, 0.3, 0, 0.02)
    beam("metal", (0, 0.2, 0.02), (0, 0.2, 0.2), 0.03, 0.03)
    box("metal", -0.1, 0.1, -0.05, -0.02, 0.1, 0.3)
    box("lamp", -0.08, 0.08, -0.02, 0.24, 0.12, 0.28)
    lathe("metal", [(0.15, 0.24), (0.0, 0.36)], 4, 0, 0.2, smooth=False)


@part("gooseneck", "signs")
def _():
    # a gooseneck lamp over a sign
    box("metal", -0.05, 0.05, 0, 0.08, 0, 0.02)
    for i in range(6):
        a0, a1 = math.pi * i / 6, math.pi * (i + 1) / 6
        beam("metal", (0, 0.05 + 0.25 * math.sin(a0), 0.25 - 0.25 * math.cos(a0)), (0, 0.05 + 0.25 * math.sin(a1), 0.25 - 0.25 * math.cos(a1)), 0.02, 0.02)
    lathe("metal", [(0.0, 0.0), (0.04, 0.01), (0.14, -0.08), (0.0, -0.06)], 10, 0, 0.5)
    lathe("lamp", [(0.0, -0.075), (0.12, -0.075)], 10, 0, 0.5)


@part("lamp-police", "signs")
def _():
    # a police station's twin globes on a post by the door
    lathe("metal", [(0.12, 0), (0.06, 0.2), (0.05, 2.4), (0.08, 2.5)], 10)
    beam("metal", (-0.35, 2.55, 0), (0.35, 2.55, 0), 0.05, 0.05)
    for x in (-0.35, 0.35):
        lathe("lamp", [(0.0, 2.58), (0.16, 2.72), (0.0, 2.9)], 12, x, 0)


# ── the gas station ──────────────────────────────────────────────────────────────────────────────────────────


@part("pump", "gas")
def _():
    # a modern dispenser on its island: 1.25 × 0.5 × 2.1, screens, nozzles each side, a price topper
    box("galv", -0.62, 0.62, 0, 1.6, -0.25, 0.25)
    box("red", -0.64, 0.64, 1.6, 2.1, -0.27, 0.27)
    box("canvas2", -0.55, 0.55, 1.68, 2.02, 0.27, 0.272)
    for sg in (-1, 1):
        box("glass", -0.2, 0.2, 1.0, 1.35, sg * 0.25, sg * 0.25 + sg * 0.005)
        for x in (-0.45, 0.45):
            box("metal", x - 0.06, x + 0.06, 0.9, 1.15, sg * 0.25, sg * 0.32)
            beam("rubber", (x, 0.95, sg * 0.3), (x, 0.4, sg * 0.42), 0.025, 0.025)
            beam("rubber", (x, 0.4, sg * 0.42), (x, 1.5, sg * 0.3), 0.025, 0.025)
    box("metal", -0.64, 0.64, 0, 0.12, -0.27, 0.27)


@part("pump-classic", "gas")
def _():
    # a 1950s pump: a round-shouldered cabinet, a lit globe on top
    prism_y("red", [(-0.3, -0.22), (0.3, -0.22), (0.38, -0.12), (0.38, 0.12), (0.3, 0.22), (-0.3, 0.22), (-0.38, 0.12), (-0.38, -0.12)], 0, 1.6)
    box("canvas2", -0.25, 0.25, 0.9, 1.35, 0.22, 0.225)
    lathe("chrome", [(0.08, 1.6), (0.08, 1.7)], 10)
    lathe("lamp", [(0.0, 1.7), (0.2, 1.78), (0.22, 1.9), (0.2, 2.02), (0.0, 2.1)], 14)
    beam("rubber", (0.38, 1.1, 0), (0.45, 0.3, 0.1), 0.03, 0.03)
    box("chrome", 0.36, 0.44, 1.05, 1.25, -0.05, 0.05)


@part("island~x", "gas")
def _():
    box("concrete", -0.5, 0.5, 0, 0.18, -0.55, 0.55)
    box("canvas2", -0.5, 0.5, 0.0, 0.04, -0.6, -0.55)
    box("canvas2", -0.5, 0.5, 0.0, 0.04, 0.55, 0.6)


@part("canopy-post", "gas")
def _():
    # a canopy column, 0.45 sq × 5.0, clad, on its island's end with a bollard
    box("galv", -0.22, 0.22, 0, 5.0, -0.22, 0.22)
    box("red", -0.23, 0.23, 4.6, 5.0, -0.23, 0.23)
    lathe("canvas2", [(0.12, 0), (0.12, 0.95), (0.0, 1.0)], 10, 0, 0.7)
    lathe("metal", [(0.122, 0.3), (0.122, 0.4)], 10, 0, 0.7, caps=False)


@part("air-pump", "gas")
def _():
    box("red", -0.25, 0.25, 0, 1.4, -0.2, 0.2)
    box("canvas2", -0.18, 0.18, 0.95, 1.25, 0.2, 0.205)
    beam("rubber", (0.25, 0.8, 0), (0.6, 0.05, 0.4), 0.03, 0.03)
    box("concrete", -0.35, 0.35, 0, 0.1, -0.3, 0.3)


# ── the parking garage ───────────────────────────────────────────────────────────────────────────────────────


@part("column-conc", "garage")
def _():
    # a deck's column, 0.6 sq × 3.0 floor to floor, a drop panel under the slab, a painted collar
    box("concrete", -0.3, 0.3, 0, 2.75, -0.3, 0.3)
    box("concrete", -0.55, 0.55, 2.75, 3.0, -0.55, 0.55)
    box("canvas2", -0.302, 0.302, 0.0, 1.0, -0.302, 0.302, skip=("top", "bottom"))
    box("door", -0.303, 0.303, 0.3, 0.5, -0.303, 0.303, skip=("top", "bottom"))


@part("spandrel~x", "garage")
def _():
    # a precast spandrel at a deck's edge: 1.1 tall over a 0.3 slab, a reveal along it
    box("concrete", -0.5, 0.5, -0.3, 1.1, -0.2, 0)
    box("concrete", -0.5, 0.5, 0.45, 0.5, 0, 0.012)
    box("concrete", -0.5, 0.5, -0.3, -0.25, 0, 0.012)


@part("screen-mesh~x", "garage")
def _():
    # a metal mesh screen panel, 1 m × 3.0, in its frame (the mesh style)
    box("metal", -0.5, -0.46, 0, 3.0, 0, 0.06)
    box("metal", -0.5, 0.5, 0, 0.04, 0, 0.06)
    box("metal", -0.5, 0.5, 2.96, 3.0, 0, 0.06)
    for j in range(25):
        y = 0.04 + j * 0.12
        box("galv", -0.46, 0.5, y, y + 0.05, 0.02, 0.04)


@part("wheel-stop", "garage")
def _():
    prism_x("concrete", [(-0.1, 0), (0.1, 0), (0.07, 0.12), (-0.07, 0.12)], -0.9, 0.9)
    box("canvas2", -0.9, -0.6, 0.12, 0.121, -0.07, 0.07)
    box("canvas2", 0.6, 0.9, 0.12, 0.121, -0.07, 0.07)


@part("barrier", "garage")
def _():
    # a ticket barrier: its cabinet and a striped arm 3.0 long
    box("canvas2", -0.2, 0.2, 0, 1.1, -0.15, 0.15)
    box("door", -0.21, 0.21, 0.9, 1.0, -0.16, 0.16)
    for i in range(8):
        role = "red" if i % 2 == 0 else "canvas2"
        box(role, 0.2 + i * 0.36, 0.2 + (i + 1) * 0.36, 0.95, 1.03, -0.03, 0.03)
    box("galv", -0.55, -0.25, 0.8, 1.35, -0.1, 0.1)
    box("glass", -0.5, -0.3, 1.0, 1.2, 0.1, 0.105)


@part("core-head", "garage")
def _():
    # the stair and lift core's head over the top deck: 3.6 × 6.0 × 3.2, glazed stair side, a lift's overrun
    box("brick", -1.8, 1.8, 0, 3.2, -6.0, 0, skip=("front",))
    box("brick", -1.8, -0.9, 0, 3.2, -0.2, 0, skip=("back",))
    box("brick", 0.9, 1.8, 0, 3.2, -0.2, 0, skip=("back",))
    pane("glass", -0.9, 0.9, 0, 3.0, -0.1)
    box("brick", -0.9, 0.9, 3.0, 3.2, -0.2, 0)
    box("stone", -1.9, 1.9, 3.2, 3.35, -6.1, 0.1)
    box("brick", -1.6, 0.2, 3.35, 4.6, -5.8, -3.6)
    box("stone", -1.65, 0.25, 4.6, 4.7, -5.85, -3.55)


def build():
    """Every part into the buffers."""
    for name, fn in PARTS.items():
        begin(name)
        at()
        fn()
    at()
