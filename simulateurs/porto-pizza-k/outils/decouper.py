#!/usr/bin/env python3
"""Prépare les photos réelles du simulateur Porto Pizza K (Pillow + numpy uniquement).

  python3 outils/decouper.py pizza  photo.jpg tomate-crue      → assets/tomate-crue.webp (pizza détourée en rond)
  python3 outils/decouper.py morceaux planche.jpg olives       → assets/olives-1.png, olives-2.png… (fond uni retiré)
  python3 outils/decouper.py manifeste                         → réécrit assets/manifest.js d'après le dossier assets/

Noms attendus : tomate-crue, tomate-cuite, pate-crue, chocolat-cuite (pizzas) et olives, champi, thon, saumon,
oignons, piments (morceaux). Les planches de morceaux doivent être photographiées sur un fond uni très coloré
(bleu ou vert), morceaux séparés les uns des autres. Voir ASSETS.md.
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
BASES = {'tomate': ('tomate-crue', 'tomate-cuite'), 'choco': ('pate-crue', 'chocolat-cuite')}
PIECES = ['olives', 'champi', 'thon', 'saumon', 'oignons', 'piments']


def border_color(rgb):
    edge = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    return np.median(edge, axis=0)


def pizza(src, name, size=1024):
    """Recadre la pizza (ronde) au centre et rend le fond transparent avec un bord adouci."""
    img = Image.open(src).convert('RGB')
    rgb = np.asarray(img).astype(np.float32)
    dist = np.linalg.norm(rgb - border_color(rgb), axis=2)
    mask = dist > 38
    ys, xs = np.nonzero(mask)
    cy, cx = np.median(ys), np.median(xs)
    radius = np.percentile(np.hypot(ys - cy, xs - cx), 99.3)
    box = (int(cx - radius), int(cy - radius), int(cx + radius), int(cy + radius))
    crop = img.crop(box).resize((size, size), Image.LANCZOS)
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.hypot(yy - size / 2, xx - size / 2) / (size / 2)
    alpha = np.clip((1.0 - r) / 0.012, 0, 1)                     # bord circulaire très légèrement adouci
    local = np.linalg.norm(np.asarray(crop).astype(np.float32) - border_color(rgb), axis=2)
    alpha = alpha * np.clip((local - 20) / 30, 0, 1) ** 0.5      # suit les irrégularités réelles de la croûte
    out = crop.convert('RGBA')
    out.putalpha(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)))
    ASSETS.mkdir(exist_ok=True)
    out.save(ASSETS / f'{name}.webp', quality=88, method=6)
    print('→', ASSETS / f'{name}.webp')


def labels(mask):
    """Composantes connexes (4-voisinage) sur un masque réduit ; renvoie les boîtes englobantes."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    boxes = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True; y0 = y1 = y; x0 = x1 = x; n = 0
                while q:
                    a, b = q.popleft(); n += 1
                    y0, y1, x0, x1 = min(y0, a), max(y1, a), min(x0, b), max(x1, b)
                    for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                        if 0 <= c < h and 0 <= d < w and mask[c, d] and not seen[c, d]:
                            seen[c, d] = True; q.append((c, d))
                boxes.append((n, y0, y1, x0, x1))
    return boxes


def morceaux(src, name, size=256):
    """Retire le fond uni (incrustation couleur), supprime le reflet coloré et découpe chaque morceau."""
    img = Image.open(src).convert('RGB')
    rgb = np.asarray(img).astype(np.float32)
    bg = border_color(rgb)
    dist = np.linalg.norm(rgb - bg, axis=2)
    alpha = np.clip((dist - 45) / 55, 0, 1)
    # Suppression du débordement de couleur du fond sur les bords des morceaux.
    ch = int(np.argmax(bg)); others = [c for c in range(3) if c != ch]
    limit = rgb[:, :, others].max(axis=2)
    rgb[:, :, ch] = np.minimum(rgb[:, :, ch], limit + (rgb[:, :, ch] - limit) * alpha)
    small = Image.fromarray((alpha > .5).astype(np.uint8) * 255).resize((img.width // 4, img.height // 4))
    boxes = [b for b in labels(np.asarray(small) > 127) if b[0] > 60]
    for old in ASSETS.glob(f'{name}-*.png'):
        old.unlink()
    count = 0
    for _, y0, y1, x0, x1 in sorted(boxes, key=lambda b: (b[1] // 40, b[3])):
        pad = 3
        y0, x0 = max(0, (y0 - pad) * 4), max(0, (x0 - pad) * 4)
        y1, x1 = min(img.height, (y1 + pad + 1) * 4), min(img.width, (x1 + pad + 1) * 4)
        piece = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
        out = Image.fromarray(piece, 'RGBA')
        side = max(out.size)
        square = Image.new('RGBA', (side, side)); square.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
        count += 1
        square.resize((size, size), Image.LANCZOS).save(ASSETS / f'{name}-{count}.png', optimize=True)
    print(f'→ {count} morceaux : {ASSETS}/{name}-1..{count}.png')


def manifeste():
    data = {}
    for base, (raw, baked) in BASES.items():
        if (ASSETS / f'{raw}.webp').exists() and (ASSETS / f'{baked}.webp').exists():
            data[base] = {'raw': f'assets/{raw}.webp', 'baked': f'assets/{baked}.webp'}
    pieces = {k: [f'assets/{p.name}' for p in sorted(ASSETS.glob(f'{k}-*.png'), key=lambda p: int(p.stem.split('-')[-1]))] for k in PIECES}
    pieces = {k: v for k, v in pieces.items() if v}
    if pieces:
        data['pieces'] = pieces
    head = '/* Photos réelles du simulateur Porto Pizza K · généré par outils/decouper.py (ne pas modifier à la main). */\n'
    (ASSETS / 'manifest.js').write_text(head + 'window.PORTO_PIZZA_ASSETS = ' + json.dumps(data, indent=2, ensure_ascii=False) + ';\n', encoding='utf-8')
    print('→ manifest.js :', ', '.join(data) or 'vide')


if __name__ == '__main__':
    cmd = sys.argv[1:2]
    if cmd == ['pizza'] and len(sys.argv) == 4: pizza(sys.argv[2], sys.argv[3]); manifeste()
    elif cmd == ['morceaux'] and len(sys.argv) == 4: morceaux(sys.argv[2], sys.argv[3]); manifeste()
    elif cmd == ['manifeste']: manifeste()
    else: sys.exit(__doc__)
