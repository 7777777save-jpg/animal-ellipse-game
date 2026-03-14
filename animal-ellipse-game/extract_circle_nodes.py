import cv2
import numpy as np
import json
import os

REF_DIR = os.path.join(os.path.dirname(__file__), "reference")
OUTPUT  = os.path.join(os.path.dirname(__file__), "circle_nodes.json")

result = {}

for animal in sorted(os.listdir(REF_DIR)):
    img_path = os.path.join(REF_DIR, animal, "layer2_circle_system.jpg")
    if not os.path.exists(img_path):
        continue

    img  = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (9, 9), 2)

    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=80,
        param1=120,
        param2=150,
        minRadius=30,
        maxRadius=2500
    )

    nodes = []
    if circles is not None:
        for x, y, r in np.round(circles[0]).astype(int):
            # 去重：与已有圆心距离 < 两者半径均值的 0.3 倍则跳过
            dup = False
            for n in nodes:
                dist = ((x - n['x'])**2 + (y - n['y'])**2) ** 0.5
                if dist < (r + n['r']) * 0.15:
                    dup = True
                    break
            if not dup:
                nodes.append({"x": int(x), "y": int(y), "r": int(r)})
        nodes.sort(key=lambda c: -c["r"])  # 从大到小排列

    result[animal] = nodes
    print(f"{animal}: {len(nodes)} circles")

with open(OUTPUT, "w") as f:
    json.dump(result, f, indent=2)

print(f"\nSaved → {OUTPUT}")
