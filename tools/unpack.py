"""يفك ملفات HTML المصدّرة من Claude Design إلى مصادرها.
الاستخدام: python3 tools/unpack.py prototype/laptop.html unpacked/laptop
"""
import sys, json, re, base64, gzip, os

src, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
html = open(src, encoding='utf-8').read()

def grab(t):
    m = re.search(r'<script type="__bundler/%s">(.*?)</script>' % re.escape(t), html, re.S)
    return m.group(1) if m else None

manifest = json.loads(grab('manifest'))
template = json.loads(grab('template'))
open(os.path.join(outdir, 'template.html'), 'w', encoding='utf-8').write(template)
EXT = {'text/javascript': 'js', 'application/javascript': 'js', 'text/html': 'html',
       'text/css': 'css', 'application/json': 'json'}
for uuid, e in manifest.items():
    b = base64.b64decode(e['data'])
    if e.get('compressed'):
        b = gzip.decompress(b)
    ext = EXT.get(e['mime'], e['mime'].split('/')[-1].replace('+xml', ''))
    open(os.path.join(outdir, f'{uuid}.{ext}'), 'wb').write(b)
    print(uuid, e['mime'], len(b))
