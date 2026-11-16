# Plan 92 — a contact sheet of stills (Blender's own image API; numpy is Blender's).
#   blender -b --factory-startup -P tools/art/cars/contact.py -- --dir design/cars --names a,b,c --cols 3
#       --out design/cars/0-sheet.png [--cell 900x520]
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1 :]


def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


D = arg("--dir")
names = arg("--names").split(",")
cols = int(arg("--cols", "3"))
W, H = (int(x) for x in arg("--cell", "900x520").split("x"))
GAP = 10
rows = (len(names) + cols - 1) // cols
sheet = np.full(((H + GAP) * rows - GAP, (W + GAP) * cols - GAP, 4), 0.05, np.float32)
sheet[..., 3] = 1
for i, name in enumerate(names):
    p = os.path.join(D, name + ".png")
    if not os.path.exists(p):
        continue
    im = bpy.data.images.load(p)
    im.scale(W, H)
    px = np.array(im.pixels[:], dtype=np.float32).reshape(H, W, 4)
    r, c = divmod(i, cols)
    y = (rows - 1 - r) * (H + GAP)
    x = c * (W + GAP)
    sheet[y : y + H, x : x + W] = px
out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0])
out.pixels.foreach_set(sheet.ravel())
out.filepath_raw = arg("--out")
out.file_format = "PNG"
out.save()
print("wrote", arg("--out"))
