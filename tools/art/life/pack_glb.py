# Plan 73, phase 1 — a life-look asset packed for the web: every texture in a .glb encoded to KTX2
# (Basis Universal: ETC1S for most — flat painted colour packs small; UASTC for skin, whose soft
# gradients band in ETC1S), the KHR_texture_basisu extension marked, the binary chunk laid out
# again (meshopt-compressed geometry, EXT_meshopt_compression, kept as Blender wrote it). Plain
# Python, no packages: the glTF container is read and written by hand.
#
#   python3 -I tools/art/life/pack_glb.py IN.glb OUT.glb [--basisu PATH] [--size 1024]
#
# The encoder is Basis Universal's `basisu`, built from source (docs/plan/73, "Rebuilding the assets").
import json
import os
import struct
import subprocess
import sys
import tempfile

args = sys.argv[1:]


def opt(name, default):
    return args[args.index(name) + 1] if name in args else default


src, dst = args[0], args[1]
BASISU = opt(
    "--basisu",
    os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/tools/basis_universal/bin/basisu"),
)
# which materials take UASTC (by name): the skin's gradients
UASTC = {"skin"}

with open(src, "rb") as f:
    data = f.read()
magic, version, total = struct.unpack_from("<III", data, 0)
assert magic == 0x46546C67 and version == 2, f"{src}: not a glb 2"
off = 12
gltf = None
binc = b""
while off < total:
    length, kind = struct.unpack_from("<II", data, off)
    chunk = data[off + 8 : off + 8 + length]
    if kind == 0x4E4F534A:
        gltf = json.loads(chunk)
    elif kind == 0x004E4942:
        binc = chunk
    off += 8 + length
assert gltf is not None

views = gltf.get("bufferViews", [])
images = gltf.get("images", [])
textures = gltf.get("textures", [])
materials = gltf.get("materials", [])

# which material each image serves (for its mode)
image_mat = {}
for m in materials:
    for slot in ("baseColorTexture",):
        t = (m.get("pbrMetallicRoughness") or {}).get(slot)
        if t is not None:
            image_mat[textures[t["index"]]["source"]] = m.get("name", "")

# ---- every range of buffer 0 something points at: the views, and meshopt's compressed data
ranges = []  # (holder dict, offset key, length key) — all into buffer 0
for v in views:
    if v.get("buffer", 0) == 0:
        ranges.append((v, "byteOffset", "byteLength"))
    ext = (v.get("extensions") or {}).get("EXT_meshopt_compression")
    if ext and ext.get("buffer", 0) == 0:
        ranges.append((ext, "byteOffset", "byteLength"))

# ---- the images, encoded
replaced = {}  # view index → new bytes
before = after = 0
with tempfile.TemporaryDirectory() as tmp:
    for i, img in enumerate(images):
        if "bufferView" not in img or img.get("mimeType") == "image/ktx2":
            continue
        vi = img["bufferView"]
        v = views[vi]
        raw = binc[v.get("byteOffset", 0) : v.get("byteOffset", 0) + v["byteLength"]]
        ext = ".png" if img.get("mimeType", "image/png") == "image/png" else ".jpg"
        inp = os.path.join(tmp, f"i{i}{ext}")
        out = os.path.join(tmp, f"i{i}.ktx2")
        with open(inp, "wb") as f:
            f.write(raw)
        mat = image_mat.get(i, "")
        if mat in UASTC:
            mode = ["-uastc", "-uastc_level", "2", "-uastc_rdo_l", "0.75"]
        else:
            mode = ["-quality", "90", "-effort", "4"]
        subprocess.run(
            [BASISU, "-ktx2", "-mipmap", "-quiet", *mode, inp, "-output_file", out],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        with open(out, "rb") as f:
            k = f.read()
        replaced[vi] = k
        before += len(raw)
        after += len(k)
        img["mimeType"] = "image/ktx2"
        print(f"  {img.get('name', i)} ({mat or '-'}): {len(raw) / 1e3:.0f} KB → {len(k) / 1e3:.0f} KB {'UASTC' if mat in UASTC else 'ETC1S'}")

# the textures take their image through the extension
for t in textures:
    if "source" in t and images[t["source"]].get("mimeType") == "image/ktx2":
        t.setdefault("extensions", {})["KHR_texture_basisu"] = {"source": t.pop("source")}
for key in ("extensionsUsed", "extensionsRequired"):
    lst = gltf.setdefault(key, [])
    if "KHR_texture_basisu" not in lst:
        lst.append("KHR_texture_basisu")

# ---- the binary chunk laid out again: each range once, in order, 16-aligned
seen = {}
out_bin = bytearray()
for holder, ok, lk in sorted(ranges, key=lambda r: r[0].get(r[1], 0)):
    start, length = holder.get(ok, 0), holder[lk]
    key = (start, length)
    vi = next((i for i, v in enumerate(views) if v is holder), None)
    if vi is not None and vi in replaced:
        body = replaced[vi]
        key = ("img", vi)
    else:
        body = binc[start : start + length]
    if key not in seen:
        while len(out_bin) % 16:
            out_bin.append(0)
        seen[key] = len(out_bin)
        out_bin += body
    holder[ok] = seen[key]
    holder[lk] = len(body)
while len(out_bin) % 4:
    out_bin.append(0)
gltf["buffers"][0]["byteLength"] = len(out_bin)

js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * ((4 - len(js) % 4) % 4)
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out_bin))
glb += struct.pack("<II", len(js), 0x4E4F534A) + js
glb += struct.pack("<II", len(out_bin), 0x004E4942) + bytes(out_bin)
with open(dst, "wb") as f:
    f.write(glb)
print(f"packed {os.path.basename(dst)}: {len(data) / 1e6:.2f} MB → {len(glb) / 1e6:.2f} MB (textures {before / 1e6:.2f} → {after / 1e6:.2f} MB)")
