#!/usr/bin/env python3
"""Собирает один HTML-файл: src/app.html + src/ai.js + встроенные SheetJS, three.js и pdf.js."""
import zipfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
src = (root / "src" / "app.html").read_text(encoding="utf-8")
for marker, name in (("/*__AI__*/", "../src/ai.js"), ("/*__XLSX__*/", "xlsx.mini.min.js"), ("/*__THREE__*/", "three.min.js"),
                     ("/*__PDF__*/", "pdf.min.js"), ("/*__PDFWORKER__*/", "pdf.worker.min.js")):
    lib = (root / "vendor" / name).read_text(encoding="utf-8")
    assert "</script" not in lib.lower(), name
    assert src.count(marker) == 1, marker
    src = src.replace(marker, lib)
dist = root / "dist"
dist.mkdir(exist_ok=True)
target = dist / "Ремонт_смета.html"
target.write_text(src, encoding="utf-8")
with zipfile.ZipFile(dist / "Ремонт_смета.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.write(target, target.name)
print(f"{target.relative_to(root)}: {len(src.encode('utf-8')) / 1024:.0f} КБ")

# ---- Сайт (GitHub Pages из корня репозитория): index.html + manifest + sw.js + значки ----
import hashlib, json
from PIL import Image, ImageDraw
site = src.replace("<!--__SITEHEAD__-->", '<link rel="manifest" href="manifest.webmanifest">'
                   '<link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="icon" type="image/png" href="icon-192.png">')
target.write_text(src.replace("<!--__SITEHEAD__-->\n", ""), encoding="utf-8")  # файл для диска — без ссылок на сайт
with zipfile.ZipFile(dist / "Ремонт_смета.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.write(target, target.name)
ver = hashlib.sha1(site.encode()).hexdigest()[:8]
(root / "index.html").write_text(site, encoding="utf-8")
(root / "manifest.webmanifest").write_text(json.dumps({
    "name": "Ремонт: план и смета", "short_name": "Ремонт", "lang": "ru", "id": "./", "start_url": "./", "scope": "./",
    "display": "standalone", "background_color": "#f4f5f7", "theme_color": "#2f6fde",
    "icons": [{"src": f"icon-{n}.png", "sizes": f"{n}x{n}", "type": "image/png", "purpose": "any"} for n in (192, 512)]},
    ensure_ascii=False, indent=1), encoding="utf-8")
(root / "sw.js").write_text('''const CACHE = "remont-%s";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())));
// свои файлы: берём свежие с сайта, без интернета (или если сайт не ответил за 2 с) — сохранённую копию
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  const net = fetch(r.url, {cache: "no-cache"}).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); } return res; });
  const saved = () => caches.match(r).then(m => m || caches.match("index.html"));
  e.respondWith(new Promise(done => { let over = false; const fin = v => { if (!over && v) { over = true; done(v); } };
    const t = setTimeout(() => saved().then(fin), 2000);
    net.then(res => { clearTimeout(t); fin(res); }).catch(() => { clearTimeout(t); saved().then(m => fin(m || Response.error())); }); }));
  e.waitUntil(net.catch(() => {}));
});
''' % ver, encoding="utf-8")
def icon(n):
    s = 4 * n; im = Image.new("RGB", (s, s), "#2f6fde"); d = ImageDraw.Draw(im)
    d.polygon([(s*.18, s*.48), (s*.5, s*.2), (s*.82, s*.48)], fill="white")        # крыша
    d.rectangle([s*.27, s*.46, s*.73, s*.80], fill="white")                          # стены
    d.rectangle([s*.44, s*.58, s*.56, s*.80], fill="#2f6fde")                        # дверь
    d.line([(s*.16, s*.86), (s*.84, s*.86)], fill="white", width=int(s*.03))        # рулетка-линия
    return im.resize((n, n), Image.LANCZOS)
for n in (192, 512):
    icon(n).save(root / f"icon-{n}.png")
icon(180).save(root / "apple-touch-icon.png")
print("сайт: index.html, версия", ver)
