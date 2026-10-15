"""Builds the app icons (PWA / iPhone home screen) from the white logo, like the prototype's AppIcon:
black square, logo in the middle, tan strip at the bottom. Run: python3 scripts/make-icons.py"""
from PIL import Image

LOGO = Image.open('web/public/img/logo-white.png').convert('RGBA')
BG, TAN = (20, 18, 16, 255), (210, 160, 106, 255)

def cover(img, w, h):
    iw, ih = img.size
    s = max(w / iw, h / ih)
    r = img.resize((round(iw * s), round(ih * s)), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))

def icon(size, safe=1.0):
    im = Image.new('RGBA', (size, size), BG)
    w, h = round(size * 124 / 132 * safe), round(size * 84 / 132 * safe)
    logo = cover(LOGO, w, h)
    im.alpha_composite(logo, ((size - w) // 2, (size - h) // 2))
    bar = round(size * 14 / 132)
    im.paste(Image.new('RGBA', (size, bar), TAN), (0, size - bar))
    return im.convert('RGB')

for n, s, safe in [('icon-192.png', 192, 1), ('icon-512.png', 512, 1), ('maskable-512.png', 512, 0.78), ('apple-touch-icon.png', 180, 1), ('favicon-32.png', 32, 1)]:
    icon(s, safe).save(f'web/public/icons/{n}', optimize=True)
    print(n)
