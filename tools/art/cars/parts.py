# Plan 92 — the cars' parts: wheels, lamps, grilles, bumpers, mirrors, wipers, trims, glass, the cabin and the
# engine bay. Each made in the car's frame (kit.py) and tagged with its group; most placed on the body by
# casting rays at it (`Skin`), so a lamp or a moulding sits on the panel whatever the body's shape.
import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import kit

NEAR = True  # (the mid level: no flutes, pleats, tread blocks)

# ── the skin: rays cast at the finished panels ─────────────────────────────────────────────────────────────


class Skin:
    def __init__(self, objs):
        bm = bmesh.new()
        for o in objs:
            me = o.data.copy()
            me.transform(o.matrix_world)
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
        self.bvh = BVHTree.FromBMesh(bm)
        bm.free()

    def hit(self, origin, direction, far=6.0):
        loc, nrm, _, _ = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized(), far)
        return (loc, nrm) if loc is not None else (None, None)

    def side(self, x, z, side=1):
        """The outer skin on a side at (x, z): from outside, in."""
        return self.hit((x, side * 3.0, z), (0, -side, 0))

    def front(self, y, z, sign=1):
        """The nose (sign 1) or the tail (−1) at (y, z)."""
        return self.hit((sign * 6.0, y, z), (-sign, 0, 0))

    def top(self, x, y):
        return self.hit((x, y, 4.0), (0, 0, -1))


def patch(name, skin, rays, rows, cols, kind, grp="body", out=0.004, depth=0.02, rim=True, far=6.0):
    """A shell on the skin: a grid of rays (rows × cols, each (origin, direction)) — its face `out` over where
    they hit, its back `depth` under; its edges closed (a lamp's lens, a moulding, a badge)."""
    hits = []
    for o, d in rays:
        # (no further than the skin can be: a ray through a panel's gap would otherwise hit the shell's inside
        # far beyond it — it takes its neighbour's hit instead)
        loc, n = skin.hit(o, d, far)
        # (only the outer skin counts: a face turned away from the ray, or edge-on to it, is a gap's wall or a
        # panel's inside seen through a gap — a miss)
        if loc is not None and n.dot(Vector(d).normalized()) > -0.3:
            loc, n = None, None
        hits.append((loc, n))
    # (a ray that missed — over an opening — takes its nearest neighbour's hit in its row)
    for i, (loc, n) in enumerate(hits):
        if loc is None:
            r = i // cols
            best = None
            for j in range(r * cols, r * cols + cols):
                if hits[j][0] is not None and (best is None or abs(j - i) < abs(best - i)):
                    best = j
            if best is None:
                for j in range(len(hits)):
                    if hits[j][0] is not None:
                        best = j
                        break
            if best is None:
                hits[i] = (Vector(rays[i][0]) + Vector(rays[i][1]).normalized() * 2.9, -Vector(rays[i][1]).normalized())
            else:
                bl, bn = hits[best]
                # (parallel rays: moved along the strip by their own spacing; a fan's: its neighbour's point —
                # its origins are metres apart)
                same = (Vector(rays[i][1]).normalized() - Vector(rays[best][1]).normalized()).length < 1e-4
                hits[i] = (bl + (Vector(rays[i][0]) - Vector(rays[best][0])) if same else bl.copy(), bn)
    front, back = [], []
    for loc, n in hits:
        front.append(loc + n * out)
        back.append(loc - n * depth)
    verts = front + back
    N = rows * cols
    faces = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            a = r * cols + c
            faces.append((a, a + 1, a + cols + 1, a + cols))
            faces.append((N + a, N + a + cols, N + a + cols + 1, N + a + 1))
    if rim:
        ring = [c for c in range(cols)] + [r * cols + cols - 1 for r in range(1, rows)]
        ring += [(rows - 1) * cols + c for c in range(cols - 2, -1, -1)] + [r * cols for r in range(rows - 2, 0, -1)]
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            faces.append((b, a, N + a, N + b))
    o = kit.mk(name, verts, faces, kind, grp, smooth=True, angle=50)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def side_patch(name, skin, x0, x1, z0, z1, side, kind, grp="body", nx=12, nz=3, out=0.004, depth=0.015, zfun=None):
    """A strip on a side between x0..x1, z0..z1 (z0/z1 may follow x through zfun(x) → (z0, z1))."""
    rays = []
    for r in range(nz):
        for c in range(nx):
            x = x0 + (x1 - x0) * c / (nx - 1)
            lo, hi = zfun(x) if zfun else (z0, z1)
            z = lo + (hi - lo) * r / (nz - 1)
            rays.append(((x, side * 3.0, z), (0, -side, 0)))
    o = patch(name, skin, rays, nz, nx, kind, grp, out, depth, far=2.75)
    return o


def end_patch(name, skin, y0, y1, z0, z1, sign, kind, grp="body", ny=10, nz=4, out=0.004, depth=0.03, wrap=None):
    """A patch on the nose (sign 1) or the tail (−1): y0..y1 by z0..z1. With `wrap` (a centre x inside the car),
    the rays fan from it instead (a lamp that wraps round the corner: y0..y1 then taken as angles)."""
    rays = []
    for r in range(nz):
        z = z0 + (z1 - z0) * r / (nz - 1)
        for c in range(ny):
            if wrap is None:
                y = y0 + (y1 - y0) * c / (ny - 1)
                rays.append(((sign * 6.0, y, z), (-sign, 0, 0)))
            else:
                cx, cy = wrap
                a = y0 + (y1 - y0) * c / (ny - 1)
                d = Vector((math.cos(a), math.sin(a), 0))
                rays.append(((cx + d.x * 3, cy + d.y * 3, z), (-d.x, -d.y, 0)))
    return patch(name, skin, rays, nz, ny, kind, grp, out, depth, far=2.95 if wrap is not None else 4.6)


def ribs(o, axis_z=True, pitch=0.012, amp=0.0015):
    """A lens ribbed (horizontal ridges: the 80s tail lamp) by pushing its front face in and out."""
    me = o.data
    for v in me.vertices:
        pass
    return o


# ── wheels ─────────────────────────────────────────────────────────────────────────────────────────────────


def tyre_mid(name, r, w, grp):
    """The mid level's tyre: eight points round its section, its atlas UVs the same."""
    rim_r = r - 0.13 * (r / 0.317)
    hw = w / 2
    prof = [(rim_r + 0.004, -hw * 0.82), (rim_r + (r - rim_r) * 0.5, -hw * 1.02), (r - 0.02, -hw * 0.9), (r, -hw * 0.6), (r, hw * 0.6), (r - 0.02, hw * 0.9), (rim_r + (r - rim_r) * 0.5, hw * 1.02), (rim_r + 0.004, hw * 0.82)]
    vv = [0.0, 0.25, 0.4, 0.42, 0.58, 0.6, 0.8, 1.0]
    return kit.lathe(name, prof, 48, "tyre", grp, axis="y", cap=False, angle=60, uv_v=vv, uv_u=-1.0)


def tyre(name, r, w, grp, aggressive=False, n=60):
    """A tyre (axis y, centre at the origin): its sidewalls bulged, a rim protector, the tread's ribs and
    staggered blocks."""
    rim_r = r - (0.13 if not aggressive else 0.15) * (r / 0.317)
    hw = w / 2
    prof = [
        (rim_r + 0.004, -hw * 0.82),
        (rim_r + 0.012, -hw * 0.93),
        (rim_r + 0.03, -hw * 0.97),
        (rim_r + (r - rim_r) * 0.45, -hw * 1.02),
        (rim_r + (r - rim_r) * 0.7, -hw * 1.0),
        (r - 0.03, -hw * 0.94),
        (r - 0.012, -hw * 0.84),
        (r - 0.003, -hw * 0.7),
    ]
    # the tread: grooves at fixed spots across
    tread = []
    k = 9 if not aggressive else 7
    for i in range(k + 1):
        t = -0.7 + 1.4 * i / k
        groove = i in ((2, 5, 8) if not aggressive else (2, 5))
        tread.append((r - (0.008 if groove else 0.0), hw * t))
    prof += tread[1:-1]
    prof += [(r - 0.003, hw * 0.7), (r - 0.012, hw * 0.84), (r - 0.03, hw * 0.94), (rim_r + (r - rim_r) * 0.7, hw * 1.0)]
    prof += [(rim_r + (r - rim_r) * 0.45, hw * 1.02), (rim_r + 0.03, hw * 0.97), (rim_r + 0.012, hw * 0.93), (rim_r + 0.004, hw * 0.82)]
    # (UVs on the tyre's atlas: v 0..0.4 the inner sidewall rim → shoulder, the tread 0.42..0.58, the outer
    # sidewall shoulder → rim 0.6..1 — Blender's v up, the atlas's rows down: textures.make_tyre)
    nt = len(tread) - 2
    vv = [0.4 * i / 7 for i in range(8)] + [0.42 + 0.16 * i / max(1, nt - 1) for i in range(nt)] + [0.6 + 0.4 * i / 7 for i in range(8)]
    vv = [1.0 - (1.0 - v) for v in vv]
    # (u runs against the turn: the lettering reads the right way round from outside)
    o = kit.lathe(name, prof, n, "tyre", grp, axis="y", cap=False, angle=60, uv_v=vv, uv_u=-1.0)
    # blocks: every other column of the tread pushed in, staggered across the ribs
    tread_ids = set(range(8, 8 + k - 1))
    m = len(prof)
    n = len(o.data.vertices) // m - 1
    for i in range(n + 1) if NEAR else ():
        for j in tread_ids:
            v = o.data.vertices[i * m + j]
            rib = (j - 8) // (3 if not aggressive else 2)
            if ((i // (1 if not aggressive else 2)) + rib) % 2 == 0:
                c = Vector((v.co.x, 0, v.co.z))
                v.co -= c.normalized() * (0.004 if not aggressive else 0.009)
    return o


def rim(name, style, r_tyre, w, grp):
    """A wheel (axis y; +y outward is the wheel's face — the build turns it for the right side)."""
    rr = r_tyre - 0.13 * (r_tyre / 0.317)  # the rim's radius
    hw = w / 2
    obs = []
    # the barrel and the lip
    barrel = [(rr - 0.012, -hw * 0.8), (rr - 0.01, hw * 0.55), (rr + 0.006, hw * 0.75), (rr + 0.01, hw * 0.82), (rr - 0.006, hw * 0.85)]
    kind = {"steel": "steel_paint", "cover": "steel_paint", "lattice": "alloy", "turbine": "alloy", "sport": "alloy_dark", "winter": "trim", "offroad": "steel_paint", "chrome": "chrome"}[style]
    obs.append(kit.lathe(name + ".barrel", barrel, 48, kind if style not in ("cover",) else "steel_paint", grp, axis="y", cap=False))
    face_y = hw * 0.45
    if style in ("steel", "winter", "offroad", "cover"):
        # a pressed dish: the centre out, a ring of holes (dark discs), the nuts, a small cap
        dish = [(rr - 0.01, face_y - 0.02), (rr * 0.82, face_y), (rr * 0.7, face_y + 0.012), (rr * 0.5, face_y + 0.012), (rr * 0.42, face_y + 0.03), (0.0, face_y + 0.03)]
        obs.append(kit.lathe(name + ".dish", dish, 40, kind, grp, axis="y"))
        holes = 6 if style != "offroad" else 8
        for i in range(holes):
            a = 2 * math.pi * (i + 0.5) / holes
            c = (math.cos(a) * rr * 0.62, face_y + 0.0135, math.sin(a) * rr * 0.62)
            h = kit.cyl(f"{name}.hole{i}", c, rr * (0.09 if style != "offroad" else 0.07), 0.004, "under", grp, axis="y", n=10)
            obs.append(h)
        for i in range(4 if style != "offroad" else 6):
            a = 2 * math.pi * i / (4 if style != "offroad" else 6)
            obs.append(kit.cyl(f"{name}.nut{i}", (math.cos(a) * rr * 0.3, face_y + 0.04, math.sin(a) * rr * 0.3), 0.011, 0.022, "chrome", grp, axis="y", n=6))
        obs.append(kit.cyl(name + ".cap", (0, face_y + 0.04, 0), rr * 0.2, 0.025, "chrome" if style != "winter" else "trim", grp, axis="y", n=24, bevel_r=0.004))
        if style == "cover":
            # the base car's full plastic cover: a dished disc, its slots
            cov = [(rr + 0.012, face_y + 0.005), (rr * 0.9, face_y + 0.03), (rr * 0.55, face_y + 0.05), (rr * 0.25, face_y + 0.058), (0.0, face_y + 0.06)]
            obs.append(kit.lathe(name + ".cover", cov, 48, "steel_paint", grp, axis="y"))
            for i in range(12):
                a = 2 * math.pi * i / 12
                c = Vector((math.cos(a) * rr * 0.7, face_y + 0.044, math.sin(a) * rr * 0.7))
                slot = kit.box(f"{name}.slot{i}", (0, 0, 0), (0.07, 0.004, 0.018), "under", grp)
                kit.rot(slot, "Y", -a)
                kit.move(slot, c)
                obs.append(slot)
    else:
        # a cast wheel: its spokes (lattice: a mesh; turbine: curved vanes; sport: five spokes), a cap
        hub = [(rr * 0.3, face_y + 0.01), (rr * 0.22, face_y + 0.03), (0.0, face_y + 0.035)]
        obs.append(kit.lathe(name + ".hub", [(rr * 0.35, face_y - 0.02)] + hub, 32, kind, grp, axis="y"))
        if style == "lattice":
            for i in range(10):
                a = 2 * math.pi * i / 10
                for sgn in (1, -1):
                    p0 = Vector((math.cos(a) * rr * 0.3, face_y + 0.008, math.sin(a) * rr * 0.3))
                    a1 = a + sgn * 0.62
                    p1 = Vector((math.cos(a1) * (rr - 0.008), face_y - 0.005, math.sin(a1) * (rr - 0.008)))
                    obs.append(kit.tube(f"{name}.sp{i}{sgn}", [p0, p1], 0.0065, kind, grp, n=6))
            ring = [(rr - 0.004, face_y - 0.012), (rr - 0.004, face_y + 0.004), (rr - 0.03, face_y + 0.004), (rr - 0.03, face_y - 0.012)]
            obs.append(kit.lathe(name + ".ring", ring, 48, kind, grp, axis="y"))
        elif style == "turbine":
            disc = [(rr - 0.004, face_y - 0.01), (rr * 0.9, face_y + 0.006), (rr * 0.32, face_y + 0.012)]
            obs.append(kit.lathe(name + ".disc", disc, 48, kind, grp, axis="y", cap=False))
            for i in range(14):
                a = 2 * math.pi * i / 14
                s = kit.box(f"{name}.vane{i}", (0, 0, 0), (rr * 0.42, 0.006, 0.026), "under", grp)
                kit.rot(s, "Y", -a - 0.35)
                kit.move(s, (math.cos(a) * rr * 0.64, face_y + 0.012, math.sin(a) * rr * 0.64))
                obs.append(s)
        else:  # sport: five flat spokes
            ring = [(rr - 0.004, face_y - 0.012), (rr - 0.004, face_y + 0.006), (rr - 0.025, face_y + 0.006), (rr - 0.025, face_y - 0.012)]
            obs.append(kit.lathe(name + ".ring", ring, 48, kind, grp, axis="y"))
            for i in range(5):
                a = 2 * math.pi * i / 5
                s = kit.box(f"{name}.spoke{i}", (0, 0, 0), (rr * 0.75, 0.02, 0.05), kind, grp, r=0.006)
                kit.rot(s, "Y", -a)
                kit.move(s, (math.cos(a) * rr * 0.6, face_y + 0.004, math.sin(a) * rr * 0.6))
                obs.append(s)
        obs.append(kit.cyl(name + ".cap", (0, face_y + 0.04, 0), rr * 0.13, 0.012, "chrome", grp, axis="y", n=20, bevel_r=0.003))
        for i in range(4):
            a = 2 * math.pi * i / 4 + 0.4
            obs.append(kit.cyl(f"{name}.nut{i}", (math.cos(a) * rr * 0.24, face_y + 0.036, math.sin(a) * rr * 0.24), 0.009, 0.016, "chrome", grp, axis="y", n=6))
    return obs


def wheel(tag, style, r, w, aggressive=False):
    """A whole wheel for corner `tag` (fl, fr, rl, rr) at the origin, its face to +y: the tyre, the rim and the
    disc spin; the calliper only steers."""
    spin, steer = f"spin_{tag}", f"steer_{tag}"
    if not NEAR:
        # (the mid level: the tyre's eight-point section, the wheel's face one dish and its cap)
        rr = r - 0.13 * (r / 0.317)
        kind = {"steel": "steel_paint", "cover": "steel_paint", "lattice": "alloy", "turbine": "alloy", "sport": "alloy_dark", "winter": "trim", "offroad": "steel_paint", "chrome": "chrome"}.get(style, "steel_paint")
        face_y = w / 2 * 0.45
        dish = [(rr + 0.008, face_y - 0.03), (rr * 0.8, face_y + 0.005), (rr * 0.3, face_y + 0.02), (0.0, face_y + 0.035)]
        obs = [tyre_mid(f"tyre_{tag}", r, w, spin), kit.lathe(f"rim_{tag}", dish, 32, kind, spin, axis="y")]
        cal = kit.box(f"caliper_{tag}", (0, 0, 0), (0.09, 0.07, 0.05), "caliper", steer)
        kit.move(cal, (-rr * 0.55, 0.0, rr * 0.55))
        return obs + [cal]
    obs = [tyre(f"tyre_{tag}", r, w, spin, aggressive)]
    obs += rim(f"rim_{tag}", style, r, w, spin)
    rr = r - 0.13 * (r / 0.317)
    disc = [(rr - 0.03, -0.012), (rr - 0.03, 0.012), (rr * 0.45, 0.012), (rr * 0.45, -0.012)]
    obs.append(kit.lathe(f"disc_{tag}", disc, 32, "disc", spin, axis="y"))
    cal = kit.box(f"caliper_{tag}", (0, 0, 0), (0.09, 0.07, 0.05), "caliper", steer, r=0.012)
    kit.move(cal, (-rr * 0.55, 0.0, rr * 0.55))
    obs.append(cal)
    return obs


def place_wheel(obs, at, side):
    """A wheel's parts moved to its corner; the right side's turned to face out."""
    for o in obs:
        if side < 0:
            kit.rot(o, "Z", math.pi)
        kit.move(o, at)
    return obs


# ── lamps ──────────────────────────────────────────────────────────────────────────────────────────────────


def _bowl(name, rb, d, sy, sz, kind, grp, n=28):
    """A reflector's bowl facing +x (its rim at x 0): a paraboloid, its mouth scaled to sy × sz of rb."""
    prof = [(rb * (1 - t) ** 0.5 if t < 1 else 0.0, -d * t) for t in (0.0, 0.18, 0.4, 0.65, 0.85, 1.0)]
    o = kit.lathe(name, prof, n, kind, grp, axis="x", cap=False)
    kit.scale(o, (1.0, sy, sz))
    return o


def headlamp(name, c, w, h, grp="body", round_=False, emit="emit_head", lens="lens", depth=0.07, bezel="chrome", yaw=0.0):
    """A headlamp set in the skin at c (the skin's plane there, facing +x; turned `yaw` about z to follow the
    nose): a bezel round it, a housing behind, reflector bowls with their bulbs and shields, the lit discs deep
    in them (the game's emit_head), the lens (its prisms the lens map's). Rectangular (two bowls side by side,
    the 80s twin lamp) or round."""
    x, y, z = c
    obs = []
    if not NEAR:
        # (the mid level: its bezel and its lens, lit)
        if round_:
            r = min(w, h) / 2
            obs.append(kit.cyl(name + ".bezel", (x - 0.004, y, z), r + 0.014, 0.02, bezel, grp, axis="x", n=16))
            obs.append(kit.cyl(name + ".lens", (x + 0.004, y, z), r, 0.006, emit if grp.startswith("lamp") else lens, grp, axis="x", n=16))
        else:
            obs.append(kit.box(name + ".housing", (x - 0.01, y, z), (0.03, w + 0.03, h + 0.03), bezel, grp))
            obs.append(kit.box(name + ".lens", (x + 0.006, y, z), (0.008, w, h), emit if grp.startswith("lamp") else lens, grp))
    elif round_:
        r = min(w, h) / 2
        ring = [(r + 0.002, -0.03), (r + 0.017, -0.004), (r + 0.02, 0.004), (r + 0.015, 0.011), (r + 0.004, 0.01), (r - 0.002, 0.003)]
        o = kit.lathe(name + ".bezel", ring, 40, bezel, grp, axis="x", cap=False)
        kit.move(o, (x, y, z))
        obs.append(o)
        o = kit.lathe(name + ".housing", [(r + 0.002, 0.0), (r + 0.002, -depth), (0.0, -depth)], 24, "gloss", grp, axis="x", cap=False)
        kit.move(o, (x - 0.004, y, z))
        obs.append(o)
        d = depth * 0.8
        o = _bowl(name + ".refl", r * 0.98, d, 1.0, 1.0, "reflector", grp, n=32)
        kit.move(o, (x - 0.004, y, z))
        obs.append(o)
        obs.append(kit.cyl(name + ".glow", (x - 0.004 - d * 0.86, y, z), r * 0.36, 0.004, emit, grp, axis="x", n=16))
        obs.append(kit.cyl(name + ".bulb", (x - 0.004 - d * 0.6, y, z), r * 0.09, d * 0.4, emit, grp, axis="x", n=10))
        obs.append(kit.cyl(name + ".shield", (x - 0.004 - d * 0.38, y, z), r * 0.16, 0.006, "chrome", grp, axis="x", n=14))
        ln = [(r * 0.995, -0.002), (r * 0.9, 0.006), (r * 0.6, 0.011), (r * 0.25, 0.0135), (0.0, 0.014)]
        o = kit.lathe(name + ".lens", ln, 32, lens, grp, axis="x")
        kit.move(o, (x - 0.004, y, z))
        obs.append(o)
    else:
        obs.append(kit.frame_x(name + ".bezel", (x + 0.008, y, z), kit.rrect(w + 0.036, h + 0.036, 0.016, 3), kit.rrect(w + 0.002, h + 0.002, 0.007, 3), 0.032, bezel, grp, slope=0.006))
        obs.append(kit.xprism(name + ".housing", [(y + a, z + b_) for a, b_ in kit.rrect(w + 0.004, h + 0.004, 0.008, 3)], x - depth, x - 0.004, "gloss", grp, caps=(True, False)))
        nb = 2 if w / h > 1.6 else 1
        rb = min(w / (2 * nb), h / 2)
        d = depth * 0.78
        for k in range(nb):
            yy = y - w / 2 + w * (k + 0.5) / nb
            o = _bowl(f"{name}.refl{k}", rb, d, (w / nb / 2) / rb * 0.97, (h / 2) / rb * 0.95, "reflector", grp)
            kit.move(o, (x - 0.006, yy, z))
            obs.append(o)
            obs.append(kit.cyl(f"{name}.glow{k}", (x - 0.006 - d * 0.86, yy, z), rb * 0.36, 0.004, emit, grp, axis="x", n=16))
            obs.append(kit.cyl(f"{name}.bulb{k}", (x - 0.006 - d * 0.6, yy, z), rb * 0.1, d * 0.4, emit, grp, axis="x", n=10))
            obs.append(kit.cyl(f"{name}.shield{k}", (x - 0.006 - d * 0.36, yy, z), rb * 0.18, 0.006, "chrome", grp, axis="x", n=14))
        lens_o = kit.xprism(name + ".lens", [(y + a, z + b_) for a, b_ in kit.rrect(w, h, 0.007, 3)], x - 0.004, x + 0.003, lens, grp)
        obs.append(lens_o)
    if yaw:
        for o in obs:
            kit.rot(o, "Z", yaw, (x, y, z))
    return obs


def grille(name, c, w, h, style, frame_kind, grp="body"):
    """The grille set in its recess at c (the skin's plane, facing +x): a surround round it, a dark well behind,
    its mesh at the back, and in front the slats — angled louvres (horizontal), or chrome bars (vertical)."""
    x, y, z = c
    obs = []
    obs.append(kit.frame_x(name + ".surround", (x + 0.012, y, z), kit.rrect(w + 0.044, h + 0.044, 0.016, 3), kit.rrect(w, h, 0.006, 3), 0.04, frame_kind, grp, slope=0.008))
    if NEAR:
        obs.append(kit.xprism(name + ".well", [(y + a, z + b_) for a, b_ in kit.rrect(w + 0.004, h + 0.004, 0.006, 2)], x - 0.075, x - 0.004, "gloss", grp, caps=(False, False)))
    obs.append(kit.box(name + ".mesh", (x - 0.07, y, z), (0.008, w + 0.004, h + 0.004), "grille_mesh", grp))
    if style == "vertical":
        n = 17 if NEAR else 9
        for i in range(n):
            yy = y - w / 2 + w * (i + 0.5) / n
            obs.append(kit.box(f"{name}.bar{i}", (x - 0.012, yy, z), (0.034, 0.009, h - 0.004), "chrome", grp, r=0.003 if NEAR else 0.0, segs=1))
        obs.append(kit.box(f"{name}.mid", (x - 0.0, y, z), (0.012, w - 0.004, 0.012), "chrome", grp, r=0.004 if NEAR else 0.0))
    else:
        n = 6 if NEAR else 4
        for i in range(n):
            zz = z - h / 2 + h * (i + 0.5) / n
            sl = kit.box(f"{name}.slat{i}", (0, 0, 0), (0.042, w - 0.004, 0.007), "trim", grp, r=0.002 if NEAR else 0.0, segs=1)
            kit.rot(sl, "Y", math.radians(28))
            kit.move(sl, (x - 0.026, y, zz))
            obs.append(sl)
        for sg in (-1, 0, 1) if NEAR else (0,):
            obs.append(kit.box(f"{name}.div{sg}", (x - 0.03, y + sg * w * 0.3, z), (0.05, 0.01, h - 0.004), "trim", grp))
    if NEAR:
        ring = [(0.042, -0.012), (0.045, 0.004), (0.04, 0.01), (0.034, 0.006), (0.034, -0.012)]
        o = kit.lathe(name + ".emblem", ring, 32, "chrome", grp, axis="x", cap=False)
        kit.move(o, (x + 0.006, y, z))
        obs.append(o)
        obs.append(kit.cyl(name + ".emblem.field", (x + 0.006, y, z), 0.035, 0.012, "gloss", grp, axis="x", n=24))
    else:
        obs.append(kit.cyl(name + ".emblem", (x + 0.008, y, z), 0.04, 0.014, "chrome", grp, axis="x", n=12))
    return obs


# ── trims ──────────────────────────────────────────────────────────────────────────────────────────────────


def outline_tube(name, pts3, r, kind, grp="body", n=6):
    """A closed loop of 3D points as a tube (a window's rubber, a chrome surround)."""
    pts = list(pts3) + [pts3[0], pts3[1]]
    return kit.tube(name, pts, r, kind, grp, n=n, cap=False)


def glass_pane(name, pts3, kind="glass", grp="body", bend=None):
    """A pane over a loop of 3D points (a fan from its middle), subdivided so a bend can follow the skin."""
    c = sum((Vector(p) for p in pts3), Vector()) / len(pts3)
    verts = [c] + [Vector(p) for p in pts3]
    n = len(pts3)
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    o = kit.mk(name, verts, faces, kind, grp, smooth=True)
    if bend:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
        for v in bm.verts:
            v.co = bend(v.co)
        bm.to_mesh(o.data)
        bm.free()
    return o


# ── the seats ──────────────────────────────────────────────────────────────────────────────────────────────


def _piping(name, pts, kind, grp):
    return kit.tube(name, pts, 0.0055, kind, grp, n=5, cap=False)


def seat(name, c, w, kind, grp="body", bucket=False, back_h=0.62, headrest=True, recline=0.32):
    """A front seat: its hip point at c (x, y, z); the cushion, the backrest leaning back, their side bolsters
    (deep on a sport seat), piping along their edges, the pleats across the cloth, the headrest on its posts,
    the runners. (Quality pass 2: shaped, not boxes.)"""
    x, y, z = c
    obs = []
    hip = (x, y, z)
    back_at = (x - 0.02, y, z)
    cush = kit.box(name + ".cushion", (x + 0.22, y, z - 0.08), (0.5, w, 0.12), kind, grp, r=0.045, segs=3)
    kit.rot(cush, "Y", -0.08, hip)
    obs.append(cush)
    back = kit.box(name + ".back", (x - 0.06, y, z + back_h / 2 + 0.02), (0.13, w * 0.94, back_h), kind, grp, r=0.05, segs=3)
    kit.rot(back, "Y", -recline, back_at)
    obs.append(back)
    bh = 0.075 if bucket else 0.04  # (the bolsters' rise)
    for sgn in (1, -1):
        # the cushion's bolsters along its sides, the back's up its sides
        cb = kit.box(f"{name}.cb{sgn}", (x + 0.22, y + sgn * w * 0.39, z - 0.04 + bh * 0.4), (0.46, w * 0.2, 0.07 + bh * 0.5), kind, grp, r=0.032, segs=3 if NEAR else 1)
        kit.rot(cb, "X", -sgn * (0.18 if bucket else 0.08), (x, y + sgn * w * 0.3, z))
        kit.rot(cb, "Y", -0.08, hip)
        obs.append(cb)
        bb = kit.box(f"{name}.bb{sgn}", (x - 0.02 + bh * 0.25, y + sgn * w * 0.39, z + back_h * 0.48), (0.11 + bh * 0.5, w * 0.2, back_h * 0.86), kind, grp, r=0.04, segs=3 if NEAR else 1)
        kit.rot(bb, "Z", sgn * (0.22 if bucket else 0.1), (x - 0.02, y + sgn * w * 0.3, z))
        kit.rot(bb, "Y", -recline, back_at)
        obs.append(bb)
    if NEAR:
        # the pleats: soft ribs across the cushion's middle and up the back's
        for i in range(5):
            p = kit.tube(f"{name}.pl{i}", [(x + 0.06 + i * 0.075, y - w * 0.27, z - 0.018), (x + 0.06 + i * 0.075, y + w * 0.27, z - 0.018)], 0.006, kind, grp, n=6)
            kit.rot(p, "Y", -0.08, hip)
            obs.append(p)
        for i in range(5):
            p = kit.tube(f"{name}.pb{i}", [(x + 0.008, y - w * 0.27, z + 0.12 + i * 0.1), (x + 0.008, y + w * 0.27, z + 0.12 + i * 0.1)], 0.006, kind, grp, n=6)
            kit.rot(p, "Y", -recline, back_at)
            obs.append(p)
        # the piping: round the back's face and along the cushion's front edge
        hw_ = w * 0.47
        top = z + back_h + 0.012
        loop = [(x + 0.006, y - hw_, z + 0.06), (x + 0.006, y - hw_, top - 0.04), (x + 0.006, y - hw_ + 0.04, top), (x + 0.006, y + hw_ - 0.04, top), (x + 0.006, y + hw_, top - 0.04), (x + 0.006, y + hw_, z + 0.06)]
        pp = _piping(f"{name}.pipe", loop, "vinyl" if kind != "vinyl" else "trim", grp)
        kit.rot(pp, "Y", -recline, back_at)
        obs.append(pp)
        pc = _piping(f"{name}.pipec", [(x + 0.47, y - w * 0.46, z - 0.03), (x + 0.475, y, z - 0.025), (x + 0.47, y + w * 0.46, z - 0.03)], "vinyl" if kind != "vinyl" else "trim", grp)
        kit.rot(pc, "Y", -0.08, hip)
        obs.append(pc)
    if headrest:
        hr = kit.box(name + ".head", (x - 0.07, y, z + back_h + 0.14), (0.1, w * 0.58, 0.17), kind, grp, r=0.048, segs=3 if NEAR else 1)
        kit.rot(hr, "Y", -recline, back_at)
        obs.append(hr)
        for sgn in (1, -1):
            post = kit.cyl(f"{name}.post{sgn}", (x - 0.07, y + sgn * w * 0.16, z + back_h + 0.03), 0.006, 0.1, "chrome", grp, axis="z", n=8)
            kit.rot(post, "Y", -recline, back_at)
            obs.append(post)
    # the runners under it, the recline knob
    for sgn in (1, -1):
        obs.append(kit.box(f"{name}.rail{sgn}", (x + 0.2, y + sgn * w * 0.38, z - 0.17), (0.5, 0.03, 0.04), "trim", grp))
    if NEAR:
        obs.append(kit.cyl(f"{name}.knob", (x + 0.02, y + (1 if y > 0 else -1) * (w / 2 + 0.012), z + 0.01), 0.035, 0.02, "trim", grp, axis="y", n=14))
    return obs


def bench(name, c, w, kind, grp="body", back_h=0.58, recline=0.3):
    """The rear bench: one cushion across, its back, two headrests, the pleats."""
    x, y, z = c
    obs = [kit.box(name + ".cushion", (x + 0.22, y, z - 0.08), (0.48, w, 0.14), kind, grp, r=0.05, segs=3)]
    back = kit.box(name + ".back", (x - 0.08, y, z + back_h / 2), (0.14, w, back_h), kind, grp, r=0.05, segs=3)
    kit.rot(back, "Y", -recline, (x - 0.04, y, z))
    obs.append(back)
    for i in range(4) if NEAR else ():
        obs.append(kit.tube(f"{name}.pl{i}", [(x + 0.08 + i * 0.08, y - w * 0.43, z - 0.012), (x + 0.08 + i * 0.08, y + w * 0.43, z - 0.012)], 0.006, kind, grp, n=6))
    if NEAR:
        # its piping along the cushion's front, its back's top
        obs.append(_piping(f"{name}.pipec", [(x + 0.455, y - w * 0.48, z - 0.03), (x + 0.455, y + w * 0.48, z - 0.03)], "vinyl" if kind != "vinyl" else "trim", grp))
        pt = _piping(f"{name}.pipet", [(x - 0.01, y - w * 0.48, z + back_h - 0.01), (x - 0.01, y + w * 0.48, z + back_h - 0.01)], "vinyl" if kind != "vinyl" else "trim", grp)
        kit.rot(pt, "Y", -recline, (x - 0.04, y, z))
        obs.append(pt)
    for sgn in (1, -1):
        hr = kit.box(f"{name}.head{sgn}", (x - 0.1, y + sgn * w * 0.3, z + back_h + 0.08), (0.09, 0.26, 0.13), kind, grp, r=0.04)
        kit.rot(hr, "Y", -recline, (x - 0.04, y, z))
        obs.append(hr)
    return obs


def steering_wheel(c, tilt, r=0.19, grp="steering", sport=False):
    """The steering wheel at c (its hub), its face back toward the driver, tilted: a rim, three spokes, the hub
    pad. Its own group, turned about its column by the game."""
    x, y, z = c
    obs = []
    k = 10 if NEAR else 5
    rim_prof = [(r + 0.014 * math.cos(a), 0.014 * math.sin(a)) for a in [2 * math.pi * i / k for i in range(k + 1)]]
    rim = kit.lathe("sw.rim", rim_prof, 48, "leather" if sport else "vinyl", grp, axis="x", cap=False)
    obs.append(rim)
    obs.append(kit.cyl("sw.hub", (0, 0, 0), 0.06 if not sport else 0.045, 0.05, "dash", grp, axis="x", n=24, bevel_r=0.01))
    for a in (math.radians(-90), math.radians(15), math.radians(165)) if not sport else (math.radians(-90), math.radians(0), math.radians(180)):
        p1 = Vector((0.0, math.cos(a) * (r - 0.01), math.sin(a) * (r - 0.01)))
        obs.append(kit.tube("sw.spoke", [Vector((0.02, 0, 0)), p1 + Vector((0.0, 0, 0))], 0.014, "dash", grp, n=8))
    obs.append(kit.box("sw.pad", (-0.015, 0, 0), (0.03, 0.13, 0.1), "dash", grp, r=0.02))
    for o in obs:
        kit.rot(o, "Y", tilt)
        kit.move(o, c)
    return obs


# ── the engine ─────────────────────────────────────────────────────────────────────────────────────────────


def engine(b, x_front, x_back, z_floor, cyl_n=4, vee=False, diesel=False):
    """An engine under the bonnet (the fronts of the bay at x_front, its firewall x_back): a straight-four (or a
    V8) with its cam cover, plug leads, the intake, an air filter, a radiator and fan, the battery, the
    reservoirs, the strut towers, the hoses."""
    obs = []
    cx = (x_front + x_back) / 2 - 0.05
    L = min(0.62, (x_front - x_back) * 0.55)
    zb = z_floor - 0.03
    if not vee:
        obs.append(kit.box("eng.block", (cx, 0.04, zb + 0.18), (L, 0.36, 0.34), "cast", r=0.03))
        obs.append(kit.box("eng.head", (cx, 0.04, zb + 0.39), (L * 0.96, 0.3, 0.1), "cast", r=0.02))
        cam = kit.box("eng.cam", (cx, 0.04, zb + 0.48), (L * 0.92, 0.24, 0.08), "cam", r=0.03)
        obs.append(cam)
        for i in range(6):
            obs.append(kit.box(f"eng.rib{i}", (cx - L * 0.4 + i * L * 0.16, 0.04, zb + 0.525), (0.012, 0.2, 0.01), "cam", r=0.004))
        obs.append(kit.cyl("eng.cap", (cx + L * 0.25, 0.04, zb + 0.53), 0.03, 0.02, "trim", axis="z", n=16))
        # the plug leads to the distributor
        for i in range(cyl_n):
            px = cx - L * 0.36 + i * L * 0.24
            obs.append(kit.tube(f"eng.lead{i}", [(px, -0.08, zb + 0.46), (px, -0.16, zb + 0.5), (cx + L * 0.55, -0.2, zb + 0.42)], 0.005, "hose", n=6))
        # the intake runners down the left, the exhaust manifold down the right
        for i in range(cyl_n):
            px = cx - L * 0.36 + i * L * 0.24
            obs.append(kit.tube(f"eng.run{i}", [(px, 0.2, zb + 0.38), (px, 0.3, zb + 0.4), (cx, 0.36, zb + 0.32)], 0.022, "cast", n=10))
            obs.append(kit.tube(f"eng.ex{i}", [(px, -0.12, zb + 0.32), (px, -0.2, zb + 0.24), (px * 0.5 + cx * 0.5, -0.24, zb + 0.08)], 0.018, "steel", n=8))
        obs.append(kit.box("eng.plenum", (cx, 0.38, zb + 0.32), (L * 0.85, 0.08, 0.1), "cast", r=0.03))
    else:
        for sgn in (1, -1):
            bank = kit.box(f"eng.bank{sgn}", (cx, sgn * 0.17, zb + 0.32), (L, 0.2, 0.22), "cast", r=0.03)
            kit.rot(bank, "X", sgn * 0.5, (cx, 0, zb + 0.2))
            obs.append(bank)
            cam = kit.box(f"eng.cam{sgn}", (cx, sgn * 0.24, zb + 0.45), (L * 0.95, 0.14, 0.06), "chrome", r=0.025)
            kit.rot(cam, "X", sgn * 0.5, (cx, 0, zb + 0.2))
            obs.append(cam)
        obs.append(kit.box("eng.block", (cx, 0, zb + 0.15), (L, 0.4, 0.3), "cast", r=0.03))
    # the air filter: a round canister on top (a snorkel to the front)
    af = kit.cyl("eng.filter", (cx + 0.02, 0.04, zb + 0.565 if not vee else zb + 0.54), 0.16, 0.06, "trim", axis="z", n=32, bevel_r=0.012)
    obs.append(af)
    obs.append(kit.cyl("eng.wing", (cx + 0.02, 0.04, zb + 0.6 if not vee else zb + 0.575), 0.025, 0.012, "chrome", axis="z", n=12))
    obs.append(kit.tube("eng.snork", [(cx + 0.15, 0.04, zb + 0.56), (x_front - 0.2, 0.1, zb + 0.5)], 0.035, "trim", n=12))
    # the radiator and its fan behind
    obs.append(kit.box("eng.rad", (x_front - 0.08, 0, zb + 0.3), (0.04, 0.62, 0.36), "cast", r=0.008))
    obs.append(kit.box("eng.core", (x_front - 0.055, 0, zb + 0.3), (0.012, 0.58, 0.32), "copper"))
    fan = kit.cyl("eng.fan", (x_front - 0.14, 0, zb + 0.28), 0.15, 0.02, "trim", axis="x", n=24)
    obs.append(fan)
    obs.append(kit.tube("eng.hose1", [(x_front - 0.1, 0.22, zb + 0.42), (cx + L * 0.5, 0.18, zb + 0.44), (cx + L * 0.4, 0.06, zb + 0.44)], 0.02, "hose", n=10))
    obs.append(kit.tube("eng.hose2", [(x_front - 0.08, -0.24, zb + 0.14), (cx + L * 0.5, -0.24, zb + 0.12), (cx + L * 0.4, -0.1, zb + 0.1)], 0.02, "hose", n=10))
    # the battery, the brake fluid, the washer bottle; the strut towers
    obs.append(kit.box("eng.battery", (x_back + 0.2, -0.56, zb + 0.18), (0.24, 0.17, 0.2), "battery", r=0.01))
    for i, sx in enumerate((-0.06, 0.06)):
        obs.append(kit.cyl(f"eng.term{i}", (x_back + 0.2 + sx, -0.56, zb + 0.29), 0.012, 0.02, "steel", axis="z", n=8))
    obs.append(kit.cyl("eng.brake", (x_back + 0.1, 0.45, zb + 0.45), 0.05, 0.08, "fibre", axis="z", n=16))
    obs.append(kit.box("eng.washer", (x_front - 0.25, 0.6, zb + 0.3), (0.16, 0.12, 0.18), "fibre", r=0.03))
    for sgn in (1, -1):
        obs.append(kit.cyl(f"eng.tower{sgn}", (b.x(b.axle_f), sgn * 0.62, zb + 0.42), 0.09, 0.14, "under", axis="z", n=20))
    return obs


# ── quality pass 2: mirrors, handles ───────────────────────────────────────────────────────────────────────


def mirror(name, base, side, kind, grp, yaw=0.0):
    """A door mirror at its base on the door (+y out on the left, −y on the right): a housing lofted from a
    narrow neck to a rounded head and in again, its glass set in its back behind a black rim, the neck on a
    black foot."""
    secs = [(0.03, 0.045, 0.05), (0.055, 0.07, 0.082), (0.09, 0.078, 0.1), (0.15, 0.078, 0.104), (0.18, 0.068, 0.095), (0.196, 0.044, 0.07)] if NEAR else [(0.03, 0.05, 0.06), (0.1, 0.078, 0.1), (0.196, 0.05, 0.07)]
    xb = -0.042  # (its back, the glass's plane)
    verts, faces = [], []
    ring = None
    for u, d, h in secs:
        r = min(d, h) * 0.42
        pts = kit.rrect(d, h, r, 2 if NEAR else 1)
        ring = len(pts)
        for a, b_ in pts:
            verts.append((xb + d / 2 + a, side * u, 0.045 + b_ * (1.0 if u > 0.05 else 0.9)))
    m = len(secs)
    for i in range(m - 1):
        for k in range(ring):
            a, c = i * ring + k, i * ring + (k + 1) % ring
            faces.append((a, c, c + ring, a + ring))
    for i0, rev in ((0, True), ((m - 1) * ring, False)):
        cv = [sum(verts[i0 + k][j] for k in range(ring)) / ring for j in range(3)]
        ci = len(verts)
        verts.append(tuple(cv))
        for k in range(ring):
            a, c = i0 + k, i0 + (k + 1) % ring
            faces.append((a, c, ci) if not rev else (c, a, ci))
    o = kit.mk(name + ".housing", verts, faces, kind, grp, smooth=True, angle=50)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    obs = [o]
    gc = (xb - 0.0015, side * 0.125, 0.047)
    obs.append(kit.xprism(name + ".glass", [(gc[1] + a, gc[2] + b_) for a, b_ in kit.rrect(0.118, 0.074, 0.022, 2)], xb - 0.003, xb + 0.002, "reflector", grp))
    if NEAR:
        rim = kit.frame_x(name + ".rim", (0, 0, 0), kit.rrect(0.13, 0.086, 0.028, 2), kit.rrect(0.116, 0.072, 0.021, 2), 0.006, "trim", grp, slope=0.002)
        kit.rot(rim, "Z", math.pi)
        kit.move(rim, (xb - 0.004, gc[1], gc[2]))
        obs.append(rim)
    obs.append(kit.box(name + ".foot", (0.0, side * 0.012, 0.02), (0.075, 0.03, 0.06), "trim", grp, r=0.01 if NEAR else 0.0))
    obs.append(kit.box(name + ".neck", (-0.01, side * 0.035, 0.035), (0.04, 0.04, 0.03), "trim", grp, r=0.01 if NEAR else 0.0))
    for o in obs:
        if yaw:
            kit.rot(o, "Z", yaw)
        kit.move(o, base)
    return obs


def door_handle(name, loc, n, kind, grp):
    """An 80s pull handle on the skin at loc (n its outward normal): a flat escutcheon and the lever over its
    dark slot."""
    obs = []
    if NEAR:
        obs.append(kit.box(name + ".plate", loc + n * 0.002, (0.15, 0.006, 0.036), kind, grp, r=0.0028))
        obs.append(kit.box(name + ".lever", loc + n * 0.009 + Vector((0.0, 0.0, 0.004)), (0.118, 0.01, 0.017), kind, grp, r=0.0045))
        obs.append(kit.box(name + ".slot", loc + n * 0.005 - Vector((0.0, 0.0, 0.009)), (0.1, 0.004, 0.006), "gap", grp))
    else:
        obs.append(kit.box(name, loc + n * 0.006, (0.14, 0.012, 0.03), kind, grp))
    return obs
