# Plan 92 (quality pass) — a car's GLB pointed at the shared textures: Blender's embedded images dropped, each
# material given its maps by name (texmap.py) as URIs — ours `tex/<name>.ktx2` beside the cars, the
# library's `../mat/<id>-<map>.ktx2` — with KHR_texture_basisu, and the tiles' repeats as KHR_texture_transform.
# One copy of each texture for every car on the server; the game shares them by URI.
#
#   link(path, depth)   (depth: how many folders below public/life/cars the GLB sits: extras/ and wheels/ are 1)
import json
import struct

import texmap

LIB_MAPS = ("albedo", "normal", "orm")


def _read(path):
    data = open(path, "rb").read()
    magic, ver, total = struct.unpack_from("<III", data, 0)
    off, js, binc = 12, None, b""
    while off < total:
        ln, kind = struct.unpack_from("<II", data, off)
        chunk = data[off + 8 : off + 8 + ln]
        if kind == 0x4E4F534A:
            js = json.loads(chunk)
        elif kind == 0x004E4942:
            binc = chunk
        off += 8 + ln
    return js, binc


def _write(path, js, binc):
    j = json.dumps(js, separators=(",", ":")).encode()
    j += b" " * ((4 - len(j) % 4) % 4)
    binc += b"\0" * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(j) + (8 + len(binc) if binc else 0)
    out = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(j), 0x4E4F534A) + j
    if binc:
        out += struct.pack("<II", len(binc), 0x004E4942) + binc
    open(path, "wb").write(out)


def _drop_images(js, binc):
    """The embedded images and their buffer views out; the binary chunk laid out again without them."""
    views = js.get("bufferViews", [])
    dead = {img["bufferView"] for img in js.get("images", []) if "bufferView" in img}
    js.pop("images", None)
    js.pop("textures", None)
    js.pop("samplers", None)
    for m in js.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        for k in ("baseColorTexture", "metallicRoughnessTexture"):
            pbr.pop(k, None)
        for k in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            m.pop(k, None)
        for ext in list((m.get("extensions") or {}).values()):
            for k in list(ext):
                if k.endswith("Texture"):
                    ext.pop(k)
    if not dead:
        return binc
    # every range into buffer 0: the kept views and meshopt's compressed data
    keep = [i for i in range(len(views)) if i not in dead]
    newbin = bytearray()
    remap = {}
    for i in keep:
        v = views[i]
        for holder in [v] + [(v.get("extensions") or {}).get("EXT_meshopt_compression")]:
            if holder is None or holder.get("buffer", 0) != 0:
                continue
            o, ln = holder.get("byteOffset", 0), holder["byteLength"]
            key = (o, ln)
            if key not in remap:
                while len(newbin) % 16:
                    newbin.append(0)
                remap[key] = len(newbin)
                newbin += binc[o : o + ln]
            holder["byteOffset"] = remap[key]
    # the views renumbered
    idx = {old: new for new, old in enumerate(keep)}
    js["bufferViews"] = [views[i] for i in keep]
    for a in js.get("accessors", []):
        if "bufferView" in a:
            a["bufferView"] = idx[a["bufferView"]]
        sp = a.get("sparse")
        if sp:
            sp["indices"]["bufferView"] = idx[sp["indices"]["bufferView"]]
            sp["values"]["bufferView"] = idx[sp["values"]["bufferView"]]
    for b in js.get("buffers", []):
        if "uri" not in b:
            b["byteLength"] = len(newbin)
    return bytes(newbin)


def link(path, depth=0):
    js, binc = _read(path)
    binc = _drop_images(js, binc)
    up = "../" * depth
    images, textures = [], []
    js["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]

    def tex(uri, tile):
        if uri not in [im["uri"] for im in images]:
            images.append({"uri": uri, "mimeType": "image/ktx2"})
        src = [im["uri"] for im in images].index(uri)
        textures.append({"sampler": 0, "extensions": {"KHR_texture_basisu": {"source": src}}})
        ref = {"index": len(textures) - 1}
        if tile:
            s = 1.0 / tile
            ref["extensions"] = {"KHR_texture_transform": {"scale": [s, s]}}
        return ref

    used_transform = False
    for m in js.get("materials", []):
        name = m.get("name", "").split(".")[0]
        pbr = m.setdefault("pbrMetallicRoughness", {})
        t = texmap.OWN.get(name)
        if t:
            tile = t.get("tile")
            used_transform |= bool(tile)
            if t.get("base"):
                pbr["baseColorTexture"] = tex(f"{up}tex/{t['base']}.ktx2", tile)
            if t.get("normal"):
                m["normalTexture"] = dict(tex(f"{up}tex/{t['normal']}.ktx2", tile), scale=t.get("ns", 1.0))
            if t.get("orm"):
                pbr["metallicRoughnessTexture"] = tex(f"{up}tex/{t['orm']}.ktx2", tile)
            if t.get("alpha"):
                m["alphaMode"] = t["alpha"]
                if t["alpha"] == "MASK":
                    m["alphaCutoff"] = 0.5
                pbr["baseColorFactor"] = pbr.get("baseColorFactor", [1, 1, 1, 1])[:3] + [1.0]
            continue
        lib = texmap.LIB.get(name)
        if lib:
            lid, metres = lib
            used_transform = True
            base = f"{up}../mat/{lid}"
            pbr["baseColorTexture"] = tex(f"{base}-albedo.ktx2", metres)
            m["normalTexture"] = tex(f"{base}-normal.ktx2", metres)
            pbr["metallicRoughnessTexture"] = tex(f"{base}-orm.ktx2", metres)
            m["occlusionTexture"] = tex(f"{base}-orm.ktx2", metres)
            # (the library's albedo carries the colour for woods; the fabrics' is grey, tinted by ours)
            if lid in ("walnut", "pine"):
                pbr["baseColorFactor"] = [1, 1, 1, 1]
            pbr["roughnessFactor"] = 1.0
            pbr["metallicFactor"] = pbr.get("metallicFactor", 0.0)
    if images:
        js["images"] = images
        js["textures"] = textures
        used = js.setdefault("extensionsUsed", [])
        req = js.setdefault("extensionsRequired", [])
        for e in ("KHR_texture_basisu",) + (("KHR_texture_transform",) if used_transform else ()):
            if e not in used:
                used.append(e)
        if "KHR_texture_basisu" not in req:
            req.append("KHR_texture_basisu")
    else:
        js.pop("samplers", None)
    _write(path, js, binc)
    return [im["uri"] for im in images]
