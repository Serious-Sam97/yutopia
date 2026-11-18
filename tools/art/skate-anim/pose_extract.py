# Plan 106 — 3D motion from real skaters' footage (MediaPipe Pose, Apache-2.0, on this Mac's CPU).
#
# Each clip in footage/ (Pexels stock, see sources.md) → poses/<id>.json: per frame the 33 world landmarks (metres,
# the hips' middle the origin, MediaPipe's axes: x the image's right, y down, z away from the camera), each one's
# visibility, and the image landmarks (0..1) — plus poses/<id>-sheet.jpg, a contact sheet of frames with the skeleton
# drawn over them (to see where the model held and where it lost her).
#
#   tools/art/skate-anim/.venv/bin/python -I tools/art/skate-anim/pose_extract.py [--only 9723989,5039533]
import argparse
import json
import os
import sys

import cv2
import mediapipe as mp
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FOOT = os.path.join(HERE, "footage")
OUT = os.path.join(HERE, "poses")
MODEL = os.path.join(HERE, "models", "pose_landmarker_heavy.task")

EDGES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27),
         (27, 29), (29, 31), (27, 31), (24, 26), (26, 28), (28, 30), (30, 32), (28, 32), (0, 11), (0, 12)]


def run(path, cid):
    BaseOptions = mp.tasks.BaseOptions
    PoseLandmarker = mp.tasks.vision.PoseLandmarker
    Opts = mp.tasks.vision.PoseLandmarkerOptions
    opts = Opts(base_options=BaseOptions(model_asset_path=MODEL), running_mode=mp.tasks.vision.RunningMode.VIDEO,
                num_poses=1, min_pose_detection_confidence=0.4, min_pose_presence_confidence=0.4,
                min_tracking_confidence=0.4)
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames = []
    thumbs = []
    with PoseLandmarker.create_from_options(opts) as lm:
        i = 0
        while True:
            ok, img = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            r = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(i * 1000 / fps))
            f = None
            if r.pose_world_landmarks:
                w = r.pose_world_landmarks[0]
                n = r.pose_landmarks[0]
                f = dict(
                    w=[[round(p.x, 4), round(p.y, 4), round(p.z, 4)] for p in w],
                    v=[round(p.visibility or 0, 2) for p in n],
                    im=[[round(p.x, 4), round(p.y, 4)] for p in n],
                )
            frames.append(f)
            if i % max(1, int(fps / 4)) == 0:
                t = img.copy()
                if f:
                    for a, b in EDGES:
                        pa = (int(f["im"][a][0] * W), int(f["im"][a][1] * H))
                        pb = (int(f["im"][b][0] * W), int(f["im"][b][1] * H))
                        c = (0, 255, 0) if min(f["v"][a], f["v"][b]) > 0.5 else (0, 0, 255)
                        cv2.line(t, pa, pb, c, max(2, W // 300))
                cv2.putText(t, f"{i}", (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 255), 3)
                s = 240 / max(W, H)
                thumbs.append(cv2.resize(t, (int(W * s), int(H * s))))
            i += 1
    cap.release()
    os.makedirs(OUT, exist_ok=True)
    json.dump(dict(id=cid, fps=fps, w=W, h=H, frames=frames), open(os.path.join(OUT, f"{cid}.json"), "w"))
    if thumbs:
        cols = 8
        th, tw = thumbs[0].shape[:2]
        rows = (len(thumbs) + cols - 1) // cols
        sheet = np.zeros((rows * th, cols * tw, 3), np.uint8)
        for k, t in enumerate(thumbs):
            y, x = divmod(k, cols)
            sheet[y * th : y * th + t.shape[0], x * tw : x * tw + t.shape[1]] = t
        cv2.imwrite(os.path.join(OUT, f"{cid}-sheet.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])
    got = sum(1 for f in frames if f)
    print(f"{cid}: {len(frames)} frames at {fps:.0f} fps, a pose in {got}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    only = set(x for x in a.only.split(",") if x)
    for fn in sorted(os.listdir(FOOT)):
        if not fn.endswith(".mp4"):
            continue
        cid = fn.split("-")[0]
        if only and cid not in only:
            continue
        run(os.path.join(FOOT, fn), cid)


if __name__ == "__main__":
    sys.exit(main())
