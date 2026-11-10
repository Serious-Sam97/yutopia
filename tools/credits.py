# Plan 75 — the credits: apps/client/public/credits.json (the game's Credits page and /credits read it),
# and each person file built from another's work stamped with its credit (glTF's asset.copyright).
#   python3 tools/credits.py
# Groups:
#   hair    the works by others (CC BY 4.0) — tools/art/life/sources.json, the files each one is in (by
#           hair.py's WARDROBE_HAIR and the beards' strands); a credit is owed for each
#   people  MakeHuman (CC0) — the bodies, skins and its hairs; courtesy
#   sounds  every sound by others (CC0) — read from public/sfx/CREDITS.md; courtesy
#   code    the client's libraries as shipped — their licence and its text (MIT, Apache 2.0 ask for it)
# Also `wardrobe`: every wardrobe hair → what it's made from (a work's key, "fur", "makehuman", "ours"),
# for the test that nothing built from a work goes uncredited (life-credits.test.ts).
import ast
import json
import os
import re
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIFE = os.path.join(ROOT, "tools/art/life")
CLIENT = os.path.join(ROOT, "apps/client")
OUT = os.path.join(CLIENT, "public/credits.json")
CC0 = {"license": "CC0 1.0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/"}


def literal(path, name):
    """A dict literal assigned to `name` in a Python file — read, not imported (no Blender, no numpy)."""
    tree = ast.parse(open(path).read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise KeyError(name)


def hair_group():
    sources = json.load(open(os.path.join(LIFE, "sources.json")))
    wardrobe = literal(os.path.join(LIFE, "hair.py"), "WARDROBE_HAIR")
    beards = literal(os.path.join(LIFE, "hair.py"), "BEARD_FUR_SPEC")
    files = {k: [] for k in sources}
    for name, src in wardrobe.items():
        if src in files:
            files[src].append(f"hair-{name}")
    # (the beards' strands: every style that keeps them — make_beard_fur)
    files["sfbeard"] = [f"beard-{s}" for s, (_l, _h, keep) in beards.items() if keep is not None]
    works = []
    for key, e in sources.items():
        if not files[key]:
            continue  # (not in the game: nothing to credit)
        works.append({
            "key": key, "title": e["title"], "author": e["author"], "author_url": e["author_url"],
            "source": e["source"], "license": e["license"], "license_url": e["license_url"],
            "change": e["change"], "files": files[key],
        })  # fmt: skip
    made = {}
    for name, src in wardrobe.items():
        made[f"hair-{name}"] = src if src in sources else ("fur" if src.startswith("fur:") else "makehuman")
    return works, made


def people_group():
    return [{
        "title": "MakeHuman", "author": "the MakeHuman team and community",
        "author_url": "http://www.makehumancommunity.org/", "source": "http://www.makehumancommunity.org/",
        **CC0, "change": "The people's bodies, faces, skins, eyes and clothes helpers, and the hairs braids, "
        "crew, slick and pixie: shaped, re-skinned and fitted for Yutopia.",
    }]  # fmt: skip


def sounds_group():
    text = open(os.path.join(CLIENT, "public/sfx/CREDITS.md"), encoding="utf-8").read()
    out, seen = [], set()

    def add(title, author, url):
        title, author = " ".join(title.split()), " ".join(author.split())  # (wrapped over lines in the .md)
        if (title, author) not in seen:
            seen.add((title, author))
            out.append({"title": title, "author": author.strip(), "source": url, **CC0})

    for title, author, fs, oga in re.findall(
        r"\*([^*]+)\*\s+by\s+([^(*,]+?)\s+\((?:Freesound\s+(\d+)|OpenGameArt,\s+([\w-]+))\)", text
    ):
        add(title, author, f"https://freesound.org/s/{fs}/" if fs else f"https://opengameart.org/content/{oga}")
    for title, author, url in re.findall(r"\*([^*]+)\* by ([^,(]+?)[,\s][^h]*?(https://\S+?)[\s)]", text):
        add(title, author, url.rstrip(".,"))
    return out


def code_group():
    deps = json.load(open(os.path.join(CLIENT, "package.json")))["dependencies"]
    out = []
    for name in sorted(deps):
        d = os.path.join(CLIENT, "node_modules", name)
        if name.startswith("@yutopia/") or not os.path.exists(os.path.join(d, "package.json")):
            continue
        out.append(package(d))
    # (the physics: our build of JoltPhysics.js, packages/jolt)
    out.append(package(os.path.join(ROOT, "packages/jolt"), title="JoltPhysics.js (Jolt Physics)",
                       url="https://github.com/jrouwe/JoltPhysics.js"))  # fmt: skip
    return out


def package(d, title=None, url=None):
    j = json.load(open(os.path.join(d, "package.json")))
    repo = j.get("repository")
    repo = repo.get("url") if isinstance(repo, dict) else repo
    if repo and not repo.startswith(("http", "git")):
        repo = f"https://github.com/{repo}"
    repo = re.sub(r"^git\+|\.git$", "", (repo or "").replace("git://", "https://").replace("git@github.com:", "https://github.com/"))
    lic_file = next((f for f in sorted(os.listdir(d)) if re.match(r"(?i)^(licen[cs]e|copying)", f)), None)
    return {
        "title": title or j["name"], "version": j.get("version"), "license": j.get("license"),
        "source": url or j.get("homepage") or repo,
        "text": open(os.path.join(d, lic_file), encoding="utf-8").read().strip() if lic_file else None,
    }  # fmt: skip


def stamp(works):
    """Each file built from a work carries its credit in glTF's asset.copyright (a file passed around
    alone still names its author) — both people's copies."""
    for w in works:
        line = f"{w['title']} by {w['author']} ({w['source']}), {w['license']} — modified for Yutopia: {w['change']}"
        for who in ("man", "woman"):
            for f in w["files"]:
                path = os.path.join(CLIENT, "public/life", f"wear-{who}", f"{f}.glb")
                if os.path.exists(path):
                    set_copyright(path, line)


def set_copyright(path, line):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20 : 20 + n])
    if j["asset"].get("copyright") == line:
        return
    j["asset"]["copyright"] = line
    js = json.dumps(j, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    js += b" " * (-len(js) % 4)
    rest = b[20 + n :]
    total = 12 + 8 + len(js) + len(rest)
    open(path, "wb").write(b[:8] + struct.pack("<I", total) + struct.pack("<I", len(js)) + b"JSON" + js + rest)


if __name__ == "__main__":
    works, made = hair_group()
    data = {
        "hair": works,
        "people": people_group(),
        "sounds": sounds_group(),
        "code": code_group(),
        "wardrobe": made,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    stamp(works)
    print(f"credits: {len(works)} works by others, {len(data['sounds'])} sounds, {len(data['code'])} libraries → {os.path.relpath(OUT, ROOT)}")
