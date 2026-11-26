#!/usr/bin/env python3
"""Intègre une photo dans un simulateur (Pillow + numpy uniquement).

  python3 outils/detourer.py le-j salami-rosette photo.png     → assets/le-j/salami-rosette.webp
  python3 outils/detourer.py le-j dossier/                     → tous les fichiers du dossier (nom du fichier = clé)
  python3 outils/detourer.py manifeste                         → réécrit assets/manifest.js

La photo peut avoir un fond transparent (PNG de GPT) ou un fond uni (vert, bleu, blanc…) : le fond est retiré,
l'image est recadrée au plus près, réduite à 1100 px de large et enregistrée en WebP. Le manifeste est mis à jour
tout seul : le simulateur affiche la photo à la place du dessin, sans toucher au code.
Les clés (noms de fichier) sont celles des fichiers config.js : voir PHOTOS-GPT.md.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
SIMS = {'le-j': 'le-j-compose', 'maison-braha': 'maison-braha-table', 'kosher-fc': 'kosher-fc-menu', 'olev-burger': 'olev-burger-menu'}


def cut(src):
    img = Image.open(src).convert('RGBA')
    px = np.asarray(img).astype(np.float32)
    alpha = px[..., 3] / 255
    if alpha.min() > .98:  # pas de transparence : on retire le fond uni mesuré sur les bords
        rgb = px[..., :3]
        edge = np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3), rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)])
        bg = np.median(edge, axis=0)
        dist = np.linalg.norm(rgb - bg, axis=2)
        alpha = np.clip((dist - 28) / 34, 0, 1)
        # retire le reflet coloré du fond sur les bords de l'objet
        spill = (1 - alpha)[..., None]
        rgb = np.clip(rgb - spill * (bg - rgb.mean(axis=2, keepdims=True)) * .6, 0, 255)
        px = np.dstack([rgb, alpha * 255])
        a = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8))
        img = Image.fromarray(px.astype(np.uint8), 'RGBA')
        img.putalpha(a)
    box = img.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    if not box:
        raise SystemExit(f'{src} : image vide après détourage')
    img = img.crop(box)
    if img.width > 1100:
        img = img.resize((1100, round(img.height * 1100 / img.width)), Image.LANCZOS)
    return img


def manifest():
    data = {}
    for folder, sim_id in SIMS.items():
        entry = {}
        for p in sorted((ASSETS / folder).glob('*.webp')):
            with Image.open(p) as im:
                entry[p.stem] = {'src': f'../assets/{folder}/{p.name}', 'w': im.width, 'h': im.height}
        data[sim_id] = entry
    (ASSETS / 'manifest.js').write_text('/* Photos détourées disponibles, par simulateur. Fichier réécrit par outils/detourer.py — ne pas modifier à la main. */\nwindow.KOSH_ASSETS = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';\n', encoding='utf-8')
    print('manifeste :', {k: len(v) for k, v in data.items()})


def main(argv):
    if argv[:1] == ['manifeste']:
        return manifest()
    if len(argv) < 2 or argv[0] not in SIMS:
        raise SystemExit(__doc__)
    sim, rest = argv[0], argv[1:]
    jobs = [(p.stem, p) for p in sorted(Path(rest[0]).iterdir()) if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')] if Path(rest[0]).is_dir() else [(rest[0], Path(rest[1]))]
    (ASSETS / sim).mkdir(parents=True, exist_ok=True)
    for key, src in jobs:
        out = ASSETS / sim / f'{key}.webp'
        cut(src).save(out, quality=90, method=6)
        print('→', out.relative_to(ROOT))
    manifest()


if __name__ == '__main__':
    main(sys.argv[1:])
