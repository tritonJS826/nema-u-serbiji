#!/usr/bin/env python3
"""Validate data/catalog.json before publishing.

Checks:
  * unique seller ids and product ids;
  * every product points to an existing seller and category;
  * no duplicate product per (seller_id, normalized name);
  * price/price_unknown consistency;
  * product images are existing .avif files;
  * required fields and URL shapes.

Usage:
    python3 tools/validate_catalog.py [data/catalog.json]
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

URL_RE = re.compile(r"^https://t\.me/[A-Za-z0-9_+/%.-]+$")
ROOT = Path(__file__).resolve().parent.parent


def norm_name(value: str) -> str:
    value = value.lower().replace("ё", "е")
    value = re.sub(r"[^\w\s-]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/catalog.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    errors: list[str] = []

    for key in ("updated_at", "source", "categories", "sellers", "products"):
        if key not in data:
            fail(errors, f"missing top-level key: {key}")
    if errors:
        return report(errors)

    seller_ids = [s.get("id") for s in data["sellers"]]
    product_ids = [p.get("id") for p in data["products"]]
    category_ids = {c.get("id") for c in data["categories"]}

    for label, values in (("seller", seller_ids), ("product", product_ids)):
        for value, count in Counter(values).items():
            if count > 1:
                fail(errors, f"duplicate {label} id: {value!r} ({count}x)")
        if any(not value for value in values):
            fail(errors, f"empty {label} id")

    sellers = set(seller_ids)

    for seller in data["sellers"]:
        sid = seller.get("id")
        for field in ("name", "tg_kind", "tg_url"):
            if not seller.get(field):
                fail(errors, f"seller {sid!r}: missing {field}")
        if seller.get("tg_kind") not in {"user", "group", "message"}:
            fail(errors, f"seller {sid!r}: bad tg_kind {seller.get('tg_kind')!r}")
        for field in ("tg_url", "source_message_url"):
            url = seller.get(field)
            if url and not URL_RE.match(url):
                fail(errors, f"seller {sid!r}: bad {field}: {url!r}")

    seen: dict[tuple[str, str], str] = {}
    for product in data["products"]:
        pid = product.get("id")
        sid = product.get("seller_id")
        name = product.get("name") or ""

        if sid not in sellers:
            fail(errors, f"product {pid!r}: unknown seller {sid!r}")
        if product.get("category") not in category_ids:
            fail(errors, f"product {pid!r}: unknown category {product.get('category')!r}")
        if not name:
            fail(errors, f"product {pid!r}: missing name")

        key = (sid or "", norm_name(name))
        if key in seen:
            fail(errors, f"duplicate product for {sid!r}: {name!r} (also {seen[key]!r})")
        seen[key] = pid

        price = product.get("price")
        unknown = product.get("price_unknown")
        if price is not None and not isinstance(price, (int, float)):
            fail(errors, f"product {pid!r}: price must be a number or null")
        if (price is None) != bool(unknown):
            fail(errors, f"product {pid!r}: price/price_unknown disagree")
        if price is None and not product.get("price_note"):
            fail(errors, f"product {pid!r}: unknown price needs price_note")

        url = product.get("source_message_url")
        if url and not URL_RE.match(url):
            fail(errors, f"product {pid!r}: bad source_message_url: {url!r}")

        image = product.get("image")
        if image:
            if not isinstance(image, str) or not image.lower().endswith(".avif"):
                fail(errors, f"product {pid!r}: image must be an .avif path: {image!r}")
            elif not (ROOT / image).is_file():
                fail(errors, f"product {pid!r}: image file not found: {image!r}")

    return report(errors, len(data["sellers"]), len(data["products"]))


def report(errors: list[str], sellers: int = 0, products: int = 0) -> int:
    if errors:
        print(f"FAIL: {len(errors)} problem(s)", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    print(f"OK: {sellers} sellers, {products} products")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
