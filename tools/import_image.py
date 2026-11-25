#!/usr/bin/env python3
"""Convert one product photo to AVIF and attach it to a catalog product.

Usage:
    python3 tools/import_image.py <source-image> <product-id>

The image is resized to max 1200 px, converted to AVIF (quality 55) and saved
as data/images/products/<product-id>.avif. The product's `image` field in
data/catalog.json is updated in place.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "catalog.json"
OUT_DIR = ROOT / "data" / "images" / "products"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    src = Path(sys.argv[1]).expanduser()
    product_id = sys.argv[2]

    if not src.is_file():
        print(f"source image not found: {src}", file=sys.stderr)
        return 1

    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    product = next((p for p in data["products"] if p["id"] == product_id), None)
    if product is None:
        print(f"unknown product id: {product_id}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dst = OUT_DIR / f"{product_id}.avif"
    subprocess.run([
        "magick", str(src),
        "-resize", "1200x1200>",
        "-strip",
        "-quality", "55",
        str(dst),
    ], check=True)

    product["image"] = f"data/images/products/{product_id}.avif"
    data["products"] = [dict(sorted(p.items())) for p in data["products"]]
    CATALOG.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{product_id}: {src.name} -> {dst.relative_to(ROOT)} "
          f"({os.path.getsize(dst) // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
