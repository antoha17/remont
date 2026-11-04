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
