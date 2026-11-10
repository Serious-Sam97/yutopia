# Plan 75 — the works by others in the people (CC BY 4.0, from Sketchfab): `sources.json` is the one list.
# Each entry: the download's folder under $HAIR_IMPORTS (yutopia-art-src/sketchfab — the downloads stay
# out of git, as MakeHuman's sources do), how it's extracted (sf_extract.py's settings), how it's built
# (hair.py make_imported's options), the change line the credits print — and its credit, read here from
# the download's own license.txt (title, author, links, licence), never typed by hand.
#   python3 tools/art/life/sources.py credits         — fill the credits; copy each licence to licenses/
#   python3 tools/art/life/sources.py extract [key…]  — run sf_extract.py for each (Blender)
#   python3 tools/art/life/sources.py sheet           — bake the strand sheet ($HAIR_IMPORTS/hair-sheet.npy)
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIST = os.path.join(HERE, "sources.json")
IMPORTS = os.environ.get("HAIR_IMPORTS", os.path.expanduser("~/Developer/projects/yondra/yutopia-art-src/sketchfab"))
BLENDER = os.environ.get("BLENDER", "blender")


def load():
    return json.load(open(LIST))


def save(S):
    with open(LIST, "w") as f:
        f.write(json.dumps(S, indent=2, ensure_ascii=False) + "\n")


def credits():
    S = load()
    os.makedirs(os.path.join(HERE, "licenses"), exist_ok=True)
    for key, e in S.items():
        path = os.path.join(IMPORTS, e["dir"], "x", "license.txt")
        text = open(path, encoding="utf-8").read()

        def field(name):
            m = re.search(rf"^\* {name}:\s*(.+)$", text, re.M)
            return m.group(1).strip() if m else None

        author = field("author")
        lic = field("license type")
        am = re.match(r"(.*?)\s*\((https?://[^)]+)\)", author or "")
        lm = re.match(r"(.*?)\s*\((https?://[^)]+)\)", lic or "")
        e["title"] = field("title")
        e["source"] = field("source")
        e["author"], e["author_url"] = (am.group(1), am.group(2)) if am else (author, None)
        lid, lurl = (lm.group(1), lm.group(2)) if lm else (lic, None)
        e["license"] = {"CC-BY-4.0": "CC BY 4.0"}.get(lid, lid)
        e["license_url"] = (lurl or "").replace("http://", "https://")
        shutil.copy(path, os.path.join(HERE, "licenses", f"{key}.txt"))
        print(f"{key}: {e['title']} — {e['author']} ({e['license']})")
    save(S)


def extract(keys):
    S = load()
    for key in keys or list(S):
        e = S[key]
        d = os.path.join(IMPORTS, e["dir"])
        env = {**os.environ, **e["extract"]}
        cmd = [BLENDER, "-b", "--factory-startup", "-P", os.path.join(HERE, "sf_extract.py"), "--",
               os.path.join(d, "x", "scene.gltf"), os.path.join(d, e["out"])]  # fmt: skip
        out = subprocess.run(cmd, env=env, capture_output=True, text=True)
        print(key, "→", next((ln for ln in out.stdout.splitlines() if ln.startswith("extracted")), out.stderr[-400:]))


def sheet():
    out = os.path.join(IMPORTS, "hair-sheet.png")
    env = {**os.environ, "SHEET": "1"}
    subprocess.run([BLENDER, "-b", "--factory-startup", "-P", os.path.join(HERE, "bake_hair_atlas.py"), "--", out],
                   env=env, check=True, capture_output=True)  # fmt: skip
    os.replace(out + ".npy", os.path.join(IMPORTS, "hair-sheet.npy"))
    print("baked", os.path.join(IMPORTS, "hair-sheet.npy"))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "credits"
    {"credits": lambda: credits(), "extract": lambda: extract(sys.argv[2:]), "sheet": lambda: sheet()}[cmd]()
