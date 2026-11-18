# Plan 104 (docs/plan/104-the-skate-again.md F6a) — the skate hall: a converted brick warehouse on the Grounds' own
# plot, walls and door (grounds.ts BUILDINGS `skatehall`: its collision stays the Grounds'). Two models:
#
#   outside  red brick on a concrete-block plinth, a coping band, steel-framed clerestory windows down the long
#            sides, brick gables, a corrugated roof with skylight strips and a ridge cap, gutters and downpipes, the
#            doorway with its steel frame, the roller shutter's drum and canopy, the enamel SKATE HALL sign, a mural
#            down the south face (shown while you're outside: the Grounds cut it when you're in)
#   inside   the power-floated floor, the walls (a painted block dado, brick over), steel roof trusses on the walls
#            every 20 ft (Pratt webs, purlins), the roof's underside with its skylights, rows of twin-tube
#            fluorescent fittings on chains, the clerestory from inside, the murals, the pro shop (its counter by
#            the door, the slatwall of decks behind it, its lightbox), the office front under the mezzanine, the
#            rules board
#
# The lights (the fittings' tubes) go in the manifest: the game hangs its lamps there.
import math

import pkit as K

E = 0.12  # the walls' thickness inside the plot (as the Grounds' interior)
EAVE = 9.0
RIDGE = 1.6


def wall(mat, a, b, z0, z1, n, u0=0.0, grp="main"):
    """An upright quad from plan a to b, z0..z1, facing n; UVs in metres along it from u0 and up."""
    L = math.dist(a, b)
    K.face(mat, [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], [(u0, z0), (u0 + L, z0), (u0 + L, z1), (u0, z1)], n=(n[0], n[1], 0), grp=grp)


def box(mat, x0, y0, z0, x1, y1, z1, grp="main", skip=()):
    """An axis-aligned box (floor frame), its faces outward; UVs in metres."""
    if "bottom" not in skip:
        K.face(mat, [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], n=(0, 0, -1), grp=grp)
    if "top" not in skip:
        K.face(mat, [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], n=(0, 0, 1), grp=grp)
    wall(mat, (x0, y0), (x1, y0), z0, z1, (0, -1), x0, grp)
    wall(mat, (x1, y1), (x0, y1), z0, z1, (0, 1), x0, grp)
    wall(mat, (x0, y1), (x0, y0), z0, z1, (-1, 0), y0, grp)
    wall(mat, (x1, y0), (x1, y1), z0, z1, (1, 0), y0, grp)


def beam(mat, a, b, w, h, grp="main"):
    """A straight member from a to b (floor frame, its centreline), w wide, h deep, square to its run and up."""
    ax, ay, az = a
    bx, by, bz = b
    d = [bx - ax, by - ay, bz - az]
    L = math.sqrt(sum(c * c for c in d)) or 1
    t = [c / L for c in d]
    up = (0, 0, 1) if abs(t[2]) < 0.9 else (1, 0, 0)
    s = (t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0])
    sl = math.sqrt(sum(c * c for c in s))
    s = [c / sl for c in s]
    v = (s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0])
    cs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

    def P(p, i):
        x, y = cs[i]
        return tuple(p[k] + s[k] * x * w / 2 + v[k] * y * h / 2 for k in range(3))

    for i in range(4):
        j = (i + 1) % 4
        n = tuple(s[k] * (cs[i][0] + cs[j][0]) + v[k] * (cs[i][1] + cs[j][1]) for k in range(3))
        side = w if i % 2 == 0 else h
        K.face(mat, [P(a, i), P(b, i), P(b, j), P(a, j)], [(0, 0), (L, 0), (L, side), (0, side)], n=n, grp=grp)
    for p, sg in ((a, -1), (b, 1)):
        K.face(mat, [P(p, i) for i in range(4)], [(0, 0), (w, 0), (w, h), (0, h)], n=tuple(c * sg for c in t), grp=grp)


def decal(mat, a, b, z0, z1, n, uv=((0, 0), (1, 0), (1, 1), (0, 1)), off=0.01, grp="main"):
    """A picture on a wall (its whole texture unless uv says): plan a → b, z0..z1, set `off` out along n."""
    ax, ay = a[0] + n[0] * off, a[1] + n[1] * off
    bx, by = b[0] + n[0] * off, b[1] + n[1] * off
    K.face(mat, [(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)], list(uv), n=(n[0], n[1], 0), grp=grp)


def sign_uv(row):
    """The signs' atlas rows (0 SKATE HALL, 1 PRO SHOP, 2 the shop's window, 3 the rules)."""
    v1 = 1 - row / 4
    v0 = 1 - (row + 1) / 4
    return ((0, v0), (1, v0), (1, v1), (0, v1))


def roof_z(y, z0, z1, h):
    """The roof's height over y across the plot (a gable, its ridge along x at the middle)."""
    ym = (z0 + z1) / 2
    return h + EAVE + RIDGE * (1 - abs(y - ym) / ((z1 - z0) / 2))


# ── the outside ──────────────────────────────────────────────────────────────────────────────────────────────


def outside(H):
    x0, y0, x1, y1 = H["x0"], H["z0"], H["x1"], H["z1"]
    h = H["h"]
    d = H["door"]
    dx0, dx1 = d["from"], d["to"]
    top = h + EAVE
    plinth = h + 0.9
    # the long walls and the gables: block plinth, brick over, the doorway cut in the south
    for (a, b, n) in (((x1, y0), (x0, y0), (0, -1)), ((x0, y1), (x1, y1), (0, 1)), ((x0, y0), (x0, y1), (-1, 0)), ((x1, y1), (x1, y0), (1, 0))):
        if n == (0, 1):
            for (p, q) in (((x0, y1), (dx0, y1)), ((dx1, y1), (x1, y1))):
                wall("block", p, q, h, plinth, n, p[0])
                wall("brick", p, q, plinth, top, n, p[0])
            wall("brick", (dx0, y1), (dx1, y1), h + 2.8, top, n, dx0)
        else:
            wall("block", a, b, h, plinth, n)
            wall("brick", a, b, plinth, top, n)
    # the gables over the end walls (brick triangles to the ridge)
    ym = (y0 + y1) / 2
    for x, n in ((x0, -1), (x1, 1)):
        pts = [(x, y0, top), (x, y1, top), (x, ym, top + RIDGE)]
        K.face("brick", pts, [(y0, top), (y1, top), (ym, top + RIDGE)], n=(n, 0, 0))
    # the coping band at the eaves, the plinth's cap
    for (ax, ay, bx, by) in ((x0 - 0.06, y0 - 0.06, x1 + 0.06, y0 + 0.1), (x0 - 0.06, y1 - 0.1, x1 + 0.06, y1 + 0.06)):
        box("conc", ax, ay, top - 0.25, bx, by, top)
    for (ax, ay, bx, by) in ((x0 - 0.04, y0 - 0.04, x1 + 0.04, y0), (x0 - 0.04, y1, dx0, y1 + 0.04), (dx1, y1, x1 + 0.04, y1 + 0.04), (x0 - 0.04, y0, x0, y1), (x1, y0, x1 + 0.04, y1)):
        box("conc", ax, ay, plinth, bx, by, plinth + 0.06, skip=("bottom",))
    # the clerestory: steel-framed windows down the long sides, a bay each 20 ft
    for k in range(7):
        cx = x0 + 3.05 + k * 6.1
        if cx > x1 - 1:
            break
        for y, n in ((y0, (0, -1)), (y1, (0, 1))):
            win_out(cx, y, n, h)
    # the roof: corrugated slopes past the walls, the ridge cap, skylight strips each bay
    ov = 0.35
    for ya, yb in ((y0 - ov, ym), (y1 + ov, ym)):
        za = roof_z(ya, y0, y1, h) - (ov * RIDGE / ((y1 - y0) / 2))
        zb = top + RIDGE
        sg = -1 if ya < ym else 1
        K.face("cladding", [(x0 - ov, ya, za), (x1 + ov, ya, za), (x1 + ov, yb, zb), (x0 - ov, yb, zb)], [(0, 0), (x1 - x0 + 2 * ov, 0), (x1 - x0 + 2 * ov, abs(yb - ya)), (0, abs(yb - ya))], n=(0, sg * RIDGE, (y1 - y0) / 2))
        # (its underside at the eaves, seen from below outside)
        K.face("cladding", [(x0 - ov, ya, za - 0.01), (x1 + ov, ya, za - 0.01), (x1 + ov, ya - sg * -ov * 0 + (yb - ya) * 0.02, za - 0.01 + (zb - za) * 0.02), (x0 - ov, ya + (yb - ya) * 0.02, za - 0.01 + (zb - za) * 0.02)], [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, 0, -1))
        for k in range(7):
            cx = x0 + 3.05 + k * 6.1
            for f0, f1 in ((0.3, 0.45), (0.62, 0.77)):
                p0 = (ya + (yb - ya) * f0, za + (zb - za) * f0)
                p1 = (ya + (yb - ya) * f1, za + (zb - za) * f1)
                K.face("glass", [(cx - 1.22, p0[0], p0[1] + 0.03), (cx + 1.22, p0[0], p0[1] + 0.03), (cx + 1.22, p1[0], p1[1] + 0.03), (cx - 1.22, p1[0], p1[1] + 0.03)], [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, sg * RIDGE, (y1 - y0) / 2))
    box("galv", x0 - ov, ym - 0.18, top + RIDGE - 0.02, x1 + ov, ym + 0.18, top + RIDGE + 0.12)
    # the gutters and the downpipes at the corners
    for y in (y0 - ov, y1 + ov):
        box("galv", x0 - ov, y - 0.08, top - 0.05, x1 + ov, y + 0.08, top + 0.07)
    for x in (x0 + 0.25, x1 - 0.25):
        for y in (y0 - 0.12, y1 + 0.12):
            box("galv", x - 0.05, y - 0.05, h, x + 0.05, y + 0.05, top)
    # the doorway: its steel frame, the shutter's drum, a canopy, the sign, a lamp's housing
    ys = y1
    box("steelpaint", dx0 - 0.25, ys - 0.02, h, dx0, ys + 0.14, h + 3.0)
    box("steelpaint", dx1, ys - 0.02, h, dx1 + 0.25, ys + 0.14, h + 3.0)
    box("steelpaint", dx0 - 0.25, ys - 0.02, h + 2.8, dx1 + 0.25, ys + 0.2, h + 3.3)
    box("paint_door", dx0 - 0.1, ys + 0.0, h + 3.3, dx1 + 0.1, ys + 0.45, h + 3.75)
    box("steelpaint", dx0 - 1.0, ys, h + 3.8, dx1 + 1.0, ys + 1.3, h + 3.9)
    for x in (dx0 - 0.9, dx1 + 0.9):
        K_brace(x, ys, h)
    decal("signs", (dx0 - 2.0, ys), (dx1 + 2.0, ys), h + 4.2, h + 5.7, (0, 1), sign_uv(0), off=0.06)
    box("steelpaint", dx0 - 2.1, ys, h + 4.1, dx1 + 2.1, ys + 0.05, h + 5.8)
    # a mural down the south face, west of the door
    decal("mural_north", (x0 + 1.5, ys), (x0 + 17.5, ys), h + 1.2, h + 4.7, (0, 1))


def K_brace(x, y, h):
    beam("steelpaint", (x, y + 0.02, h + 3.0), (x, y + 1.2, h + 3.82), 0.05, 0.05)


def win_out(cx, y, n, h):
    """A clerestory window from outside: a steel frame, glazing bars, dark glass (lit from inside at night)."""
    w, z0, z1 = 3.6, h + 6.0, h + 8.2
    a = (cx - w / 2, y)
    b = (cx + w / 2, y)
    decal("winglow", a, b, z0, z1, n, ((0, 0), (1, 0), (1, 1), (0, 1)), off=0.005)
    o = 0.03
    sx = n[0] * o
    sy = n[1] * o
    # (the frame, its sill, glazing bars in a grid)
    for zz in (z0, z1):
        box("steelpaint", a[0], y + sy - 0.03, zz - 0.04, b[0], y + sy + 0.03, zz + 0.04)
    for k in range(5):
        x = a[0] + w * k / 4
        box("steelpaint", x - 0.03, y + sy - 0.03, z0, x + 0.03, y + sy + 0.03, z1)
    for k in (1, 2):
        zz = z0 + (z1 - z0) * k / 3
        box("steelpaint", a[0], y + sy - 0.02, zz - 0.02, b[0], y + sy + 0.02, zz + 0.02)
    box("conc", a[0] - 0.1, y - 0.0 + n[1] * 0.0 - 0.12 * (n[1] < 0) + 0.0, z0 - 0.12, b[0] + 0.1, y + 0.12 * (n[1] > 0), z0 - 0.04)
    _ = sx


# ── the inside ───────────────────────────────────────────────────────────────────────────────────────────────


def inside(H, shop, lights):
    x0, y0, x1, y1 = H["x0"] + E, H["z0"] + E, H["x1"] - E, H["z1"] - E
    h = H["h"]
    d = H["door"]
    dx0, dx1 = d["from"], d["to"]
    top = h + EAVE
    ym = (y0 + y1) / 2
    # the floor (a hair under the pipes' flats)
    K.face("floor", [(x0, y0, h + 0.002), (x1, y0, h + 0.002), (x1, y1, h + 0.002), (x0, y1, h + 0.002)], [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], n=(0, 0, 1))
    # the walls from inside: a painted block dado, brick over (the doorway open)
    dado = h + 1.2
    walls = [((x0, y0), (x1, y0), (0, 1)), ((x1, y1), (x0, y1), (0, -1)), ((x0, y1), (x0, y0), (1, 0)), ((x1, y0), (x1, y1), (-1, 0))]
    for a, b, n in walls:
        if n == (0, -1):
            for p, q in (((x1, y1), (dx1, y1)), ((dx0, y1), (x0, y1))):
                wall("paint_white", p, q, h, dado, n)
                wall("brick", p, q, dado, top, n)
            wall("brick", (dx1, y1), (dx0, y1), h + 2.8, top, n)
            # (the reveal of the doorway through the wall)
            for x, nn in ((dx0, (1, 0)), (dx1, (-1, 0))):
                wall("brick", (x, y1), (x, y1 + E), h, h + 2.8, nn)
            K.face("brick", [(dx0, y1, h + 2.8), (dx1, y1, h + 2.8), (dx1, y1 + E, h + 2.8), (dx0, y1 + E, h + 2.8)], [(0, 0), (2, 0), (2, 0.12), (0, 0.12)], n=(0, 0, -1))
        else:
            wall("paint_white", a, b, h, dado, n)
            wall("brick", a, b, dado, top, n)
        # (a black line at the dado's top)
        wall("paint_black", a, b, dado - 0.05, dado, n) if n != (0, -1) else None
    # the gables from inside
    for x, n in ((x0, 1), (x1, -1)):
        K.face("brick", [(x, y0, top), (x, y1, top), (x, ym, top + RIDGE)], [(y0, top), (y1, top), (ym, top + RIDGE)], n=(n, 0, 0))
    # the roof's underside (its corrugation from below), the skylights in it
    for ya in (y0, y1):
        za = top
        zb = top + RIDGE
        sg = -1 if ya < ym else 1
        K.face("cladding", [(x0, ya, za), (x1, ya, za), (x1, ym, zb), (x0, ym, zb)], [(0, 0), (x1 - x0, 0), (x1 - x0, abs(ym - ya)), (0, abs(ym - ya))], n=(0, -sg * RIDGE, -(y1 - y0) / 2))
        for k in range(7):
            cx = H["x0"] + 3.05 + k * 6.1
            for f0, f1 in ((0.3, 0.45), (0.62, 0.77)):
                p0 = (ya + (ym - ya) * f0, za + (zb - za) * f0 - 0.02)
                p1 = (ya + (ym - ya) * f1, za + (zb - za) * f1 - 0.02)
                K.face("skylight", [(cx - 1.22, p0[0], p0[1]), (cx + 1.22, p0[0], p0[1]), (cx + 1.22, p1[0], p1[1]), (cx - 1.22, p1[0], p1[1])], [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, -sg * RIDGE, -(y1 - y0) / 2))
    # the trusses: on the walls every 20 ft, Pratt webs; purlins along over them
    bottom = top - 0.35
    xs = [H["x0"] + 3.05 + k * 6.1 for k in range(7)]
    for x in xs:
        tc = [(x, y0, top - 0.05), (x, ym, top + RIDGE - 0.12), (x, y1, top - 0.05)]
        beam("steelpaint", tc[0], tc[1], 0.14, 0.2)
        beam("steelpaint", tc[1], tc[2], 0.14, 0.2)
        beam("steelpaint", (x, y0, bottom), (x, y1, bottom), 0.14, 0.16)
        n = 8
        for i in range(1, n * 2):
            yy = y0 + (y1 - y0) * i / (n * 2)
            zt = roof_z(yy, H["z0"], H["z1"], h) - 0.15
            beam("steelpaint", (x, yy, bottom + 0.08), (x, yy, zt - 0.05), 0.07, 0.07)
            if i < n * 2 - 1:
                yn = y0 + (y1 - y0) * (i + 1) / (n * 2)
                ztn = roof_z(yn, H["z0"], H["z1"], h) - 0.15
                if yy < ym:
                    beam("steelpaint", (x, yy, zt - 0.05), (x, yn, bottom + 0.08), 0.06, 0.06)
                else:
                    beam("steelpaint", (x, yy, bottom + 0.08), (x, yn, ztn - 0.05), 0.06, 0.06)
        # (its bearing plates on the walls)
        for y in (y0, y1):
            box("steelpaint", x - 0.2, min(y, y - 0.3 * (1 if y > ym else -1)), top - 0.6, x + 0.2, max(y, y - 0.3 * (1 if y > ym else -1)), top - 0.35)
    for k in range(1, 8):
        for side in (-1, 1):
            yy = ym + side * (ym - y0) * k / 8
            zz = roof_z(yy, H["z0"], H["z1"], h) - 0.12
            beam("steelpaint", (x0, yy, zz), (x1, yy, zz), 0.08, 0.15)
    # the fittings: twin-tube fluorescents on chains, three rows down the hall, one a bay
    fz = h + 6.6
    for ry in (y0 + 6.0, ym, y1 - 6.5):
        for k in range(6):
            cx = (xs[k] + xs[k + 1]) / 2
            fitting(cx, ry, fz, bottom)
            lights.append([round(cx, 3), round(ry, 3), round(fz - 0.15, 3)])
    # the clerestory from inside: its glazing (the day through it), frames, bars
    for k in range(7):
        cx = H["x0"] + 3.05 + k * 6.1
        for y, n in ((y0, (0, 1)), (y1, (0, -1))):
            w, z0, z1 = 3.6, h + 6.0, h + 8.2
            decal("skylight", (cx - w / 2, y), (cx + w / 2, y), z0, z1, n, off=0.005)
            for k2 in range(5):
                xx = cx - w / 2 + w * k2 / 4
                box("steelpaint", xx - 0.03, y + n[1] * 0.01 - 0.02, z0, xx + 0.03, y + n[1] * 0.01 + 0.02, z1)
            for zz in (z0, (z0 + z1) / 2, z1):
                box("steelpaint", cx - w / 2, y + n[1] * 0.01 - 0.02, zz - 0.03, cx + w / 2, y + n[1] * 0.01 + 0.02, zz + 0.03)
    # the murals (our own words): over the vert's extension, the north quarters, the east wall, the mezzanine
    decal("mural_west", (x0, -523.6), (x0, -535.6), h + 4.9, h + 8.9, (1, 0))
    decal("mural_north", (476.0, y0), (492.0, y0), h + 2.6, h + 6.1, (0, 1))
    decal("mural_east", (x1, -534.0), (x1, -522.0), h + 2.3, h + 6.3, (-1, 0))
    decal("mural_south", (467.4, y1), (457.4, y1), h + 3.4, h + 6.4, (0, -1))
    # the pro shop by the door: its counter, the decks on the slatwall behind, its lightbox; the rules board
    counter(shop, h)
    sx0, sx1 = shop["x"] - 0.2, shop["x"] + shop["w"] + 0.2
    box("wood", sx0, y1 - 0.04, h + 1.15, sx1, y1, h + 2.55)
    colours = ["paint_yellow", "paint_door", "paint_black", "paint_yellow", "paint_white", "paint_door", "paint_black"]
    for k in range(7):
        x = sx0 + 0.3 + k * (sx1 - sx0 - 0.6) / 6
        box(colours[k], x - 0.1, y1 - 0.07, h + 1.3, x + 0.1, y1 - 0.05, h + 2.1)
    decal("signlit", (sx1 + 0.6, y1), (sx0 - 0.6, y1), h + 2.7, h + 3.4, (0, -1), sign_uv(1), off=0.095)
    box("paint_black", sx0 - 0.65, y1 - 0.08, h + 2.65, sx1 + 0.65, y1, h + 3.45)
    decal("signs", (dx0 - 0.7, y1), (dx0 - 2.5, y1), h + 1.3, h + 1.75, (0, -1), sign_uv(3))
    box("paint_white", dx0 - 2.55, y1 - 0.02, h + 1.27, dx0 - 0.65, y1, h + 1.78)
    # the office under the mezzanine: its window onto the hall, a door, the PRO SHOP name
    front = -508.2 - 3.05 - 0.02
    decal("signs", (460.2, front), (466.4, front), h + 0.85, h + 2.05, (0, -1), sign_uv(2), off=0.005)
    decal("glass", (460.2, front), (466.4, front), h + 0.85, h + 2.05, (0, -1), off=0.02)
    for xx in (460.15, 463.3, 466.45):
        box("steelpaint", xx - 0.04, front - 0.05, h + 0.8, xx + 0.04, front + 0.01, h + 2.1)
    for zz in (h + 0.8, h + 2.1):
        box("steelpaint", 460.1, front - 0.05, zz - 0.04, 466.5, front + 0.01, zz + 0.04)
    box("paint_door", 467.0, front - 0.04, h, 467.95, front + 0.01, h + 2.1)
    box("chrome", 467.8, front - 0.08, h + 1.0, 467.86, front - 0.04, h + 1.06)
    # (the mezzanine's edge: yellow and black where it drops)
    for k in range(18):
        x = 459.36 + k * 0.508
        box("paint_yellow" if k % 2 == 0 else "paint_black", x, front - 0.0, h + 2.3, x + 0.508, front + 0.01, h + 2.44)


def fitting(cx, cy, z, hang):
    """A twin-tube 5 ft fitting: its white housing, two lit tubes under it, its chains up to the truss line."""
    L = 1.52
    box("fixture", cx - L / 2, cy - 0.09, z, cx + L / 2, cy + 0.09, z + 0.07)
    for dy in (-0.045, 0.045):
        tube_lit(cx - L / 2 + 0.03, cx + L / 2 - 0.03, cy + dy, z - 0.02)
    for dx in (-0.55, 0.55):
        beam("galv", (cx + dx, cy, z + 0.07), (cx + dx, cy, hang - 0.08), 0.012, 0.012)


def tube_lit(xa, xb, y, z):
    r = 0.016
    n = 8 if K.near() else 4
    for k in range(n):
        a0 = 2 * math.pi * k / n
        a1 = 2 * math.pi * (k + 1) / n
        p = [(xa, y + r * math.cos(a0), z + r * math.sin(a0)), (xb, y + r * math.cos(a0), z + r * math.sin(a0)), (xb, y + r * math.cos(a1), z + r * math.sin(a1)), (xa, y + r * math.cos(a1), z + r * math.sin(a1))]
        K.face("tube_lit", p, [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2)))


def counter(s, h):
    """The pro shop's counter (grounds.ts SKATE_SHOP, its solid): a wooden body, a glass top on a steel frame, a till,
    wheels and wax under the glass."""
    x0, y0 = s["x"], s["z"]
    x1, y1 = x0 + s["w"], y0 + s["d"]
    top = h + s["h"]
    box("wood", x0, y0, h, x1, y1, top - 0.08)
    box("paint_black", x0 - 0.01, y0 - 0.01, h, x1 + 0.01, y1 + 0.01, h + 0.08)
    box("galv", x0, y0, top - 0.08, x1, y1, top - 0.06)
    for k in range(9):
        cx = x0 + 0.2 + k * 0.32
        box(["paint_yellow", "paint_white", "paint_door"][k % 3], cx - 0.04, y0 + 0.2, top - 0.06, cx + 0.04, y0 + 0.28, top - 0.02)
    K.face("glass", [(x0, y0, top), (x1, y0, top), (x1, y1, top), (x0, y1, top)], [(0, 0), (1, 0), (1, 1), (0, 1)], n=(0, 0, 1))
    box("paint_black", x1 - 0.55, y0 + 0.2, top, x1 - 0.15, y0 + 0.5, top + 0.18)
    box("chrome", x1 - 0.5, y0 + 0.18, top + 0.18, x1 - 0.2, y0 + 0.24, top + 0.22)
