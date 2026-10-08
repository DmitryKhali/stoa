"""Готовит фото для сайта: вырезает бюсты из фона, тонирует под камень, размывает Стою."""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src') + os.sep
OUT = HERE + os.sep


def load(name):
    return Image.open(SRC + name)


def border_connected(bgmask):
    lab, n = ndi.label(bgmask)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge = edge[edge > 0]
    return np.isin(lab, edge)


def cutout(rgb, bg, close=3, erode=2, soft=1.4, opening=0):
    fg = ~border_connected(bg)
    if opening:
        fg = ndi.binary_opening(fg, iterations=opening)
    fg = ndi.binary_closing(fg, iterations=close)
    fg = ndi.binary_fill_holes(fg)
    lab, n = ndi.label(fg)
    if n > 1:
        sizes = ndi.sum(fg, lab, range(1, n + 1))
        fg = lab == (np.argmax(sizes) + 1)
    fg = ndi.binary_erosion(fg, iterations=erode)
    a = ndi.gaussian_filter(fg.astype(np.float32), soft)
    a = np.clip((a - 0.5) * 1.6 + 0.5, 0, 1)
    return a


def gauss(x, s):
    return ndi.gaussian_filter(x, s)


def freshen(rgb, spots=1.0, clarity=0.3, keep_color=0.24, tint=(1.0, 0.972, 0.928)):
    """Мрамор «как только из мастерской»: без патины, пятен и цветных отсветов, с ясной пластикой."""
    f = rgb.astype(np.float32) / 255.0
    W3 = np.array([0.299, 0.587, 0.114], np.float32)
    L0 = f @ W3
    L = L0.copy()
    med = ndi.median_filter(L, size=7)
    m1, m2 = gauss(L, 3.0), gauss(L * L, 3.0)
    smooth = np.clip(1.0 - np.sqrt(np.clip(m2 - m1 * m1, 0, None)) / 0.055, 0, 1)
    dark = np.clip((med - L - 0.02) / 0.05, 0, 1)
    light = np.clip((L - med - 0.05) / 0.06, 0, 1) * 0.5
    L = L + (med - L) * np.maximum(dark, light) * smooth * spots
    lo, mid = gauss(L, 28.0), gauss(L, 6.0)
    L = L + (lo - mid) * np.clip((lo - mid - 0.015) / 0.06, 0, 1) * gauss(smooth, 6.0) * 0.6 * spots
    L = L + clarity * (L - gauss(L, 16.0))
    L = L + 0.3 * (L - gauss(L, 1.0))
    out = L[..., None] * np.array(tint, np.float32) + (f - L0[..., None]) * keep_color
    return np.clip(out * 255, 0, 255).astype(np.int32)


def rowfill(a, frac=0.7):
    """Грудь бюста сплошная: заливаем строки, где силуэт уже широкий (тени не должны «выгрызать» камень)."""
    b = a > 0.5
    wid = b.sum(1)
    a = a.copy()
    for y in np.where(wid > frac * wid.max())[0]:
        xs = np.where(b[y])[0]
        a[y, xs[0]:xs[-1] + 1] = 1.0
    return a


def source(name, fallback):
    p = os.path.join(SRC, name + '-restored.jpg')
    return p if os.path.exists(p) else os.path.join(SRC, fallback)


def grade(rgb, alpha=None, sat=0.55, lo=0.05, hi=0.95, warm=(1.0, 0.975, 0.93)):
    f = rgb.astype(np.float32) / 255.0
    lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
    sel = lum[alpha > 0.9] if alpha is not None else lum.ravel()
    p2, p98 = np.percentile(sel, [1.5, 99.2])
    f = (f - p2) / max(1e-3, p98 - p2) * (hi - lo) + lo
    lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
    f = lum[..., None] + (f - lum[..., None]) * sat
    f = f * np.array(warm, np.float32)
    # лёгкая S-кривая для объёма
    f = np.clip(f, 0, 1)
    f = f + 0.18 * (f * f * (3 - 2 * f) - f)
    return np.clip(f * 255, 0, 255).astype(np.uint8)


def save_rgba(rgb, a, name, height, crop_pad=0.02):
    ys, xs = np.where(a > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = int((y1 - y0) * crop_pad)
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(a.shape[0], y1 + pad), min(a.shape[1], x1 + pad)
    im = np.dstack([rgb, (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
    img = Image.fromarray(im, 'RGBA')
    w = round(img.width * height / img.height)
    img = img.resize((w, height), Image.LANCZOS)
    img.save(OUT + name, 'WEBP', quality=82, method=6)
    print(name, img.size)
    return img


def preview(img, name):
    bg = Image.new('RGBA', img.size, (128, 150, 128, 255))
    bg.alpha_composite(img)
    bg = bg.convert('RGB')
    bg.thumbnail((500, 700))
    bg.save(os.path.join(os.environ.get('TMPDIR', '/tmp'), 'pv_' + name + '.jpg'), quality=85)


def arr(img):
    return np.asarray(img.convert('RGB')).astype(np.int32)


jobs = sys.argv[1:] or ['marcus', 'zeno', 'cleanthes', 'chrysippus', 'seneca', 'head', 'epictetus', 'stoa']

if 'marcus' in jobs:
    im = load('marcus.jpg')
    rgb = arr(im)[:2235]
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1.0)
    bg = ((G / (R + 1.0) < 0.6) & (sat > 0.58)) | (R + G + B < 90)
    a = cutout(rgb, bg, close=4, erode=2, soft=1.6, opening=3)
    a[-3:] = 0
    out = save_rgba(grade(freshen(rgb), a, sat=0.85), a, 'marcus.webp', 1500)
    preview(out, 'marcus')

if 'zeno' in jobs or 'cleanthes' in jobs:
    for nm, cut in (('zeno', 1810), ('cleanthes', 1440)):
        if nm not in jobs:
            continue
        rgb = arr(Image.open(source(nm, nm + '.jpg')))[:cut]
        R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        bg = ((G - R) > -6) & ((B - R) > -14) & ((R + G + B) < 600)
        a = cutout(rgb, bg, close=4, erode=2, soft=1.4)
        a[-3:] = 0
        out = save_rgba(grade(freshen(rgb), a, sat=0.85), a, nm + '.webp', 960)
        preview(out, nm)

if 'chrysippus' in jobs:
    rgb = arr(load('chrysippus.jpg'))[:985]
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    bg = lum < 62
    a = cutout(rgb, bg, close=3, erode=1, soft=1.0)
    a[-2:] = 0
    out = save_rgba(grade(freshen(rgb), a, sat=0.85), a, 'chrysippus.webp', 960)
    preview(out, 'chrysippus')

if 'seneca' in jobs:
    im = load('seneca.png').convert('RGBA')
    px = np.asarray(im).astype(np.int32)
    px = px[:int(px.shape[0] * 0.9)]
    a = px[..., 3].astype(np.float32) / 255.0
    a = np.clip((ndi.gaussian_filter(a, 0.8) - 0.5) * 1.4 + 0.5, 0, 1)
    out = save_rgba(grade(freshen(px[..., :3]), a, sat=0.85), a, 'seneca.webp', 960)
    preview(out, 'seneca')

if 'head' in jobs:
    rgb = arr(load('marcus-head.jpg'))
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    bg = lum < 58
    a = cutout(rgb, bg, close=3, erode=1, soft=1.2)
    out = save_rgba(grade(rgb, a), a, 'marcus-head.webp', 960)
    preview(out, 'head')

if 'epictetus' in jobs:
    g = np.asarray(load('epictetus.jpg').convert('L')).astype(np.float32) / 255.0
    h, w = g.shape
    g = g[int(h * 0.012):int(h * 0.985), int(w * 0.02):int(w * 0.98)]
    g = np.clip((g - 0.08) / 0.84, 0, 1)
    ink = np.array([42, 33, 26], np.float32)
    paper = np.array([231, 223, 208], np.float32)
    rgb = (ink + (paper - ink) * g[..., None]).astype(np.uint8)
    img = Image.fromarray(rgb, 'RGB')
    img = img.resize((round(img.width * 1100 / img.height), 1100), Image.LANCZOS)
    img.save(OUT + 'epictetus.webp', 'WEBP', quality=80, method=6)
    print('epictetus.webp', img.size)

if 'restored' in jobs:
    # Приёмка реставраций: restore/out/<id>.png|jpg|webp на ровном фоне → assets/<id>.webp
    import glob, json
    root = os.path.join(os.path.dirname(HERE), 'restore', 'out')
    report = {}
    for path in sorted(glob.glob(os.path.join(root, '*'))):
        name, ext = os.path.splitext(os.path.basename(path))
        if ext.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        im = Image.open(path)
        if im.mode == 'RGBA' and np.asarray(im)[..., 3].min() < 250:
            px = np.asarray(im).astype(np.int32)
            rgb, a = px[..., :3], px[..., 3].astype(np.float32) / 255.0
        else:
            rgb = arr(im)
            border = np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3), rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)])
            c = np.median(border, axis=0)
            dist = np.sqrt(((rgb - c) ** 2 * np.array([0.3, 0.59, 0.11])).sum(-1))
            bdist = np.sqrt(((border - c) ** 2 * np.array([0.3, 0.59, 0.11])).sum(-1))
            thr = float(np.clip(np.percentile(bdist, 75) * 3.0, 10.0, 40.0))
            a = cutout(rgb, dist < thr, close=3, erode=1, soft=1.2)
            if (a > 0.5).sum() < 0.05 * a.size:
                print(name + ': фон не отделился, кладу без вырезки')
                a = np.ones(rgb.shape[:2], np.float32)
            a = rowfill(a, 0.72)
        out = save_rgba(grade(rgb, a, sat=0.85), a, name + '.webp', 1400)
        preview(out, name)
        report[name] = out.size
    print(json.dumps(report))

if 'stoa' in jobs:
    im = load('stoa.jpg').convert('RGB').resize((1600, 1200), Image.LANCZOS)
    im = im.filter(ImageFilter.GaussianBlur(16))
    f = np.asarray(im).astype(np.float32) / 255.0
    lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
    f = lum[..., None] + (f - lum[..., None]) * 0.55
    haze = np.array([0.9, 0.87, 0.82], np.float32)
    f = f * 0.78 + haze * 0.22
    f = f * np.array([1.03, 1.0, 0.95], np.float32)
    out = Image.fromarray(np.clip(f * 255, 0, 255).astype(np.uint8), 'RGB')
    out.save(OUT + 'stoa-blur.webp', 'WEBP', quality=74, method=6)
    print('stoa-blur.webp', out.size)
