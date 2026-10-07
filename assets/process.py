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


def cutout(rgb, bg, close=3, erode=2, soft=1.4):
    fg = ~border_connected(bg)
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
    bg = (G / (R + 1.0) < 0.68) | (R + G + B < 90)
    a = cutout(rgb, bg, close=4, erode=2, soft=1.6)
    a[-3:] = 0
    out = save_rgba(grade(rgb, a, sat=0.5), a, 'marcus.webp', 1500)
    preview(out, 'marcus')

if 'zeno' in jobs or 'cleanthes' in jobs:
    for nm, cut in (('zeno', 1810), ('cleanthes', 1440)):
        if nm not in jobs:
            continue
        rgb = arr(load(nm + '.jpg'))[:cut]
        R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        bg = ((G - R) > -6) & ((B - R) > -14) & ((R + G + B) < 600)
        a = cutout(rgb, bg, close=4, erode=2, soft=1.4)
        a[-3:] = 0
        out = save_rgba(grade(rgb, a), a, nm + '.webp', 960)
        preview(out, nm)

if 'chrysippus' in jobs:
    rgb = arr(load('chrysippus.jpg'))[:985]
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    bg = lum < 62
    a = cutout(rgb, bg, close=3, erode=1, soft=1.0)
    a[-2:] = 0
    out = save_rgba(grade(rgb, a), a, 'chrysippus.webp', 960)
    preview(out, 'chrysippus')

if 'seneca' in jobs:
    im = load('seneca.png').convert('RGBA')
    px = np.asarray(im).astype(np.int32)
    px = px[:int(px.shape[0] * 0.9)]
    a = px[..., 3].astype(np.float32) / 255.0
    a = np.clip((ndi.gaussian_filter(a, 0.8) - 0.5) * 1.4 + 0.5, 0, 1)
    out = save_rgba(grade(px[..., :3], a), a, 'seneca.webp', 960)
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
