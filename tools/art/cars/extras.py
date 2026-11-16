# Plan 92 — what a variant adds to its body (dress.py calls `variant_extras`): skirts, spoilers, flared arches, a
# bonnet scoop, roof rails, a snorkel, a roof rack and ladder, a spare wheel on the back door, a bull bar, a
# camper's pop-top, a pickup's bed and a flatbed. And the shared add-ons (`addon(kind)`): the parts a buyer
# chooses (F13b), each built at the origin of its socket, written to public/life/cars/extras/<id>.glb.
import math

from mathutils import Vector

import kit
import parts


def rails(car, kind="trim", grp="body"):
    b = car.b
    s0, s1 = b.gh[1][0] + 0.12, b.gh[-2][0] - 0.06
    obs = []
    for side in (1, -1):
        y = side * (b.HR - 0.1)
        z = b.roof + 0.05
        obs.append(kit.tube(f"rail{side}", [(b.x(s0), y, z), (b.x(s1), y, z)], 0.014, kind, grp, n=10))
        for s in (s0, (s0 + s1) / 2, s1) if parts.NEAR else (s0, s1):
            obs.append(kit.box(f"railfoot{side}{s:.2f}", (b.x(s), y, b.roof + 0.025), (0.08, 0.035, 0.05), "trim", grp, r=0.01))
    return obs


def rack(car, ladder=True):
    """An expedition roof rack: a tubular frame over the whole roof, its floor slats, a ladder down the back."""
    b = car.b
    s0, s1 = b.gh[1][0] + 0.05, b.gh[-2][0] - 0.02
    z = b.roof + 0.13
    hw = b.HR - 0.03
    obs = []
    for side in (1, -1):
        obs.append(kit.tube(f"rack.side{side}", [(b.x(s0), side * hw, z), (b.x(s1), side * hw, z)], 0.016, "trim", n=8))
        for s in (s0 + 0.05, (s0 + s1) / 2, s1 - 0.05):
            obs.append(kit.tube(f"rack.leg{side}{s:.2f}", [(b.x(s), side * hw, z), (b.x(s), side * (hw - 0.02), b.roof + 0.01)], 0.012, "trim", n=6))
    n = 9
    for i in range(n):
        s = s0 + (s1 - s0) * i / (n - 1)
        obs.append(kit.tube(f"rack.x{i}", [(b.x(s), hw, z - 0.01), (b.x(s), -hw, z - 0.01)], 0.011, "trim", n=6))
    obs.append(kit.tube("rack.front", [(b.x(s0), hw, z), (b.x(s0 - 0.08), hw * 0.8, z + 0.07), (b.x(s0 - 0.08), -hw * 0.8, z + 0.07), (b.x(s0), -hw, z)], 0.014, "trim", n=8))
    if ladder and parts.NEAR:
        y = -b.lid_hw() + 0.12 if b.boot["kind"] == "side" else -0.6
        x = b.x(b.L) - 0.06
        for sy in (y - 0.15, y + 0.15):
            obs.append(kit.tube(f"ladder{sy:.2f}", [(x, sy, b.boot["z_low"] + 0.05), (x, sy, z)], 0.012, "trim", "boot" if b.boot["kind"] == "side" else "body", n=6))
        for k in range(7):
            zz = b.boot["z_low"] + 0.12 + k * (z - b.boot["z_low"] - 0.15) / 6
            obs.append(kit.tube(f"rung{k}", [(x, y - 0.15, zz), (x, y + 0.15, zz)], 0.009, "trim", "boot" if b.boot["kind"] == "side" else "body", n=6))
    return obs


def bullbar(b, x_front, z0, hw=0.6, grp="body", tag=""):
    """A bull bar: two uprights, a hoop, cross tubes (black)."""
    x = x_front + 0.14
    obs = []
    for sgn in (1, -1):
        obs.append(kit.tube(f"bb.up{sgn}{tag}", [(x - 0.12, sgn * 0.3, z0), (x, sgn * 0.3, z0 + 0.1), (x, sgn * 0.3, z0 + 0.55), (x - 0.06, sgn * 0.3, z0 + 0.62)], 0.03, "trim", grp, n=10))
    obs.append(kit.tube(f"bb.hoop{tag}", [(x - 0.06, 0.3, z0 + 0.62), (x - 0.04, 0.0, z0 + 0.66), (x - 0.06, -0.3, z0 + 0.62)], 0.03, "trim", grp, n=10))
    obs.append(kit.tube(f"bb.low{tag}", [(x - 0.2, hw, z0 + 0.08), (x, 0.3, z0 + 0.12), (x, -0.3, z0 + 0.12), (x - 0.2, -hw, z0 + 0.08)], 0.026, "trim", grp, n=10))
    obs.append(kit.tube(f"bb.mid{tag}", [(x, 0.3, z0 + 0.35), (x, -0.3, z0 + 0.35)], 0.022, "trim", grp, n=8))
    return obs


def spot_lamps(at_l, at_r, grp="body", tag=""):
    obs = []
    for i, at in enumerate((at_l, at_r)):
        obs += parts.headlamp(f"spot{i}{tag}", at, 0.15, 0.15, grp, round_=True, depth=0.08)
        obs.append(kit.cyl(f"spot.can{i}{tag}", (at[0] - 0.05, at[1], at[2]), 0.08, 0.1, "chrome", grp, axis="x", n=20, bevel_r=0.01))
    return obs


def spare(car, r, w):
    """The spare on the back door (the 4x4's), its cover."""
    b = car.b
    x = b.x(b.L) - 0.02 - w / 2 - 0.02
    z = (b.boot["z_low"] + b.belt) / 2 + 0.05
    o = kit.lathe("spare", [(r, -w / 2), (r + 0.01, 0), (r, w / 2), (r * 0.62, w / 2 + 0.01), (0.0, w / 2 + 0.02)], 32, "canvas", "boot", axis="x")
    kit.move(o, (x - 0.02, 0.0, z))
    back = kit.lathe("spare.back", [(r, -w / 2), (r * 0.6, -w / 2 - 0.01), (0.0, -w / 2 - 0.01)], 32, "tyre", "boot", axis="x")
    kit.move(back, (x - 0.02, 0.0, z))
    return [o, back, kit.box("spare.mount", (x + w / 2 + 0.02, 0, z), (0.05, 0.16, 0.16), "trim", "boot", r=0.01)]


def flares(car, out=0.045):
    """Flared arches (the hot hatch's, the expedition's): since quality pass 2 shaped round each arch on the
    skin with its lip (detail.arch_lips) — nothing here."""
    return []
    b = car.b
    obs = []
    for i, (s, r) in enumerate(b.arches):
        for side in (1, -1):
            pts = []
            for k in range(25):
                a = math.pi * k / 24
                x = b.x(s) + math.cos(a) * (r + 0.02)
                z = b.arch_z + math.sin(a) * (r + 0.02)
                pts.append((x, side * (b.hw(s) + out * 0.5), z))
            obs.append(kit.tube(f"flare{i}{side}", pts, out * 0.6, "trim" if car.v.get("flare_kind") == "trim" else "paint", "body", n=8))
    return obs


def skirts(car):
    b = car.b
    obs = []
    for side in (1, -1):
        s0, s1 = b.arches[0][0] + b.arches[0][1] + 0.02, b.arches[1][0] - b.arches[1][1] - 0.02
        obs.append(kit.box(f"skirt{side}", (b.x((s0 + s1) / 2), side * (b.hw((s0 + s1) / 2) + 0.005), b.zb(b.L / 2) + 0.03), (s1 - s0, 0.05, 0.08), "paint", r=0.02))
    return obs


def boot_spoiler(car):
    """A lip spoiler on the boot lid's tail, or a roof spoiler over a hatch's glass."""
    b = car.b
    k = b.boot["kind"]
    if k == "deck":
        s = b.L - 0.12
        z = b.zt(s) + b.crown + 0.012
        o = kit.box("spoiler", (b.x(s), 0, z), (0.12, b.lid_hw() * 2 - 0.05, 0.03), "paint", "boot", r=0.012)
        kit.rot(o, "Y", 0.18, (b.x(s), 0, z))
        legs = [kit.box(f"spoiler.leg{sg}", (b.x(s), sg * (b.lid_hw() - 0.12), z - 0.02), (0.06, 0.03, 0.04), "trim", "boot", r=0.008) for sg in (1, -1)]
        return [o, *legs]
    hs = b.boot.get("hinge_s", b.L)
    z = (b.gh_top(hs + 0.04) or b.roof) + 0.01
    o = kit.box("spoiler", (b.x(hs + 0.12), 0, z), (0.22, b.HR * 2 - 0.12, 0.035), "paint", "boot", r=0.015)
    kit.rot(o, "Y", 0.12, (b.x(hs + 0.12), 0, z))
    return [o]


def scoop(car):
    b = car.b
    s = b.hood["s1"] * 0.55
    z = b.zt(s) + b.crown + 0.006
    o = kit.box("scoop", (b.x(s), 0.0, z), (0.36, 0.34, 0.05), "paint", "bonnet", r=0.02)
    mouth = kit.box("scoop.mouth", (b.x(s) + 0.18, 0.0, z + 0.004), (0.02, 0.28, 0.03), "gloss", "bonnet", r=0.006)
    return [o, mouth]


def snorkel(car):
    """A snorkel up the right A-pillar."""
    b = car.b
    s_w = b.hood["s1"] - 0.1
    y = -(b.hw(s_w) + 0.04)
    pts = [(b.x(s_w), y, b.zt(s_w) - 0.12), (b.x(s_w - 0.02), y, b.belt + 0.05)]
    sa, za = b.gh[1]
    pts += [(b.x(b.gh[0][0] + 0.12), -(b.gh_hw(b.belt + 0.3) + 0.06), b.belt + 0.3), (b.x(sa - 0.06), -(b.gh_hw(za - 0.05) + 0.07), za)]
    obs = [kit.tube("snorkel", pts, 0.042, "trim", n=12)]
    top = Vector(pts[-1])
    obs.append(kit.box("snorkel.head", top + Vector((0.06, 0, 0.04)), (0.18, 0.1, 0.1), "trim", r=0.03))
    return obs


def poptop(car):
    """A camper's pop-top: a white roof shell lifted on a canvas band."""
    b = car.b
    s0, s1 = b.gh[2][0] + 0.15, b.gh[-3][0] - 0.1
    hw = b.HR - 0.03
    obs = [kit.box("poptop.band", (b.x((s0 + s1) / 2), 0, b.roof + 0.11), (s1 - s0 - 0.04, hw * 2 - 0.04, 0.2), "canvas", r=0.01)]
    roof = kit.box("poptop.shell", (b.x((s0 + s1) / 2), 0, b.roof + 0.24), (s1 - s0 + 0.04, hw * 2 + 0.02, 0.08), "fibre", r=0.035)
    obs.append(roof)
    for i in range(3):
        s = s0 + 0.25 + i * (s1 - s0 - 0.5) / 2
        obs.append(kit.box(f"poptop.win{i}", (b.x(s), hw - 0.01, b.roof + 0.12), (0.3, 0.012, 0.1), "glass_tint", r=0.01))
    return obs


def bed(car):
    """A pickup's bed: the cab's back wall, the bed's floor (ribbed), its front wall and wheel tubs."""
    b = car.b
    d = b.bed
    hw = b.W / 2 - 0.05
    obs = []
    sc = b.gh[-1][0]
    obs.append(kit.box("cabback", (b.x(sc + 0.01), 0, (b.cabin["floor"] + b.belt) / 2), (0.02, b.HB * 2 - 0.04, b.belt - b.cabin["floor"]), "paint"))
    obs.append(kit.box("bed.front", (b.x(d["s0"] + 0.02), 0, (d["floor"] + b.belt) / 2), (0.02, hw * 2 - 0.04, b.belt - d["floor"]), "bed"))
    obs.append(kit.box("bed.floor", (b.x((d["s0"] + d["s1"]) / 2), 0, d["floor"]), (d["s1"] - d["s0"], hw * 2 - 0.04, 0.02), "bed"))
    for i in range(9):
        y = -hw + 0.15 + i * (hw * 2 - 0.3) / 8
        obs.append(kit.box(f"bed.rib{i}", (b.x((d["s0"] + d["s1"]) / 2), y, d["floor"] + 0.015), (d["s1"] - d["s0"] - 0.05, 0.03, 0.012), "bed"))
    for side in (1, -1):
        obs.append(kit.box(f"bed.side{side}", (b.x((d["s0"] + d["s1"]) / 2), side * (hw - 0.03), (d["floor"] + b.belt) / 2), (d["s1"] - d["s0"], 0.012, b.belt - d["floor"]), "bed"))
        s, r = b.arches[1]
        tub = kit.cyl(f"bed.tub{side}", (b.x(s), side * (hw - 0.17), b.arch_z), r + 0.02, 0.28, "bed", axis="y", n=28)
        obs.append(tub)
    # the cab's rear window guard, a rubber edge on the bed's rails
    for side in (1, -1):
        obs.append(kit.box(f"bed.cap{side}", (b.x((d["s0"] + d["s1"]) / 2), side * (b.W / 2 - 0.04), b.belt + 0.006), (d["s1"] - d["s0"], 0.07, 0.012), "trim", r=0.004))
    return obs


def flatbed(car):
    """The flatbed: a wooden-floored steel platform behind the cab, its hinged dropsides, mudguards over the
    rear wheels, the tail lamps on its back."""
    b = car.b
    d = b.bed
    hw = b.W / 2 + 0.04
    z = d["floor"]
    obs = []
    mid = (d["s0"] + d["s1"]) / 2
    obs.append(kit.box("fb.deck", (b.x(mid), 0, z), (d["s1"] - d["s0"], hw * 2, 0.05), "wood"))
    for i in range(8):
        y = -hw + 0.12 + i * (hw * 2 - 0.24) / 7
        obs.append(kit.box(f"fb.plank{i}", (b.x(mid), y, z + 0.027), (d["s1"] - d["s0"] - 0.02, 0.004, 0.004), "trim"))
    obs.append(kit.box("fb.frame", (b.x(mid), 0, z - 0.07), (d["s1"] - d["s0"], 0.9, 0.1), "under"))
    for side in (1, -1):
        obs.append(kit.box(f"fb.drop{side}", (b.x(mid), side * (hw - 0.01), z + 0.19), (d["s1"] - d["s0"] - 0.04, 0.025, 0.32), "steel_paint", r=0.006))
        for k in range(4):
            s = d["s0"] + 0.1 + k * (d["s1"] - d["s0"] - 0.2) / 3
            obs.append(kit.box(f"fb.post{side}{k}", (b.x(s), side * (hw + 0.005), z + 0.19), (0.04, 0.02, 0.34), "steel_paint", r=0.004))
        sa, ra = b.axle_r, b.wheel_r + 0.1
        guard = []
        for k in range(17):
            a = math.pi * k / 16
            guard.append((b.x(sa) + math.cos(a) * (ra + 0.03), side * b.track, b.arch_z + math.sin(a) * (ra + 0.03)))
        obs.append(kit.tube(f"fb.guard{side}", guard, 0.03, "trim", n=6))
    obs.append(kit.box("fb.front", (b.x(d["s0"] + 0.02), 0, z + 0.3), (0.03, hw * 2, 0.55), "steel_paint", r=0.006))
    obs.append(kit.box("fb.tail", (b.x(d["s1"] - 0.01), 0, z + 0.19), (0.025, hw * 2 - 0.04, 0.32), "steel_paint", "boot", r=0.006))
    return obs


def variant_extras(car, skin):
    v, b = car.v, car.b
    obs = []
    if v.get("rails"):
        obs += rails(car, "chrome" if v.get("chrome") else "trim")
    if v.get("rack"):
        obs += rack(car)
    if v.get("skirts"):
        obs += skirts(car)
    if v.get("spoiler"):
        obs += boot_spoiler(car)
    if v.get("flares"):
        obs += flares(car)
    if v.get("scoop"):
        obs += scoop(car)
    if v.get("snorkel"):
        obs += snorkel(car)
    if v.get("spare"):
        obs += spare(car, b.wheel_r, b.wheel_w)
    if v.get("bullbar"):
        obs += bullbar(b, b.x(0), b.bumper_z - 0.05, hw=b.hw(0.1) - 0.05)
    if v.get("spots"):
        x = b.x(b.gh[1][0]) - 0.05
        obs += spot_lamps((x + 0.1, 0.4, b.roof + 0.2), (x + 0.1, -0.4, b.roof + 0.2))
    if v.get("poptop"):
        obs += poptop(car)
    if getattr(b, "bed", None) and not v.get("flatbed"):
        obs += bed(car)
    if v.get("flatbed"):
        obs += flatbed(car)
    if v.get("wood_sides"):
        pass
    return obs


# ── the shared add-ons (F13b: the extras a buyer picks; each at its socket's origin) ───────────────────────


def addon(kind):
    """An add-on at its socket's origin (x forward, z up): the game puts it on the car's x_* socket and scales
    the roof ones to the roof's length (manifest: x_roof, and each body's roof length)."""
    obs = []
    if kind == "roofrack":
        # a pair of bars with a basket (on x_roof): 1.3 m long, 1.2 m wide
        for sg in (1, -1):
            obs.append(kit.tube(f"rr{sg}", [(0.65, sg * 0.6, 0.11), (-0.65, sg * 0.6, 0.11)], 0.014, "trim", n=8))
            for x in (0.55, -0.55):
                obs.append(kit.box(f"rrf{sg}{x}", (x, sg * 0.6, 0.05), (0.06, 0.04, 0.1), "trim", r=0.01))
        for i in range(6):
            x = -0.6 + i * 0.24
            obs.append(kit.tube(f"rrx{i}", [(x, 0.6, 0.1), (x, -0.6, 0.1)], 0.01, "trim", n=6))
        obs.append(kit.tube("rr.hoop", [(0.65, 0.6, 0.11), (0.7, 0.5, 0.19), (0.7, -0.5, 0.19), (0.65, -0.6, 0.11)], 0.012, "trim", n=6))
    elif kind == "skibox":
        for x in (0.45, -0.45):
            obs.append(kit.box(f"sb.bar{x}", (x, 0, 0.06), (0.04, 1.2, 0.03), "trim", r=0.008))
            for sg in (1, -1):
                obs.append(kit.box(f"sb.foot{x}{sg}", (x, sg * 0.6, 0.03), (0.06, 0.05, 0.06), "trim", r=0.01))
        box = kit.box("sb.box", (0, 0.1, 0.2), (1.7, 0.75, 0.22), "fibre", r=0.1, segs=4)
        kit.scale(box, (1, 1, 1), (0, 0, 0))
        obs.append(box)
        obs.append(kit.box("sb.seam", (0, 0.1, 0.2), (1.66, 0.77, 0.012), "trim", r=0.004))
    elif kind == "bullbar":

        class _B:
            pass

        obs += bullbar(None, -0.14, -0.08, hw=0.75)
    elif kind == "spots":
        obs += spot_lamps((0.0, 0.0, 0.0), (0.0, -0.8, 0.0))
        for o in obs:
            kit.move(o, (0, 0.4, 0))
        obs.append(kit.tube("spots.bar", [(-0.06, 0.45, -0.07), (-0.06, -0.45, -0.07)], 0.014, "chrome", n=8))
    elif kind == "flaps":
        f = kit.box("flap", (0, 0, -0.12), (0.012, 0.22, 0.26), "rubber", r=0.004)
        obs.append(f)
        obs.append(kit.box("flap.badge", (-0.007, 0, -0.18), (0.002, 0.1, 0.04), "chrome"))
    elif kind == "chains":
        # snow chains: links across a tyre's tread (a ring round it, at the reference size r 0.317, w 0.195)
        r = 0.32
        for i in range(16):
            a = 2 * math.pi * i / 16
            p0 = (math.cos(a) * r, -0.1, math.sin(a) * r)
            p1 = (math.cos(a + 0.2) * r, 0.1, math.sin(a + 0.2) * r)
            obs.append(kit.tube(f"chain{i}", [p0, p1], 0.005, "steel", n=5))
        for sg in (1, -1):
            ring = [(math.cos(2 * math.pi * k / 32) * (r - 0.01), sg * 0.105, math.sin(2 * math.pi * k / 32) * (r - 0.01)) for k in range(33)]
            obs.append(kit.tube(f"chainring{sg}", ring, 0.004, "steel", n=5, cap=False))
    elif kind == "lightbar":
        # the police's: a bar of red and blue, on x_roof
        obs.append(kit.box("lb.base", (0, 0, 0.05), (0.32, 1.2, 0.06), "trim", r=0.02))
        for sg, k in ((1, "r"), (-1, "b")):
            lens = "lens_red" if k == "r" else "glass_tint"
            obs.append(kit.box(f"lb.dome{k}", (0, sg * 0.3, 0.12), (0.26, 0.52, 0.1), lens, r=0.04))
            obs.append(kit.box(f"lb.emit{k}", (0, sg * 0.3, 0.12), (0.2, 0.46, 0.06), f"emit_beacon_{k}", f"beacon_{k}"))
        obs.append(kit.box("lb.mid", (0, 0, 0.12), (0.26, 0.1, 0.1), "chrome", r=0.02))
    elif kind == "taxisign":
        obs.append(kit.box("ts.foot", (0, 0, 0.02), (0.2, 0.5, 0.03), "trim", r=0.01))
        obs.append(kit.box("ts.body", (0, 0, 0.12), (0.1, 0.5, 0.17), "lens_amber", r=0.025))
        for nm, dx in (("x", 0.052), ("-x", -0.052)):
            obs.append(kit.plate(f"ts.face{nm}", (dx, 0, 0.12), 0.44, 0.11, "sign_face", "sign", normal=nm, t=0.004))
        for nm in ("x", "-x"):
            pass
    return obs


def wheel_addon(style):
    """A wheel choice (F13b): tyre + rim at the reference size (r 0.317, width 0.195), its face +y; the game
    scales it to each car's wheel (manifest: wheel.r, wheel.width)."""
    obs = parts.tyre("tyre", 0.317, 0.195, "spin", aggressive=style == "offroad"), *parts.rim("rim", style, 0.317, 0.195, "spin")
    return list(obs)
