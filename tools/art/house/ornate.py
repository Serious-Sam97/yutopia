# Plan 130's quality pass (docs/plan/130-the-house-build.md, F9a: ornate pieces in Blender): the house's ornate pieces,
# modelled here and exported as one GLB (public/life/house/ornate.glb), a node a kind under "ornate", each in the
# kit's frame — Blender X the kit's x (across its tiles), -Y the kit's z (down them, out from a wall), Z up — its
# meshes' materials named by role (marble, iron, tile-a, tile-b, white, stone, wood, brass, dark), coloured by the game.
#   blender -b -P tools/art/house/ornate.py -- apps/client/public/life/house/ornate.glb
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/ornate.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
root = bpy.data.objects.new("ornate", None)
scene.collection.objects.link(root)

MATS = {}


def mat(name):
    if name not in MATS:
        m = bpy.data.materials.new(name)
        MATS[name] = m
    return MATS[name]


def obj(name, bm, role, parent):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat(role))
    for p in me.polygons:
        p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.parent = parent
    return o


def box(parent, role, c, s, name="box"):
    """A box: middle c (x, y, z), size s."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(s), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts)
    return obj(name, bm, role, parent)


def lathe(parent, role, profile, at, seg=24, name="lathe", smooth=True):
    """A turned shape: profile [(r, z)] spun round the vertical through `at` (x, y)."""
    bm = bmesh.new()
    vs = [bm.verts.new((max(r, 1e-4), 0, z)) for r, z in profile]
    edges = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=seg, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector((at[0], at[1], 0)), verts=bm.verts)
    o = obj(name, bm, role, parent)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def prism(parent, role, poly, y0, y1, name="prism", axis="y"):
    """A flat outline extruded: poly [(a, b)] in the XZ plane (axis y: through y0..y1), or the YZ plane (axis x)."""
    bm = bmesh.new()
    if axis == "y":
        vs = [bm.verts.new((a, y0, b)) for a, b in poly]
        d = Vector((0, y1 - y0, 0))
    else:
        vs = [bm.verts.new((y0, a, b)) for a, b in poly]
        d = Vector((y1 - y0, 0, 0))
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=d, verts=[v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, role, parent)


def tube(parent, role, pts, r, name="tube", seg=8):
    """A round bar along points."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        t = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        a = t.cross(Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))).normalized()
        b = t.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(k / seg * math.tau) + b * math.sin(k / seg * math.tau)) * r) for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj(name, bm, role, parent)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def spiral(c, r0, r1, turns, n=40, plane="xz", lift=0.0):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = t * turns * math.tau
        r = r0 + (r1 - r0) * t
        if plane == "xz":
            pts.append((c[0] + math.cos(a) * r, c[1] + lift * t, c[2] + math.sin(a) * r))
        else:
            pts.append((c[0] + lift * t, c[1] + math.cos(a) * r, c[2] + math.sin(a) * r))
    return pts


def piece(name):
    e = bpy.data.objects.new(name, None)
    scene.collection.objects.link(e)
    e.parent = root
    return e


# ── a Victorian marble fireplace (2 tiles across, its back on the wall at the tile's edge) ─────────────────────
def fp_victorian():
    P = piece("fp_victorian")
    D = 0.34  # its depth out from the wall
    box(P, "marble", (1.0, -0.03 - D / 2, 0.6), (1.96, D, 1.2), "breast")
    # the hearth before it, a darker stone
    box(P, "stone", (1.0, -0.03 - D - 0.24, 0.025), (2.0, 0.5, 0.05), "hearth")
    # the cast-iron insert: an arched opening, its frame, the fan grille in the arch
    W, H = 0.86, 0.92
    y = -0.03 - D - 0.005
    outer = [(1 - W / 2, 0.06), (1 + W / 2, 0.06), (1 + W / 2, 0.06 + H), (1 - W / 2, 0.06 + H)]
    prism(P, "iron", outer, y + 0.01, y - 0.03, "insert")
    r = 0.3
    arch = [(1 - r, 0.07)] + [(1 - r * math.cos(a), 0.62 + r * math.sin(a)) for a in [i / 16 * math.pi for i in range(17)]] + [(1 + r, 0.07)]
    # (its dark mouth a clear 4 mm in front of the iron — a hair, they flickered)
    prism(P, "dark", arch, y - 0.034, y - 0.04, "opening")
    for k in range(9):
        a = k / 8 * math.pi
        tube(P, "iron", [(1, y - 0.048, 0.62), (1 - math.cos(a) * r * 0.95, y - 0.048, 0.62 + math.sin(a) * r * 0.95)], 0.008, f"fan{k}", 6)
    tube(P, "iron", [(1 - r * math.cos(a), y - 0.05, 0.62 + r * math.sin(a)) for a in [i / 20 * math.pi for i in range(21)]], 0.014, "archrim", 8)
    # a basket grate and logs in it
    box(P, "iron", (1, y + 0.1, 0.14), (0.42, 0.18, 0.04), "grate")
    for s in (-1, 1):
        tube(P, "wood", [(1 - 0.17, y + 0.08 + s * 0.03, 0.2), (1 + 0.17, y + 0.08 - s * 0.03, 0.21)], 0.045, f"log{s}", 8)
    # tiled slips either side of the insert, two colours alternate
    for s in (-1, 1):
        for k in range(6):
            box(P, "tile-a" if k % 2 else "tile-b", (1 + s * (W / 2 + 0.075), y - 0.004, 0.13 + k * 0.145), (0.13, 0.01, 0.13), f"slip{s}{k}")
    # the pilasters: fluted, a plinth block and a capital each
    for s in (-1, 1):
        x = 1 + s * 0.76
        box(P, "marble", (x, y - 0.03, 0.09), (0.26, 0.08, 0.18), f"plinth{s}")
        box(P, "marble", (x, y - 0.025, 0.6), (0.22, 0.06, 0.84), f"pilaster{s}")
        for f in range(5):
            box(P, "stone", (x - 0.08 + f * 0.04, y - 0.056, 0.6), (0.014, 0.006, 0.74), f"flute{s}{f}")
        # a corbel: a scroll under the shelf's ends
        sc = [(x - 0.09, y - 0.02, 0.98), (x + 0.09, y - 0.02, 0.98)]
        prism(P, "marble", [(0.0, 0.98), (-0.0, 1.16), (-0.16, 1.16), (-0.12, 1.06), (-0.04, 1.02)], x - 0.09, x + 0.09, f"corbel{s}", "x")
        o = bpy.data.objects[f"corbel{s}"]
        o.location = (0, y + 0.0, 0)
        tube(P, "marble", spiral((x - 0.095, y - 0.1, 1.05), 0.05, 0.012, 1.3, 30, "yz"), 0.012, f"volute{s}a", 6)
        tube(P, "marble", spiral((x + 0.095, y - 0.1, 1.05), 0.05, 0.012, 1.3, 30, "yz"), 0.012, f"volute{s}b", 6)
        del sc
    # the frieze between: a band, an oval medallion with a garland, rosettes over the pilasters
    box(P, "marble", (1, y - 0.02, 1.07), (1.3, 0.04, 0.18), "frieze")
    m = lathe(P, "marble", [(0.0, 0), (0.08, 0.004), (0.11, 0.015), (0.1, 0.03), (0.0, 0.034)], (0, 0), 24, "medallion")
    m.rotation_euler = (math.pi / 2, 0, 0)
    m.scale = (1.4, 1, 1)
    m.location = (1, y - 0.04, 1.07)
    for k in range(13):
        a = math.pi * (0.15 + 0.7 * k / 12)
        bpy.data.objects.new  # (a garland: small beads along a sag)
        b = lathe(P, "marble", [(0, 0), (0.016, 0.01), (0.0, 0.02)], (0, 0), 10, f"bead{k}")
        b.location = (1 - 0.42 + k * 0.07, y - 0.045, 1.08 - math.sin(a) * 0.05)
    for s in (-1, 1):
        rr = lathe(P, "marble", [(0, 0), (0.05, 0.006), (0.055, 0.016), (0.03, 0.026), (0.0, 0.032)], (0, 0), 16, f"rosette{s}")
        rr.rotation_euler = (math.pi / 2, 0, 0)
        rr.location = (1 + s * 0.76, y - 0.06, 1.07)
    # the shelf: an ogee moulding under a thick top, past the breast at each end
    og = [(0, 0)] + [(-0.06 * (1 - math.cos(t * math.pi)) / 2, 0.06 * t) for t in [i / 10 for i in range(11)]] + [(-0.09, 0.06), (-0.09, 0.1), (0.02, 0.1)]
    prism(P, "marble", [(y + 0.03 + a, 1.16 + b) for a, b in og], -0.03, 2.03, "shelf", "x")
    bpy.data.objects["shelf"].location = (0, 0, 0)
    return P


# ── a Corinthian column (a tile, centred, a storey high) ────────────────────────────────────────────────────────
def corinthian():
    P = piece("corinthian_column")
    H = 3.266
    cx, cy = 0.5, -0.5
    box(P, "stone", (cx, cy, 0.05), (0.56, 0.56, 0.1), "plinth")
    lathe(P, "stone", [(0.26, 0.1), (0.27, 0.14), (0.25, 0.17), (0.215, 0.19), (0.205, 0.22), (0.225, 0.25), (0.215, 0.27), (0.19, 0.29), (0.0, 0.29)], (cx, cy), 32, "base")
    # the shaft: 24 flutes, tapering to the top
    n, R0, R1 = 24, 0.19, 0.165
    top = H - 0.5
    bm = bmesh.new()
    rings = []
    for z, R in ((0.29, R0), (top, R1)):
        ring = []
        for k in range(n * 4):
            a = k / (n * 4) * math.tau
            f = (k % 4)
            rr = R * (0.94 if f in (1, 2) else 1.0)
            ring.append(bm.verts.new((cx + math.cos(a) * rr, cy + math.sin(a) * rr, z)))
        rings.append(ring)
    for k in range(n * 4):
        bm.faces.new((rings[0][k], rings[0][(k + 1) % (n * 4)], rings[1][(k + 1) % (n * 4)], rings[1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj("shaft", bm, "stone", P)
    lathe(P, "stone", [(0.18, top - 0.01), (0.19, top + 0.02), (0.175, top + 0.04), (0.0, top + 0.04)], (cx, cy), 32, "astragal")
    # the capital: a bell, two rows of acanthus leaves curling out, the volutes, a concave abacus
    bell = top + 0.04
    lathe(P, "stone", [(0.17, bell), (0.18, bell + 0.15), (0.21, bell + 0.3), (0.24, bell + 0.4), (0.0, bell + 0.4)], (cx, cy), 32, "bell")
    # (the bell's radius at a height: its leaves hug it, then flare out)
    def bell_r(z):
        t = max(0.0, min(1.0, (z - bell) / 0.4))
        return 0.17 + 0.07 * t * t
    for row, (zz, hh, count, off) in enumerate(((bell, 0.24, 8, 0.0), (bell + 0.08, 0.3, 8, 0.5))):
        for k in range(count):
            a = (k + off) / count * math.tau
            bm = bmesh.new()
            # an acanthus leaf: tall and pointed, a rib up its middle, its edges in lobes, its top curling out and over
            N, M = 9, 5
            grid = []
            for j in range(N + 1):
                t = j / N
                w = 0.062 * math.sin(math.pi * min(1.0, t ** 0.85)) * (1.0 - 0.25 * t)
                z = zz + hh * t
                flare = 0.11 * max(0.0, t - 0.45) ** 1.6
                droop = -0.05 * max(0.0, t - 0.8) / 0.2
                rowv = []
                for i in range(M):
                    u = (i / (M - 1) * 2 - 1)
                    edge = abs(u)
                    lobe = 0.008 * (1 - math.cos(t * math.pi * 6)) * edge
                    rib = 0.01 * (1 - edge) ** 2
                    out = bell_r(z) + 0.006 + flare + rib - lobe + 0.012 * edge * edge * (1 - t)
                    rowv.append(bm.verts.new((u * w, out, z + droop * (1 - 0.5 * edge))))
                grid.append(rowv)
            for j in range(N):
                for i in range(M - 1):
                    bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.008)
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(a - math.pi / 2, 3, "Z"))
            bmesh.ops.translate(bm, vec=Vector((cx, cy, 0)), verts=bm.verts)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            lf = obj(f"leaf{row}{k}", bm, "stone", P)
            for p in lf.data.polygons:
                p.use_smooth = True
    ab = bell + 0.4
    # the volutes: a spiral under each corner of the abacus, facing out along the diagonal; a stalk up to it
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-math.sin(a), math.cos(a), 0))
        c = Vector((cx, cy, ab - 0.07)) + d * 0.27
        pts = []
        for i in range(41):
            t = i / 40
            ang = t * 1.75 * math.tau
            r = 0.065 * (1 - t * 0.8)
            pts.append(tuple(c + side * (math.cos(ang) * r * 0.35) + d * (math.cos(ang) * r * 0.6) + Vector((0, 0, math.sin(ang) * r))))
        tube(P, "stone", pts, 0.013, f"volute{k}", 6)
        tube(P, "stone", [tuple(Vector((cx, cy, bell + 0.2)) + d * 0.2), tuple(Vector((cx, cy, ab - 0.12)) + d * 0.25), tuple(c + Vector((0, 0, -0.05)))], 0.014, f"stalk{k}", 6)
    # the abacus: a square with its sides curved in, its corners cut
    poly = []
    for k in range(4):
        a0 = k * math.pi / 2
        for i in range(9):
            t = i / 8
            ang = a0 - math.pi / 4 + t * math.pi / 2
            rr = 0.36 - 0.06 * math.sin(t * math.pi)
            poly.append((cx + math.cos(ang) * rr, cy + math.sin(ang) * rr))
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, ab)) for x, y in poly]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=Vector((0, 0, H - ab)), verts=[v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj("abacus", bm, "stone", P)
    return P


# ── a porch bracket: a scrolled corbel under the eaves, on a wall (a tile wide; the wall's face at -0.1) ─────────
def porch_bracket():
    P = piece("porch_bracket")
    t = 0.05
    x0, x1 = 0.5 - t / 2, 0.5 + t / 2
    y0 = -0.1
    # its back plate up the wall, its arm out under the eave, the curved brace between (a solid of a quarter round)
    box(P, "white", (0.5, y0 - 0.02, 2.56), (0.09, 0.04, 0.6), "plate")
    box(P, "white", (0.5, y0 - 0.28, 2.82), (t, 0.52, 0.06), "arm")
    brace = [(y0 - 0.04, 2.3)]
    for i in range(13):
        a = i / 12 * math.pi / 2
        brace.append((y0 - 0.04 - 0.44 * (1 - math.cos(a)), 2.3 + 0.48 * math.sin(a)))
    brace += [(y0 - 0.5, 2.79), (y0 - 0.04, 2.79)]
    prism(P, "white", brace, x0, x1, "brace", "x")
    # pierced: a ring in the brace's middle, a scroll at its foot, a drop under the arm's end
    ring = tube(P, "white", [(0.5 + 0.0, y0 - 0.22 + math.cos(a) * 0.08, 2.6 + math.sin(a) * 0.08) for a in [i / 24 * math.tau for i in range(25)]], 0.012, "ring", 6)
    del ring
    tube(P, "white", spiral((0.5, y0 - 0.06, 2.34), 0.07, 0.015, 1.4, 34, "yz"), 0.014, "scroll", 6)
    lathe(P, "white", [(0.0, 2.68), (0.03, 2.7), (0.022, 2.74), (0.035, 2.78), (0.0, 2.79)], (0.5, y0 - 0.5), 12, "drop")
    return P


# ── a balustrade: turned balusters between rails, a newel post with a ball at each end (2 tiles, its middle) ─────
def baluster_rail():
    P = piece("baluster_rail")
    y = -0.5
    prof = [(0.0, 0.08), (0.04, 0.08), (0.04, 0.12), (0.03, 0.14), (0.026, 0.2), (0.042, 0.34), (0.045, 0.42), (0.03, 0.52), (0.02, 0.6), (0.026, 0.66), (0.034, 0.7), (0.034, 0.76), (0.04, 0.78), (0.04, 0.86), (0.0, 0.86)]
    for k in range(8):
        lathe(P, "white", prof, (0.28 + k * 0.206, y), 14, f"baluster{k}")
    box(P, "white", (1.0, y, 0.05), (1.84, 0.09, 0.06), "shoe")
    # the handrail: a moulded top, wider than the balusters
    hr = [(-0.055, 0.86), (0.055, 0.86), (0.055, 0.89), (0.04, 0.92), (0.0, 0.935), (-0.04, 0.92), (-0.055, 0.89)]
    prism(P, "white", [(y + a, b) for a, b in hr], 0.08, 1.92, "handrail", "x")
    for x in (0.06, 1.94):
        box(P, "white", (x, y, 0.5), (0.12, 0.12, 1.0), f"newel{x}")
        box(P, "white", (x, y, 1.02), (0.15, 0.15, 0.04), f"cap{x}")
        lathe(P, "white", [(0.0, 1.04), (0.03, 1.05), (0.02, 1.07), (0.05, 1.1), (0.055, 1.13), (0.04, 1.17), (0.0, 1.19)], (x, y), 16, f"ball{x}")
    return P


fp_victorian()
corinthian()
porch_bracket()
baluster_rail()

# (merged a piece at a time by role: fewer meshes in the file — the game merges again by colour)
for p in list(root.children):
    by = {}
    for o in list(p.children):
        by.setdefault(o.data.materials[0].name, []).append(o)
    for role, objs in by.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        objs[0].name = f"{p.name}|{role}"

for o in scene.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_meshopt_compression_enable=True,
    use_selection=False,
)
print("ornate:", [p.name for p in root.children], "->", OUT)
