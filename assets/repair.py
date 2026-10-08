"""Цифровая реставрация бюстов на фото.

Недостающее берётся с настоящего мрамора, как у реставраторов XVI–XVIII веков:
отбитый нос пересаживается с другого бюста (очищенный от патины и подогнанный по тону),
сколотая сторона лица восстанавливается зеркально с уцелевшей. Всё вклеивается
пуассоновским смешиванием, чтобы не было шва.
Запуск: python3 assets/repair.py [zeno cleanthes]
Результат: assets/src/<id>-restored.jpg, дальше его берёт process.py.
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import spsolve

HERE = os.path.dirname(os.path.abspath(__file__))

def poly_mask(shape, pts):
    from PIL import ImageDraw
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m) > 127



def poisson(target, source, mask):
    """Градиентное смешивание: внутри маски берём перепады source, на краю — target."""
    ys, xs = np.nonzero(mask)
    idx = -np.ones(mask.shape, np.int64)
    idx[ys, xs] = np.arange(len(ys))
    N = len(ys)
    A = lil_matrix((N, N))
    out = target.copy()
    for k, (y, x) in enumerate(zip(ys, xs)):
        A[k, k] = 4
    for c in range(3):
        b = np.zeros(N)
        for k, (y, x) in enumerate(zip(ys, xs)):
            lap = 4 * source[y, x, c]
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                lap -= source[yy, xx, c]
                if mask[yy, xx]:
                    if c == 0:
                        A[k, idx[yy, xx]] = -1
                else:
                    b[k] += target[yy, xx, c]
            b[k] += lap
        if c == 0:
            A = A.tocsr()
        out[ys, xs, c] = spsolve(A, b)
    return out



# Реставрация по образцу мастеров XVI–XVIII вв.: недостающее берётся с настоящего мрамора —
# нос пересаживается с другого бюста, сколотая сторона лица восстанавливается зеркально.
RESTORE = {
    'zeno': dict(src='zeno.jpg', cheek=(500, 585, 60, 60), ops=[
        dict(kind='donor', donor='seneca.png', t_axis=(663, 731), d_axis=(650, 582), scale=(0.9, 1.0),
             region=[(618, 540), (708, 540), (730, 600), (746, 660), (744, 712), (732, 742), (590, 742), (576, 700), (584, 630)]),
        dict(kind='mirror', axis=663,
             region=[(700, 535), (760, 545), (796, 600), (800, 690), (752, 700), (734, 640), (712, 585)]),
    ]),
    'cleanthes': dict(src='cleanthes.jpg', cheek=(420, 760, 60, 60), ops=[
        dict(kind='mirror', axis=606,
             region=[(330, 420), (470, 375), (560, 420), (560, 560), (430, 585), (330, 540)]),
    ]),
}


def clean_donor(d, albedo):
    """Убирает пятна патины с донора и перекрашивает его в тон мрамора получателя."""
    L = d @ np.array([0.299, 0.587, 0.114], np.float32)
    med = ndi.median_filter(L, size=9)
    m1, m2 = ndi.gaussian_filter(L, 3), ndi.gaussian_filter(L * L, 3)
    std = np.sqrt(np.clip(m2 - m1 * m1, 0, None))
    smooth = np.clip(1 - std / 14.0, 0, 1)
    dark = np.clip((med - L - 4) / 12, 0, 1)
    L = L + (med - L) * dark * smooth
    lo, mid = ndi.gaussian_filter(L, 24), ndi.gaussian_filter(L, 5)
    L = L + (lo - mid) * np.clip((lo - mid - 3) / 14, 0, 1) * 0.7
    knee = np.percentile(L, 80)
    L = np.where(L > knee, knee + (L - knee) * 0.35, L)
    tone = albedo / max(1e-3, albedo @ np.array([0.299, 0.587, 0.114]))
    return L[..., None] * tone[None, None, :]


def warp(img, sx, sy):
    return np.dstack([ndi.map_coordinates(img[..., c], [sy, sx], order=1, mode='nearest') for c in range(3)])


def repair(key):
    p = RESTORE[key]
    img = np.asarray(Image.open(os.path.join(HERE, 'src', p['src'])).convert('RGB')).astype(np.float32)
    H, W = img.shape[:2]
    x0, y0, cw, ch = p['cheek']
    albedo = img[y0:y0 + ch, x0:x0 + cw].reshape(-1, 3).mean(0)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for op in p['ops']:
        region = poly_mask((H, W), op['region'])
        if op['kind'] == 'donor':
            don = np.asarray(Image.open(os.path.join(HERE, 'src', op['donor'])).convert('RGB')).astype(np.float32)
            don = clean_donor(don, albedo)
            (tx, ty), (dx, dy), (scx, scy) = op['t_axis'], op['d_axis'], op['scale']
            src = warp(don, (xx - tx) / scx + dx, (yy - ty) / scy + dy)
            form = op.get('form', 1.0)
            if form < 1.0:
                sb, tb = ndi.gaussian_filter(src, (14, 14, 0)), ndi.gaussian_filter(img, (14, 14, 0))
                src = tb + (sb - tb) * form + (src - sb)
        else:
            src = warp(img, 2 * op['axis'] - xx, yy)
        img = poisson(img, src, region)
    out = np.clip(img, 0, 255).astype(np.uint8)
    path = os.path.join(HERE, 'src', key + '-restored.jpg')
    Image.fromarray(out).save(path, quality=95)
    print(path)


if __name__ == '__main__':
    for k in (sys.argv[1:] or RESTORE.keys()):
        repair(k)
