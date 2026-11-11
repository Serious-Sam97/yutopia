# Plan 79, phase 0 — the review sheets: today beside the mocks, and the guns three-quarter; two to a
# row (Blender's own image API).
#   blender -b --factory-startup -P tools/art/guns/contact.py
import os

import bpy
import numpy as np

D = os.path.join(os.path.dirname(__file__), "../../../design/guns")
SHEETS = {
    "0-sheet": [
        ("0-today-revolver-ready", "0-today-revolver-aim"),
        ("0-aw2-revolver-ready", "0-aw2-revolver-aim"),
        ("0-aw2-ak47-aim", "0-aw2-daybreak-aim"),
        ("0-aw2-shotgun-aim", "0-aw2-sniper-scope"),
    ],
    # the guns three-quarter (1200 × 800 each)
    "0-guns": [
        ("0-blockout-revolver", "0-blockout-shotgun"),
        ("0-blockout-ak47", "0-blockout-sniper"),
        ("0-blockout-daybreak", None),
    ],
}
GAP = 12


def load(name, w, h):
    im = bpy.data.images.load(os.path.join(D, name + ".png"))
    im.scale(w, h)
    return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)


for out_name, rows in SHEETS.items():
    W, H = (960, 540) if out_name == "0-sheet" else (900, 600)
    sheet = np.full(((H + GAP) * len(rows) - GAP, W * 2 + GAP, 4), 0.06, np.float32)
    sheet[..., 3] = 1
    for r, row in enumerate(rows[::-1]):  # (Blender's pixels start at the bottom)
        for c, name in enumerate(row):
            if name:
                y, x = r * (H + GAP), c * (W + GAP)
                sheet[y : y + H, x : x + W] = load(name, W, H)
    out = bpy.data.images.new(out_name, sheet.shape[1], sheet.shape[0])
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(D, out_name + ".png")
    out.file_format = "PNG"
    out.save()
    print("wrote", out.filepath_raw)
