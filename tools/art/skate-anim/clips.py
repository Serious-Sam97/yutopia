# Plan 104 F4a — the skater's clips as keys: what each key pose is, when, and how it eases in (Blender's own
# interpolations: BEZIER's auto-clamped curves, BACK's overshoot, EXPO's snap, SINE, QUAD, LINEAR). Tony Hawk's Pro
# Skater 1+2 is the reference for timing (60 fps: a pop in 3–5 frames, a catch's stamp in 2–3, a landing's absorb
# over ~10) and for what reads at a distance (the board under the feet, the hand on its edge, knees up in the air).
#
# Every clip is authored for a regular rider on the street popsicle (the board's nose to her left, +x; her toes to its
# toe side, +z); a goofy rider's is the mirror (the client's), another board's points are mapped onto its own.
# A key is (t s, ease, {channel: value}) — the channels it doesn't name are the last key's (the first key's, `base`).
#
# The channels (all her space unless said, the root on the ground under the board's middle):
#   hx hy hz        the hips: across, the rig's thigh joints' height over the root, ahead
#   hrx hry hrz     the pelvis turned (tipped forward, turned toward the nose, side)
#   sx sy sz        the trunk bent forward, twisted to her left, bent to her right (spine and chest share it)
#   cx cy cz        the chest's own on top;  nx ny  the neck;  dx dy dz  the head
#   L* R*           each arm: f raised forward, o out, t twist, e the elbow's bend, wx wz the wrist, c the hand's
#                   curl (−1 open, 0 relaxed, 1 a grip, 2 a fist); ik 0..1 its wrist to (px, py, pz) on the board
#                   (the board's own frame) — or, `space: root`, there in her space (a handplant's coping)
#   F* B*           the front foot (her left, regular) and the back: x y z its sole's point on the board (its own
#                   frame), ox oy oz off it (her space, the board's turns not followed — a flip's feet off it),
#                   h turned (+ toward the nose), t pointed (+ toes down), lk 0..1 on the board (the client locks it
#                   there by IK), kx ky kz the knee's way
#   bx by bz        the board's middle moved (her space);  br bw bp  its roll (about its length: + lifts the heel
#                   edge), yaw (about its up), pitch (+ nose up) — about the pivot px py pz (its own frame)
#   inv ivx ivy ivz the whole of her and the board turned about her z by inv (rad) round (ivx, ivy, ivz) — inverts
#   fy              the whole of her and the board turned about her up (a slide's 90°, a powerslide's)
#   sw              (plan 106) the feet's spots on the board turned 180° with it (> 0.5): a shove-it's board lands
#                   with its tail forward — she stands on it as on any board, her feet never crossed
import math

PI = math.pi
TAU = 2 * PI

# the street popsicle's measures (public/life/skate/manifest.json "street-pop")
D = 0.0885  # the deck's top
TAIL_Y = 0.0957  # the back foot's spot on the kick
NOSE_X, TAIL_X = 0.4018, -0.3938
AXLE_X, WHEEL_R = 0.178, 0.025
THICK = 0.0115

from rig import HIP_H  # noqa: E402  (the rig's hips over the ground standing: moves.ts)

FOOT_F = (0.17, D, -0.035)
FOOT_B = (-0.25, TAIL_Y, -0.03)


def hs(dy=0.0):
    """The hips' height over the root standing on the deck with soft knees, `dy` more."""
    return D + HIP_H - 0.07 + dy


def stance():
    fx, fy_, fz = FOOT_F
    bx_, by_, bz_ = FOOT_B
    return dict(
        hx=0.0, hy=hs(0.012), hz=0.02, hrx=0.12, hry=0.22, hrz=0.0,
        sx=0.24, sy=0.24, sz=0.0, cx=0.06, cy=0.08, cz=0.0, nx=0.04, ny=0.32, dx=0.1, dy=0.45, dz=0.0,
        Lf=0.18, Lo=0.62, Lt=0.25, Le=0.62, Lwx=0.0, Lwz=0.1, Lc=0.0, Lik=0.0, Lpx=0.0, Lpy=D, Lpz=0.0,
        Rf=-0.08, Ro=0.52, Rt=0.2, Re=0.55, Rwx=0.0, Rwz=0.1, Rc=0.0, Rik=0.0, Rpx=0.0, Rpy=D, Rpz=0.0,
        Fx=fx, Fy=fy_, Fz=fz, Fox=0.0, Foy=0.0, Foz=0.0, Fh=0.55, Ft=0.0, Flk=1.0, Fkx=0.02, Fky=0.0, Fkz=1.0,
        Bx=bx_, By=by_, Bz=bz_, Box=0.0, Boy=0.0, Boz=0.0, Bh=-0.05, Bt=0.0, Blk=1.0, Bkx=0.16, Bky=0.0, Bkz=1.0,
        bx=0.0, by=0.0, bz=0.0, br=0.0, bw=0.0, bp=0.0, px=0.0, py=D, pz=0.0,
        inv=0.0, ivx=0.0, ivy=1.0, ivz=0.0, fy=0.0, sw=0.0,
    )


def mix(*ds, **kw):
    out = {}
    for d in ds:
        out.update(d)
    out.update(kw)
    return out


# ── poses (deltas over the stance, or whole) ─────────────────────────────────────────────────────────────
# (plan 106, measured: a real crouch for the pop is the hips at ~0.8 of the leg over the deck, the knees 75–85°, the
# trunk 30° over; the knees go forward over the toes, inside the ankles — never the squat's bow)
CROUCH = dict(hy=hs(-0.15), hrx=0.2, sx=0.4, cx=0.08, nx=-0.04, dx=0.0, Lf=0.1, Le=0.55, Lo=0.42, Rf=-0.45,
              Re=0.5, Ro=0.35, Fkx=0.0, Fkz=1.0, Bkx=0.18)
# (the air: the knees drawn up together under the chest — measured 90–110°, ~0.6–0.7 of the leg)
AIR = dict(hy=hs(-0.22), hrx=0.16, sx=0.3, cx=0.06, nx=-0.02, dx=0.0, Lf=0.3, Lo=0.75, Le=0.5, Rf=-0.1, Ro=0.7,
           Re=0.45, Fkx=0.04, Bkx=0.12)
TUCK = dict(hy=hs(-0.32), hrx=0.28, sx=0.48, cx=0.1, nx=-0.06, dx=-0.08, Fkx=0.04, Bkx=0.1)
# (plan 106, measured on a real grind: the front arm out high toward the nose, 55–85°, the back one lower, 30–45°, the
# elbows a little bent — balance, not a scarecrow)
ARMS_OUT = dict(Lf=0.22, Lo=1.15, Le=0.42, Lt=0.3, Lwz=0.15, Rf=-0.08, Ro=0.72, Re=0.48, Rt=0.25, Rwz=0.15, Lc=-0.3,
                Rc=-0.2)
ARMS_DOWN = dict(Lf=0.0, Lo=0.18, Le=0.25, Rf=-0.3, Ro=0.18, Re=0.25)
LOOK_RAIL = dict(ny=0.38, dy=0.62, dx=0.22, nx=0.1)  # down the rail, the way she goes (the nose's)
FEET_OFF = dict(Flk=0.0, Blk=0.0)


def grab_spot(name):
    """The board's grab spots (street-pop's, its own frame)."""
    return {
        "toe": (0.0, D, 0.1022),
        "heel": (0.0, D, -0.1022),
        "toe_f": (0.2957, 0.1042, 0.102),
        "heel_f": (0.2957, 0.1042, -0.102),
        "toe_r": (-0.2918, 0.1036, 0.102),
        "heel_r": (-0.2918, 0.1036, -0.102),
        "nose": (0.4058, 0.1379, 0.0),
        "tail": (-0.3978, 0.1379, 0.0),
    }[name]


def hand(S, spot, w=1.0, dy=-0.012, curl=1.0):
    """A hand on a board spot (its wrist a little off the edge: the fingers round it)."""
    x, y, z = grab_spot(spot)
    out = 0.035 if z > 0 else -0.035 if z < 0 else 0.0
    ox = 0.035 if spot == "nose" else -0.035 if spot == "tail" else 0.0
    return {f"{S}ik": w, f"{S}px": x + ox, f"{S}py": y + dy, f"{S}pz": z + out, f"{S}c": curl}


CLIPS = {}


def clip(cid, dur, keys, base=None, loop=False, hold=None, out=None, lag=True, hands_space=None, kind=None,
         note=""):
    """A clip: its keys over its base (the stance's); `loop` cycles it all; `hold` (a, b) s loops while the trick's
    held, `out` s on is played when it's let go."""
    b = mix(stance(), base or {})
    CLIPS[cid] = dict(id=cid, dur=dur, keys=keys, base=b, loop=loop, hold=hold, out=out, lag=lag,
                      space=hands_space or {}, kind=kind, note=note)


# ══ rolling ════════════════════════════════════════════════════════════════════════════════════════════════
# the stance: soft knees over her toes, the board under her, looking down it; a breath, a sway from the ankles and a
# weight shift (loops). (Plan 106, measured on real skaters rolling: the hips ~0.97 of the leg over the deck, the knees
# 30–50°, the knees inside the ankles' line, the trunk 15–25° over, the arms out 35–60°, the elbows 20–60°.)
clip("stance", 3.2, [
    (0.0, "sine", {}),
    (0.8, "sine", dict(hy=hs(0.0), sx=0.26, hx=-0.012, Lf=0.2, Lo=0.66, Rf=-0.06, Ro=0.55, dy=0.48, Le=0.66)),
    (1.6, "sine", dict(hy=hs(0.008), sx=0.23, hx=0.0, hz=0.028, Lo=0.6, Ro=0.5, dy=0.42, ny=0.3)),
    (2.4, "sine", dict(hy=hs(-0.004), sx=0.25, hx=0.012, Lf=0.16, Lo=0.64, Rf=-0.1, Ro=0.56, dy=0.47, Re=0.6)),
    (3.2, "sine", {}),
], loop=True, kind="roll")

# pushing (plan 106, from real skaters' pushes): the front foot pivoted to point down the board, the hips and shoulders
# turned with it, the front knee bent to let the back foot reach; the back foot stepped down flat on the toe side beside
# the front truck, swept back along the ground (the push), its heel peeling off at the end (the toes last), lifted low
# and carried forward again under the hips — never kicked up behind. The arms swing against the legs. (~0.8 s a push)
PUSH_BODY = dict(hry=0.85, sy=0.3, cy=0.12, ny=0.2, dy=0.22, sx=0.26, Fh=1.15, Fx=0.13, Fz=-0.01, Fkx=0.7, Fkz=0.8)
clip("push", 0.8, [
    (0.0, "smooth", dict(Bx=-0.04, By=0.1, Bz=0.16, Blk=0.0, Bh=0.95, Bt=0.0, hy=hs(-0.05), Lf=-0.15, Rf=0.25,
                         Bkx=0.5, Bkz=1.0)),
    (0.12, "out", dict(Bx=0.04, By=0.0, Bz=0.18, Bt=0.0, hy=hs(-0.14), sx=0.34, Lf=-0.1, Rf=0.2)),
    (0.42, "smooth", dict(Bx=-0.44, By=0.0, Bz=0.18, Bt=0.05, Bh=0.9, hy=hs(-0.11), sx=0.3, Lf=0.4, Rf=-0.4,
                          Le=0.7, Re=0.66, Bkx=0.2)),
    (0.52, "out", dict(Bx=-0.52, By=0.01, Bz=0.17, Bt=0.5, hy=hs(-0.09), Lf=0.42, Rf=-0.42)),
    (0.62, "smooth", dict(Bx=-0.4, By=0.06, Bz=0.17, Bt=0.15, hy=hs(-0.07), Lf=0.25, Rf=-0.2, Bkx=0.35)),
    (0.8, "smooth", dict(Bx=-0.04, By=0.1, Bz=0.16, Blk=0.0, Bh=0.95, Bt=0.0, hy=hs(-0.05), Lf=-0.15, Rf=0.25,
                         sx=0.26, Le=0.62, Re=0.55, Bkx=0.5)),
], base=mix(PUSH_BODY, Blk=0.0, Bkx=0.5, Bkz=1.0), loop=True, kind="roll")

# a carve: leant toward her toes (the lean's +1) or her heels (−1) — the board's tilt is the board's own (its trucks)
clip("carve+", 0.4, [(0.0, "smooth", dict(hz=0.07, sx=0.3, hrx=0.18, hy=hs(-0.06), Lf=0.35, Rf=0.05, dx=-0.14,
                                         Fkz=1.0, Bkz=1.0))], kind="roll")
clip("carve-", 0.4, [(0.0, "smooth", dict(hz=-0.07, sx=0.02, hrx=-0.02, hy=hs(-0.07), Lf=0.05, Rf=-0.3, Lo=0.5,
                                         Ro=0.5, dx=0.02, Fkz=0.8, Bkz=0.8))], kind="roll")
# the crouch (Space held): low, the arms down and back, ready to spring
clip("crouch", 0.4, [(0.0, "smooth", CROUCH)], kind="roll")

# the ollie, from the pop (the step's take-off): crouched — the tail snapped (3 frames), the front foot dragged up the
# grip to level it, the knees up (to ~0.2 s), the legs reaching down again for the ground
clip("ollie", 0.5, [
    # (plan 106, the 60 fps footage's ollie, timed to the game's: the crouch's spring — the legs straightened to the
    # pop, 1.05 of the leg, in ~3 frames —, the tail snapped, the front foot dragged up the grip on its side; the knees
    # drawn up to the chest by ~0.2 s; the legs let down again for the ground; the arms rise with the pop and float)
    (0.0, "smooth", mix(CROUCH, hy=hs(-0.17), Lf=-0.05, Rf=-0.55, Lo=0.35, Ro=0.3, Le=0.4, Re=0.4)),
    (0.05, "snap", dict(hy=hs(0.04), sx=0.16, hrx=0.08, bp=0.42, px=-AXLE_X, py=0.0, pz=0.0, by=0.015,
                        Fx=0.22, Fh=0.62, Ft=-0.2, Fkx=-0.05, Bkx=0.1, Lf=0.45, Lo=0.6, Rf=0.15, Ro=0.6, dx=-0.02)),
    (0.12, "out", dict(hy=hs(-0.18), sx=0.3, bp=0.06, by=0.0, Fx=0.27, Ft=0.0, Fh=0.58, Lf=0.4, Lo=0.75, Rf=-0.05,
                       Ro=0.7)),
    (0.22, "smooth", mix(AIR, TUCK, bp=0.0, Fx=0.21, Lf=0.32, Lo=0.8, Rf=-0.1, Ro=0.72)),
    (0.38, "smooth", dict(hy=hs(-0.12), sx=0.26, hrx=0.14, Fx=0.18, Fkx=-0.02, Bkx=0.18)),
    (0.5, "smooth", mix(AIR, hy=hs(-0.13), Fx=0.17)),
], kind="air")
# landing (measured: the knees take it from ~0.85 of the leg down to ~0.7 in ~5 frames, then she rises back to her
# stance over ~0.3 s — the arms a frame or two behind, settling)
clip("land", 0.42, [
    (0.0, "smooth", mix(AIR, hy=hs(-0.12))),
    (0.08, "snap", mix(CROUCH, hy=hs(-0.24), sx=0.44, hrx=0.22, Lf=0.05, Rf=-0.3, Lo=0.6, Ro=0.6, Le=0.5)),
    (0.2, "out", mix(CROUCH, hy=hs(-0.1), sx=0.32, Lo=0.66, Ro=0.56)),
    (0.42, "smooth", stance()),
], kind="roll")
# a plain air (no trick): knees up, the arms out to the sides, a slow drift (loops)
clip("air", 1.2, [
    (0.0, "sine", AIR),
    (0.6, "sine", mix(AIR, hy=hs(-0.27), Lo=0.66, Ro=0.56, sx=0.33)),
    (1.2, "sine", AIR),
], loop=True, kind="air")
# the revert: on landing in a ramp, the board slid round 180° under her (the step turns her; the clip is the skid)
clip("revert", 0.34, [
    (0.0, "smooth", mix(CROUCH, hy=hs(-0.2), fy=-PI)),
    (0.1, "snap", dict(fy=-0.35, hy=hs(-0.26), bw=0.25, sy=-0.2, hry=0.05, Lf=0.6, Lo=0.7, Rf=-0.5, Ro=0.7, dy=0.2)),
    (0.2, "out", dict(fy=0.0, bw=0.0, sy=0.18, hry=0.25, hy=hs(-0.18))),
    (0.34, "smooth", {}),
], kind="roll", note="the board and she slid round 180° the short way, in her frame (the root's already round)")
# the powerslide (cess: the board across the way it goes): turned 90° with it, sat back on the heels, the heel edge
# scrubbing, the arms out ahead
clip("powerslide", 0.9, [
    (0.0, "smooth", {}),
    (0.12, "snap", dict(fy=PI / 2, hy=hs(-0.2), hz=-0.08, sx=0.05, hrx=0.0, hry=0.05, sy=0.02, cy=0.0, ny=0.05,
                        dy=0.08, br=0.0, Lf=0.7, Lo=0.35, Rf=0.65, Ro=0.35, Le=0.3, Re=0.3, Fh=0.1, Bh=-0.1)),
    (0.5, "sine", dict(hy=hs(-0.22), hz=-0.09, Lf=0.75, Rf=0.7)),
    (0.9, "sine", dict(hy=hs(-0.2), hz=-0.08, Lf=0.7, Rf=0.65)),
], hold=(0.12, 0.9), kind="roll")
# a stumble (a small slip — the ragdoll takes the big ones): the arms thrown, the back foot off and down
clip("stumble", 0.7, [
    (0.0, "smooth", {}),
    (0.08, "snap", dict(hy=hs(-0.22), sx=0.5, Lf=0.9, Lo=0.8, Rf=0.6, Ro=1.1, Blk=0.0, Bx=-0.4, By=0.0, Bz=0.15,
                        Bh=0.4, hz=0.05, bw=0.15)),
    (0.3, "out", dict(sx=0.2, Lf=0.2, Lo=1.2, Rf=-0.4, Ro=0.9, hy=hs(-0.16), sz=0.15)),
    (0.7, "smooth", dict(Blk=0.0, sz=0.0)),
], kind="roll", note="a slip; the board stays")
# getting on: the board dropped from the left hand at her side, the front foot on it, the back foot after
clip("geton", 0.45, [
    (0.0, "smooth", dict(Flk=0.0, Blk=0.0, Fx=0.1, Fy=0.0, Fz=0.12, Fox=0.0, Foy=-D, Bx=-0.2, By=0.0, Bz=-0.05,
                         Boy=-D, Fh=0.0, Bh=0.0, hy=HIP_H - 0.02, hry=0.0, sy=0.0, sx=0.05, ny=0.1, dy=0.5,
                         bx=0.18, by=0.62, bz=0.04, br=-1.45, bw=0.0, bp=1.35, **hand("L", "toe_f", 1.0))),
    (0.1, "in", dict(by=0.05, br=0.0, bp=0.0, bx=0.0, bz=0.0, Lik=0.0, Fy=0.0, Foy=0.0)),
    (0.2, "snap", dict(by=0.0, Flk=1.0, Fx=0.17, Fy=D, Fz=-0.035, Fh=0.45, hy=hs(-0.06), hry=0.2)),
    (0.32, "smooth", dict(Blk=1.0, Bx=-0.25, By=TAIL_Y, Bz=-0.03, Boy=0.0, Bh=-0.08, hy=hs(-0.09))),
    (0.45, "smooth", {}),
], kind="roll", hands_space={"L": "board"})
# stepping off: the back foot down, the tail stomped — the board up into the left hand
clip("kickup", 0.45, [
    (0.0, "smooth", {}),
    (0.1, "out", dict(Flk=0.0, Fx=0.25, Fy=0.0, Fz=0.12, Foy=-D, hy=hs(-0.05))),
    (0.18, "snap", dict(bp=0.9, px=TAIL_X + 0.02, py=0.0, pz=0.0, Bx=-0.3, By=0.11, Bt=0.3)),
    (0.3, "out", dict(Blk=0.0, Bx=-0.25, By=0.0, Bz=-0.1, Boy=-D, bp=1.5, bx=0.05, by=0.32, bz=0.12, br=-0.2,
                      **hand("L", "toe_f", 1.0), hy=HIP_H - 0.03, hry=0.1)),
    (0.45, "smooth", dict(bx=0.18, by=0.62, bz=0.04, br=-1.45, bp=1.35, hy=HIP_H - 0.02, hry=0.0, sx=0.05)),
], kind="roll", hands_space={"L": "board"})

# ══ manuals (a balance: −/+ the meter's ends, blended by (bal+1)/2 over the hold) ═══════════════════════════════
MAN = dict(bp=0.24, px=-AXLE_X, py=0.0, pz=0.0, hx=-0.07, hy=hs(-0.06), sx=0.2, Lo=0.75, Ro=0.75, Lf=0.25,
           Rf=0.1, Le=0.3, Re=0.3, dx=-0.12)
clip("manual", 1.2, [
    (0.0, "smooth", {}),
    (0.1, "snap", MAN),
    (0.65, "sine", dict(Lo=0.8, Ro=0.7, hx=-0.075)),
    (1.2, "sine", MAN),
], hold=(0.1, 1.2), kind="manual")
NMAN = dict(bp=-0.24, px=AXLE_X, py=0.0, pz=0.0, hx=0.07, hy=hs(-0.06), sx=0.24, Lo=0.75, Ro=0.75, Lf=0.1,
            Rf=0.25, Le=0.3, Re=0.3, Fx=0.21)
clip("nosemanual", 1.2, [
    (0.0, "smooth", {}),
    (0.1, "snap", NMAN),
    (0.65, "sine", dict(Lo=0.7, Ro=0.8, hx=0.075)),
    (1.2, "sine", NMAN),
], hold=(0.1, 1.2), kind="manual")
# the balance poses (additive: each against its trick's own hold)
clip("manual.bal-", 0.1, [(0.0, "smooth", mix(MAN, bp=0.34, hx=-0.12, sx=0.42, Lf=0.8, Rf=0.75, Lo=0.5, Ro=0.5))],
     kind="balance", note="tipping onto the tail")
clip("manual.bal+", 0.1, [(0.0, "smooth", mix(MAN, bp=0.1, hx=-0.01, sx=0.02, Lf=-0.3, Rf=-0.4, Lo=0.9, Ro=0.9))],
     kind="balance", note="tipping onto the nose")
clip("manual.bal0", 0.1, [(0.0, "smooth", MAN)], kind="balance")
# Hang Ten (the special nose manual): both feet on the nose, the arms up
HANG = mix(NMAN, Fx=0.3, Fy=0.11, Bx=0.12, By=D, Bh=0.3, Fh=0.6, hx=0.15, hy=hs(-0.02), sx=0.1, Lf=0.6, Rf=0.6,
           Lo=0.9, Ro=0.9, Le=0.1, Re=0.1, Lc=-1, Rc=-1, dx=0.1)
clip("hangten", 1.2, [
    (0.0, "smooth", {}),
    (0.12, "out", mix(NMAN, Bx=0.0, Bh=0.2, hy=hs(-0.03))),
    (0.28, "snap", HANG),
    (0.75, "sine", dict(Lf=0.7, Rf=0.55, sz=0.05)),
    (1.2, "sine", HANG),
], hold=(0.28, 1.2), kind="manual")

# ══ grinds and slides (the root on the rail's top) ═════════════════════════════════════════════════════════════
# (a real 50-50 on a ledge: the hips ~0.85–0.95 of the leg over the deck, the knees 45–80°, the trunk 25–40° over)
GR = mix(ARMS_OUT, LOOK_RAIL, hy=hs(-0.1), sx=0.36, hrx=0.16)
AX = -(WHEEL_R - 0.004)  # the axles on the rail


def grind(cid, pose, note="", into=0.09):
    clip(cid, 1.2, [
        (0.0, "smooth", mix(AIR)),
        (into, "back", mix(GR, pose)),
        (0.65, "sine", mix(GR, pose, Lo=1.08, Ro=0.92, sz=0.03)),
        (1.2, "sine", mix(GR, pose)),
    ], hold=(into, 1.2), kind="grind", note=note)


grind("fiftyfifty", dict(by=AX), "both trucks")
grind("fiveo", dict(by=AX, bp=0.2, px=-AXLE_X, py=0.0, hx=-0.06), "the back truck, the nose up")
grind("nosegrind", dict(by=AX, bp=-0.2, px=AXLE_X, py=0.0, hx=0.06), "the front truck, the tail up")
grind("crooked", dict(by=AX, bp=-0.24, px=AXLE_X, py=0.0, bw=0.32, br=-0.22, hx=0.07, Fh=0.55), "the front truck, the nose angled over")
grind("overcrook", dict(by=AX, bp=-0.22, px=AXLE_X, py=0.0, bw=-0.34, br=0.24, hx=0.07, hz=-0.03), "the front truck, the nose over the far side")
grind("smith", dict(by=AX, bp=-0.3, px=-AXLE_X, py=0.0, br=0.38, hx=-0.07, hz=0.05, Fkz=1.2), "the back truck, the front dipped below on the toe side")
grind("feeble", dict(by=AX, bp=-0.22, px=-AXLE_X, py=0.0, br=-0.36, hx=-0.07, hz=-0.04), "the back truck, the front over the far side")
SL_D = -(D - THICK)  # the deck's underside on the rail
grind("boardslide", dict(by=SL_D, ny=0.05, dy=0.05, dx=0.25, sy=0.0, hry=0.06, cy=0.0, Fh=0.1, hy=hs(-0.14)), "the deck across the rail")
grind("lipslide", dict(by=SL_D, ny=-0.05, dy=-0.05, dx=0.25, sy=-0.05, hry=0.0, cy=0.0, Fh=0.1, Bh=0.0, hy=hs(-0.14)), "the deck across, the tail over first")
SLIDE = dict(fy=PI / 2, ny=0.05, dy=0.08, dx=0.25, sy=0.0, hry=0.05, cy=0.0)
grind("noseslide", mix(SLIDE, by=-0.06, bp=-0.18, bz=0.0, bx=-0.3, Fh=0.3, hx=-0.12), "the nose's underside on the rail, the board across")
grind("tailslide", mix(SLIDE, by=-0.06, bp=0.18, bx=0.3, Bh=-0.3, hx=0.1), "the tail's underside on the rail, the board across")
grind("bluntslide", mix(SLIDE, by=-0.02, bp=0.55, px=TAIL_X, py=0.13, bx=0.34, hx=0.14, hy=hs(-0.1)), "the tail on the rail, the board up over it")
# the specials' slides: the Darkslide (the board upside down, the feet on its bottom), the Casper (flipped, the front
# foot hooked under its nose, the tail down on the rail)
DARK = dict(br=PI, by=-(D - THICK) + 0.012, Fy=D - THICK - 0.004, By=D - THICK - 0.004, Bx=-0.2, hy=hs(-0.08))
clip("darkslide", 1.2, [
    (0.0, "smooth", AIR),
    (0.14, "back", mix(GR, DARK)),
    (0.65, "sine", mix(GR, DARK, Lo=1.1, Ro=0.9)),
    (1.2, "sine", mix(GR, DARK)),
], hold=(0.14, 1.2), kind="grind", note="upside down, the feet on the graphic")
CASP = dict(br=PI, bp=-0.75, px=-0.2, py=D, by=0.18, Fy=D - THICK - 0.004, Fx=0.3, Bx=-0.2, By=D - THICK - 0.004,
            hy=hs(-0.06), hx=-0.05, sx=0.3, Fh=0.3)
clip("casper", 1.2, [
    (0.0, "smooth", AIR),
    (0.16, "back", mix(GR, CASP)),
    (0.65, "sine", mix(GR, CASP, Lo=1.12)),
    (1.2, "sine", mix(GR, CASP)),
], hold=(0.16, 1.2), kind="grind", note="flipped, the tail on the rail, the front foot under the nose")
# balance (additive, against the 50-50): leant to her heels (−) or her toes (+), the arms windmilling
clip("grind.bal0", 0.1, [(0.0, "smooth", mix(GR, by=AX))], kind="balance")
clip("grind.bal-", 0.1, [(0.0, "smooth", mix(GR, by=AX, hz=-0.07, sx=0.48, hrx=0.24, Lf=0.7, Rf=0.65, Lo=0.6,
                                              Ro=0.6, sz=0.06))], kind="balance", note="falling to her heels")
clip("grind.bal+", 0.1, [(0.0, "smooth", mix(GR, by=AX, hz=0.08, sx=0.02, hrx=0.0, Lf=-0.4, Rf=-0.45, Lo=1.25,
                                              Ro=1.2, sz=-0.06, dx=0.05))], kind="balance", note="falling to her toes")

# ══ lips (the root on the coping) ═══════════════════════════════════════════════════════════════════════════
LIP = mix(ARMS_OUT, hy=hs(-0.12), sx=0.2, dx=0.2, Lo=0.7, Ro=0.7)


def lip(cid, pose, dur=1.0, into=0.14, note=""):
    clip(cid, dur + 0.3, [
        (0.0, "smooth", AIR),
        (into, "back", mix(LIP, pose)),
        (dur * 0.6, "sine", mix(LIP, pose, Lo=0.8, Ro=0.6)),
        (dur, "sine", mix(LIP, pose)),
        (dur + 0.3, "out", mix(CROUCH, bp=0.0, bw=0.0, by=0.0, br=0.0, bx=0.0, bz=0.0, hx=0.0)),
    ], hold=(into, dur), out=dur, kind="lip", note=note)


lip("rocktofakie", dict(by=-(D - THICK), bp=-0.12, px=0.0, py=0.0, hx=0.02), note="the board's middle over the coping")
lip("axlestall", dict(by=AX, bp=0.12, px=-AXLE_X, py=0.0, hx=-0.08, hy=hs(-0.1)), note="the back truck on the coping")
lip("nosestall", dict(bp=-0.55, px=NOSE_X, py=0.0, bx=-NOSE_X + 0.04, by=0.02, hx=0.1, hy=hs(-0.12), sx=0.35),
    note="the nose on the coping, the tail up")
# the handplant: the back hand down on the coping, the whole of her turned over it (inv about her z), the board held
# up to her by the front hand on its heel edge
HP = mix(dict(inv=PI * 0.96, ivx=0.0, ivy=0.95, ivz=0.0, hy=hs(-0.3), by=0.36, bz=-0.05, sx=-0.1, hrx=-0.1,
              nx=-0.3, dx=-0.4, Rik=1.0, Rpx=0.08, Rpy=0.0, Rpz=0.02, Rc=-0.6, Lo=0.3),
         hand("L", "heel", 1.0))
clip("handplant", 1.5, [
    (0.0, "smooth", AIR),
    (0.12, "out", dict(Rik=1.0, Rpx=0.08, Rpy=0.0, Rpz=0.02, Rc=-0.6, hy=hs(-0.2))),
    (0.45, "in", mix(HP, inv=PI * 0.6)),
    (0.6, "back", HP),
    (1.05, "sine", mix(HP, inv=PI * 0.92, by=0.4)),
    (1.2, "sine", HP),
    (1.5, "out", mix(AIR, Rik=0.0, Lik=0.0, inv=0.0)),
], hold=(0.6, 1.2), out=1.2, kind="lip", hands_space={"R": "root", "L": "board"}, note="inverted over the hand")

# ══ walls ═══════════════════════════════════════════════════════════════════════════════════════════════════
# a wallride: the board on its side, its wheels to the wall (her toes' side), she leant out from it, low
WALL = mix(ARMS_OUT, br=-1.3, bz=0.08, by=0.08, hy=hs(-0.18), hz=-0.12, sx=0.0, hrx=-0.1, Lo=0.9, Ro=0.9, dx=0.1)
clip("wallride", 1.2, [
    (0.0, "smooth", AIR),
    (0.1, "back", WALL),
    (0.65, "sine", mix(WALL, Lo=1.0, Ro=0.8)),
    (1.2, "sine", WALL),
], hold=(0.1, 1.2), kind="wall")
# a wallplant: the back foot kicked off the wall (toe side), the board held to the front foot, and away
clip("wallplant", 0.4, [
    (0.0, "smooth", AIR),
    (0.06, "snap", mix(AIR, Blk=0.0, Bx=-0.22, By=0.2, Bz=0.38, Bh=0.2, Bt=-0.4, hy=hs(-0.22), sx=0.1, hz=-0.06,
                       Lo=0.9, Ro=0.9, Lf=0.4, Rf=0.2)),
    (0.2, "out", mix(AIR, Blk=0.0, Bx=-0.25, By=0.16, Bz=0.1)),
    (0.4, "smooth", AIR),
], kind="air")
# the spine transfer and the acid drop: airs of their own (a tuck and a reach for the far face)
clip("spine", 0.6, [
    (0.0, "smooth", AIR),
    (0.2, "smooth", mix(AIR, TUCK, Lo=0.8, Ro=0.8)),
    (0.6, "smooth", mix(AIR, hy=hs(-0.12), sx=0.4, dx=-0.3)),
], kind="air")
clip("acid", 0.6, [
    (0.0, "smooth", mix(AIR, hy=hs(-0.12))),
    (0.25, "smooth", mix(AIR, hy=hs(-0.1), sx=0.45, bp=-0.25, dx=-0.4, Lf=0.6, Rf=0.3)),
    (0.6, "smooth", mix(AIR, bp=-0.3, sx=0.4)),
], kind="air")

# ══ flips ═══════════════════════════════════════════════════════════════════════════════════════════════════
# Each by the board's turns (tricks.ts: roll about its length, yaw about its up, pitch across — whole turns) and the
# foot that does it: the front foot flicked off the heel edge (kickflip) or the toe edge (heelflip); the back foot's
# scoop for a shove-it, a varial, a hardflip, a 360; the back foot's wrap for an impossible. The board pops off the
# feet (they lift and spread over it), turns, and is caught (both feet stamped back on it: 3 frames) — then the
# knees take it down into the air pose.
FLIPS = {
    "kickflip": dict(roll=1, kick="F", side=-1),
    "heelflip": dict(roll=-1, kick="F", side=1),
    "shoveit": dict(yaw=0.5, kick="B", side=1),
    "impossible": dict(pitch=1, kick="B", side=0),
    "varial": dict(roll=1, yaw=0.5, kick="B", side=1),
    "varialheel": dict(roll=-1, yaw=-0.5, kick="F", side=1),
    "hardflip": dict(roll=1, yaw=-0.5, kick="F", side=-1, pitch_lean=0.5),
    "inwardheel": dict(roll=-1, yaw=0.5, kick="B", side=1),
    "treflip": dict(roll=1, yaw=1, kick="B", side=1),
    "shove360": dict(yaw=1, kick="B", side=1),
    "ghettobird": dict(roll=-1, yaw=0.5, kick="B", side=1, special=True),
}
FLIP_LEN = {"kickflip": 0.36, "heelflip": 0.36, "shoveit": 0.32, "impossible": 0.42, "varial": 0.42,
            "varialheel": 0.42, "hardflip": 0.42, "inwardheel": 0.42, "treflip": 0.5, "shove360": 0.48,
            "ghettobird": 0.75}


def flip(cid, f, n=1):
    """(plan 106, after real flips: the pop's spring is the ollie's; here, in the air) the kicking foot flicks off its
    edge — out to the side it flicks and up, its knee leading —, both legs drawn up and apart (the front foot toward the
    nose, the back toward the tail: they never cross), the board turning under the open legs; the catch: the front foot
    first, stamped onto the bolts, the back a frame after, the knees taking it; the arms thrown out by the flick and
    floating back."""
    L = FLIP_LEN[cid] * (1.55 if n > 1 else 1.0)
    roll = f.get("roll", 0) * TAU * n
    yaw = f.get("yaw", 0) * TAU * (n if not f.get("roll") and not f.get("pitch") else 1)
    pitch = f.get("pitch", 0) * TAU * (n if not f.get("roll") else 1)
    k = f["kick"]
    side = f["side"]
    other = "B" if k == "F" else "F"
    sx_ = 1 if k == "F" else -1  # (the kicking foot's own end of the board: the nose's or the tail's)
    # the flick: the kicking foot off its edge and out (a kickflip's to her heels, a heelflip's to her toes, a scoop's
    # behind with the tail), the other lifted off
    flick = {f"{k}lk": 0.0, f"{k}oy": 0.15, f"{k}oz": 0.17 * side, f"{k}ox": 0.1 * sx_, f"{k}t": 0.45,
             f"{k}kz": 1.0, f"{k}kx": 0.25 * sx_,
             f"{other}lk": 0.0, f"{other}oy": 0.12, f"{other}ox": -0.06 * sx_}
    if f.get("pitch") and not f.get("roll"):
        # (the impossible: the board wrapped up round the back foot, end over end)
        flick = {"Flk": 0.0, "Foy": 0.2, "Fox": 0.08, "Blk": 0.6, "Bt": 0.3}
    spin = dict(br=roll, bw=yaw, bp=pitch, by=0.07, px=0.0, py=D, pz=0.0)
    if f.get("pitch") and not f.get("roll"):
        spin.update(px=FOOT_B[0], py=D)
    # the legs open over it: up, the front toward the nose, the back toward the tail
    over = {"Flk": 0.0, "Blk": 0.0, "Foy": 0.2, "Boy": 0.18, "Fox": 0.08, "Box": -0.1, "Foz": 0.02, "Boz": 0.02,
            "Fkx": 0.15, "Bkx": -0.05, "Ft": 0.25, "Bt": 0.2}
    T = TUCK if f.get("special") else {}
    # (an odd number of half turns about its up: the board lands tail first — her feet go on it as they are, `sw`,
    # switched while both are off it, the board past its quarter turn)
    swap = dict(sw=1.0 if round(yaw / PI) % 2 else 0.0)
    arms_flick = dict(Lo=0.95 + 0.15 * (side < 0), Ro=0.9, Lf=0.35, Rf=-0.25 if k == "F" else 0.1, Le=0.4, Re=0.4)
    keys = [
        (0.0, "smooth", AIR),
        (0.05, "snap", mix(AIR, flick, arms_flick, dict(by=0.035, br=roll * 0.06, bw=yaw * 0.06,
                                                         bp=pitch * 0.08 + 0.12, sx=0.36, hy=hs(-0.2)))),
        (L * 0.5, "lin", mix(AIR, TUCK, T, over, spin, swap, dict(br=roll * 0.6, bw=yaw * 0.6, bp=pitch * 0.6, by=0.09,
                                                             sx=0.44, dx=-0.12, nx=-0.06, Lo=0.9, Ro=0.85,
                                                             hy=hs(-0.3)))),
        (L * 0.8, "out", mix(AIR, over, spin, dict(br=roll * 0.97, bw=yaw * 0.97, bp=pitch * 0.97, by=0.04,
                                                   Foy=0.03, Fox=0.02, Boy=0.08, Box=-0.04, Ft=0.0,
                                                   sx=0.42, dx=-0.1, hy=hs(-0.26)))),
        # (the catch: the front foot stamped first)
        (L * 0.88, "snap", mix(AIR, dict(br=roll, bw=yaw, bp=pitch, by=0.0, Flk=1.0, Blk=0.0, Foy=0.0, Fox=0.0,
                                         Foz=0.0, Boy=0.03, Box=-0.02, Ft=0.0, Bt=0.1, px=0.0, py=D, sx=0.4,
                                         hy=hs(-0.27)))),
        (L, "snap", mix(AIR, dict(br=roll, bw=yaw, bp=pitch, by=0.0, Flk=1.0, Blk=1.0, Boy=0.0, Box=0.0, Boz=0.0,
                                  Bt=0.0, px=0.0, py=D, sx=0.38, hy=hs(-0.25), Lo=0.8, Ro=0.75))),
        (L + 0.16, "smooth", mix(AIR, dict(br=roll, bw=yaw, bp=pitch, px=0.0, py=D))),
    ]
    clip(cid if n == 1 else f"{cid}.x2", L + 0.16, keys, kind="flip",
         note=f"roll {f.get('roll', 0) * n} yaw {f.get('yaw', 0)} pitch {f.get('pitch', 0)} turns, kicked by the {k}")


for fid, f in FLIPS.items():
    flip(fid, f)
    if not f.get("special"):
        flip(fid, f, 2)

# the Fingerflip Airwalk (special): the front hand flips the board by its nose, the legs walked out, caught
clip("fingerflip", 0.84, [
    (0.0, "smooth", AIR),
    (0.1, "out", mix(AIR, TUCK, FEET_OFF, hand("L", "nose", 1.0), Foy=0.1, Boy=0.1, by=0.25, bp=0.3, px=0.0, py=D,
                     sx=0.6, nx=-0.2, dx=-0.3)),
    (0.3, "lin", mix(AIR, FEET_OFF, Lik=0.0, Foz=0.32, Foy=0.0, Fox=0.1, Boz=-0.32, Boy=0.02, Bh=0.5, by=0.22, br=PI,
                     bp=0.2, Lf=1.2, Lo=0.6, Le=0.2, Rf=-0.6, Ro=0.6, Lc=-1.0, sx=0.1, hy=hs(-0.02))),
    (0.55, "lin", mix(AIR, FEET_OFF, Foz=0.3, Boz=-0.3, by=0.15, br=TAU * 0.92, bp=0.1, Lf=1.0, Rf=-0.5, hy=hs(-0.04))),
    (0.7, "snap", mix(AIR, br=TAU, bp=0.0, by=0.0, Flk=1.0, Blk=1.0, Foz=0.0, Boz=0.0, Foy=0.0, Boy=0.0,
                      Fox=0.0, Box=0.0)),
    (0.84, "smooth", mix(AIR, br=TAU)),
], kind="flip", note="special")

# ══ grabs (in → a held loop → out on letting go) ════════════════════════════════════════════════════════════════
def grab(cid, pose, into=0.16, hold_len=0.5, extra_feet=None, note=""):
    P = mix(AIR, TUCK, pose)
    P2 = mix(P, pose.get("_sway", {}))
    P.pop("_sway", None)
    P2.pop("_sway", None)
    clip(cid, into + hold_len + 0.22, [
        (0.0, "smooth", AIR),
        (into * 0.45, "in", mix(AIR, TUCK, {k: v for k, v in pose.items() if not k.endswith("ik") and k[0] in "hsdnc"},
                                sx=0.55)),
        (into, "back", P),
        (into + hold_len * 0.5, "sine", P2),
        (into + hold_len, "sine", P),
        (into + hold_len + 0.22, "out", mix(AIR, Lik=0.0, Rik=0.0)),
    ], hold=(into, into + hold_len), out=into + hold_len, kind="grab", note=note)


# (the front hand is her left, regular; the back her right)
grab("indy", mix(hand("R", "toe"), dict(br=-0.28, by=0.26, sx=0.4, cx=0.12, hy=hs(-0.26), hrx=0.2, Rf=0.6, Lo=1.0,
                                         Lf=0.5,
                                         dx=-0.25, _sway=dict(Lo=1.0, Lf=0.5))), note="the back hand on the toe edge between the feet")
grab("melon", mix(hand("L", "heel"), dict(br=0.3, by=0.2, sx=0.6, hy=hs(-0.38), Lo=0.4, Ro=0.95, Rf=0.2, sz=-0.1,
                                          hry=0.4, Fkx=0.8, _sway=dict(Ro=1.05))), note="the front hand behind the front leg on the heel edge")
grab("method", mix(hand("L", "heel"), dict(br=1.0, by=0.3, bz=-0.18, bp=0.1, sx=0.12, cx=-0.12, hrx=-0.15,
                                           hy=hs(-0.3), hz=0.06, Ro=1.25, Rf=0.35, Re=0.2, nx=0.05, dx=-0.15,
                                           Fkz=0.4, Bkz=0.4, Fky=-0.6, Bky=-0.6, sy=0.4, _sway=dict(br=1.08, Ro=1.3))),
     into=0.2, note="the front hand on the heel edge, the board pulled up behind her")
grab("stiffy", mix(hand("R", "toe"), dict(br=-0.35, by=0.32, bz=0.3, hy=hs(-0.18), sx=0.35, hrx=0.4, Lo=1.0, Lf=0.5,
                                           Fkz=1.0, Bkz=1.0, Fkx=0.2, Bkx=0.0, _sway=dict(br=-0.4))),
     into=0.2, note="the back hand on the toe edge, both legs straight, the board out ahead")
grab("nosegrab", mix(hand("L", "nose"), dict(bp=0.3, px=-0.1, py=D, by=0.2, sx=0.55, hy=hs(-0.36), hx=0.05,
                                              Ro=0.95, Rf=0.1, _sway=dict(bp=0.34))), note="the front hand on the nose")
grab("tailgrab", mix(hand("R", "tail"), dict(bp=-0.32, px=0.1, py=D, by=0.2, sx=0.5, hy=hs(-0.36), hx=-0.06, sz=0.08,
                                              Lo=0.95, Lf=0.3, _sway=dict(bp=-0.36))), note="the back hand on the tail")
grab("japan", mix(hand("L", "toe_f"), dict(br=-0.55, bp=0.3, by=0.2, bz=-0.12, px=0.0, sx=0.7, hy=hs(-0.42),
                                            hz=0.05, Ro=1.05, Rf=0.3, Fkz=0.5, Fky=-0.4, dx=-0.3,
                                            _sway=dict(br=-0.62))), into=0.2, note="the front hand on the toe edge by the nose, the board tucked up behind")
grab("madonna", mix(hand("L", "nose"), dict(Flk=0.0, Fox=0.12, Foy=-0.42, Foz=0.15, Fx=0.3, Fh=0.2, Ft=0.4, bp=0.55,
                                             px=FOOT_B[0], py=D, by=0.1, sx=0.25, hy=hs(-0.16), Ro=1.1, Rf=0.4,
                                             Fkx=0.0, Fkz=1.0, dx=-0.2, _sway=dict(bp=0.62, Foy=-0.46))),
     into=0.22, note="the front foot kicked off and down, the front hand holding the nose up")
grab("benihana", mix(hand("R", "tail"), dict(Blk=0.0, Box=-0.18, Boy=-0.34, Boz=0.3, Bh=0.3, Bt=0.3, bp=-0.35,
                                              px=FOOT_F[0], py=D, by=0.08, sx=0.32, hy=hs(-0.2), Lo=1.05, Lf=0.4,
                                              Bkx=-0.3, Bkz=1.0, _sway=dict(bp=-0.4, Boz=0.34))),
     into=0.2, note="the back foot kicked off ahead, the back hand holding the tail")
grab("airwalk", mix(hand("L", "nose"), dict(FEET_OFF, Foz=0.36, Foy=-0.02, Fox=0.06, Boz=-0.36, Boy=0.04, Bh=0.4,
                                            Fh=0.2, bw=0.35, bp=0.15, by=0.18, sx=0.12, hy=hs(-0.06), Ro=0.9,
                                            Rf=-0.5, Fkz=1.0, Bkz=1.0, _sway=dict(Foz=0.4, Boz=-0.4))),
     into=0.2, note="the legs walked off the board, the front hand on the nose")
grab("stalefish", mix(hand("R", "heel_r"), dict(br=0.35, by=0.2, sx=0.45, hy=hs(-0.38), sy=-0.3, hry=0.0, Lo=1.0,
                                                Lf=0.3, Rf=-0.3, _sway=dict(br=0.4))), note="the back hand behind the back leg on the heel edge")
# the specials' grabs
grab("christair", mix(hand("R", "toe_f"), dict(FEET_OFF, Foy=-0.04, Boy=-0.04, Fox=-0.05, Box=0.05, bx=-0.62,
                                               by=1.42, bz=0.0, br=0.0, bp=PI / 2, bw=0.0, px=0.0, py=D,
                                               hy=hs(0.02), sx=-0.12, hrx=-0.1, Lo=1.45, Lf=0.0, Le=0.0, Lc=-1.0,
                                               Fkz=1.0, Bkz=1.0, dx=-0.15, _sway=dict(Lo=1.5))),
     into=0.26, note="special: arms spread as a cross, the board held up high in the back hand")
grab("judo", mix(hand("L", "nose"), dict(Flk=0.0, Fox=0.1, Foy=-0.2, Foz=0.48, Fh=0.0, Ft=0.5, bp=0.45, px=FOOT_B[0],
                                          py=D, by=0.1, sx=0.15, hy=hs(-0.12), Ro=1.1, Rf=-0.2, Fkz=1.0, Fkx=0.0,
                                          _sway=dict(Foz=0.52))),
     into=0.22, note="special: the front foot kicked out ahead, the nose held")
# the McTwist (special): a 540 turned upside down (the step spins her; the clip turns her over) with a melon held
MT = mix(AIR, TUCK, hand("L", "heel"), dict(br=0.3, by=0.12, sx=0.6, hy=hs(-0.4), Ro=1.0, hry=0.3))
clip("mctwist", 1.1, [
    (0.0, "smooth", AIR),
    (0.15, "in", mix(MT, inv=0.0)),
    (0.55, "lin", mix(MT, inv=-PI, ivy=0.55)),
    (0.92, "out", mix(MT, inv=-TAU * 0.98, ivy=0.55)),
    (1.1, "smooth", mix(AIR, inv=-TAU, ivy=0.55, Lik=0.0)),
], kind="grab", note="special: inverted, a melon held")


def special_names():
    return {
        "mctwist": "McTwist", "christair": "Christ Air", "judo": "Judo", "ghettobird": "Ghetto Bird",
        "fingerflip": "Fingerflip Airwalk", "darkslide": "Darkslide", "casper": "Casper Slide",
        "hangten": "Hang Ten Nose Manual",
    }
