# Plan 79/80 — posing the life man in Blender for the guns' mocks (tools/art/guns/mock.py, mock80.py): his
# body from public/life/person-man.glb, the arms by a two-bone solve setting the whole hand (along it, its
# index side), the fingers curled, a gun placed by its grip point. The rig's bones are joints: each bone's
# head is its joint, its tail points up. The man faces −y; his left is +x; up is +z.
import math
import os

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.join(os.path.dirname(__file__), "../../..")
FWD = Vector((0, -1, 0))
UP = Vector((0, 0, 1))
LEFT = Vector((1, 0, 0))


def man():
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "apps/client/public/life/person-man.glb"))
    for o in list(bpy.data.objects):
        if o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o)
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    return rig


class Pose:
    def __init__(self, rig):
        self.rig = rig
        self.b = rig.data.bones
        self.p = rig.pose.bones

    def reset(self):
        for pb in self.p:
            pb.matrix_basis = Matrix.Identity(4)
        self.upd()

    def upd(self):
        bpy.context.view_layer.update()

    def head(self, n):
        return self.p[n].head.copy()

    def rest(self, n):
        return self.b[n].head_local.copy()

    def turn(self, n, axis, ang):
        """Turn a bone (and all under it) about its own joint, `axis` in the rig's space."""
        h = self.head(n)
        R = Matrix.Rotation(ang, 4, Vector(axis).normalized())
        self.p[n].matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ self.p[n].matrix
        self.upd()

    def set_frame(self, n, R3, at):
        rest3 = self.b[n].matrix_local.to_3x3()
        self.p[n].matrix = Matrix.Translation(at) @ (R3 @ rest3).to_4x4()
        self.upd()

    def cur3(self, n):
        """How a bone is turned from its rest (rig space), now."""
        return self.p[n].matrix.to_3x3() @ self.b[n].matrix_local.to_3x3().inverted()


def frame(a, b):
    a = a.normalized()
    b = (b - a * a.dot(b)).normalized()
    return Matrix((a, b, a.cross(b))).transposed()


def hand_rest(P, S):
    """The hand's own axes at rest: along it (wrist → knuckles), toward the index side; the palm's
    middle from the wrist."""
    w = P.rest(f"wrist{S}")
    f = P.rest(f"fingers{S}")
    i = P.rest(f"index{S}")
    L = (f - w).normalized()
    I = (i - f) - L * L.dot(i - f)
    palm = Vector((1, 0, 0)) if S == "R" else Vector((-1, 0, 0))
    c = w + (f - w) * 0.55 + palm * 0.022
    return L, I.normalized(), c - w


def arm(P, S, grip, L, I, pole):
    """The arm `S` set so the palm's middle is at `grip`, the hand along L with its index side toward I,
    the elbow out toward `pole`. Out of reach: the arm straight toward it."""
    L0, I0, c0 = hand_rest(P, S)
    Rh = frame(L, I) @ frame(L0, I0).transposed()
    W = grip - Rh @ c0
    s, e, wr = f"shoulder{S}", f"elbow{S}", f"wrist{S}"
    S0, E0, W0 = P.rest(s), P.rest(e), P.rest(wr)
    l1, l2 = (E0 - S0).length, (W0 - E0).length
    Sp = P.head(s)
    d = W - Sp
    dist = min(d.length, (l1 + l2) * 0.999)
    n = d.normalized()
    a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    pv = (pole - n * n.dot(pole)).normalized()
    E = Sp + n * a + pv * h
    Wr = Sp + n * dist
    back = Vector((0, 1, 0))
    P.set_frame(s, frame(E - Sp, pv) @ frame(E0 - S0, back).transposed(), Sp)
    P.set_frame(e, frame(Wr - E, pv) @ frame(W0 - E0, back).transposed(), E)
    P.set_frame(wr, Rh, Wr)
    return (W - Wr).length  # (how far short the hand fell)


def curl(P, S, fingers=1.2, index=1.2, thumb=0.6):
    """Close the hand: each finger's joints turned toward the palm (rad at each)."""
    L0, I0, _ = hand_rest(P, S)
    for chain, k in ((("fingers", "fingers2", "fingers3"), fingers), (("index", "index2", "index3"), index)):
        for j, b in enumerate(chain):
            R = P.cur3(f"wrist{S}")
            L = R @ L0
            I = R @ I0
            palm = L.cross(I) if S == "L" else I.cross(L)
            ax = L.cross(palm)
            P.turn(f"{b}{S}", ax, k * (0.9, 1.0, 0.7)[j])
    for j, b in enumerate(("thumb", "thumb2", "thumb3")):
        R = P.cur3(f"wrist{S}")
        P.turn(f"{b}{S}", R @ L0, (thumb if S == "L" else -thumb) * (0.6, 0.4, 0.3)[j])


def place(g, at, f, u):
    """A gun's grip point at `at`, its barrel along f, its top along u."""
    f = f.normalized()
    u = (u - f * f.dot(u)).normalized()
    left = u.cross(f)
    g.root.matrix_world = Matrix.Translation(at) @ Matrix((f, left, u)).transposed().to_4x4()
    bpy.context.view_layer.update()


def world(g, name):
    return g.root.matrix_world @ g.points[name]


def stance(P, blade, legs=True, crouch=0.0):
    """The trunk turned `blade` rad toward the right (bladed); the left foot a little ahead, knees soft."""
    P.turn("spine", UP, -blade * 0.5)
    P.turn("chest", UP, -blade * 0.5)
    if legs:
        X = Vector((1, 0, 0))
        P.turn("thighL", X, -0.16 - crouch)
        P.turn("kneeL", X, 0.2 + crouch)
        P.turn("thighR", X, 0.1 - crouch)
        P.turn("kneeR", X, 0.12 + crouch)


def look(P, f, down=0.0, side=0.0):
    """The head turned along f (and down / toward the right a little: onto a stock)."""
    cur = P.cur3("head") @ Vector((0, -1, 0))
    P.turn("neck", cur.cross(f), cur.angle(f) * 0.4)
    P.turn("head", Vector((1, 0, 0)), down)
    if side:
        P.turn("head", FWD, side)
