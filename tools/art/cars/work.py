# Plan 92, phase 8 — the work vehicles: the snowmobile, the snowcat, the plough truck, the tractor, the toboggan,
# and the shuttle bus (the visitor's car is a saloon GL: an alias in the manifest). Built from the same kit,
# in the same frame (kit.py), with the same kinds of groups and points as the road cars, plus their own moving
# parts, named for the game:
#   skis        wheel_fl/fr › steer_fl/fr: the snowmobile's skis (they steer; nothing spins)
#   tracks      track_l / track_r: a track's belt (its lugs; the game scrolls or leaves it); roller_l0…, roller_r0…:
#               each road wheel and sprocket, turning about its own axle (y)
#   blade       the plough truck's blade (its pivot at the frame; axis y lifts it, z angles it)
#   runners     runner_l / runner_r: the toboggan's (still)
#   steering    the handlebar (snowmobile) or wheel; beacon: the amber light (emit_ind)
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import kit
import parts
from dress import Car


class Spec:
    """A work vehicle's numbers as the build reads them (dims, its wheels), in the car's frame."""

    def __init__(self, **d):
        self.__dict__.update(d)
        self.boot = {"kind": "none"}

    def door_list(self):
        return [dict(grp=g, side=1 if g.endswith("l") else -1) for g in getattr(self, "doors", [])]


def section(hw, zb, zt, r, n=6):
    """A rounded rectangle (y, z) round, counter-clockwise from the bottom's middle."""
    r = min(r, hw * 0.95, (zt - zb) * 0.48)
    pts = [(0.0, zb)]
    corners = [((hw - r, zb + r), -math.pi / 2), ((hw - r, zt - r), 0.0), ((-hw + r, zt - r), math.pi / 2), ((-hw + r, zb + r), math.pi)]
    for (cy, cz), a0 in corners:
        for i in range(n + 1):
            a = a0 + (math.pi / 2) * i / n
            pts.append((cy + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def smooth_stations(st, k):
    """Stations (x, hw, zb, zt, r) resampled to k through monotone cubics (quality pass 2: no kinks)."""
    import bodies

    st = sorted(st, key=lambda q: q[0])
    out = []
    for i in range(k):
        x = st[0][0] + (st[-1][0] - st[0][0]) * i / (k - 1)
        out.append(tuple([x] + [bodies.pchip_table([(q[0], q[j]) for q in st], x) for j in range(1, 5)]))
    return out[::-1]


def windshield(name, x0, z0, hw, h, kind, lean=0.32, wrap=0.12):
    """A snowmobile's windshield: a curved pane from its foot (x0, z0) up and back, `hw` half wide, `h` tall at
    the middle (less at the sides), wrapped back toward its edges."""
    nu, nv = (9, 4) if parts.NEAR else (5, 2)
    verts, faces = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            t = j / nv
            hh = h * (1 - 0.35 * u * u)
            z = z0 + hh * t * math.cos(lean)
            x = x0 - hh * t * math.sin(lean) - wrap * u * u
            verts.append((x, u * hw, z))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    o = kit.mk(name, verts, faces, kind, smooth=True)
    return kit.solidify(o, 0.005)


def windshield_edge(x0, z0, hw, h, lean=0.32, wrap=0.12):
    """The windshield's top edge and sides, for its trim."""
    pts = []
    for i in range(13):
        u = -1 + 2 * i / 12
        hh = h * (1 - 0.35 * u * u)
        pts.append((x0 - hh * math.sin(lean) - wrap * u * u, u * hw, z0 + hh * math.cos(lean)))
    return [(x0 - wrap, -hw, z0)] + pts + [(x0 - wrap, hw, z0)]


def lofted(name, stations, kind, grp="body", n=6, angle=40):
    """A body lofted through stations (x, half-width, bottom, top, corner radius), capped."""
    rings = [(x, section(hw, zb, zt, r, n)) for x, hw, zb, zt, r in stations]
    m = len(rings[0][1])
    verts, faces = [], []
    for x, sec in rings:
        verts += [(x, y, z) for y, z in sec]
    for i in range(len(rings) - 1):
        for k in range(m):
            a, c = i * m + k, i * m + (k + 1) % m
            faces.append((a, c, c + m, a + m))
    faces.append(tuple(range(m)))
    last = (len(rings) - 1) * m
    faces.append(tuple(range(last + m - 1, last - 1, -1)))
    o = kit.mk(name, verts, faces, kind, grp, smooth=True, angle=angle)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def track_belt(name, side, wheels, w, kind="track", grp=None, lugs=True):
    """A track's belt round its wheels ((x, z, r) each, at y = side's), with lugs across it."""
    # the belt's outline: the hull of the wheel circles (top and bottom runs, round the end wheels)
    pts = []
    xs = sorted(wheels, key=lambda p: -p[0])
    front, rear = xs[0], xs[-1]
    bottom = min(z - r for x, z, r in wheels)
    top = max(z + r for x, z, r in wheels)
    for i in range(10):
        a = -math.pi / 2 + math.pi * i / 9
        pts.append((front[0] + math.cos(a) * front[2], front[1] + math.sin(a) * front[2]))
    for i in range(10):
        a = math.pi / 2 + math.pi * i / 9
        pts.append((rear[0] + math.cos(a) * rear[2], rear[1] + math.sin(a) * rear[2]))
    # (the bottom run on the road wheels' bottoms)
    outer = kit.offset_poly(pts, 0.03)
    inner = pts
    y0, y1 = side - w / 2, side + w / 2
    verts, faces = [], []
    n = len(pts)
    for poly, yy in ((outer, (y0, y1)), (inner, (y0, y1))):
        for x, z in poly:
            verts.append((x, yy[0], z))
        for x, z in poly:
            verts.append((x, yy[1], z))
    # outer band, inner band, the two sides
    O0, O1, I0, I1 = 0, n, 2 * n, 3 * n
    for i in range(n):
        j = (i + 1) % n
        faces.append((O0 + i, O0 + j, O1 + j, O1 + i))
        faces.append((I0 + i, I1 + i, I1 + j, I0 + j))
        faces.append((O0 + i, I0 + i, I0 + j, O0 + j))
        faces.append((O1 + i, O1 + j, I1 + j, I1 + i))
    g = grp or ("track_l" if side > 0 else "track_r")
    o = kit.mk(name, verts, faces, kind, g, smooth=False)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    obs = [o]
    if lugs:
        # lugs every ~12 cm round the outline
        per = 0.12
        L = sum((Vector(outer[(i + 1) % n]) - Vector(outer[i])).length for i in range(n))
        k = int(L / per)
        acc, seg = 0.0, 0
        p_prev = Vector(outer[0])
        dist = [0.0]
        for i in range(1, n + 1):
            dist.append(dist[-1] + (Vector(outer[i % n]) - Vector(outer[i - 1])).length)
        for t in range(k):
            d = t * L / k
            while seg < n - 1 and dist[seg + 1] < d:
                seg += 1
            a, bpt = Vector(outer[seg]), Vector(outer[(seg + 1) % n])
            f = (d - dist[seg]) / max(1e-6, dist[seg + 1] - dist[seg])
            p = a + (bpt - a) * f
            tang = (bpt - a).normalized()
            nrm = Vector((tang.y, -tang.x))
            lug = kit.box(f"{name}.lug{t}", (0, 0, 0), (0.035, w, 0.025), kind, g)
            # (each pad's cleat: a steel bar across it)
            cl = kit.box(f"{name}.cleat{t}", (0, 0, 0.015), (0.012, w * 0.9, 0.012), "steel", g)
            ang0 = math.atan2(tang.y, tang.x)
            kit.rot(cl, "Y", -ang0)
            kit.move(cl, (p.x + nrm.x * 0.02, side, p.y + nrm.y * 0.02))
            obs.append(cl)
            ang = math.atan2(tang.y, tang.x)
            kit.rot(lug, "Y", -ang)
            kit.move(lug, (p.x + nrm.x * 0.008, side, p.y + nrm.y * 0.008))
            obs.append(lug)
    return obs


def roller(name, x, y, z, r, w, grp, kind="steel_paint"):
    obs = [kit.cyl(name, (x, y, z), r, w, "rubber", grp, axis="y", n=24)]
    obs.append(kit.cyl(name + ".hub", (x, y + (w / 2 + 0.005) * (1 if y > 0 else -1), z), r * 0.6, 0.012, kind, grp, axis="y", n=20))
    return obs


def lamps_round(car, x, y, z, r, grp="lamp_head"):
    return parts.headlamp(f"lamp{y:.2f}{z:.2f}", (x, y, z), r * 2, r * 2, grp, round_=True)


def tail_lamp(car, x, y, z, w=0.1, h=0.07):
    tag = "l" if y > 0 else "r"
    obs = [kit.box(f"tl{y:.2f}", (x, y, z), (0.03, w, h), "lens_red", r=0.01)]
    obs.append(kit.box(f"tle{y:.2f}", (x + 0.006, y, z), (0.02, w * 0.8, h * 0.8), "emit_tail", "lamp_tail"))
    obs.append(kit.box(f"tlb{y:.2f}", (x + 0.004, y, z), (0.02, w * 0.6, h * 0.6), "emit_brake", "lamp_brake"))
    obs.append(kit.box(f"ti{y:.2f}", (x, y, z - h * 0.9), (0.03, w, h * 0.6), "lens_amber", r=0.008))
    obs.append(kit.box(f"tie{y:.2f}", (x + 0.006, y, z - h * 0.9), (0.02, w * 0.8, h * 0.45), "emit_ind", f"lamp_ind_{tag}"))
    return obs


def glass_box(name, x0, x1, y0, y1, z0, z1, kind="glass", grp="body"):
    """A pane (thin along x or y), and (quality pass 2) its rubber seal round it — in the scene beside it, so
    the build takes it with the rest."""
    g = kit.box(name, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), kind, grp, r=0.01)
    if parts.NEAR:
        thin_x = abs(x1 - x0) < abs(y1 - y0)
        c = (max(x0, x1) if thin_x else (x0 + x1) / 2, max(y0, y1, key=abs) if not thin_x else (y0 + y1) / 2)
        lo, hi = (min(y0, y1), max(y0, y1)) if thin_x else (min(x0, x1), max(x0, x1))
        corners = [(lo, z0), (hi, z0), (hi, z1), (lo, z1)]
        pts = []
        for a, zz in kit.round_poly(corners, 0.03, 2):
            pts.append((c[0], a, zz) if thin_x else (a, c[1], zz))
        parts.outline_tube(name + ".seal", pts, 0.011, "rubber", grp, n=4)
    return g


def wheel_at(car, tag, x, y, r, w, style="steel", aggressive=False, dual=False):
    at = (x, y, r)
    obs = parts.wheel(tag, style, r, w, aggressive=aggressive)
    parts.place_wheel(obs, at, 1 if y > 0 else -1)
    if dual:
        extra = parts.wheel(tag + "b", style, r, w, aggressive=aggressive)
        for o in extra:
            o["grp"] = f"spin_{tag}" if o["grp"].startswith("spin") else f"steer_{tag}"
        parts.place_wheel(extra, (x, y - (w + 0.02) * (1 if y > 0 else -1), r), 1 if y > 0 else -1)
        obs += extra
    car.pivot(f"wheel_{tag}", at, (0, 1, 0), parent="root")
    car.pivot(f"steer_{tag}", at, (0, 0, 1), parent=f"wheel_{tag}")
    car.pivot(f"spin_{tag}", at, (0, 1, 0), parent=f"steer_{tag}")
    car.pt(f"hub_{tag}", at)
    return obs


def mirror_arm(car, x, y, z, grp="body"):
    s = 1 if y > 0 else -1
    obs = [kit.tube(f"marm{s}", [(x, y - s * 0.05, z - 0.15), (x + 0.05, y + s * 0.12, z - 0.1), (x + 0.05, y + s * 0.2, z + 0.15)], 0.012, "chrome", grp, n=6)]
    obs.append(kit.box(f"mhead{s}", (x + 0.05, y + s * 0.22, z + 0.1), (0.04, 0.16, 0.3), "trim", grp, r=0.02))
    obs.append(kit.box(f"mglass{s}", (x + 0.02, y + s * 0.22, z + 0.1), (0.004, 0.14, 0.27), "reflector", grp, r=0.01))
    return obs


def seat_simple(car, i, x, y, z, w, kind):
    car.pt(f"seat_{i}", (x, y, z))
    return parts.seat(f"seat{i}", (x, y, z), w, kind)


def cab_kit(car, x_dash, y_mid, z_dash, width, floor_z, x_back, door_y=None):
    """A cab's inside: the dash's top and face, the printed cluster in front of the driver, a switch row, the
    floor mat, the door cards; the driver sits at y_mid."""
    obs = [kit.box("cab.dashtop", (x_dash, 0, z_dash), (0.32, width, 0.06), "dash", r=0.02)]
    obs.append(kit.box("cab.dashface", (x_dash - 0.13, 0, z_dash - 0.18), (0.06, width - 0.05, 0.32), "dash", r=0.02))
    obs.append(kit.plate("cab.cluster", (x_dash - 0.165, y_mid, z_dash - 0.08), 0.42, 0.105, "cluster", normal="-x", t=0.003))
    for tag, dy in (("fuel", 0.165), ("temp", -0.165)):
        c = (x_dash - 0.17, y_mid + dy, z_dash - 0.08)
        nd = kit.box(f"wneedle.{tag}", (0, 0, 0.015), (0.003, 0.003, 0.03), "needle", f"needle_{tag}")
        kit.rot(nd, "X", 0.6)
        kit.move(nd, c)
        obs.append(nd)
        car.pivot(f"needle_{tag}", c, (-1, 0, 0))
    for i in range(6):
        cap = kit.plate(f"wswitch{i}", (x_dash - 0.162, -y_mid * 0.2 + (i - 2.5) * 0.034, z_dash - 0.2), 0.026, 0.026, "switch", normal="-x", t=0.008)
        uv = cap.data.uv_layers[0]
        for li, (u0, v0) in zip(cap.data.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
            uv.data[li].uv = ((i + u0) / 8.0, v0)
        obs.append(cap)
    obs.append(kit.box("cab.mat", ((x_dash + x_back) / 2, 0, floor_z + 0.01), (abs(x_dash - x_back), width - 0.1, 0.02), "rubber", r=0.005))
    if door_y:
        for sd in (1, -1):
            g = f"door_f{'l' if sd > 0 else 'r'}"
            obs.append(kit.box(f"cab.card{sd}", ((x_dash + x_back) / 2 - 0.1, sd * (door_y - 0.04), floor_z + 0.45), (abs(x_dash - x_back) - 0.3, 0.02, 0.5), "vinyl", g, r=0.01))
            obs.append(kit.box(f"cab.pull{sd}", ((x_dash + x_back) / 2, sd * (door_y - 0.06), floor_z + 0.6), (0.14, 0.02, 0.03), "chrome", g, r=0.005))
    return obs


def ram(name, a, b_, r, grp="body"):
    """A hydraulic ram from a to b: its barrel, its chrome rod, the hose to it."""
    a, b_ = Vector(a), Vector(b_)
    mid = a + (b_ - a) * 0.55
    return [kit.tube(name + ".barrel", [a, mid], r, "steel_paint", grp, n=12), kit.tube(name + ".rod", [mid, b_], r * 0.55, "chrome", grp, n=10), kit.tube(name + ".hose", [a + Vector((0, 0, r)), a + Vector((0.15, 0.05, r + 0.1)), a + Vector((0.4, 0.1, r + 0.05))], 0.01, "hose", grp, n=6)]


def marker(name, at, kind="lens_amber", emit="emit_ind", grp="lamp_ind_l", size=(0.03, 0.07, 0.03)):
    return [kit.box(name, at, size, kind, r=0.008), kit.box(name + "e", at, tuple(x * 0.8 for x in size), emit, grp)]


# ── the snowmobile ─────────────────────────────────────────────────────────────────────────────────────────


def snowmobile(car):
    b = car.b
    ap = car.objs.extend
    # the hood: lofted from the nose's point back to the cowl
    st = [(1.3, 0.1, 0.42, 0.5, 0.05), (1.2, 0.28, 0.33, 0.6, 0.09), (0.95, 0.4, 0.28, 0.72, 0.12), (0.6, 0.47, 0.27, 0.8, 0.12), (0.3, 0.48, 0.27, 0.84, 0.1), (0.15, 0.46, 0.27, 0.8, 0.08)]
    # (quality pass 2) the hood through its stations smoothly (a monotone cubic, 14 sections, rounder corners)
    ap([lofted("hood", smooth_stations(st, 14 if parts.NEAR else 6), "paint", n=7 if parts.NEAR else 3)])
    # the belly pan and the tunnel the track runs in, the running boards
    ap([lofted("tunnel", [(0.2, 0.27, 0.3, 0.6, 0.03), (-1.6, 0.27, 0.3, 0.55, 0.03), (-1.68, 0.25, 0.32, 0.52, 0.03)], "paint2", n=3)])
    for s in (1, -1):
        ap([kit.box(f"board{s}", (-0.45, s * 0.36, 0.3), (1.2, 0.22, 0.02), "trim", r=0.004)])
        for i in range(8):
            ap([kit.box(f"tread{s}{i}", (-0.95 + i * 0.14, s * 0.36, 0.313), (0.03, 0.2, 0.006), "chrome")])
    # the seat, its grab strap, the rack behind
    # (quality pass 2) the seat lofted: the rider's dip, the passenger's step, rolled edges, its piping
    seat_st = [(0.02, 0.15, 0.6, 0.7, 0.05), (-0.06, 0.2, 0.6, 0.745, 0.07), (-0.35, 0.21, 0.6, 0.735, 0.075), (-0.62, 0.21, 0.6, 0.745, 0.075), (-0.72, 0.205, 0.6, 0.79, 0.075), (-1.05, 0.2, 0.6, 0.795, 0.075), (-1.12, 0.15, 0.6, 0.76, 0.05)]
    ap([lofted("seat", smooth_stations(seat_st, 16 if parts.NEAR else 7), "vinyl", n=5 if parts.NEAR else 2)])
    if parts.NEAR:
        for s_ in (1, -1):
            ap([kit.tube(f"seat.pipe{s_}", [(0.0, s_ * 0.17, 0.69), (-0.08, s_ * 0.198, 0.725), (-0.6, s_ * 0.208, 0.72), (-0.72, s_ * 0.204, 0.77), (-1.08, s_ * 0.195, 0.775)], 0.006, "trim", n=5, cap=False)])
    ap([kit.box("seat.strap", (-0.55, 0, 0.756), (0.7, 0.04, 0.012), "trim")])
    ap([kit.tube("rack", [(-1.15, 0.24, 0.66), (-1.62, 0.24, 0.66), (-1.62, -0.24, 0.66), (-1.15, -0.24, 0.66)], 0.012, "chrome", n=6)])
    car.pt("seat_0", (-0.3, 0, 0.78))
    car.pt("seat_1", (-0.85, 0, 0.78))
    car.pt("eye", (-0.25, 0, 1.55))
    # the windscreen
    # (quality pass 2) the windscreen curved round the rider: taller in the middle, wrapped back at its sides
    ap([windshield("windscreen", 0.32, 0.84, 0.43, 0.3, "glass_tint")])
    # the handlebar: its post, bar, grips, the throttle lever
    hb = Vector((0.05, 0, 0.9))
    ap([kit.tube("hb.post", [(0.12, 0, 0.78), hb], 0.018, "trim", "steering", n=8)])
    ap([kit.tube("hb.bar", [(0.0, 0.32, 0.94), (0.05, 0.12, 0.9), (0.05, -0.12, 0.9), (0.0, -0.32, 0.94)], 0.012, "chrome", "steering", n=8)])
    for s in (1, -1):
        ap([kit.cyl(f"grip{s}", (0.0, s * 0.33, 0.94), 0.018, 0.12, "rubber", "steering", axis="y", n=10)])
    car.pivot("steering", tuple(hb), (0, 0, 1))
    # the skis on their spindles (they steer), the shocks
    for tag, s in (("fl", 1), ("fr", -1)):
        at = (0.62, s * 0.5, 0.22)
        g = f"steer_{tag}"
        ski = [(1.38, 0.0, 0.16), (1.3, 0.0, 0.08), (1.15, 0.0, 0.03), (0.9, 0.0, 0.015), (0.2, 0.0, 0.015), (0.15, 0.0, 0.03)]
        pts = [(x, s * 0.5, z) for x, _, z in ski]
        ap([kit.tube(f"ski{tag}", pts, 0.03, "trim", g, n=6)])
        ap([kit.box(f"skifoot{tag}", (0.75, s * 0.5, 0.012), (1.1, 0.14, 0.012), "trim", g, r=0.004)])
        ap([kit.box(f"skikeel{tag}", (0.7, s * 0.5, 0.0), (0.9, 0.012, 0.012), "steel", g)])
        ap([kit.tube(f"spindle{tag}", [(0.62, s * 0.5, 0.04), (0.62, s * 0.5, 0.3), (0.55, s * 0.42, 0.38)], 0.02, "steel_paint", g, n=8)])
        ap([kit.tube(f"arm{tag}", [(0.62, s * 0.48, 0.28), (0.4, s * 0.25, 0.34)], 0.015, "steel_paint", n=6)])
        ap([kit.cyl(f"shock{tag}", (0.6, s * 0.45, 0.45), 0.025, 0.25, "chrome", axis="z", n=10)])
        car.pivot(f"wheel_{tag}", at, (0, 1, 0), parent="root")
        car.pivot(g, at, (0, 0, 1), parent=f"wheel_{tag}")
        car.pt(f"hub_{tag}", at)
    # the track and its bogie wheels (each turns), the drive sprocket
    wheels = [(0.15, 0.24, 0.13), (-0.25, 0.1, 0.09), (-0.7, 0.1, 0.09), (-1.15, 0.1, 0.09), (-1.5, 0.13, 0.12)]
    ap(track_belt("track", 0.0, wheels, 0.38, "track", "track_l"))
    for i, (x, z, r) in enumerate(wheels):
        for s in (1, -1):
            ap(roller(f"bogie{i}{s}", x, s * 0.12, z, r, 0.05, f"roller_{i}"))
        car.pivot(f"roller_{i}", (x, 0, z), (0, 1, 0))
    # the lamps: a pair in the hood's nose, the tail on the flap
    for s in (1, -1):
        ap(parts.headlamp(f"head{s}", (1.235, s * 0.13, 0.535), 0.12, 0.07, "lamp_head", depth=0.04, bezel="trim", yaw=-s * 0.12))
        car.pt(f"headlight_{'l' if s > 0 else 'r'}", (1.1, s * 0.16, 0.6))
    ap(tail_lamp(car, -1.69, 0.12, 0.48, 0.14, 0.05))
    ap(tail_lamp(car, -1.69, -0.12, 0.48, 0.14, 0.05))
    ap([kit.box("flap", (-1.72, 0, 0.22), (0.012, 0.4, 0.28), "rubber", r=0.004)])
    ap([kit.tube("exhaust", [(0.4, -0.3, 0.32), (0.3, -0.42, 0.3)], 0.02, "steel", n=8)])
    car.pt("exhaust_0", (0.28, -0.44, 0.3))
    # (the quality pass) the cowl's vents and its stripe, the headlight's bezel, the windshield's trim and
    # bolts, the handlebar's controls, the seat's pleats, the bumper loop, the hand grip behind
    for s_ in (1, -1):
        for k in range(4):
            ap([kit.box(f"vent{s_}{k}", (0.85 - k * 0.07, s_ * 0.43, 0.55), (0.04, 0.03, 0.012), "gap", r=0.004)])
        ap([kit.box(f"stripe{s_}", (0.55, s_ * 0.478, 0.5), (0.9, 0.004, 0.035), "paint2")])
    ap([kit.box("bezel", (1.21, 0, 0.535), (0.03, 0.4, 0.11), "gloss", r=0.03)])
    ap([kit.tube("ws.trim", windshield_edge(0.32, 0.84, 0.43, 0.3), 0.008, "trim", n=6, cap=False)])
    for s_ in (1, -1):
        ap([kit.cyl(f"ws.bolt{s_}", (0.19, s_ * 0.425, 0.9), 0.008, 0.01, "chrome", axis="y", n=8)])
        ap([kit.box(f"lever{s_}", (0.08, s_ * 0.27, 0.95), (0.08, 0.012, 0.012), "chrome", "steering", r=0.004)])
        ap([kit.box(f"pod{s_}", (0.03, s_ * 0.22, 0.925), (0.05, 0.05, 0.035), "trim", "steering", r=0.01)])
    ap([kit.box("hb.pad", (0.05, 0, 0.92), (0.06, 0.22, 0.035), "vinyl", "steering", r=0.015)])
    ap([kit.plate("hb.gauge", (0.11, 0, 0.97), 0.1, 0.05, "cluster", "steering", normal="-x", t=0.01)])
    for k in range(6) if parts.NEAR else ():
        z_ = 0.742 if k < 3 else 0.79
        ap([kit.tube(f"seat.pl{k}", [(-0.12 - k * 0.17, -0.17, z_), (-0.12 - k * 0.17, 0.17, z_ + 0.004)], 0.006, "vinyl", n=6)])
    ap([kit.tube("bumper", [(1.3, 0.25, 0.4), (1.42, 0.15, 0.42), (1.42, -0.15, 0.42), (1.3, -0.25, 0.4)], 0.018, "chrome", n=8)])
    ap([kit.tube("grab", [(-1.45, 0.2, 0.66), (-1.5, 0.2, 0.82), (-1.5, -0.2, 0.82), (-1.45, -0.2, 0.66)], 0.014, "trim", n=8)])
    ap([kit.box("badge.sm", (0.7, 0.475, 0.62), (0.3, 0.004, 0.05), "chrome")])
    ap([kit.box("badge.sm.r2", (0.7, -0.475, 0.62), (0.3, 0.004, 0.05), "chrome")])
    ap([kit.box("badge.sm.r", (0.7, -0.475, 0.62), (0.3, 0.004, 0.05), "chrome")])


# ── the snowcat ────────────────────────────────────────────────────────────────────────────────────────────


def snowcat(car):
    b = car.b
    ap = car.objs.extend
    tw = 0.6
    ty = 1.0  # each track's middle off the centre line
    # the hull between the tracks, the cab and the rear cabin
    ap([kit.box("hull", (0, 0, 0.8), (4.4, 1.3, 0.6), "paint", r=0.06)])
    for s in (1, -1):
        ap([kit.box(f"fender{s}", (0.0, s * ty, 1.3), (4.5, tw + 0.12, 0.05), "paint", r=0.02)])
        for k in range(5):
            ap([kit.box(f"fs{s}{k}", (-1.8 + k * 0.9, s * 0.66, 1.15), (0.06, 0.08, 0.3), "steel_paint", r=0.01)])
    # the cab: a box on the front with its glass all round
    cab = kit.box("cab", (1.25, 0, 1.95), (1.6, 2.1, 1.3), "paint", r=0.08)
    ap([cab])
    ap([kit.box("cab.roof", (1.25, 0, 2.62), (1.7, 2.2, 0.06), "paint2", r=0.03)])
    ap([glass_box("cab.ws", 2.05, 2.06, -0.95, 0.95, 1.5, 2.45)])
    for s in (1, -1):
        ap([glass_box(f"cab.side{s}", 0.6, 1.9, s * 1.05, s * 1.06, 1.6, 2.45, "glass", f"door_f{'l' if s > 0 else 'r'}")])
        ap([kit.box(f"cab.door{s}", (1.25, s * 1.056, 1.75), (1.3, 0.02, 0.6), "paint", f"door_f{'l' if s > 0 else 'r'}", r=0.02)])
        ap([kit.box(f"cab.handle{s}", (0.75, s * 1.075, 1.85), (0.12, 0.02, 0.03), "chrome", f"door_f{'l' if s > 0 else 'r'}", r=0.01)])
        car.pivot(f"door_f{'l' if s > 0 else 'r'}", (1.9, s * 1.06, 1.8), (0, 0, 1), side=s, kind="hinge")
    # the rear cabin (people carried behind)
    ap([kit.box("cabin", (-1.3, 0, 1.85), (2.0, 2.1, 1.1), "paint", r=0.08)])
    for s in (1, -1):
        for k in range(3):
            ap([glass_box(f"cabin.w{s}{k}", -2.15 + k * 0.62, -1.65 + k * 0.62, s * 1.05, s * 1.06, 1.75, 2.25)])
    ap([kit.box("rear.door", (-2.31, 0, 1.75), (0.03, 0.8, 1.0), "paint", "boot", r=0.02)])
    ap([glass_box("rear.win", -2.33, -2.32, -0.3, 0.3, 1.85, 2.2, "glass", "boot")])
    car.pivot("boot", (-2.32, -0.4, 1.75), (0, 0, 1), kind="hinge")
    # the tracks: road wheels, the sprocket at the back, the idler in front
    wheels = [(1.85, 0.62, 0.36), (0.95, 0.42, 0.42), (0.0, 0.42, 0.42), (-0.95, 0.42, 0.42), (-1.95, 0.62, 0.36)]
    for s in (1, -1):
        tag = "l" if s > 0 else "r"
        ap(track_belt(f"track{tag}", s * ty, wheels, tw, "track", f"track_{tag}"))
        for i, (x, z, r) in enumerate(wheels):
            ap(roller(f"rw{tag}{i}", x, s * ty, z, r - 0.02, tw * 0.8, f"roller_{tag}{i}"))
            car.pivot(f"roller_{tag}{i}", (x, s * ty, z), (0, 1, 0))
    # hubs for the game's wheel slots (fl/fr/rl/rr at the outer road wheels)
    for tag, x, s in (("fl", 1.25, 1), ("fr", 1.25, -1), ("rl", -1.35, 1), ("rr", -1.35, -1)):
        car.pt(f"hub_{tag}", (x, s * ty, 0.45))
    # lamps: two pairs on the cab's front, the beacon, the work lights; the tails
    for s in (1, -1):
        ap(lamps_round(car, 2.08, s * 0.7, 2.35, 0.07))
        ap(lamps_round(car, 2.25, s * 0.45, 0.95, 0.09))
        car.pt(f"headlight_{'l' if s > 0 else 'r'}", (2.3, s * 0.45, 0.95))
        ap(tail_lamp(car, -2.33, s * 0.85, 1.5))
        ap(mirror_arm(car, 2.0, s * 1.1, 2.0))
    ap([kit.cyl("beacon", (1.25, 0.6, 2.72), 0.08, 0.14, "lens_amber", axis="z", n=16)])
    ap([kit.cyl("beacon.e", (1.25, 0.6, 2.72), 0.055, 0.1, "emit_ind", "beacon", axis="z", n=12)])
    ap([kit.box("grille", (2.21, 0, 0.85), (0.04, 1.1, 0.35), "trim", r=0.02)])
    for i in range(6):
        ap([kit.box(f"gr{i}", (2.235, 0, 0.72 + i * 0.05), (0.02, 1.0, 0.012), "chrome")])
    ap([kit.tube("stack", [(1.6, -0.62, 1.3), (1.6, -0.62, 2.8)], 0.04, "steel", n=10)])
    car.pt("exhaust_0", (1.6, -0.62, 2.82))
    # seats: the driver, beside him, four behind
    ap(seat_simple(car, 0, 1.0, 0.45, 1.4, 0.5, "vinyl"))
    ap(seat_simple(car, 1, 1.0, -0.45, 1.4, 0.5, "vinyl"))
    for k, x in enumerate((-0.8, -1.8)):
        ap(parts.bench(f"cbench{k}", (x, 0, 1.38), 1.8, "vinyl"))
        car.pt(f"seat_{2 + 2 * k}", (x, 0.45, 1.38))
        car.pt(f"seat_{3 + 2 * k}", (x, -0.45, 1.38))
    car.pt("eye", (1.05, 0.45, 2.15))
    # (the quality pass) the cab's inside, wipers, a roof rack and its ladder, the tracks' pads' cleats
    ap(cab_kit(car, 1.88, 0.45, 1.85, 1.9, 1.3, 0.55, door_y=1.06))
    for s_ in (0.5, -0.5):
        ap([kit.tube(f"cwiper{s_}", [(2.07, s_, 1.55), (2.075, s_ - 0.3, 1.95)], 0.007, "trim", n=6)])
    ap(extras_rack_simple(1.25, 2.68, 1.5, 0.9))
    for k in range(6):
        ap([kit.tube(f"cladder{k}", [(-2.36, 0.55, 1.3 + k * 0.2), (-2.36, 0.85, 1.3 + k * 0.2)], 0.01, "chrome", n=6)])
    for sd in (0.55, 0.85):
        ap([kit.tube(f"cladder.s{sd}", [(-2.36, sd, 1.25), (-2.36, sd, 2.4)], 0.012, "chrome", n=6)])
    hub = Vector((1.5, 0.45, 1.75))
    ap(parts.steering_wheel(tuple(hub), math.radians(35), r=0.2))
    car.pivot("steering", tuple(hub), (math.cos(0.61), 0, -math.sin(0.61)), ratio=12)
    ap([kit.box("dash", (1.8, 0, 1.6), (0.3, 1.9, 0.3), "dash", r=0.04)])


# ── the plough truck ───────────────────────────────────────────────────────────────────────────────────────


def ploughtruck(car):
    b = car.b
    ap = car.objs.extend
    fx = 1.8  # the front axle
    rx = -2.4
    # the frame rails
    for s in (1, -1):
        ap([kit.box(f"rail{s}", (-0.3, s * 0.45, 0.72), (6.0, 0.1, 0.25), "under")])
    # the bonnet (a long nose), its grille, the wings over the front wheels
    ap([lofted("bonnet", [(3.4, 0.5, 0.95, 1.6, 0.06), (2.9, 0.55, 0.9, 1.68, 0.08), (2.05, 0.58, 0.9, 1.72, 0.08)], "paint", "bonnet", n=4)])
    car.pivot("bonnet", (2.05, 0, 1.72), (0, 1, 0))
    ap([kit.box("grille", (3.42, 0, 1.28), (0.06, 0.9, 0.55), "chrome", r=0.03)])
    for i in range(9):
        ap([kit.box(f"gbar{i}", (3.455, 0, 1.06 + i * 0.055), (0.02, 0.84, 0.02), "trim")])
    for s in (1, -1):
        wing = lofted(f"wing{s}", [(3.0, 0.22, 0.85, 1.25, 0.08), (1.8, 0.24, 0.9, 1.3, 0.1), (1.2, 0.2, 0.85, 1.15, 0.08)], "paint", n=4)
        kit.move(wing, (0, s * 0.95, 0))
        ap([wing])
        ap(lamps_round(car, 3.2, s * 0.95, 1.33, 0.1))
        car.pt(f"headlight_{'l' if s > 0 else 'r'}", (3.32, s * 0.95, 1.33))
        ap([kit.box(f"indf{s}", (3.15, s * 1.08, 1.2), (0.04, 0.1, 0.06), "lens_amber", r=0.01)])
        ap([kit.box(f"indfe{s}", (3.16, s * 1.08, 1.2), (0.03, 0.08, 0.04), "emit_ind", f"lamp_ind_{'l' if s > 0 else 'r'}")])
    # the cab
    ap([kit.box("cab", (1.35, 0, 2.1), (1.5, 2.3, 1.55), "paint", r=0.07)])
    ap([kit.box("cab.roof", (1.35, 0, 2.9), (1.55, 2.32, 0.06), "paint", r=0.03)])
    ap([glass_box("cab.ws", 2.1, 2.11, -1.0, 1.0, 2.1, 2.75)])
    ap([glass_box("cab.back", 0.59, 0.6, -0.8, 0.8, 2.3, 2.7)])
    for s in (1, -1):
        g = f"door_f{'l' if s > 0 else 'r'}"
        ap([kit.box(f"cdoor{s}", (1.4, s * 1.16, 1.9), (1.1, 0.03, 0.9), "paint", g, r=0.02)])
        ap([glass_box(f"cwin{s}", 0.9, 1.95, s * 1.16, s * 1.17, 2.15, 2.75, "glass", g)])
        ap([kit.box(f"ch{s}", (0.95, s * 1.185, 2.0), (0.14, 0.02, 0.03), "chrome", g, r=0.01)])
        car.pivot(g, (1.95, s * 1.17, 1.9), (0, 0, 1), side=s, kind="hinge")
        for k in range(2):
            ap([kit.box(f"step{s}{k}", (1.4, s * 1.12, 0.6 + k * 0.35), (0.4, 0.2, 0.03), "chrome", r=0.006)])
        ap(mirror_arm(car, 2.05, s * 1.15, 2.4))
    # the beacon bar on the roof
    ap([kit.box("bar", (1.35, 0, 2.97), (0.25, 1.4, 0.07), "trim", r=0.02)])
    for s in (1, -1):
        ap([kit.cyl(f"bcn{s}", (1.35, s * 0.55, 3.05), 0.08, 0.14, "lens_amber", axis="z", n=16)])
        ap([kit.cyl(f"bcne{s}", (1.35, s * 0.55, 3.05), 0.055, 0.1, "emit_ind", "beacon", axis="z", n=12)])
    # the spreader body behind: a hopper with ribs, its spinner at the tail
    ap([kit.box("hopper", (-1.55, 0, 1.7), (2.7, 2.2, 1.1), "blade", r=0.04)])
    for k in range(6):
        ap([kit.box(f"hrib{k}", (-2.75 + k * 0.48, 0, 1.7), (0.05, 2.24, 1.12), "blade", r=0.01)])
    ap([kit.box("hopper.top", (-1.55, 0, 2.27), (2.72, 2.22, 0.05), "trim", r=0.01)])
    ap([kit.cyl("spinner", (-3.05, 0, 0.75), 0.3, 0.04, "steel", axis="z", n=24)])
    ap([kit.box("chute", (-2.95, 0, 1.0), (0.3, 0.3, 0.4), "steel", r=0.02)])
    for s in (1, -1):
        ap(tail_lamp(car, -2.92, s * 1.0, 1.3, 0.14, 0.1))
        ap([kit.box(f"tank{s}", (0.1, s * 0.75, 0.85), (0.9, 0.35, 0.4), "chrome", r=0.12)])
        ap([kit.box(f"guard{s}", (rx, s * 0.95, 1.08), (1.3, 0.62, 0.05), "trim", r=0.01)])
        ap([kit.box(f"mflap{s}", (rx - 0.65, s * 0.95, 0.65), (0.012, 0.55, 0.6), "rubber", r=0.004)])
    pr = kit.plate("plate_r", (-2.94, 0.0, 0.9), 0.4, 0.13, "plate", "plate_r", normal="-x")
    ap([pr])
    car.pivot("plate_r", (-2.94, 0.0, 0.9), (-1, 0, 0), w=0.4, h=0.13)
    ap([kit.tube("stack", [(0.55, -0.85, 1.0), (0.55, -0.95, 1.6), (0.55, -0.95, 3.1)], 0.055, "chrome", n=12)])
    car.pt("exhaust_0", (0.55, -0.95, 3.12))
    # the blade: on its frame in front (its own group: it lifts and angles)
    bz = 0.55
    blade = []
    prof = [(0.0, 0.0), (0.12, 0.05), (0.2, 0.25), (0.18, 0.6), (0.08, 0.85), (0.02, 0.9), (-0.04, 0.85), (0.06, 0.6), (0.08, 0.25), (0.0, 0.05)]
    verts, faces = [], []
    n = len(prof)
    for yy in (-1.5, 1.5):
        for u, v in prof:
            verts.append((3.9 + u, yy, bz - 0.4 + v))
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    faces.append(tuple(range(n)))
    faces.append(tuple(range(2 * n - 1, n - 1, -1)))
    bo = kit.mk("blade", verts, faces, "blade", "blade", smooth=True, angle=30)
    bm = bmesh.new()
    bm.from_mesh(bo.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(bo.data)
    bm.free()
    blade.append(bo)
    blade.append(kit.box("blade.edge", (3.92, 0, bz - 0.39), (0.06, 3.0, 0.04), "steel", "blade"))
    for s in (1, -1):
        blade.append(kit.tube(f"blade.arm{s}", [(3.95, s * 0.4, bz), (3.5, s * 0.4, bz + 0.1), (3.35, s * 0.4, 0.75)], 0.04, "under", "blade", n=8))
        blade.append(kit.cyl(f"blade.mark{s}", (3.98, s * 1.45, bz + 0.6), 0.015, 0.9, "lens_red", "blade", axis="z", n=8))
    blade.append(kit.cyl("blade.ram", (3.55, 0, bz + 0.25), 0.05, 0.6, "chrome", "blade", axis="x", n=12))
    ap(blade)
    car.pivot("blade", (3.35, 0, 0.75), (0, 1, 0))
    # (the quality pass) its hydraulics: the lift ram over the A-frame, the two angle rams, their hoses
    ap(ram("blade.lift", (3.38, 0.0, 1.05), (3.62, 0.0, bz + 0.3), 0.05, "blade"))
    for s_ in (1, -1):
        ap(ram(f"blade.angle{s_}", (3.45, s_ * 0.2, bz + 0.05), (3.9, s_ * 0.9, bz + 0.1), 0.035, "blade"))
    ap([kit.box("blade.frame", (3.45, 0, 0.75), (0.25, 0.9, 0.12), "under", r=0.02)])
    # the wheels: singles in front, doubles behind
    ap(wheel_at(car, "fl", fx, 0.95, 0.5, 0.3, "steel", aggressive=True))
    ap(wheel_at(car, "fr", fx, -0.95, 0.5, 0.3, "steel", aggressive=True))
    ap(wheel_at(car, "rl", rx, 0.95, 0.5, 0.28, "steel", aggressive=True, dual=True))
    ap(wheel_at(car, "rr", rx, -0.95, 0.5, 0.28, "steel", aggressive=True, dual=True))
    # the cab inside
    ap(seat_simple(car, 0, 1.0, 0.5, 1.55, 0.55, "vinyl"))
    ap(seat_simple(car, 1, 1.0, -0.5, 1.55, 0.55, "vinyl"))
    car.pt("eye", (1.05, 0.5, 2.38))
    ap([kit.box("dash", (1.95, 0, 1.75), (0.25, 2.1, 0.35), "dash", r=0.04)])
    ap(cab_kit(car, 2.0, 0.5, 1.95, 2.1, 1.3, 0.62, door_y=1.16))
    for s_ in (1, -1):
        ap(marker(f"pmark{s_}", (2.12, s_ * 1.1, 2.88), grp=f"lamp_ind_{'l' if s_ > 0 else 'r'}"))
        ap(marker(f"pside{s_}", (0.0, s_ * 1.12, 0.95), size=(0.06, 0.02, 0.03), grp=f"lamp_ind_{'l' if s_ > 0 else 'r'}"))
    for s_ in (0.5, -0.5):
        ap([kit.tube(f"pwiper{s_}", [(2.115, s_, 2.15), (2.12, s_ - 0.35, 2.6)], 0.007, "trim", n=6)])
    hub = Vector((1.62, 0.5, 1.95))
    ap(parts.steering_wheel(tuple(hub), math.radians(40), r=0.24))
    car.pivot("steering", tuple(hub), (math.cos(0.7), 0, -math.sin(0.7)), ratio=20)


# ── the tractor ────────────────────────────────────────────────────────────────────────────────────────────


def tractor(car):
    ap = car.objs.extend
    fx, rx = 1.35, -0.95
    # the bonnet: long, narrow, over the engine; the grille; the radiator cap
    ap([lofted("bonnet", [(1.95, 0.3, 0.75, 1.35, 0.06), (1.6, 0.33, 0.72, 1.42, 0.08), (0.2, 0.34, 0.72, 1.48, 0.08)], "paint", n=4)])
    ap([kit.box("grille", (1.97, 0, 1.05), (0.04, 0.5, 0.5), "grille_mesh", r=0.02)])
    for i in range(8):
        ap([kit.box(f"gb{i}", (1.99, 0, 0.84 + i * 0.06), (0.02, 0.46, 0.015), "chrome")])
    ap([kit.box("engine", (0.95, 0, 0.6), (1.4, 0.5, 0.35), "cast", r=0.04)])
    # (the quality pass) the engine's side: the head, injector lines, the starter, the air cleaner and its
    # pre-cleaner bowl, the battery box, the front weights, the steps up to the cab
    ap([kit.box("eng.head", (0.95, 0, 0.82), (1.2, 0.42, 0.1), "cast", r=0.02)])
    for k in range(4):
        x = 0.5 + k * 0.3
        ap([kit.tube(f"inj{k}", [(x, 0.22, 0.88), (x, 0.32, 0.8), (1.45, 0.34, 0.7)], 0.006, "steel", n=5)])
    ap([kit.cyl("starter", (0.45, -0.3, 0.55), 0.06, 0.25, "cast", axis="x", n=12)])
    ap([kit.cyl("aircleaner", (0.4, -0.38, 1.25), 0.1, 0.35, "paint", axis="z", n=16, bevel_r=0.02)])
    ap([kit.cyl("precleaner", (0.4, -0.38, 1.5), 0.07, 0.12, "glass", axis="z", n=14)])
    ap([kit.box("battbox", (0.0, 0.5, 0.85), (0.3, 0.2, 0.22), "trim", r=0.02)])
    for k in range(5):
        ap([kit.box(f"weight{k}", (2.12, -0.32 + k * 0.16, 0.6), (0.18, 0.14, 0.3), "under", r=0.02)])
    ap([kit.box("weightbar", (2.05, 0, 0.6), (0.1, 0.9, 0.12), "under", r=0.02)])
    for s_ in (1, -1):
        for k in range(3):
            ap([kit.box(f"step{s_}{k}", (-0.25, s_ * 0.62, 0.45 + k * 0.22), (0.3, 0.14, 0.025), "steel", r=0.004)])
        ap([kit.tube(f"handrail{s_}", [(-0.05, s_ * 0.6, 1.0), (-0.05, s_ * 0.62, 1.9)], 0.015, "chrome", n=6)])
    ap([kit.tube("stack", [(1.3, 0.0, 1.45), (1.3, 0.0, 2.1)], 0.045, "steel", n=10)])
    ap([kit.cyl("stack.cap", (1.3, 0.0, 2.12), 0.05, 0.02, "steel", axis="z", n=10)])
    car.pt("exhaust_0", (1.3, 0.0, 2.15))
    ap([kit.box("frontaxle", (fx, 0, 0.42), (0.15, 1.5, 0.12), "under", r=0.02)])
    # the fenders over the big rear wheels, the platform, the cab
    for s in (1, -1):
        pts = [(rx + math.cos(a) * 0.72, s * 0.8, 0.62 + math.sin(a) * 0.72) for a in [math.pi * k / 16 for k in range(17)]]
        f = kit.tube(f"fender{s}", pts, 0.02, "paint", n=6)
        ap([f])
        sheet = []
        for k in range(17):
            a = math.pi * k / 16
            for yy in (0.6, 1.0):
                sheet.append((rx + math.cos(a) * 0.72, s * yy, 0.62 + math.sin(a) * 0.72))
        faces = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(16)]
        ap([kit.mk(f"fsheet{s}", sheet, faces, "paint", smooth=True)])
        ap(lamps_round(car, 1.98, s * 0.2, 1.3, 0.06))
        car.pt(f"headlight_{'l' if s > 0 else 'r'}", (2.0, s * 0.2, 1.3))
        ap(tail_lamp(car, rx - 0.75, s * 0.8, 1.2, 0.08, 0.06))
        ap(mirror_arm(car, -0.2, s * 0.6, 1.9))
    ap([kit.box("platform", (-0.6, 0, 0.92), (1.0, 1.2, 0.05), "under", r=0.01)])
    cab_g = []
    for s in (1, -1):
        for x in (-0.05, -1.25):
            cab_g.append(kit.tube(f"post{s}{x}", [(x, s * 0.58, 0.95), (x, s * 0.56, 2.25)], 0.03, "trim", n=8))
        cab_g.append(glass_box(f"cside{s}", -1.2, -0.1, s * 0.57, s * 0.58, 1.3, 2.2, "glass", f"door_f{'l' if s > 0 else 'r'}"))
        car.pivot(f"door_f{'l' if s > 0 else 'r'}", (-0.08, s * 0.58, 1.6), (0, 0, 1), side=s, kind="hinge")
    cab_g.append(kit.box("roof", (-0.65, 0, 2.3), (1.45, 1.3, 0.1), "paint", r=0.04))
    cab_g.append(glass_box("cws", -0.04, -0.03, -0.55, 0.55, 1.4, 2.22))
    cab_g.append(glass_box("cback", -1.27, -1.26, -0.55, 0.55, 1.3, 2.22))
    ap(cab_g)
    ap([kit.box("beacon", (-0.3, 0.45, 2.4), (0.12, 0.12, 0.1), "lens_amber", r=0.04)])
    ap([kit.box("beacon.e", (-0.3, 0.45, 2.4), (0.08, 0.08, 0.07), "emit_ind", "beacon")])
    ap(seat_simple(car, 0, -0.75, 0.0, 1.15, 0.5, "vinyl"))
    ap([kit.box("t.dash", (-0.15, 0, 1.35), (0.15, 0.6, 0.25), "dash", r=0.03)])
    ap([kit.plate("t.cluster", (-0.23, 0, 1.4), 0.36, 0.09, "cluster", normal="-x", t=0.003)])
    for k, (y, h) in enumerate(((0.25, 0.25), (0.35, 0.2), (-0.3, 0.22))):
        ap([kit.tube(f"tlever{k}", [(-0.6, y, 1.0), (-0.55, y, 1.0 + h)], 0.008, "chrome", n=6)])
        ap([kit.cyl(f"tknob{k}", (-0.55, y, 1.02 + h), 0.018, 0.03, "lens_red" if k == 2 else "trim", axis="z", n=10)])
    car.pt("eye", (-0.7, 0, 1.98))
    hub = Vector((-0.25, 0.0, 1.55))
    ap(parts.steering_wheel(tuple(hub), math.radians(50), r=0.2))
    car.pivot("steering", tuple(hub), (math.cos(0.87), 0, -math.sin(0.87)), ratio=18)
    ap([kit.tube("column", [hub, hub + Vector((0.3, 0, -0.35))], 0.03, "trim", n=8)])
    # the three-point hitch behind
    for s in (1, -1):
        ap([kit.tube(f"hitch{s}", [(rx - 0.4, s * 0.35, 0.65), (rx - 0.9, s * 0.4, 0.45)], 0.03, "under", n=8)])
    ap([kit.tube("hitchtop", [(rx - 0.4, 0, 1.0), (rx - 0.9, 0, 0.85)], 0.03, "under", n=8)])
    # the wheels: small steering fronts, big lugged rears
    ap(wheel_at(car, "fl", fx, 0.72, 0.4, 0.22, "steel", aggressive=True))
    ap(wheel_at(car, "fr", fx, -0.72, 0.4, 0.22, "steel", aggressive=True))
    ap(wheel_at(car, "rl", rx, 0.8, 0.6, 0.4, "offroad", aggressive=True))
    ap(wheel_at(car, "rr", rx, -0.8, 0.6, 0.4, "offroad", aggressive=True))


# ── the toboggan ───────────────────────────────────────────────────────────────────────────────────────────


def toboggan(car):
    ap = car.objs.extend
    # slats along it, curled up at the front; cross bars; the rope
    for i in range(6):
        y = -0.25 + i * 0.1
        pts = [(-1.05, y, 0.12), (0.4, y, 0.12), (0.62, y, 0.16), (0.74, y, 0.28), (0.72, y, 0.4), (0.62, y, 0.44)]
        verts, faces = [], []
        for x, yy, z in pts:
            for dy in (-0.042, 0.042):
                verts.append((x, yy + dy, z))
                verts.append((x, yy + dy, z + 0.018))
        for k in range(len(pts) - 1):
            a = k * 4
            b_ = a + 4
            faces += [(a + 1, a + 3, b_ + 3, b_ + 1), (a, b_, b_ + 2, a + 2), (a, a + 1, b_ + 1, b_), (a + 2, b_ + 2, b_ + 3, a + 3)]
        faces += [(0, 2, 3, 1), (len(verts) - 4, len(verts) - 3, len(verts) - 1, len(verts) - 2)]
        o = kit.mk(f"slat{i}", verts, faces, "wood", smooth=True)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
        ap([o])
    for x in (-0.9, -0.4, 0.1, 0.45):
        ap([kit.box(f"bar{x}", (x, 0, 0.1), (0.05, 0.6, 0.025), "wood", r=0.008)])
    ap([kit.tube("rope", [(0.7, 0.3, 0.38), (0.4, 0.34, 0.2), (-0.9, 0.34, 0.2)], 0.008, "canvas", n=6)])
    ap([kit.tube("rope2", [(0.7, -0.3, 0.38), (0.4, -0.34, 0.2), (-0.9, -0.34, 0.2)], 0.008, "canvas", n=6)])
    ap([kit.box("pad", (-0.35, 0, 0.15), (1.1, 0.5, 0.04), "tweed", r=0.015)])
    for x in (-0.9, -0.4, 0.1, 0.45):
        for y in (-0.22, 0.22):
            ap([kit.cyl(f"bolt{x}{y}", (x, y, 0.115), 0.008, 0.006, "steel", axis="z", n=8)])
    ap([kit.tube("curlbrace", [(0.62, -0.28, 0.36), (0.62, 0.28, 0.36)], 0.012, "wood", n=8)])
    for s in (1, -1):
        g = "runner_l" if s > 0 else "runner_r"
        ap([kit.tube(f"runner{s}", [(-1.05, s * 0.22, 0.02), (0.45, s * 0.22, 0.02), (0.68, s * 0.22, 0.1), (0.72, s * 0.22, 0.24)], 0.012, "steel", g, n=6)])
        for x in (-0.8, -0.3, 0.2):
            ap([kit.box(f"post{s}{x}", (x, s * 0.22, 0.06), (0.03, 0.02, 0.08), "steel", g)])
        car.pivot(g, (0, s * 0.22, 0.02), (0, 1, 0))
    for i, x in enumerate((-0.55, 0.05)):
        car.pt(f"seat_{i}", (x, 0, 0.16))
    car.pt("eye", (-0.5, 0, 1.0))
    for tag, x, s in (("fl", 0.55, 1), ("fr", 0.55, -1), ("rl", -0.65, 1), ("rr", -0.65, -1)):
        car.pt(f"hub_{tag}", (x, s * 0.22, 0.1))


BUILD = {
    "snowmobile": (snowmobile, Spec(id="snowmobile", kind="snowmobile", L=3.0, W=1.15, roof=1.15, ahead=1.3, cog=0.5, axle_f=0.68, axle_r=2.23, wheel_r=0.22, wheel_w=0.14, track=0.5)),
    "snowcat": (snowcat, Spec(id="snowcat", kind="snowcat", L=4.6, W=2.4, roof=2.7, ahead=2.2, cog=0.95, axle_f=0.95, axle_r=3.55, wheel_r=0.45, wheel_w=0.6, track=1.0, doors=["door_fl", "door_fr"])),
    "ploughtruck": (ploughtruck, Spec(id="ploughtruck", kind="ploughtruck", L=6.6, W=2.5, roof=3.0, ahead=3.6, cog=1.1, axle_f=1.8, axle_r=6.0, wheel_r=0.5, wheel_w=0.3, track=0.95, doors=["door_fl", "door_fr"])),
    "tractor": (tractor, Spec(id="tractor", kind="tractor", L=3.3, W=1.9, roof=2.4, ahead=1.75, cog=0.9, axle_f=0.4, axle_r=2.7, wheel_r=0.6, wheel_w=0.4, track=0.8, doors=["door_fl", "door_fr"])),
    "toboggan": (toboggan, Spec(id="toboggan", kind="toboggan", L=1.8, W=0.6, roof=0.35, ahead=0.75, cog=0.2, axle_f=0.2, axle_r=1.4, wheel_r=0.1, wheel_w=0.08, track=0.22)),
}
WORK = list(BUILD) + ["shuttle"]


def build(wid, lod="near"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit.MATS.clear()
    kit.SEG = {"near": 1.0, "mid": 0.5}.get(lod, 0.35)
    parts.NEAR = lod == "near"
    fn, spec = BUILD[wid]
    car = Car(spec, {"wheels": "steel", "name": wid})
    fn(car)
    kit.uv_all()
    return car


def extras_rack_simple(x, z, L, hw):
    """A roof rack: two rails and cross bars."""
    obs = []
    for sd in (1, -1):
        obs.append(kit.tube(f"wrack{sd}", [(x - L / 2, sd * hw, z + 0.1), (x + L / 2, sd * hw, z + 0.1)], 0.016, "trim", n=8))
        for xx in (x - L / 2 + 0.05, x + L / 2 - 0.05):
            obs.append(kit.tube(f"wrackleg{sd}{xx}", [(xx, sd * hw, z + 0.1), (xx, sd * hw, z)], 0.012, "trim", n=6))
    for k in range(6):
        xx = x - L / 2 + k * L / 5
        obs.append(kit.tube(f"wrackx{k}", [(xx, hw, z + 0.1), (xx, -hw, z + 0.1)], 0.01, "trim", n=6))
    return obs
