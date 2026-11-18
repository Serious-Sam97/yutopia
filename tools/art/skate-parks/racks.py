# Plan 104 (docs/plan/104-the-skate-again.md F6a) — the parks' board racks (shared skate/racks.ts SKATE_RACKS: the
# game stands three boards in each, tails in the trough, decks leant back on the bar — tp/skate3d.ts rackGroup):
# the hall's a shop's wall rack in varnished hardwood on a ply back with its header; the yard's galvanised tube on
# base plates. In the rack's own frame: the floor's, its point the origin, facing north (−y), the boards' slots
# along x at −0.5, 0, 0.5, their bar 0.72 m up 0.18 m behind, the trough at their tails.
import pieces as P
import pkit as K
from hall import box


def rack(style):
    if style == "hall":
        # the ply back, its header plank, posts, the padded bar, the trough
        box("ply", -0.95, 0.24, 0.0, 0.95, 0.27, 1.35)
        box("wood", -0.98, 0.2, 1.35, 0.98, 0.28, 1.5)
        for x in (-0.92, 0.92):
            box("wood", x - 0.04, 0.12, 0.0, x + 0.04, 0.24, 1.35)
        P.tube("rubber", [(-0.92, 0.18, 0.72), (0.92, 0.18, 0.72)], 0.025, K.st("tube"))
        box("wood", -0.92, -0.06, 0.0, 0.92, 0.12, 0.03)
        for x in (-0.92, 0.92):
            box("wood", x - 0.02, -0.06, 0.03, x + 0.02, 0.12, 0.09)
        box("wood", -0.92, -0.08, 0.03, 0.92, -0.05, 0.08)
        # (dividers between the slots on the bar)
        for x in (-0.25, 0.25):
            box("wood", x - 0.015, 0.12, 0.62, x + 0.015, 0.24, 0.82)
        # (a sticker sheet of tags on its back)
        K.face("tags", [(-0.8, 0.235, 0.95), (-0.35, 0.235, 0.95), (-0.35, 0.235, 1.3), (-0.8, 0.235, 1.3)], [(0.25, 0.75), (0, 0.75), (0, 1), (0.25, 1)], n=(0, -1, 0))
        K.face("tags", [(0.35, 0.235, 0.95), (0.8, 0.235, 0.95), (0.8, 0.235, 1.3), (0.35, 0.235, 1.3)], [(0.75, 0.25), (0.5, 0.25), (0.5, 0.5), (0.75, 0.5)], n=(0, -1, 0))
        return
    # the yard's: galvanised tube uprights on plates, a bar, a low rail, the trough
    for x in (-0.92, 0.92):
        P.tube("tube", [(x, 0.2, 0.0), (x, 0.2, 1.05)], 0.024, K.st("tube"))
        P.boxy("galv", (x, 0.2), (0.08, 0.08), 0.0, 0.0, 0.008)
    P.tube("tube", [(-0.92, 0.2, 1.05), (0.92, 0.2, 1.05)], 0.024, K.st("tube"))
    P.tube("rubber", [(-0.92, 0.18, 0.72), (0.92, 0.18, 0.72)], 0.026, K.st("tube"))
    P.tube("tube", [(-0.92, 0.05, 0.06), (0.92, 0.05, 0.06)], 0.02, K.st("tube"))
    box("galv", -0.92, -0.06, 0.0, 0.92, 0.12, 0.02)
    box("paint_yellow", -0.7, 0.215, 0.9, 0.7, 0.225, 1.02)
