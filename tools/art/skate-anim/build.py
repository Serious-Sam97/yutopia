# Plan 104 F4a — the skater's clips: authored as Blender actions, solved on the game's rig, written in the game's
# format.
#
#   blender -b --factory-startup -P tools/art/skate-anim/build.py -- [--only kickflip,indy] [--who man]
#           [--out apps/client/public/life/skate/anim.json] [--blend design/skate/anim104/clips.blend]
#
# 1. Each clip of clips.py becomes an Action on an empty (`ctl.<clip>`): a custom property per channel, keyed at the
#    clip's keys with Blender's own interpolation per key (BEZIER auto-clamped, BACK, EXPO, SINE, QUAD, LINEAR), the
#    arms' keys two frames late and the head's one (follow-through), a Cycles modifier on a looped clip's curves
#    (their handles cycle-aware). Saved with `--blend` to look at in Blender's graph editor.
# 2. The exporter evaluates the actions every frame at 60 fps and solves each frame on the rig (rig.py): the hips
#    placed and turned, the trunk, the arms by their angles or by IK to a board spot, the legs by IK to their soles'
#    targets (on the board, or off it), the board's place and turn — then writes the game's format, sampled at 30 fps:
#    each joint's three.js XYZ Euler, the hips' lift, the board's middle and turn (three.js YXZ: roll, yaw, pitch,
#    unwrapped), each foot's lock and its spot on the board, each hand's IK weight and its spot.
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rig as R  # noqa: E402

import clips as C  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", os.path.join(R.ROOT, "apps/client/public/life/skate/anim.json"))
BLEND = arg("--blend", "")
ONLY = set(arg("--only", "").split(",")) - {""}
WHO = arg("--who", "man")
FPS = 60
EXPORT_FPS = 30

EASE = {
    "smooth": ("BEZIER", "AUTO"),
    "lin": ("LINEAR", "AUTO"),
    "snap": ("EXPO", "EASE_OUT"),
    "in": ("QUAD", "EASE_IN"),
    "out": ("QUAD", "EASE_OUT"),
    "back": ("BACK", "EASE_OUT"),
    "sine": ("SINE", "EASE_IN_OUT"),
}
ARM_CH = ("f", "o", "t", "e", "wx", "wz", "c")
HEAD_CH = {"nx", "ny", "dx", "dy", "dz"}


def lag_of(ch):
    if ch[0] in "LR" and ch[1:] in ARM_CH:
        return 2
    if ch in HEAD_CH:
        return 1
    return 0


def author(spec):
    """The clip as an Action on its own empty: its channels keyed."""
    ob = bpy.data.objects.new(f"ctl.{spec['id']}", None)
    bpy.context.scene.collection.objects.link(ob)
    base = spec["base"]
    for ch, v in base.items():
        ob[ch] = float(v)
    act = bpy.data.actions.new(f"skate.{spec['id']}")
    ob.animation_data_create()
    ob.animation_data.action = act
    end = round(spec["dur"] * FPS)
    vals = dict(base)
    rows = []
    for t, ease, over in spec["keys"]:
        vals = {**vals, **over}
        rows.append((round(t * FPS), ease, dict(vals)))
    for ch in base:
        lag = lag_of(ch) if spec["lag"] else 0
        prev_f = -1
        pts = []
        for i, (f, ease, v) in enumerate(rows):
            ff = f
            if 0 < i < len(rows) - 1 and lag:
                ff = min(f + lag, rows[i + 1][0] - 1, end)
            ff = max(ff, prev_f + 1)
            prev_f = ff
            pts.append((ff, ease, v[ch]))
        for f, _e, v in pts:
            ob[ch] = float(v)
            ob.keyframe_insert(data_path=f'["{ch}"]', frame=f)
        fc = None
        for c in act_fcurves(act):
            if c.data_path == f'["{ch}"]':
                fc = c
                break
        if fc is None:
            continue
        kps = sorted(fc.keyframe_points, key=lambda k: k.co.x)
        for i, kp in enumerate(kps):
            # (a key's interpolation is the curve after it: the next key's ease)
            nxt = pts[i + 1][1] if i + 1 < len(pts) else "smooth"
            interp, easing = EASE[nxt]
            kp.interpolation = interp
            kp.easing = easing
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"
        if spec["loop"]:
            fc.modifiers.new("CYCLES")
        fc.update()
    return ob, act, end


def act_fcurves(act):
    """An action's F-curves (Blender 4.4+'s layered actions, or the old list)."""
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def sample(act, f):
    return {fc.data_path[2:-2]: fc.evaluate(f) for fc in act_fcurves(act)}


def hand_curl(c):
    """−1 open … 0 relaxed … 1 a grip … 2 a fist."""
    H = R.HANDS
    if c < 0:
        a, b, u = H["relaxed"], H["open"], min(1.0, -c)
    elif c <= 1:
        a, b, u = H["relaxed"], H["grip"], c
    else:
        a, b, u = H["grip"], H["fist"], min(1.0, c - 1)
    return tuple(a[i] + (b[i] - a[i]) * u for i in range(3))


Y = Vector((0, 1, 0))


def solve(rig, ch, spaces, prev=None):
    """One frame's channels → the game's pose and the board, feet and hands."""
    g = lambda k: ch[k]  # noqa: E731
    Rfy = Matrix.Rotation(g("fy"), 3, "Y")
    Rinv = Matrix.Rotation(g("inv"), 3, "Z")
    piv = Vector((g("ivx"), g("ivy"), g("ivz")))
    TR = Rinv @ Rfy

    def T(v):
        return Rinv @ (Rfy @ v - piv) + piv

    # the board: its points from its own frame to hers
    Rb0 = R.board_m(g("br"), g("bw"), g("bp"))
    P = Vector((g("px"), g("py"), g("pz")))
    off = Vector((g("bx"), g("by"), g("bz")))
    Rb = TR @ Rb0

    def B(p):
        return T(Rb0 @ (Vector(p) - P) + P + off)

    centre = B((0.0, C.D, 0.0))
    # the hips
    lift0 = Vector((g("hx"), g("hy") - R.HIP_H, g("hz")))
    hp0 = rig.rest_hips + lift0
    hr = TR @ R.e2m((g("hrx"), g("hry"), g("hrz")))
    hp = T(hp0)
    pose = {"hips": R.m2e(hr, prev and prev["j"]["hips"])}
    lift = hp - rig.rest_hips
    sx, sy, sz = g("sx"), g("sy"), g("sz")
    pose["spine"] = (sx, sy * 0.5, sz * 0.5)
    pose["chest"] = (g("cx"), sy * 0.5 + g("cy"), sz * 0.5 + g("cz"))
    pose["neck"] = (g("nx"), g("ny"), 0.0)
    pose["head"] = (g("dx"), g("dy"), g("dz"))
    # the legs: each sole to its target — on the board (its frame) or off it (hers, the board's turns not followed)
    feet = {}
    # (plan 106: `sw` — the board turned 180° under her feet: their spots and turns are the board's turned round)
    swapped = g("sw") > 0.5
    for key, S in (("F", "L"), ("B", "R")):
        p0 = Vector((g(f"{key}x"), g(f"{key}y"), g(f"{key}z")))
        o = Vector((g(f"{key}ox"), g(f"{key}oy"), g(f"{key}oz")))
        lk = max(0.0, min(1.0, g(f"{key}lk")))
        h0, t = g(f"{key}h"), g(f"{key}t")
        # (on the board: its own spot, turned round with it; off it, her space as keyed)
        p = Vector((-p0.x, p0.y, -p0.z)) if swapped else p0
        h = h0 + math.pi if swapped else h0
        sole_on = B(p)
        # (a sole on the board's bottom — a darkslide's, a casper's: the foot stood on it upside down with it)
        under = p.y < C.D - C.THICK * 0.5
        Rf = Rb @ Matrix.Rotation(math.pi, 3, "X") if under else Rb
        up_on = Rf @ Y
        sole_off = T(p0 + o)
        up_off = TR @ Y
        sole = sole_off.lerp(sole_on, lk)
        up = up_off.lerp(up_on, lk).normalized()
        rot_on = (Rf @ Matrix.Rotation(h, 3, "Y") @ Matrix.Rotation(t, 3, "X")).to_quaternion()
        rot_off = (TR @ Matrix.Rotation(h0, 3, "Y") @ Matrix.Rotation(t, 3, "X")).to_quaternion()
        frot = rot_off.slerp(rot_on, lk).to_matrix()
        ankle = sole + up * R.ANKLE
        pole = TR @ Vector((g(f"{key}kx"), g(f"{key}ky"), g(f"{key}kz")))
        th, kn, an = R.leg_ik(rig, S, hp, hr, ankle, pole, frot)
        pose[f"thigh{S}"] = th
        pose[f"knee{S}"] = (kn, 0.0, 0.0)
        pose[f"ankle{S}"] = an
        pose[f"toe{S}"] = (0.0, 0.0, 0.0)
        feet[S] = dict(lk=lk, p=tuple(p), h=h, t=t)
    # the arms: by their angles, or reached to a spot (IK), blended
    J = rig.fk(pose, tuple(lift))
    cp, cr = J["chest"]
    hands = {}
    for S, side in (("L", 1), ("R", -1)):
        fk_sh = R.e2m((-g(f"{S}f"), side * g(f"{S}t"), side * g(f"{S}o")))
        fk_el = -g(f"{S}e")
        w = max(0.0, min(1.0, g(f"{S}ik")))
        p = Vector((g(f"{S}px"), g(f"{S}py"), g(f"{S}pz")))
        sp = spaces.get(S, "board")
        if w > 1e-4:
            target = p.copy() if sp == "root" else B(p)
            pole = Vector((side * 0.6, -1.0, -0.45))
            ik_sh, ik_el = R.arm_ik(rig, S, cp, cr, target, pole)
            q = fk_sh.to_quaternion().slerp(R.e2m(ik_sh).to_quaternion(), w)
            sh = R.m2e(q.to_matrix())
            el = fk_el + (ik_el - fk_el) * w
        else:
            sh = R.m2e(fk_sh)
            el = fk_el
        pose[f"shoulder{S}"] = sh
        pose[f"elbow{S}"] = (el, 0.0, 0.0)
        pose[f"wrist{S}"] = (g(f"{S}wx"), 0.0, -side * g(f"{S}wz"))
        f, i, th_ = hand_curl(g(f"{S}c"))
        pose.update(R.hand_shape(side, f, i, th_))
        hands[S] = dict(w=w, p=tuple(p))
    # (each Euler the nearest to the last frame's: unwrapped)
    if prev:
        for j in R.JOINTS:
            if j in pose and j != "hips":
                pose[j] = R.m2e(R.e2m(pose[j]), prev["j"][j])
    be = R.board_e(Rb, prev and prev["be"])
    return dict(j=pose, lift=tuple(lift), bc=tuple(centre), be=be, feet=feet, hands=hands)


def q(v, n=3):
    return round(v, n) + 0.0


def export_clip(rig, spec, act, end):
    frames = []
    prev = None
    step = FPS // EXPORT_FPS
    fs = list(range(0, end + 1, step))
    if fs[-1] != end:
        fs.append(end)
    for f in fs:
        s = solve(rig, sample(act, f), spec["space"], prev)
        frames.append(s)
        prev = s
    chans = {}

    def put(name, vals, n=3):
        vs = [q(v, n) for v in vals]
        chans[name] = vs[0] if max(vs) - min(vs) < 10 ** -n else vs

    for j in R.JOINTS:
        for a, ax in enumerate("xyz"):
            put(f"{j}.{ax}", [fr["j"][j][a] for fr in frames])
    for a, ax in enumerate("xyz"):
        put(f"lift.{ax}", [fr["lift"][a] for fr in frames])
        put(f"bc.{ax}", [fr["bc"][a] for fr in frames])
        put(f"be.{ax}", [fr["be"][a] for fr in frames])
    for S in "LR":
        put(f"f{S}.lk", [fr["feet"][S]["lk"] for fr in frames], 2)
        for a, ax in enumerate("xyz"):
            put(f"f{S}.{ax}", [fr["feet"][S]["p"][a] for fr in frames])
        put(f"f{S}.h", [fr["feet"][S]["h"] for fr in frames])
        put(f"f{S}.t", [fr["feet"][S]["t"] for fr in frames])
        put(f"h{S}.w", [fr["hands"][S]["w"] for fr in frames], 2)
        for a, ax in enumerate("xyz"):
            put(f"h{S}.{ax}", [fr["hands"][S]["p"][a] for fr in frames])
    times = [round(f / FPS, 4) for f in fs]
    out = dict(
        dur=round(end / FPS, 4),
        n=len(frames),
        t=times,
        kind=spec["kind"],
        ch=chans,
        keys=[round(k[0], 4) for k in spec["keys"]],
    )
    if spec["loop"]:
        out["loop"] = True
    if spec["hold"]:
        out["hold"] = [round(spec["hold"][0], 4), round(spec["hold"][1], 4)]
    if spec["out"] is not None:
        out["out"] = round(spec["out"], 4)
    if spec["space"]:
        out["space"] = spec["space"]
    if spec["note"]:
        out["note"] = spec["note"]
    return out


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    rig = R.Rig(WHO)
    clips = {}
    for cid, spec in C.CLIPS.items():
        if ONLY and cid not in ONLY:
            continue
        _ob, act, end = author(spec)
        clips[cid] = export_clip(rig, spec, act, end)
        print(f"clip {cid}: {clips[cid]['dur']} s, {clips[cid]['n']} samples")
    doc = dict(
        version=1,
        about="plan 104 F4a: the skater's clips (tools/art/skate-anim). Her space: x her left, y up, z ahead; a regular "
        "rider (the board's nose to her left); joints three.js XYZ Euler; the board's turn three.js YXZ (roll, yaw, "
        "pitch) about its middle; feet and hands on the board in its own frame (street-pop's).",
        fps=EXPORT_FPS,
        rig=dict(who=WHO, HIP_H=round(R.HIP_H, 5), THIGH=round(R.THIGH, 5), ANKLE=R.ANKLE,
                 restHips=[round(v, 4) for v in rig.rest_hips]),
        board=dict(variant="street-pop", deckY=C.D, tailY=C.TAIL_Y, nose=C.NOSE_X, tail=C.TAIL_X, bolts=0.184,
                   width=0.205),
        joints=R.JOINTS,
        specials=C.special_names(),
        clips=clips,
    )
    if ONLY and os.path.exists(OUT):
        old = json.load(open(OUT))
        old["clips"].update(clips)
        doc["clips"] = old["clips"]
    with open(OUT, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print(f"wrote {OUT}: {len(doc['clips'])} clips, {os.path.getsize(OUT)} bytes")
    if BLEND:
        os.makedirs(os.path.dirname(BLEND), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
        print("saved", BLEND)


if __name__ == "__main__":
    main()
