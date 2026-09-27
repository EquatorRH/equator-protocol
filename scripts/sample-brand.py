"""Sample the brand palette from real assets and rebuild logo-derived files.

Usage: python scripts/sample-brand.py palette   -> prints k-means clusters (each snapped to a real pixel)
       python scripts/sample-brand.py assets    -> writes src/brand/* and src/favicon.grid.json

Palette provenance: pooled k-means (k=8, seed 0) over the opaque logo pixels and the six reference posts,
each centroid snapped to the nearest real pixel of its cluster; file and x,y are printed for the tokens.css comment.
Resizes are premultiplied because the transparent logo PNG stores pure-black RGB under alpha 0.
"""
import glob, json, os, sys
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(R, "brand", "LOGO EQUATOR PNG...png")  # RGBA, transparent background
POSTS = sorted(glob.glob(os.path.join(R, "reference", "EQUATOR [1-6].jpg.jpeg")))


def hexs(c):
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def palette(k=8, per_image=6000):
    rng = np.random.default_rng(0)
    px, src = [], []
    for p in [LOGO] + POSTS:
        a = np.array(Image.open(p).convert("RGBA"))
        ys, xs = np.nonzero(a[..., 3] > 250)
        pick = rng.choice(len(ys), min(per_image, len(ys)), replace=False)
        for i in pick:
            px.append(a[ys[i], xs[i], :3]); src.append((os.path.basename(p), int(xs[i]), int(ys[i])))
    px = np.array(px, float)
    km = KMeans(n_clusters=k, n_init=6, random_state=0).fit(px)
    rows = []
    for i, c in enumerate(km.cluster_centers_):
        idx = np.where(km.labels_ == i)[0]
        j = idx[((px[idx] - c) ** 2).sum(1).argmin()]
        rows.append((len(idx) / len(px), hexs(px[j]), src[j]))
    for share, hx, (f, x, y) in sorted(rows, reverse=True):
        print(f"{share*100:5.1f}%  {hx}  {f} @({x},{y})")


def premul_resize(img, size):
    a = np.array(img.convert("RGBA"), np.float32)
    a[..., :3] *= a[..., 3:] / 255.0
    pm = Image.fromarray(a.round().astype(np.uint8), "RGBA").resize(size, Image.LANCZOS)
    b = np.array(pm, np.float32)
    al = b[..., 3:]
    b[..., :3] = np.where(al > 0, b[..., :3] * 255.0 / np.maximum(al, 1), 0)
    return Image.fromarray(np.clip(b, 0, 255).round().astype(np.uint8), "RGBA")


def flat_brand():
    import re
    css = open(os.path.join(R, "src", "tokens.css"), encoding="utf8").read()
    h = re.search(r"--brand:\s*#([0-9a-f]{6})", css).group(1)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def decontaminate(img, rgb):
    # The mark is one flat colour; the source's anti-aliased edge pixels carry a pale matte. Keep alpha, force RGB.
    b = np.array(img)
    b[..., :3] = np.where(b[..., 3:] > 0, np.array(rgb, np.uint8), 0)
    return Image.fromarray(b, "RGBA")


def assets():
    logo = Image.open(LOGO).convert("RGBA")
    box = logo.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    mark = logo.crop(box)
    os.makedirs(os.path.join(R, "src", "brand"), exist_ok=True)
    w = 320
    m = premul_resize(mark, (w, round(w * mark.height / mark.width)))
    brand = flat_brand()
    m = decontaminate(m, brand)
    m.save(os.path.join(R, "src", "brand", "logo-mark.png"), optimize=True)
    # fringe check: fully-transparent-adjacent pixels must not drift dark after un-premultiply
    b = np.array(m); edge = (b[..., 3] > 20) & (b[..., 3] < 240)
    print("logo-mark", m.size, "edge px mean rgb", b[edge][:, :3].mean(0).round(1) if edge.any() else None)
    # favicon pixel grid: 32x32, mark fitted into 28px width, centred; alpha only (colour comes from tokens)
    g = 28
    small = premul_resize(mark, (g, max(1, round(g * mark.height / mark.width))))
    canvas = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    canvas.paste(small, ((32 - small.width) // 2, (32 - small.height) // 2))
    al = np.array(canvas)[..., 3]
    json.dump({"size": 32, "alpha": ["".join("%02x" % v for v in row) for row in al]}, open(os.path.join(R, "src", "favicon.grid.json"), "w"))
    print("favicon grid", al.shape, "opaque px", int((al > 0).sum()))
    # apple-touch-icon: mark over the token background, premultiplied resize, composited in float
    import re
    css = open(os.path.join(R, "src", "tokens.css"), encoding="utf8").read()
    bg = [int(re.search(r"--bg:\s*#([0-9a-f]{6})", css).group(1)[i:i + 2], 16) for i in (0, 2, 4)]
    im = decontaminate(premul_resize(mark, (120, round(120 * mark.height / mark.width))), brand)
    icon = Image.new("RGBA", (180, 180), tuple(bg) + (255,))
    icon.alpha_composite(im, ((180 - im.width) // 2, (180 - im.height) // 2))
    icon.convert("RGB").save(os.path.join(R, "src", "brand", "apple-touch-icon.png"), optimize=True)
    return mark


if __name__ == "__main__":
    {"palette": palette, "assets": assets}[sys.argv[1] if len(sys.argv) > 1 else "palette"]()
