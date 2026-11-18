# Plan 101 — the bicycles: four bodies (town, bmx, mtb, road), three variants each; their geometry (wheels, bottom
# bracket, head and seat angles, rake, the rider's points), their frames (lugged or TIG-welded steel, real tube
# profiles), forks, and everything hung on them — each object tagged with the group (pivot) it moves with.
#
# Groups (build_bikes.py hangs each under its pivot): frame · steer (fork, stem, bars…) · bars_spin (bmx-free's
# bars and stem over its rotor) · wheel_f › spin_f · lever_l, lever_r · wheel_r › spin_r · crank › pedal_l,
# pedal_r · kickstand · collider.
import math

from mathutils import Matrix, Vector

import bacc as ac
import bcockpit as ck
import bdrive as dr
import bkit as bk
import bwheel as bw
import kit

V = Vector
Y = V((0, 1, 0))

# ── the bodies: geometry and parts each variant starts from ─────────────────────────────────────────────────
BODIES = {
    "town": dict(
        kind="bike_town",
        maker="HOLLIN",
        wheel_f=dict(r=0.355, bead=0.3175, tw=0.04, tread="block", rim="westwood", rim_kind="chrome", rim_w=0.024, spokes=36, ol=0.1, flanges=(0.034, -0.034), hub_kind="chrome", flange_r=0.021),
        wheel_r=dict(r=0.355, bead=0.3175, tw=0.04, tread="block", rim="westwood", rim_kind="chrome", rim_w=0.024, spokes=36, ol=0.12, flanges=(0.033, -0.027), hub="drum", flange_r=0.022, cogs=[18], cog_y0=-0.046, cog_th=0.0028),
        bb_drop=0.065, cs_x=-0.465, wb=1.12, ha=69.0, rake=0.066, fork_len=0.405, ht_len=0.24, sa=67.0, st_len=0.48,
        saddle_z=0.87, grip_z=1.03, bar="town", bar_w=0.58, stem="swan", saddle="town", post="town",
        crank=dict(style="town", rings=[38], ring_y=[-0.046], q=0.074, bcd=0.0), pedal="block",
        brakes=("sidepull_long", "drum"), shifter="trigger", gears=3, lamp="dynamo", bell=True, kickstand=True,
        guards=True, guard_kind="paint", chain_guard="case", lug=True, rack=True,
    ),
    "bmx": dict(
        kind="bike_bmx",
        maker="ROOK",
        wheel_f=dict(r=0.251, bead=0.203, tw=0.048, tread="bmx", rim="box", rim_kind="alloy", rim_w=0.024, spokes=36, ol=0.1, flanges=(0.034, -0.034), flange_r=0.024, cross=3),
        wheel_r=dict(r=0.251, bead=0.203, tw=0.05, tread="bmx", rim="box", rim_kind="alloy", rim_w=0.024, spokes=36, ol=0.11, flanges=(0.034, -0.028), flange_r=0.024, cogs=[16], cog_y0=-0.043, cog_th=0.003, cross=3),
        bb_drop=-0.049, cs_x=-0.36, wb=0.98, ha=74.0, rake=0.028, fork_len=0.335, ht_len=0.115, sa=71.0, st_len=0.255,
        saddle_z=0.70, grip_z=0.95, bar="bmx", bar_w=0.66, stem="bmx", saddle="bmx", post="bmx",
        crank=dict(style="bmx", rings=[44], ring_y=[-0.043], q=0.07, bcd=0.055, arm=0.175), pedal="bmx",
        brakes=("sidepull_long", "sidepull_long"), shifter=None, gears=1, lamp="none", bell=False, kickstand=False,
        guards=False, chain_guard=None, lug=False, rack=False,
    ),
    "mtb": dict(
        kind="bike_mtb",
        maker="TARN",
        wheel_f=dict(r=0.333, bead=0.2795, tw=0.052, tread="knobby", rim="box", rim_kind="alloy", rim_w=0.023, spokes=36, ol=0.1, flanges=(0.034, -0.034), qr=True, gum=True),
        wheel_r=dict(r=0.333, bead=0.2795, tw=0.052, tread="knobby", rim="box", rim_kind="alloy", rim_w=0.023, spokes=36, ol=0.13, flanges=(0.036, -0.02), qr=True, gum=True, cogs=[28, 24, 21, 18, 16, 14, 12], cog_y0=-0.0285, cog_step=0.0048),
        bb_drop=0.033, cs_x=-0.43, wb=1.07, ha=70.5, rake=0.045, fork_len=0.425, ht_len=0.13, sa=73.0, st_len=0.47,
        saddle_z=0.88, grip_z=0.975, bar="flat", bar_w=0.565, stem="mtb", saddle="mtb", post="mtb",
        crank=dict(style="mtb", rings=[48, 38, 28], ring_y=[-0.053, -0.0475, -0.042], q=0.079, bcd=0.055), pedal="trap",
        brakes=("canti", "canti"), shifter="thumb", gears=21, lamp="none", bell=True, kickstand=True,
        guards=False, chain_guard=None, lug=False, rack=False, bar_ends=True,
    ),
    "road": dict(
        kind="bike_road",
        maker="MERROW",
        wheel_f=dict(r=0.334, bead=0.311, tw=0.023, tread="file", rim="box", rim_kind="alloy", rim_w=0.0195, spokes=32, ol=0.1, flanges=(0.034, -0.034), qr=True, valve="presta", gum=True, cross=3),
        wheel_r=dict(r=0.334, bead=0.311, tw=0.023, tread="file", rim="box", rim_kind="alloy", rim_w=0.0195, spokes=36, ol=0.126, flanges=(0.036, -0.019), qr=True, valve="presta", gum=True, cogs=[23, 21, 19, 17, 15, 14, 13], cog_y0=-0.0285, cog_step=0.0048),
        bb_drop=0.064, cs_x=-0.408, wb=1.0, ha=73.0, rake=0.045, fork_len=0.385, ht_len=0.16, sa=73.5, st_len=0.555,
        saddle_z=0.87, grip_z=0.935, bar="drop", bar_w=0.40, stem="road", saddle="road", post="road",
        crank=dict(style="road", rings=[52, 42], ring_y=[-0.0465, -0.0405], q=0.073, bcd=0.065), pedal="quill",
        brakes=("sidepull", "sidepull"), shifter="downtube", gears=14, lamp="none", bell=False, kickstand=False,
        guards=False, chain_guard=None, lug=True, rack=False, tape="tape",
    ),
}

VARIANTS = {
    # ── town ──
    "town-classic": dict(body="town", name="Hollin Dame", frame="oma", basket=True, rack=True, rack_clamp=True, skirt="strings", chain_guard="case",
                         colours=["#1d1f22", "#22392c", "#d8cfb8"], colour2="#b8a77a", leather=True),
    "town-step": dict(body="town", name="Hollin Lage", frame="step", rack=True, rack_bag=True, skirt="panel", chain_guard="half",
                      wheel_f=dict(gum=True), wheel_r=dict(gum=True), colours=["#d9d0b4", "#6f8fa8", "#6b2430"], colour2="#3a3328"),
    "town-post": dict(body="town", name="Hollin Bode", frame="post", carrier=True, rack=True, rack_clamp=True, skirt="panel", chain_guard="case",
                      wheel_f=dict(r=0.338, bead=0.295, tw=0.047, ol=0.1), wheel_r=dict(tw=0.047), fork_len=0.42, tube_scale=1.12,
                      colours=["#d2a514", "#9c2a1e", "#3b3d3f"], colour2="#1d1f22"),
    # ── bmx ──
    "bmx-free": dict(body="bmx", name="Rook Spinner", gyro=True, pegs=4, twin_top=True, brakes=("sidepull_long", "ubrake"),
                     wheel_f=dict(rim="mag", tw=0.048), wheel_r=dict(rim="mag", tw=0.05), pads=("bar", "top"),
                     colours=["#c9ccd1", "#e0358a", "#f2f0ea"], colour2="#1a1a1c", bar_kind="chrome"),
    "bmx-race": dict(body="bmx", name="Rook Gate", number=True, pads=("bar",), wheel_f=dict(tread="bmx", tw=0.044), wheel_r=dict(tw=0.046),
                     colours=["#f2f0ea", "#1c4fa0", "#d02a20"], colour2="#e3c21b", bar_kind="alloy"),
    "bmx-street": dict(body="bmx", name="Rook Curb", pegs=4, bell=True, wheel_f=dict(tread="knobby", tw=0.054, r=0.254, rim_kind="chrome"), wheel_r=dict(tread="knobby", tw=0.054, r=0.254, rim_kind="chrome"),
                       colours=["#1a1a1c", "#2f6b3a", "#e86a1a"], colour2="#e9e4d6", bar_kind="chrome"),
    # ── mtb ──
    "mtb-trail": dict(body="mtb", name="Tarn Ridgeline", colours=["#1f7d78", "#e7e33a", "#5a3a86"], colour2="#f2f0ea", bottle=1),
    "mtb-winter": dict(body="mtb", name="Tarn Rime", lamp="battery", guards=True, guard_kind="trim",
                       wheel_f=dict(tread="studded", gum=False), wheel_r=dict(tread="studded", gum=False), colours=["#b3221c", "#f0eee8", "#1d2b4a"], colour2="#1a1a1c"),
    "mtb-tour": dict(body="mtb", name="Tarn Wayfarer", rack=True, bottle=2, bar_ends=False,
                     wheel_f=dict(tread="city", tw=0.038, r=0.3175, gum=False), wheel_r=dict(tread="city", tw=0.038, r=0.3175, gum=False),
                     colours=["#2e4a32", "#c8b892", "#40607e"], colour2="#e9e4d6"),
    # ── road ──
    "road-race": dict(body="road", name="Merrow Sprint", bottle=1, pump=True, colours=["#b5201a", "#f1efe9", "#1e3f8a"], colour2="#f1efe9"),
    "road-tour": dict(body="road", name="Merrow Randonneur", lamp="battery", bell=True, kickstand=True, guards=True, guard_kind="alloy", rack=True, panniers=True, bottle=2,
                      brakes=("canti", "canti"), chrome_lugs=True, grip_z=0.95, crank=dict(style="road", rings=[48, 38, 26], ring_y=[-0.0515, -0.0465, -0.0415], q=0.077, bcd=0.055),
                      wheel_f=dict(tw=0.032, r=0.342, gum=False, tread="file", rib=False), wheel_r=dict(tw=0.032, r=0.342, gum=False, tread="file", rib=False, cogs=[28, 24, 21, 18, 16, 14, 13]),
                      gears=21, colours=["#5e1a22", "#23402e", "#1d2a44"], colour2="#e2d7b8"),
    "road-fixed": dict(body="road", name="Merrow Pista", bar="track", stem="track", shifter=None, gears=1, fixed=True,
                       crank=dict(style="road", rings=[48], ring_y=[-0.0425], q=0.071, bcd=0.065),
                       wheel_r=dict(cogs=[16], cog_y0=-0.0425, cog_th=0.003, ol=0.12, flanges=(0.033, -0.027)), wheel_f=dict(gum=False), wheel_r_gum=False,
                       colours=["#151517", "#b9bcc0", "#d9661c"], colour2="#e8e4da"),
}

ROAD_ORDER = ["town-classic", "town-step", "town-post", "bmx-free", "bmx-race", "bmx-street", "mtb-trail", "mtb-winter", "mtb-tour", "road-race", "road-tour", "road-fixed"]


def spec(vid):
    v = VARIANTS[vid]
    b = BODIES[v["body"]]
    out = dict(b)
    for k, x in v.items():
        if k in ("wheel_f", "wheel_r", "crank") and k in b:
            d = dict(b[k])
            d.update(x)
            out[k] = d
        else:
            out[k] = x
    if v.get("wheel_r_gum") is False:
        out["wheel_r"]["gum"] = False
    out["vid"] = vid
    return out


class Bike:
    def __init__(self, vid, s):
        self.vid = vid
        self.s = s
        self.points = {}  # name → (Vector, parent group)
        self.pivots = {}  # group → (world Matrix, parent group)
        self.info = {}


def hexc(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x ** 2.2 for x in c)


# ── tube helpers: lugs and welds ─────────────────────────────────────────────────────────────────────────────


def lug(J, d, r, grp, kind="paint", L=0.032, point=0.022, n=20):
    """A lug's socket round a tube at a joint J (the tube runs from J along d): a sleeve with its two side
    points (the classic spearpoint, seen from the side), a little proud of the tube."""
    J, d = V(J), V(d).normalized()
    if not bk.near():
        return [bk.sweep("lug", [J, J + d * L], r + 0.0012, kind, grp, n=max(8, n // 2), cap=(False, False))]
    o = bk.sweep("lug", [J, J + d * (L * 0.5), J + d * L, J + d * (L + 0.001)], [r + 0.0013, r + 0.0013, r + 0.0011, r + 0.0002], kind, grp, n=n, cap=(False, False), up=(0, 0, 1) if abs(d.z) < 0.95 else (1, 0, 0))
    me = o.data
    m = len(me.vertices) // 4
    side = Y - d * d.dot(Y)
    if side.length < 1e-6:
        side = V((1, 0, 0))
    side.normalize()
    for ring, frac in ((2, 0.75), (3, 1.0)):
        for k in range(m):
            v = me.vertices[ring * m + k]
            c = J + d * d.dot(v.co - J)
            off = (v.co - c).normalized()
            w = abs(off.dot(side)) ** 6
            v.co = v.co + d * point * w * frac
    me.update()
    return [o]


def weld(J, d, r, grp, kind="paint"):
    """A TIG bead round a tube where it meets another: a ring a little proud, its ripples."""
    if not bk.near():
        return []
    J, d = V(J), V(d).normalized()
    u = d.cross(V((0, 0, 1)) if abs(d.z) < 0.9 else V((1, 0, 0))).normalized()
    w = d.cross(u).normalized()
    pts = []
    n = 16
    for i in range(n):
        a = 2 * math.pi * i / n
        pts.append(J + d * 0.0015 + (u * math.cos(a) + w * math.sin(a)) * (r + 0.0006))
    return [bk.sweep("weld", pts, 0.0019, kind, grp, n=4, closed=True)]


FAR = []


def tube(name, pts, rad, grp, kind="paint", n=20, up=None):
    FAR.append((name, [V(p) for p in pts], rad if not isinstance(rad, (list, tuple)) else rad[0], grp))
    return [bk.sweep(name, pts, rad, kind, grp, n=n, up=up)]


def point_at(pts, H, dist):
    """The point along a polyline at `dist` from H (searching from its end at H)."""
    best = None
    for i in range(len(pts) - 1):
        for k in range(10):
            p = V(pts[i]).lerp(V(pts[i + 1]), k / 10)
            e = abs((p - H).length - dist)
            if best is None or e < best[0]:
                best = (e, p)
    return best[1]


# ── the build ─────────────────────────────────────────────────────────────────────────────────────────────────


def build(vid):
    s = spec(vid)
    B = Bike(vid, s)
    FAR.clear()
    body = s["body"]
    wf, wr = dict(s["wheel_f"]), dict(s["wheel_r"])
    rr, rf = wr["r"], wf["r"]
    bbz = rr - s["bb_drop"]
    BB = V((0, 0, bbz))
    HR = V((s["cs_x"], 0, rr))
    HF = V((s["cs_x"] + s["wb"], 0, rf))
    ha = math.radians(s["ha"])
    a = V((-math.cos(ha), 0, math.sin(ha)))
    nrm = V((math.sin(ha), 0, math.cos(ha)))
    P0 = HF - nrm * s["rake"]
    SB = P0 + a * s["fork_len"]
    ST = SB + a * s["ht_len"]
    sa = math.radians(s["sa"])
    ds = V((-math.cos(sa), 0, math.sin(sa)))
    STT = BB + ds * s["st_len"]
    ts = s.get("tube_scale", 1.0)
    paint = "paint"
    lugk = "chrome" if s.get("chrome_lugs") else paint
    bars_grp = "bars_spin" if s.get("gyro") else "steer"
    obs = []
    R = {  # tube radii (m): top, down, seat, head, chain stay (a, b) at the BB, seat stay
        "road": dict(tt=0.0127, dt=0.0143, st=0.0143, ht=0.016, cs=(0.0115, 0.0075), cs_end=0.0055, ss=0.0072, ss_end=0.0055, fb=(0.0135, 0.0095)),
        "mtb": dict(tt=0.0143, dt=0.0159, st=0.0143, ht=0.0175, cs=(0.0115, 0.0085), cs_end=0.0065, ss=0.008, ss_end=0.006, fb=(0.0145, 0.011)),
        "bmx": dict(tt=0.0143, dt=0.0159, st=0.0143, ht=0.0178, cs=(0.0105, 0.0095), cs_end=0.0085, ss=0.0095, ss_end=0.008, fb=(0.0135, 0.0125)),
        "town": dict(tt=0.0105, dt=0.0159, st=0.0143, ht=0.0165, cs=(0.0105, 0.008), cs_end=0.0065, ss=0.0085, ss_end=0.0065, fb=(0.014, 0.0105)),
    }[body]
    R = {k: (tuple(x * ts for x in v) if isinstance(v, tuple) else v * ts) for k, v in R.items()}
    welded = not s.get("lug")
    bb_w = {"road": 0.068, "mtb": 0.073, "bmx": 0.068, "town": 0.068}[body]
    bb_r = 0.0255 if body == "bmx" else 0.0195

    # ── the main triangle ──
    ht_pts = [SB - a * 0.004, ST + a * 0.004]
    obs += tube("headtube", ht_pts, R["ht"], "frame", paint, n=24)
    obs += [bk.cyl_ax("bbshell", BB, Y, bb_r, bb_w, paint, "frame", n=28)]
    obs += [bk.cyl_ax("bbcup", BB + Y * (bb_w / 2 + 0.002), Y, bb_r * 0.95, 0.005, "steel", "frame", n=20), bk.cyl_ax("bbcup", BB - Y * (bb_w / 2 + 0.002), Y, bb_r * 0.95, 0.005, "steel", "frame", n=20)]
    frame = s.get("frame", "diamond")
    seat_top = STT
    tt_a = tt_b = dt_a = dt_b = None
    if body == "town":
        # the seat tube (short: a long pillar shows), the step-through's tubes
        obs += tube("seattube", [BB + ds * 0.01, STT], R["st"], "frame", paint)
        dt_top = SB + a * 0.035
        if frame == "oma":
            # the main tube swooping from the head tube to the bottom bracket
            dpts = bk.bez(dt_top, dt_top - a * 0.14 + V((-0.04, 0, -0.05)), BB + V((0.2, 0, 0.16)), BB + V((0.018, 0, 0.012)), 16)
            obs += tube("downtube", dpts, R["dt"], "frame", paint)
            # the twin laterals from the head tube, past the seat tube either side, on to the dropouts
            top = ST - a * 0.05
            zx = BB.z + 0.2
            xs = BB.x + (zx - BB.z) * (-1 / math.tan(sa))
            for sg in (1, -1):
                p = bk.bez(top + Y * sg * 0.012, top + V((-0.12, sg * 0.02, -0.06)), V((xs + 0.18, sg * 0.022, zx + 0.05)), V((xs, sg * 0.024, zx)), 14)
                p += [V((HR.x + 0.03, sg * (wr["ol"] / 2 - 0.004), HR.z + 0.012))]
                obs += tube("lateral", p, 0.0095 * ts, "frame", paint, n=14)
            tt_a, tt_b = top, V((xs, 0, zx))
        elif frame == "step":
            dpts = bk.bez(dt_top, dt_top - a * 0.12 + V((-0.05, 0, -0.08)), BB + V((0.17, 0, 0.12)), BB + V((0.02, 0, 0.01)), 16)
            obs += tube("downtube", dpts, 0.019, "frame", paint)
            tt_a, tt_b = dt_top, BB
        else:  # post: twin curved tubes one over the other, heavier
            dpts = bk.bez(dt_top, dt_top - a * 0.12 + V((-0.04, 0, -0.06)), BB + V((0.19, 0, 0.15)), BB + V((0.02, 0, 0.012)), 16)
            obs += tube("downtube", dpts, R["dt"], "frame", paint)
            top = ST - a * 0.045
            zx = BB.z + 0.2
            xs = BB.x + (zx - BB.z) * (-1 / math.tan(sa))
            upts = bk.bez(top, top + V((-0.11, 0, -0.07)), V((xs + 0.16, 0, zx + 0.07)), V((xs + 0.012, 0, zx)), 16)
            obs += tube("uppertube", upts, R["dt"] * 0.92, "frame", paint)
            tt_a, tt_b = top, V((xs, 0, zx))
        if s.get("lug"):
            obs += lug(ST - a * 0.003, -a, R["ht"], "frame", lugk, L=0.04)
            obs += lug(SB + a * 0.003, a, R["ht"], "frame", lugk, L=0.045)
            obs += lug(STT, -ds, R["st"], "frame", lugk, L=0.05)
            obs += lug(BB + ds * 0.02, ds, R["st"], "frame", lugk, L=0.03)
    else:
        # top tube: from the seat lug to the head lug; down tube: from the BB to the head tube's foot
        tt_a = STT - ds * (0.022 if body != "bmx" else 0.018)
        tt_b = ST - a * (0.028 if body != "bmx" else 0.03)
        dt_a = BB + V((0.012, 0, 0.012))
        dt_b = SB + a * 0.03
        dt_dir = (dt_b - dt_a).normalized()
        tt_dir = (tt_b - tt_a).normalized()
        obs += tube("seattube", [BB + ds * 0.01, STT], R["st"], "frame", paint, n=24)
        obs += tube("downtube", [dt_a + dt_dir * 0.01, dt_b - dt_dir * 0.004], R["dt"], "frame", paint, n=24)
        if s.get("twin_top"):
            for dz in (0.012, -0.03):
                p0 = tt_a + V((0, 0, dz))
                p1 = tt_b + V((0, 0, dz)) - a * (0.0 if dz > 0 else 0.0)
                obs += tube("toptube", [p0, p1], R["tt"] * 0.82, "frame", paint)
        else:
            obs += tube("toptube", [tt_a + tt_dir * 0.004, tt_b - tt_dir * 0.004], R["tt"], "frame", paint, n=24)
        if s.get("lug"):
            obs += lug(tt_b, -tt_dir, R["tt"], "frame", lugk)
            obs += lug(dt_b, -dt_dir, R["dt"], "frame", lugk, L=0.035)
            obs += lug(tt_a, tt_dir, R["tt"], "frame", lugk)
            obs += lug(dt_a + dt_dir * 0.012, dt_dir, R["dt"], "frame", lugk, L=0.028)
            obs += lug(BB + ds * 0.016, ds, R["st"], "frame", lugk, L=0.03)
            # the head lugs' sleeves round the head tube, the seat lug's
            obs += [bk.sweep("headlug", [ST + a * 0.004, ST - a * 0.05], R["ht"] + 0.0013, lugk, "frame", n=24, cap=(False, False))]
            obs += [bk.sweep("headlug", [SB - a * 0.004, SB + a * 0.05], R["ht"] + 0.0013, lugk, "frame", n=24, cap=(False, False))]
            obs += lug(STT + ds * 0.004, -ds, R["st"], "frame", lugk, L=0.052, point=0.028)
        else:
            obs += weld(tt_b - tt_dir * 0.002, -tt_dir, R["tt"], "frame", paint)
            obs += weld(dt_b - dt_dir * 0.002, -dt_dir, R["dt"], "frame", paint)
            obs += weld(tt_a + tt_dir * 0.002, tt_dir, R["tt"], "frame", paint)
            obs += weld(dt_a + dt_dir * 0.03, dt_dir, R["dt"], "frame", paint)
            obs += weld(BB + ds * 0.022, ds, R["st"], "frame", paint)
            # the seat tube's collar at its top
            obs += [bk.sweep("seatcollar", [STT - ds * 0.004, STT + ds * 0.012], R["st"] + 0.0018, paint, "frame", n=20)]
        if body == "bmx":
            # the gussets under the top tube and the down tube at the head tube, a brace
            for (p, d_) in ((tt_b, -tt_dir), (dt_b, -dt_dir)):
                g = [(p.x, p.z), ((p + d_ * 0.07).x, (p + d_ * 0.07).z), ((SB + a * 0.07 if d_.z > 0 else ST - a * 0.065).x, (SB + a * 0.07 if d_.z > 0 else ST - a * 0.065).z)]
                pl = bk.plate_xz("gusset", g, -0.0018, 0.0018, paint, "frame")
                obs.append(pl)
        seat_top = STT
    # ── the rear triangle ──
    ol = wr["ol"]
    dy = ol / 2 - 0.005
    tyre_hw = wr["tw"] / 2
    for sg in (1, -1):
        # the chain stay: from the BB shell's side, round the tyre's front, to the dropout
        c0 = BB + V((-0.018, sg * (bb_w / 2 - 0.009), -0.002))
        x_t = HR.x + rr - 0.01
        c1 = V((x_t, sg * max(tyre_hw + R["cs"][0] + 0.005, bb_w / 2 - 0.003), bbz + (HR.z - bbz) * (x_t / HR.x) - 0.004))
        c2 = V((HR.x + 0.016, sg * dy, HR.z - 0.002))
        cpts = bk.fillet([c0, c1, c2], 0.06, 6)
        FAR.append(("chainstay", cpts, R["cs"][1], "frame"))
        obs += [bk.sweep("chainstay", cpts, [R["cs"]] + [((R["cs"][0] * (1 - t) + R["cs_end"] * t), (R["cs"][1] * (1 - t) + R["cs_end"] * t)) for t in [i / (len(cpts) - 1) for i in range(1, len(cpts))]], paint, "frame", n=16, up=(0, 0, 1))]
        if welded:
            obs += weld(c0 + V((-0.004, 0, 0)), (c1 - c0).normalized(), R["cs"][0], "frame", paint)
        else:
            obs += lug(c0, (c1 - c0).normalized(), R["cs"][0] * 0.9, "frame", lugk, L=0.025, point=0.015, n=16)
        # the seat stay: from the seat lug's side (or the twin laterals' join) down round the tyre to the dropout
        s0 = seat_top - ds * (0.03 if body != "bmx" else 0.025) + V((0, sg * (R["st"] * 0.7), 0))
        s2 = V((HR.x + 0.008, sg * dy, HR.z + 0.016))
        mid = s0.lerp(s2, 0.55)
        mid.y = sg * max(tyre_hw + R["ss"] + 0.006, abs(mid.y))
        spts = bk.fillet([s0, mid, s2], 0.08, 6)
        FAR.append(("seatstay", spts, R["ss"], "frame"))
        obs += [bk.sweep("seatstay", spts, [R["ss"] * (1 - 0.25 * i / (len(spts) - 1)) for i in range(len(spts))], paint, "frame", n=14)]
        if not welded and body != "town":
            # the wrap-over caps at the seat lug
            obs += [bk.sweep("sscap", [s0 + V((0.006, -sg * 0.003, 0.004)), s0 - (spts[1] - s0).normalized() * 0.0], R["ss"] + 0.0012, lugk, "frame", n=12)]
        B.info.setdefault("ss_pts", {})[sg] = spts
        # the dropout: a plate round the axle, forward to the stays (the right one with the derailleur's hanger)
        out = []
        for i in range(9):
            t = math.radians(80 + 200 * i / 8)
            out.append((HR.x + 0.0135 * math.cos(t), HR.z + 0.0135 * math.sin(t)))
        if sg < 0 and s.get("gears", 1) > 3:
            out = out[:6] + [(HR.x - 0.004, HR.z - 0.022), (HR.x - 0.016, HR.z - 0.028), (HR.x - 0.004, HR.z - 0.036), (HR.x + 0.012, HR.z - 0.024)] + out[8:]
        out += [(HR.x + 0.032, HR.z - 0.008), (HR.x + 0.03, HR.z + 0.006), (HR.x + 0.016, HR.z + 0.03), (HR.x + 0.002, HR.z + 0.028)]
        if body in ("bmx", "town") or s.get("fixed"):
            # track ends: open to the back, the slot long
            out = [(HR.x - 0.022, HR.z - 0.009), (HR.x + 0.034, HR.z - 0.012), (HR.x + 0.034, HR.z + 0.008), (HR.x + 0.016, HR.z + 0.03), (HR.x - 0.004, HR.z + 0.026), (HR.x - 0.022, HR.z + 0.009)]
        pl = bk.plate_xz("dropout", out, sg * dy - 0.0025, sg * dy + 0.0025, paint if body != "road" else "steel", "frame")
        obs.append(pl)
        if s.get("guards") or s.get("rack"):
            obs.append(bk.cyl_ax("eyelet", V((HR.x - 0.012, sg * (dy + 0.002), HR.z - 0.016)), Y, 0.005, 0.005, paint, "frame", n=10))
        if body == "bmx":
            # the chain tensioner's bolt through the track end
            obs.append(bk.rod("tensioner", V((HR.x - 0.03, sg * (dy + 0.004), HR.z)), V((HR.x + 0.003, sg * (dy + 0.004), HR.z)), 0.0028, "chrome", "frame", n=6))
    # the bridges: the chain stays' behind the BB, the seat stays' (where a rear caliper hangs)
    ss_l = B.info["ss_pts"][1]
    bridge = point_at(ss_l, HR, rr + 0.03)
    if s["brakes"][1] in ("sidepull", "sidepull_long"):
        bridge = point_at(ss_l, HR, rr + 0.03 + (0.008 if body == "bmx" else 0.0))
    ss_bridge = V((bridge.x, 0, bridge.z))
    obs += [bk.rod("ssbridge", V((bridge.x, abs(bridge.y), bridge.z)), V((bridge.x, -abs(bridge.y), bridge.z)), 0.0065 * ts, paint, "frame", n=12)]
    csb = V((HR.x + rr + 0.035, 0, bbz + (HR.z - bbz) * ((HR.x + rr + 0.035) / HR.x)))
    ycs = max(tyre_hw + R["cs"][0] + 0.005, bb_w / 2 - 0.003)
    obs += [bk.rod("csbridge", csb + Y * ycs, csb - Y * ycs, 0.0065, paint, "frame", n=12)]
    B.info["ss_bridge"] = ss_bridge

    # ── the fork (steer) ──
    fy_top = 0.03 if body != "bmx" else 0.04
    fy_end = wf["ol"] / 2 - 0.004
    crown = SB - a * 0.014
    obs += ck.crown_race(SB, a, "steer")
    blades = {}
    for sg in (1, -1):
        if body == "mtb":
            # a unicrown: the blades' tops bent in to the steerer
            p0 = crown + V((0, sg * 0.016, 0)) + a * 0.004
            p1 = crown - a * 0.05 + V((0, sg * 0.036, 0))
            p2 = HF + a * 0.12 - nrm * 0.012 + V((0, sg * fy_end, 0))
            p3 = HF + V((0, sg * fy_end, 0)) + a * 0.008
            bp = bk.fillet([p0, p1, p2], 0.05, 6)[:-1] + bk.bez(p2, p2 - a * 0.05, p3 + a * 0.04 - nrm * 0.004, p3, 6)
        elif body == "bmx":
            p0 = crown - a * 0.012 + V((0, sg * fy_top, 0))
            p3 = HF - nrm * s["rake"] + V((0, sg * fy_end, 0)) + a * 0.012
            bp = [p0, p0.lerp(p3, 0.5), p3]
        else:
            p0 = crown - a * 0.012 + V((0, sg * fy_top, 0))
            p3 = HF + V((0, sg * fy_end, 0)) + a * 0.008
            bp = bk.bez(p0, p0 - a * 0.16, p3 + a * 0.12 - nrm * 0.01, p3, 11)
        n_ = len(bp)
        rads = [((R["fb"][0] * (1 - 0.5 * t)), (R["fb"][1] * (1 - 0.38 * t))) for t in [i / (n_ - 1) for i in range(n_)]]
        if body == "bmx":
            rads = [R["fb"]] * n_
        FAR.append(("blade", bp, R["fb"][1], "steer"))
        obs += [bk.sweep("blade", bp, rads, paint, "steer", n=12, up=a)]
        blades[sg] = bp
        # the fork end: a little plate round the axle (forward drop-outs for the BMX's offset)
        fo = [(HF.x + 0.012 * math.cos(math.radians(t)), HF.z + 0.012 * math.sin(math.radians(t))) for t in range(-60, 181, 30)]
        tip = bp[-1]
        fo += [(tip.x - 0.008, tip.z + 0.012), (tip.x + 0.01, tip.z + 0.008)]
        if body == "bmx":
            fo = [(HF.x + 0.014, HF.z + 0.004), (HF.x + 0.004, HF.z - 0.013), (tip.x - 0.012, tip.z - 0.012), (tip.x - 0.012, tip.z + 0.016), (tip.x + 0.01, tip.z + 0.016), (HF.x + 0.008, HF.z + 0.014)]
        pl = bk.plate_xz("forkend", fo, sg * fy_end - 0.0022, sg * fy_end + 0.0022, paint if body != "road" else "steel", "steer")
        obs.append(pl)
    # the crown
    if body == "mtb":
        obs += [bk.sweep("crown", [crown + a * 0.006, crown - a * 0.03], [(0.016, 0.03), (0.016, 0.04)], paint, "steer", n=18, up=Y)]
    elif body == "bmx":
        obs += [bk.box("crown", crown - a * 0.006, (0.034, 0.1, 0.022), paint, "steer", r=0.006)]
        kit.rot(obs[-1], (0, 1, 0), -(math.pi / 2 - ha), crown - a * 0.006)
    else:
        ck_kind = "chrome" if body == "road" or s.get("chrome_lugs") else paint
        cr = [crown + V((0, sg * 0.036, 0)) for sg in (1, -1)]
        obs += [bk.sweep("crown", [cr[0], crown + V((0.006, 0, 0)), cr[1]], [(0.012, 0.016), (0.014, 0.02), (0.012, 0.016)], ck_kind, "steer", n=18, up=a)]
        for sg in (1, -1):
            obs += [bk.sweep("crownsocket", [blades[sg][0] + a * 0.008, blades[sg][0] - a * 0.03], [R["fb"][0] + 0.0012, R["fb"][0] + 0.0004], ck_kind, "steer", n=16, up=a)]
    # the steerer's top, the headset
    obs += ck.headset(SB, ST, a, "frame", kind="chrome" if body != "bmx" else "alloy_dark")
    obs += ck.headset_top(ST, a, "steer", kind="chrome" if body != "bmx" else "alloy_dark")
    # ── the wheels ──
    obs += bw.wheel(HF, wf, "spin_f", "wheel_f")
    obs += bw.wheel(HR, wr, "spin_r", "wheel_r")
    cog_obs, cog_ys = bw.cogs(HR, wr, "spin_r")
    obs += cog_obs
    if s["wheel_r"].get("hub") == "drum":
        # the drum's brake plate on the left and its arm clipped to the chain stay; the hub gear's toggle chain
        obs += [bk.cyl_ax("drumplate", HR + Y * (wr["flanges"][0] + 0.004), Y, 0.05, 0.006, "alloy", "wheel_r", n=32)]
        obs += [bk.sweep("drumarm", [HR + Y * (wr["flanges"][0] + 0.008) + V((0.03, 0, -0.01)), V((HR.x + 0.16, dy + 0.004, HR.z - 0.022))], (0.004, 0.009), "steel", "frame", n=8, up=(0, 0, 1))]
        obs += [bk.box("drumclip", V((HR.x + 0.165, dy + 0.002, HR.z - 0.02)), (0.012, 0.016, 0.022), "steel", "frame", r=0.002)]
        obs += [bk.cyl_ax("toggle", HR - Y * (ol / 2 + 0.012), Y, 0.007, 0.018, "steel", "wheel_r", n=8)]
    # ── the drivetrain ──
    cr = dict(s["crank"])
    obs += dr.crankset(BB, cr, "crank")
    arm = cr.get("arm", 0.17)
    q = cr["q"]
    p_off = {"quill": 0.05, "trap": 0.058, "block": 0.06, "bmx": 0.06}[s["pedal"]]
    pedal_c = {"r": BB + V((arm, -(q + p_off), 0)), "l": BB + V((-arm, q + p_off, 0))}
    obs += dr.pedal(pedal_c["r"], -1, s["pedal"], "pedal_r")
    obs += dr.pedal(pedal_c["l"], 1, s["pedal"], "pedal_l")
    if s["pedal"] == "quill" and bk.near():
        pass
    # the chain: on the big ring (mid ring for a triple) and a middle cog
    rings = cr["rings"]
    ri = 0 if len(rings) < 3 else 1
    R1 = dr.pitch_r(rings[ri])
    y_ring = cr["ring_y"][ri]
    cogs = wr.get("cogs", [16])
    ci = len(cogs) // 2 if len(cogs) > 1 else 0
    R2 = dr.pitch_r(cogs[ci])
    y_cog = cog_ys[ci] if cog_ys else y_ring
    geared = len(cogs) > 1
    chain_case = s.get("chain_guard") == "case"
    if geared:
        lc = body == "mtb" or len(rings) == 3
        up_j = (HR.x - 0.002, HR.z - R2 - 0.032)
        lo_j = (up_j[0] + (0.03 if lc else 0.022), up_j[1] - (0.072 if lc else 0.052))
        circles = [(BB.x, BB.z, R1, 1), (HR.x, HR.z, R2, 1), (up_j[0], up_j[1], dr.pitch_r(11), -1), (lo_j[0], lo_j[1], dr.pitch_r(11), 1)]
        rd_obs, rd_anchor = dr.rear_derailleur(HR, ol, up_j, lo_j, y_cog, "frame", long_cage=lc)
        obs += rd_obs
        fd_obs, fd_c = dr.front_derailleur(BB, ds, dr.pitch_r(rings[0]), cr["ring_y"][0], cr["ring_y"][-1], "frame", R["st"])
        obs += fd_obs
    else:
        circles = [(BB.x, BB.z, R1, 1), (HR.x, HR.z, R2, 1)]
    if not chain_case:
        def y_of(x, xr=HR.x, y0=y_ring, y1=y_cog):
            t = max(0.0, min(1.0, x / xr))
            return y0 + (y1 - y0) * t

        ch, nl = dr.chain(circles, y_of, "frame")
        obs += ch
        B.info["chain_links"] = nl
    # ── the saddle and its post ──
    st_kind = s["saddle"]
    L, Wd, wn, crown_, skirt, rise, k0 = ck.SADDLES[st_kind]
    dz = crown_ + skirt * 0.95 + 0.022 + (0.012 if st_kind == "town" else 0)
    cz = s["saddle_z"] - dz
    x_axis = -(cz - bbz) / math.tan(sa)
    clamp_x = x_axis - (0.03 if s["post"] == "bmx" else 0.0)
    sit = V((clamp_x - 0.15 * L, 0, s["saddle_z"]))
    s_kind = "leather" if (st_kind == "road" or s.get("leather")) else ("vinyl" if st_kind != "road" else "leather")
    if body == "road" and s["vid"] == "road-fixed":
        s_kind = "vinyl"
    sobs, clamp = ck.saddle(sit, st_kind, "frame", kind=s_kind)
    obs += sobs
    obs += ck.seatpost(STT, ds, clamp, s["post"], "frame")
    if body == "mtb":
        # the quick-release seat binder: its lever
        b0 = STT - ds * 0.01 + V((-0.02, 0, 0))
        obs += [bk.cyl_ax("qrbinder", b0 + V((0.0, 0.0, 0)), Y, 0.007, 0.05, "alloy", "frame", n=10)]
        obs += [bk.sweep("qrlever", [b0 + V((0, 0.026, 0)), b0 + V((0.02, 0.03, 0.006)), b0 + V((0.05, 0.03, 0.012))], (0.003, 0.006), "alloy", "frame", n=8, up=(0, 1, 0))]
    else:
        b0 = STT - ds * 0.018 + V((-R["st"] - 0.008, 0, 0))
        obs += [bk.box("binderears", b0, (0.012, 0.02, 0.014), lugk if s.get("lug") else paint, "frame", r=0.003)]
        obs += [bk.rod("binderbolt", b0 - Y * 0.016, b0 + Y * 0.016, 0.0035, "steel", "frame", n=6)]
    B.points["saddle"] = (sit, "frame")
    # ── the cockpit ──
    bar = s["bar"]
    stem_style = s["stem"]
    # where the bar's clamp goes for the grips to sit at grip_z
    _, info = ck.bar_paths(bar, V((0, 0, 0)), s["bar_w"])
    gdz = (info["grip"].z if bar not in ("drop", "track") else info["grip"].z)
    zc = s["grip_z"] - gdz
    if stem_style == "swan":
        Q = ST + a * ((zc - 0.05 - ST.z) / a.z)
        C = Q + V((0.065, 0, 0.05))
    elif stem_style == "bmx":
        top = ST + a * 0.05
        C = top + V((0.035, 0, 0.034))
    else:
        rise = math.radians({"road": -2, "mtb": 12, "track": -8}[stem_style])
        e = V((math.cos(rise), 0, math.sin(rise)))
        ext = {"road": 0.1, "mtb": 0.125, "track": 0.11}[stem_style]
        h = (zc - ST.z - e.z * ext) / a.z
        C = ST + a * h + e * ext
    sk = "alloy" if body in ("road", "mtb") else ("chrome" if body == "town" else s.get("bar_kind", "chrome"))
    st_obs, quill_top = ck.stem(ST, a, stem_style, C, bars_grp, kind=sk)
    obs += st_obs
    bobs, sides, left_path = ck.bars(bar, C, s["bar_w"], bars_grp, kind=sk if body != "bmx" else s.get("bar_kind", "chrome"), tape=s.get("tape"))
    obs += bobs
    lev = {}
    if bar in ("drop", "track"):
        for nm, sg in (("l", 1), ("r", -1)):
            sd = sides[nm]
            bo, bl, piv, ax, tip = ck.road_lever(sd["hood"], sg, bars_grp, f"lever_{nm}", gum=(s["vid"] == "road-race"))
            obs += bo + bl
            lev[nm] = (piv, ax, tip, sd["hood"] + V((-0.01, 0, -0.04)), C + V((0.0, sg * 0.058, -0.012)))
            B.points[f"grip_{nm}"] = (sd["grip"], bars_grp)
            B.points[f"drop_{nm}"] = (sd["drop"], bars_grp)
    else:
        for nm, sg in (("l", 1), ("r", -1)):
            sd = sides[nm]
            end, d = sd["end"], sd["dir"]
            gl = sd["grip_len"]
            obs += ck.grip(end, d, gl, bars_grp, style="mushroom" if body == "bmx" else "rib", kind="rubber")
            B.points[f"grip_{nm}"] = (end - d * gl / 2, bars_grp)
            at = end - d * (gl + 0.012)
            lstyle = {"mtb": "mtb", "town": "town", "bmx": "bmx"}[body]
            bo, bl, piv, ax, tip, adj = ck.flat_lever(at, d, sg, bars_grp, f"lever_{nm}", style=lstyle, tilt=30 if body != "town" else 38)
            obs += bo + bl
            lev[nm] = (piv, ax, tip, at, adj)
            if s.get("bar_ends") and body == "mtb":
                be = [end - d * 0.012, end - d * 0.006 + V((0.03, 0, 0.012)), end + V((0.12, 0, 0.04))]
                obs += [bk.sweep("barend", bk.fillet(be, 0.04, 4), 0.0115, "alloy", bars_grp, n=14)]
                obs += [bk.cyl_ax("barend_clamp", end - d * 0.012, d, 0.0155, 0.022, "alloy", bars_grp, n=14)]
                obs += [bk.cyl_ax("barend_plug", end + V((0.12, 0, 0.04)), V((0.95, 0, 0.3)), 0.0118, 0.004, "rubber", bars_grp, n=12)]
            if s.get("shifter") == "thumb":
                so, _ = dr.thumb_shifter(at - d * 0.028, d, sg, bars_grp)
                obs += so
            if s.get("shifter") == "trigger" and nm == "r":
                so, _ = dr.trigger_shifter(at - d * 0.03, d, bars_grp)
                obs += so
    B.info["levers"] = {}
    for nm in ("l", "r"):
        piv, ax, tip = lev[nm][0], lev[nm][1], lev[nm][2]
        barpt = lev[nm][3]
        B.pivots[f"lever_{nm}"] = (piv, ax, bars_grp)
        B.info["levers"][f"lever_{nm}"] = dict(pull=round(ck.pull_sign(piv, ax, tip, barpt), 3), brake="front" if nm == "r" else "rear")
    # the BMX's pads, crossbar's plate
    if body == "bmx":
        cross = (C + V((-0.012, 0.115, 0.1)), C + V((-0.012, -0.115, 0.1)))
        if "bar" in s.get("pads", ()):
            obs += ac.pad_on(cross[0] - Y * 0.005, cross[1] + Y * 0.005, 0.022, bars_grp)
        if "top" in s.get("pads", ()):
            d_ = (tt_b - tt_a).normalized()
            obs += ac.pad_on(tt_a + d_ * 0.08 + V((0, 0, 0.003)), tt_b - d_ * 0.05 + V((0, 0, 0.003)), 0.026, "frame")
        if s.get("number"):
            obs += ac.number_plate(C + V((0.03, 0, 0.115)), bars_grp)
    # ── the brakes and their cables ──
    near = bk.near()
    front_b, rear_b = s["brakes"]
    housing = "trim"
    lev_out = {nm: (lev[nm][4] if len(lev[nm]) > 4 else lev[nm][3] + V((0.0, 0, 0.0))) for nm in ("l", "r")}
    Df = (SB - HF).normalized()
    if front_b in ("sidepull", "sidepull_long"):
        fobs, f_anchor = ck.sidepull(HF, Df, rf, wf, 1, "steer", kind="chrome" if body == "town" else "alloy", long_reach=front_b == "sidepull_long")
        obs += fobs
    else:
        fobs, f_anchor = ck.cantilevers(HF, Df, wf, fy_end - 0.006 + 0.0, "steer", wide=True)
        obs += fobs
        # the front hanger on the headset
        hg = ST + a * 0.016 + V((0.03, 0, 0))
        obs += [bk.box("hanger", hg, (0.04, 0.012, 0.006), "alloy", "steer", r=0.002)]
        obs += ck.cable([hg, f_anchor], "steer", kind="steel", r=0.0008) if near else []
        f_anchor = hg + V((0.0, 0, 0.004))
    Dr = (ss_bridge - HR).normalized()
    if rear_b in ("sidepull", "sidepull_long"):
        robs, r_anchor = ck.sidepull(HR, Dr, rr, wr, -1, "frame", kind="alloy")
        obs += robs
    elif rear_b == "drum":
        r_anchor = HR + Y * (wr["flanges"][0] + 0.01) + V((0.05, 0, 0.03))
    else:
        robs, r_anchor = ck.cantilevers(HR, Dr, wr, dy + 0.002, "frame", wide=rear_b == "canti", u_brake=rear_b == "ubrake")
        obs += robs
        hg = ss_bridge + Dr * 0.05 + V((0.0, 0, 0.0))
        obs += ck.cable([hg, r_anchor], "frame", kind="steel", r=0.0008) if near else []
        obs += [bk.box("hanger", hg, (0.014, 0.012, 0.03), "alloy", "frame", r=0.002)]
        r_anchor = hg + V((0, 0, 0.012))
    # the cables (near: housings and bare wires along their stops; mid: the housings' loops)
    if near or bk.LOD == "mid":
        # front: from the right lever, a loop down to the front brake
        rl = lev_out["r"]
        if s.get("gyro"):
            obs += ck.cable([rl, rl + V((0.02, 0.02, 0.0)), quill_top + V((0.02, -0.01, 0.03)), quill_top + V((0.0, 0, 0.01))], bars_grp, kind=housing)
        else:
            up_f = (f_anchor - HF).normalized()
            obs += ck.cable(bk.bez(rl, rl + V((0.13, 0.03, -0.02)), f_anchor + up_f * 0.14 + V((0.03, 0, 0)), f_anchor, 14), "steer", kind=housing, smooth=0.0)
        # rear: from the left lever back along the frame
        ll = lev_out["l"]
        if body == "town":
            # down the step tube and along the left chain stay to the drum's arm
            path = [ll, ll + V((0.05, -0.02, -0.08)), SB + a * 0.06 + V((-0.02, 0.02, 0)), BB + V((0.16, 0.02, 0.12)), BB + V((0.03, 0.025, 0.03)), BB + V((-0.05, bb_w / 2 + 0.006, 0.0)), V((HR.x + 0.1, dy + 0.008, HR.z - 0.012)), r_anchor]
            obs += ck.cable(path, "frame", kind=housing, smooth=0.05)
        elif s.get("gyro"):
            obs += ck.cable([ll, ll + V((0.03, -0.02, -0.01)), quill_top + V((0.0, 0.05, 0.04))], bars_grp, kind=housing)
            # (the gyro and its cables, the lower ones down to the top tube)
            go, el, eu = ac.gyro(ST, a, "frame", bars_grp)
            obs += go
            sp = quill_top + V((0.0, 0.0, 0.05))
            for e_ in eu:
                obs += ck.cable([sp + V((0, 0.03, 0.0)), e_ + a * 0.03, e_], bars_grp, kind="steel", r=0.0009)
            tstop = tt_a.lerp(tt_b, 0.8) + V((0, 0, R["tt"] + 0.004))
            for e_ in el:
                obs += ck.cable([e_, e_ - a * 0.03, tstop + V((0.03, 0, 0.01))], "frame", kind="steel", r=0.0009)
            obs += ck.cable([tstop, tt_a + V((0.02, 0, R["tt"] + 0.004))], "frame", kind="steel", r=0.0008)
            obs += ck.cable([tt_a + V((0.02, 0, R["tt"] + 0.004)), tt_a + V((-0.03, 0, 0.0)), r_anchor], "frame", kind=housing)
        else:
            # to the top tube's front stop, bare along its top, housing from the seat lug to the brake
            d_ = (tt_b - tt_a).normalized()
            top_off = V((0, 0, R["tt"] + 0.004)) if body != "bmx" or not s.get("twin_top") else V((0, 0, R["tt"] * 0.82 + 0.016))
            f_stop = tt_b - d_ * 0.06 + top_off
            r_stop = tt_a + d_ * 0.05 + top_off
            obs += ck.cable(bk.bez(ll, ll + V((0.12, -0.02, -0.02)), f_stop + d_ * 0.16 + V((0, 0, 0.05)), f_stop, 14), bars_grp, kind=housing, smooth=0.0)
            obs += ck.cable([f_stop, r_stop], "frame", kind="steel", r=0.0008)
            obs += [bk.cyl_ax("stop", f_stop, d_, 0.0042, 0.012, "steel", "frame", n=8), bk.cyl_ax("stop", r_stop, d_, 0.0042, 0.012, "steel", "frame", n=8)]
            obs += ck.cable([r_stop, r_stop - d_ * 0.06 + V((0, 0, 0.01)), r_anchor + (r_anchor - HR).normalized() * 0.06, r_anchor], "frame", kind=housing, smooth=0.04)
        # the gear cables
        if s.get("shifter") == "downtube" and near:
            d_ = (dt_b - dt_a).normalized()
            shc = dt_b - d_ * 0.16
            obs += dr.downtube_shifters(shc, d_, R["dt"], "frame")
            under = V((0, 0, -1))
            below = lambda p, k=0.0: p + (d_.cross(Y)).normalized() * -(R["dt"] + 0.003) + Y * k  # noqa: E731
            gd = BB + V((0.0, 0, -bb_r - 0.004))
            for sg in (1, -1):
                obs += ck.cable([shc + Y * sg * 0.01 + V((0, 0, -0.012)), below(dt_a + d_ * 0.08, sg * 0.004), gd + Y * sg * 0.004 + V((0.02, 0, 0))], "frame", kind="steel", r=0.0008)
            # rear: along the right chain stay to its stop, a housing loop to the derailleur
            cs_stop = V((HR.x + 0.06, -dy - 0.002, HR.z + 0.008))
            obs += ck.cable([gd - Y * 0.004 + V((-0.01, 0, 0)), V((-0.08, -(bb_w / 2 + 0.002), bbz + 0.006)), cs_stop], "frame", kind="steel", r=0.0008)
            obs += ck.cable([cs_stop, cs_stop + V((-0.05, -0.012, -0.004)), rd_anchor + V((0.03, -0.004, 0.02)), rd_anchor], "frame", kind=housing, r=0.0021)
            # front: up the seat tube to the derailleur's clamp
            obs += ck.cable([gd + Y * 0.004 + V((-0.012, 0, 0)), BB + ds * 0.03 + V((0.018, 0.006, 0)), fd_c + V((0.016, 0.008, 0))], "frame", kind="steel", r=0.0008)
        if s.get("shifter") == "thumb" and near:
            # top-tube routing: housings from the shifters to the top tube's stops; bare along it
            d_ = (tt_b - tt_a).normalized()
            for nm, sg in (("r", -1), ("l", 1)):
                sh = sides[nm]["end"] - sides[nm]["dir"] * 0.15 + V((0.01, 0, 0.012))
                stop = tt_b - d_ * 0.09 + V((0, sg * 0.009, R["tt"] * 0.7))
                obs += ck.cable([sh, sh + V((0.07, -sg * 0.04, -0.02)), (sh + stop) / 2 + V((0.05, 0, 0.05)), stop + d_ * 0.03, stop], bars_grp, kind=housing, r=0.0021, smooth=0.05)
                end = tt_a + d_ * 0.04 + V((0, sg * 0.009, R["tt"] * 0.7))
                obs += ck.cable([stop, end], "frame", kind="steel", r=0.0008)
                if sg < 0:
                    # to the rear derailleur: down the right seat stay, a loop at its end
                    spts = B.info["ss_pts"][-1]
                    obs += ck.cable([end, end - d_ * 0.02 + V((0, -0.01, -0.03))] + [p + V((0.0, -0.012, 0.004)) for p in spts[1:-1]] + [spts[-1] + V((0.02, -0.012, -0.012))], "frame", kind="steel", r=0.0008)
                    obs += ck.cable([spts[-1] + V((0.02, -0.012, -0.012)), spts[-1] + V((-0.03, -0.016, -0.03)), rd_anchor + V((0.02, -0.004, 0.025)), rd_anchor], "frame", kind=housing, r=0.0021)
                else:
                    # the front derailleur's: down the seat tube (a top pull)
                    obs += ck.cable([end, end - d_ * 0.02 + V((0, 0, -0.02)), fd_c + V((0.012, 0.012, 0.03)), fd_c + V((0.012, 0.012, 0.0))], "frame", kind="steel", r=0.0008)
        if s.get("shifter") == "trigger" and near:
            sh = sides["r"]["end"] - sides["r"]["dir"] * 0.155 + V((0.0, 0, -0.03))
            if chain_case:
                # into the case through a grommet on its top, over the ring (the toggle chain inside it)
                gm = V((BB.x - 0.02, cr["ring_y"][0] - 0.016, BB.z + dr.pitch_r(rings[0]) + 0.026))
                path = [sh, sh + V((0.05, 0.02, -0.08)), SB + a * 0.05 + V((-0.02, -0.02, -0.02)), BB + V((0.16, -0.022, 0.13)), gm + V((0.04, 0.004, 0.02)), gm + V((0, 0, 0.004))]
                obs += [bk.cyl_ax("grommet", gm, (0, 0, 1), 0.0045, 0.006, "rubber", "frame", n=8)]
            else:
                path = [sh, sh + V((0.05, 0.02, -0.08)), SB + a * 0.05 + V((-0.02, -0.02, -0.02)), BB + V((0.14, -0.022, 0.1)), BB + V((-0.06, -(bb_w / 2 + 0.004), 0.036)), V((HR.x + 0.1, -(dy + 0.006), HR.z + 0.012)), HR - Y * (ol / 2 + 0.02) + V((0.03, 0, 0.007))]
            obs += ck.cable(path, "frame", kind=housing, r=0.0021, smooth=0.05)
    # ── mudguards, racks, chain guards, skirts, basket, carrier ──
    gk = s.get("guard_kind", "paint")
    if s.get("guards"):
        gw = max(wf["tw"], 0.03) + 0.022
        obs += ac.mudguard(HF, rf + 0.016, -18, 168, gw, "steer", kind=gk, stays=(25,), ol=wf["ol"], flap=body == "town")
        rgw = max(wr["tw"], 0.03) + 0.024
        ra0 = math.degrees(math.atan2((STT - HR).z, (STT - HR).x)) - 22
        obs += ac.mudguard(HR, rr + 0.018, ra0, 205, rgw, "frame", kind=gk, tip=18 if body == "town" else None, stays=(150, 185) if body != "mtb" else (165,), ol=ol)
        # its bridge mounts
        obs += [bk.rod("guardbolt", ss_bridge, ss_bridge + Dr * -0.012, 0.003, "steel", "frame", n=6)]
    if s.get("chain_guard"):
        R1b = dr.pitch_r(rings[0])
        y_ch = cr["ring_y"][0]
        obs += ac.chain_case(BB, R1b, HR, dr.pitch_r(cogs[0]), y_ch + 0.016, y_ch - 0.016 if s["chain_guard"] == "case" else y_ch - 0.011, "frame", kind="paint2" if s["chain_guard"] == "case" else "paint", full=s["chain_guard"] == "case")
    if s.get("skirt") == "strings":
        obs += ac.skirt_strings(HR, rr + 0.016, 0.033, "frame")
    elif s.get("skirt") == "panel":
        obs += ac.skirt_panels(HR, rr + 0.012, ol / 2 + 0.012, "frame")
    rack_back = None
    if s.get("rack"):
        if body == "town":
            top_z = HR.z + rr + 0.06
            x0, x1 = STT.x + 0.0, HR.x - 0.2
            w = 0.15
        elif body == "mtb":
            top_z = HR.z + rr + 0.045
            x0, x1 = HR.x + 0.13, HR.x - 0.2
            w = 0.12
        else:
            top_z = HR.z + rr + 0.05
            x0, x1 = HR.x + 0.13, HR.x - 0.18
            w = 0.11
        ss_pt = point_at(B.info["ss_pts"][1], HR, rr + 0.075)
        ro, rack_back = ac.rear_rack(HR, top_z, x0, x1, w, V((ss_pt.x, 0, ss_pt.z)), ol, "frame", kind="steel" if body != "town" else "paint2", r=0.0048 if body != "town" else 0.0058, clamp=s.get("rack_clamp", False))
        obs += ro
        if s.get("panniers"):
            for sg in (1, -1):
                obs += ac.pannier(V(((x0 + x1) / 2 - 0.02, sg * (w / 2 + 0.002), top_z + 0.004)), 0.3, 0.28, 0.13, sg, "frame")
        if s.get("rack_bag"):
            # a double bag over the rack: two sides and the bridge over the top
            for sg in (1, -1):
                obs += ac.pannier(V(((x0 + x1) / 2, sg * (w / 2 + 0.002), top_z + 0.004)), 0.3, 0.24, 0.1, sg, "frame")
            obs += [bk.box("bagtop", V(((x0 + x1) / 2, 0, top_z + 0.012)), (0.3, w + 0.03, 0.016), "canvas", "frame", r=0.006)]
    if s.get("basket"):
        bc = HF + V((0.025, 0, rf + 0.075))
        obs += ac.basket(bc, 0.37, 0.28, 0.22, "steer")
        # its hooks over the bars and its wire strut to the fork's ends
        for sg in (1, -1):
            hook_top = C + V((0.0, sg * 0.09, 0.0))
            obs += [bk.sweep("basket_hook", bk.fillet([bc + V((-0.135, sg * 0.09, 0.2)), hook_top + V((0.02, 0, 0.02)), hook_top + V((-0.012, 0, 0.012)), hook_top + V((-0.012, 0, -0.016))], 0.012, 3), 0.0028, "steel", "steer", n=6)]
            obs += [bk.rod("basket_strut", bc + V((-0.06, sg * 0.06, -0.006)), HF + V((0.006, sg * (fy_end + 0.006), 0.004)), 0.0035, "steel", "steer", n=8)]
    carrier_front = None
    if s.get("carrier"):
        ctop = HF.z + rf + 0.12
        co, carrier_front = ac.front_carrier(SB, ST, a, ctop, HF.x - 0.2, HF.x + 0.26, 0.42, "frame", kind="paint")
        obs += co
    # ── bottles, pump, pegs ──
    if s.get("bottle"):
        d_ = (dt_b - dt_a).normalized()
        sn = d_.cross(Y).normalized()
        if sn.z < 0:
            sn = -sn
        obs += ac.bottle_cage(dt_a.lerp(dt_b, 0.32) + sn * R["dt"], d_, sn, "frame", bottle_kind="nylon")
        if s["bottle"] > 1:
            sn2 = ds.cross(Y).normalized()
            if sn2.x < 0:
                sn2 = -sn2
            obs += ac.bottle_cage(BB + ds * 0.17 + sn2 * R["st"], ds, sn2, "frame", bottle_kind="alloy")
    if s.get("pump"):
        d_ = (tt_b - tt_a).normalized()
        obs += ac.pump(tt_a + d_ * 0.04 + V((0, 0, -R["tt"] - 0.014)), tt_b - d_ * 0.06 + V((0, 0, -R["tt"] - 0.014)), "frame", kind="nylon")
    if s.get("pegs"):
        for sg, nm in ((1, "l"), (-1, "r")):
            obs += ac.peg(HF + Y * sg * (wf["ol"] / 2 + 0.0055), sg, "wheel_f")
            obs += ac.peg(HR + Y * sg * (ol / 2 + 0.0055), sg, "frame")
            B.points[f"peg_f{nm}"] = (HF + Y * sg * (wf["ol"] / 2 + 0.06), "wheel_f")
            B.points[f"peg_r{nm}"] = (HR + Y * sg * (ol / 2 + 0.06), "frame")
    # ── the bell, the lamps, the reflectors ──
    if s.get("bell"):
        sd = sides["l"]
        if bar in ("drop", "track"):
            at = C + V((0, 0.06, 0))
            bdir = Y
        else:
            at = sd["end"] - sd["dir"] * (sd["grip_len"] + 0.045 + (0.03 if s.get("shifter") == "thumb" else 0.0))
            bdir = sd["dir"]
        bo, bt = ac.bell(at, bdir, bars_grp, r=0.027 if body != "bmx" else 0.02)
        obs += bo
        B.points["bell"] = (bt, bars_grp)
    lamp = s.get("lamp", "none")
    if lamp == "dynamo":
        if carrier_front is not None:
            lc = carrier_front + V((0.028, 0, -0.06))
            obs += ac.headlamp(lc, "frame", kind="chrome")
            obs += [bk.box("lampbracket", lc + V((-0.04, 0, 0.03)), (0.03, 0.012, 0.05), "steel", "frame")]
            lamp_grp = "frame"
        else:
            lc = HF + (SB - HF) * 0.0 + V((0, 0, 0)) + Df * (rf + 0.06) + V((0.085, 0, -0.02))
            obs += ac.headlamp(lc, "steer", kind="chrome")
            obs += [bk.sweep("lampbracket", [lc + V((-0.05, 0, 0.0)), SB - a * 0.02 + V((0.012, 0, 0))], (0.0025, 0.007), "steel", "steer", n=6, up=Y)]
            lamp_grp = "steer"
        B.points["lamp_f"] = (lc + V((0.005, 0, 0)), lamp_grp)
        # the bottle dynamo on the right fork blade, its roller on the sidewall
        bp = blades[-1]
        mnt = bp[int(len(bp) * 0.62)] + V((0.0, -0.022, 0))
        roll = HF + Df * (rf - 0.012) + V((0.02, -(wf["tw"] / 2 + 0.003), 0)) - Df * 0.06
        obs += ac.bottle_dynamo(mnt + V((-0.012, -0.012, 0.04)), None, roll, "steer")
        if near:
            obs += ck.cable([mnt + V((-0.012, -0.012, 0.07)), bp[3] + V((0.0, -0.014, 0.0)), (B.points["lamp_f"][0] - V((0.06, 0, 0))) if lamp_grp == "steer" else SB], "steer", kind="trim", r=0.0011)
        # the rear lamp on the mudguard's tail (or the rack's plate)
        if rack_back is not None:
            rlc = rack_back + V((-0.006, 0, -0.035))
        else:
            ang = math.radians(196)
            rlc = HR + V((math.cos(ang), 0, math.sin(ang))) * (rr + 0.04)
        obs += ac.rear_lamp(rlc, "frame", kind="trim", guard=rack_back is None)
        B.points["lamp_r"] = (rlc, "frame")
    elif lamp == "battery":
        if body == "road":
            # a low lamp on the left fork blade
            bp = blades[1]
            lc = bp[int(len(bp) * 0.7)] + V((0.06, 0.03, 0.0))
            obs += ac.battery_lamp(lc, "steer", w=0.05, h=0.04, depth=0.06)
            obs += [bk.box("lampbracket", lc + V((-0.06, -0.012, 0)), (0.03, 0.03, 0.008), "steel", "steer")]
        else:
            lc = C + V((0.06, 0.06, 0.0))
            obs += ac.battery_lamp(lc, bars_grp)
            obs += [bk.sweep("lampclamp", [lc + V((-0.07, 0, 0)), C + V((0, 0.06, 0))], (0.004, 0.012), "trim", bars_grp, n=6, up=(0, 0, 1))]
        B.points["lamp_f"] = (lc + V((0.003, 0, 0)), "steer" if body == "road" else bars_grp)
        rlc = (rack_back + V((-0.006, 0, -0.035))) if rack_back is not None else STT + ds * 0.06 + V((-0.032, 0, 0))
        obs += ac.rear_lamp(rlc, "frame", kind="trim", guard=False)
        B.points["lamp_r"] = (rlc, "frame")
    else:
        # a red reflector behind the saddle on its post (BMX: on the seat stays' bridge)
        rlc = STT + ds * 0.03 + V((-0.03, 0, 0)) if body != "bmx" else ss_bridge + V((-0.02, 0, 0.01))
        obs += ac.reflector(rlc, -1, "frame", "lens_red")
        B.points["lamp_r"] = (rlc, "frame")
    # front reflector (white) where there's no lamp; spoke reflectors on town/mtb/bmx-street
    if lamp == "none":
        if body == "road":
            fl = SB - a * 0.01 + V((0.03, 0, -0.03))
            obs += ac.reflector(fl, 1, "steer", "lens", w=0.04, h=0.025)
        elif body != "bmx" or s["vid"] != "bmx-race":
            fl = C + V((0.045, 0, 0.0))
            obs += ac.reflector(fl, 1, bars_grp, "lens", w=0.05, h=0.03)
    if body in ("town", "mtb") or s["vid"] == "bmx-street":
        if wf.get("rim") != "mag":
            obs += bw.spoke_reflector(HF, wf, "spin_f", "lens_amber", 1)
            obs += bw.spoke_reflector(HR, wr, "spin_r", "lens_amber", 1)
    # ── decals: the maker on the down tube, the model on the top tube, a band on the seat tube ──
    if bk.near():
        maker = s["maker"]
        model = s["name"].split(" ", 1)[1].upper()
        if body == "town":
            da, db = dpts[3], dpts[11] if len(dpts) > 11 else dpts[-1]
            for sg in (1, -1):
                obs.append(bk.decal_tube("decal", maker, 0.03, da, db, R["dt"] if frame != "step" else 0.019, sg, "decal", "frame", at=0.5, stretch=1.15))
            obs.append(bk.decal_tube("decal", model, 0.016, BB + ds * 0.08, STT, R["st"], 1, "decal", "frame", at=0.5))
            obs.append(bk.decal_tube("decal", model, 0.016, BB + ds * 0.08, STT, R["st"], -1, "decal", "frame", at=0.5))
        else:
            h = R["dt"] * 1.55
            at_ = 0.55 if s.get("bottle") else 0.5
            for sg in (1, -1):
                obs.append(bk.decal_tube("decal", maker, h, dt_a, dt_b, R["dt"], sg, "decal", "frame", at=at_, stretch=1.25))
                obs.append(bk.decal_tube("decal", model, 0.013, tt_a, tt_b, R["tt"], sg, "paint2", "frame", at=0.5))
                obs.append(bk.decal_tube("decal", "CR-MO" if body != "road" else "BUTTED CR-MO", 0.007, BB + ds * 0.05, STT, R["st"], sg, "paint2", "frame", at=0.75))
            # the seat tube's band and the head tube's badge
            obs += [bk.sweep("stband", [STT - ds * 0.11, STT - ds * 0.07], R["st"] + 0.0003, "paint2", "frame", n=24, cap=(False, False))]
        # the head badge: a shield on the head tube's front
        hb = SB.lerp(ST, 0.55) + nrm * (R["ht"] + 0.0012)
        sh = [V((0, -0.011, 0.014)), V((0, 0.011, 0.014)), V((0, 0.011, -0.004)), V((0, 0.0, -0.016)), V((0, -0.011, -0.004))]
        verts = []
        rotm = Matrix.Rotation(-(math.pi / 2 - ha), 3, Y)
        for p in sh:
            verts.append(hb + rotm @ p)
        for p in sh:
            verts.append(hb + rotm @ p - nrm * 0.0015)
        o = bk.mk("badge", verts, [(0, 4, 3, 2, 1), (5, 6, 7, 8, 9), (0, 1, 6, 5), (1, 2, 7, 6), (2, 3, 8, 7), (3, 4, 9, 8), (4, 0, 5, 9)], "chrome", "frame", smooth=False)
        bk._fix_normals(o)
        obs.append(o)
        obs.append(bk.decal_flat("badge_t", maker[0], 0.014, hb + nrm * 0.0002 + rotm @ V((0, 0, 0.002)), (0, -1, 0), rotm @ V((0, 0, 1)), "paint2", "frame", depth=0.0003))
    # ── the kickstand ──
    if s.get("kickstand"):
        K = BB + V((-0.075, 0.0, -0.01))
        cs_dir = (V((HR.x + 0.016, dy, HR.z)) - V((-0.018, bb_w / 2, bbz))).normalized()
        Kl = K + Y * (max(tyre_hw + R["cs"][0] + 0.005, bb_w / 2 - 0.003) + 0.014)
        ds_ = (cs_dir + V((0, 0.0, -0.02))).normalized()
        dd = V((-0.18, 0.4, -1.0)).normalized()
        lean = math.radians(7)
        L_ = None
        # the leg's length: its foot a little above the ground upright (the bike leans onto it)
        for _ in range(3):
            L_ = (Kl.z - 0.0) / -dd.z
            foot = Kl + dd * L_
            h_need = abs(foot.y) * math.sin(lean)
            L_ = (Kl.z - h_need) / -dd.z
        ko, axis, ang, foot = ac.kickstand(Kl, ds_, dd, L_, "frame", "kickstand", mount_y=Kl.y - 0.0)
        obs += ko
        B.pivots["kickstand"] = (Kl, axis, "root")
        B.info["kickstand"] = dict(axis="x", down=round(ang, 4), lean=round(lean, 4), lean_side="left")
        B.points["stand_foot"] = (foot, "root")
    # ── points and pivots ──
    B.points["bb"] = (BB, "root")
    B.points["hub_f"] = (HF, "wheel_f")
    B.points["hub_r"] = (HR, "wheel_r")
    B.points["steer_top"] = (ST, "root")
    B.points["steer_bottom"] = (SB, "root")
    B.pivots["frame"] = (V((0, 0, 0)), None, "root")
    B.pivots["steer"] = (SB, a, "root")
    if s.get("gyro"):
        B.pivots["bars_spin"] = (ST, a, "steer")
    B.pivots["wheel_f"] = (HF, None, "steer")
    B.pivots["spin_f"] = (HF, None, "wheel_f")
    B.pivots["wheel_r"] = (HR, None, "root")
    B.pivots["spin_r"] = (HR, None, "wheel_r")
    B.pivots["crank"] = (BB, None, "root")
    B.pivots["pedal_l"] = (pedal_c["l"], None, "crank")
    B.pivots["pedal_r"] = (pedal_c["r"], None, "crank")
    for nm in ("l", "r"):
        piv, ax, g = B.pivots[f"lever_{nm}"]
        B.pivots[f"lever_{nm}"] = (piv, ax, g)
    B.info["far"] = list(FAR)
    B.info["bar_path"] = left_path
    B.info.update(
        dict(BB=BB, HR=HR, HF=HF, SB=SB, ST=ST, a=a, C=C, pedal=pedal_c, q=q, p_off=p_off, arm=arm, rings=rings, cogs=cogs, ol=ol, wf=wf, wr=wr, sit=sit, clamp=clamp)
    )
    return B, obs


def collider(B):
    """The Jolt hull: the convex hull round the wheels' tyres, the frame's main points, the bars and the saddle
    (a few dozen points)."""
    import bmesh
    import bpy

    I = B.info
    pts = []
    for H, w in ((I["HF"], I["wf"]), (I["HR"], I["wr"])):
        for i in range(12):
            an = 2 * math.pi * i / 12
            for sg in (1, -1):
                pts.append(H + V((w["r"] * math.cos(an), sg * w["tw"] / 2, w["r"] * math.sin(an))))
    for nm in ("grip_l", "grip_r"):
        p = B.points[nm][0]
        pts += [p + V((0, 0, 0.02)), p + V((0, 0, -0.02))]
    sit = I["sit"]
    for dx in (-0.08, 0.12):
        for sg in (1, -1):
            pts.append(sit + V((dx, sg * 0.06, 0.01)))
    for sg in (1, -1):
        pts.append(I["BB"] + V((0, sg * (I["q"] + I["p_off"] + 0.04), 0)))
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    drop = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)}
    bmesh.ops.delete(bm, geom=list(drop), context="VERTS")
    me = bpy.data.meshes.new("collider")
    bm.to_mesh(me)
    bm.free()
    return kit.obj("collider", me, "collider", "collider", smooth=False)
