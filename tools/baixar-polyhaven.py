# Baixa texturas e céus CC0 do Poly Haven (https://polyhaven.com) e gera versões leves para o gráfico Ultra.
# Uso: python3 tools/baixar-polyhaven.py   (gera public/ultra/*)
import json, os, subprocess, sys
import cv2, numpy as np

OUT = 'public/ultra'
TMP = '/tmp/ph-cache'
os.makedirs(TMP, exist_ok=True)
for d in ['terreno', 'casca', 'ceu']: os.makedirs(f'{OUT}/{d}', exist_ok=True)

TERRENO = {  # tipo de terreno do jogo -> textura do Poly Haven
    'g': 'leafy_grass', 'd': 'dirt', 's': 'coast_sand_01', 'm': 'brown_mud_02',
    'r': 'rock_boulder_dry', 'p': 'stone_pathway', 'w': 'brown_mud_02',
}
CASCA = {'acacia': 'fever_tree_bark', 'floresta': 'bark_brown_02'}
CEU = {  # hora do jogo -> céu (mesmo lugar em horários diferentes)
    'amanhecer': 'qwantani_sunrise_puresky', 'manha': 'qwantani_morning_puresky', 'meiodia': 'qwantani_noon_puresky',
    'tarde': 'qwantani_late_afternoon_puresky', 'porsol': 'qwantani_sunset_puresky', 'crepusculo': 'qwantani_dusk_2_puresky',
    'noite': 'qwantani_night_puresky',
}

def get(url, path):
    if not os.path.exists(path):
        subprocess.run(['curl', '-sfL', '-o', path, url], check=True)
    return path

def files(asset):
    p = f'{TMP}/{asset}.json'
    if not os.path.exists(p): get(f'https://api.polyhaven.com/files/{asset}', p)
    return json.load(open(p))

def texture(asset, out, size=512):
    f = files(asset)
    for key, suf in [('Diffuse', 'cor'), ('nor_gl', 'nor')]:
        src = get(f[key]['1k']['jpg']['url'], f'{TMP}/{asset}_{suf}_1k.jpg')
        im = cv2.imread(src, cv2.IMREAD_COLOR)
        im = cv2.resize(im, (size, size), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f'{out}_{suf}.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 84])

def write_hdr(path, rgb):  # Radiance .hdr sem compressão (RGBE)
    h, w, _ = rgb.shape
    m = rgb.max(axis=2); e = np.zeros_like(m, dtype=np.int32); mant = np.zeros_like(m)
    nz = m > 1e-32
    mant[nz], e[nz] = np.frexp(m[nz])
    sc = np.zeros_like(m); sc[nz] = mant[nz] * 256.0 / m[nz]
    out = np.zeros((h, w, 4), np.uint8)
    for c in range(3): out[..., c] = np.clip(rgb[..., c] * sc, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(nz, e + 128, 0).astype(np.uint8)
    with open(path, 'wb') as fh:
        fh.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
        fh.write(out.tobytes())

def sky(asset, name):
    f = files(asset)
    hdr = get(f['hdri']['1k']['hdr']['url'], f'{TMP}/{asset}_1k.hdr')
    im = cv2.imread(hdr, cv2.IMREAD_UNCHANGED)[..., ::-1].astype(np.float32)  # BGR -> RGB
    small = cv2.resize(im, (256, 128), interpolation=cv2.INTER_AREA)
    write_hdr(f'{OUT}/ceu/{name}.hdr', small)
    # direção do sol: pixel mais brilhante
    y, x = np.unravel_index(np.argmax(im.sum(axis=2)), im.shape[:2])
    sol = {'u': float(x / im.shape[1]), 'v': float(y / im.shape[0]), 'pico': float(im.sum(axis=2).max())}
    tm = get(f['tonemapped']['url'], f'{TMP}/{asset}_tm.jpg')
    bg = cv2.resize(cv2.imread(tm, cv2.IMREAD_COLOR), (2048, 1024), interpolation=cv2.INTER_AREA)
    cv2.imwrite(f'{OUT}/ceu/{name}.jpg', bg, [cv2.IMWRITE_JPEG_QUALITY, 80, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
    return sol

meta = {'terreno': list(TERRENO), 'ceu': {}}
for k, a in TERRENO.items(): texture(a, f'{OUT}/terreno/{k}'); print('terreno', k, a)
for k, a in CASCA.items(): texture(a, f'{OUT}/casca/{k}', 256); print('casca', k, a)
for k, a in CEU.items(): meta['ceu'][k] = sky(a, k); print('céu', k, a, meta['ceu'][k])
json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1)
with open(f'{OUT}/CREDITOS.txt', 'w') as fh:
    fh.write('Texturas e céus do Poly Haven (https://polyhaven.com), licença CC0 (domínio público).\n\n')
    for k, a in {**{f'terreno {k}': a for k, a in TERRENO.items()}, **{f'casca {k}': a for k, a in CASCA.items()}, **{f'céu {k}': a for k, a in CEU.items()}}.items():
        fh.write(f'{k}: https://polyhaven.com/a/{a}\n')
print('ok')
