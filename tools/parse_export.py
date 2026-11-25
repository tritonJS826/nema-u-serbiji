#!/usr/bin/env python3
"""Parse a Telegram HTML chat export into JSONL.

Usage:
    python3 tools/parse_export.py <export_dir> <out.jsonl> [--days 365]

Only messages newer than N days (default 365) before the export's last
message date are written. The export directory is never modified.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

from bs4 import BeautifulSoup


def clean_text(el) -> str:
    """Extract text preserving line breaks, links and emoji alt-text."""
    if el is None:
        return ""
    # Emoji are <img alt="🔥"> inside <span class="emoji">.
    for img in el.find_all("img"):
        img.replace_with(img.get("alt", ""))
    for br in el.find_all("br"):
        br.replace_with("\n")
    for a in el.find_all("a"):
        href = a.get("href", "")
        txt = a.get_text(" ", strip=True)
        if href and href.startswith("http") and href != txt:
            a.replace_with(f"{txt} ({href})" if txt else href)
        elif href and not href.startswith("#"):
            a.replace_with(f"{txt} ({href})" if txt and txt != href else (txt or href))
        else:
            a.replace_with(txt)
    text = el.get_text()
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_file(path: Path):
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "lxml")
    out = []
    last_author = None
    last_author_link = None
    for msg in soup.select("div.message"):
        classes = msg.get("class", [])
        if "service" in classes:
            continue
        mid = msg.get("id", "")
        date_el = msg.select_one(".date.details")
        if date_el is None:
            continue
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})", date_el.get("title", ""))
        if not m:
            continue
        d, mo, y, h, mi, s = map(int, m.groups())
        dt = datetime(y, mo, d, h, mi, s)

        body = msg.select_one(":scope > .body")
        if body is None:
            continue

        from_el = body.select_one(".from_name")
        author = last_author
        author_link = last_author_link
        if from_el is not None:
            author = from_el.get_text(" ", strip=True)
            a = from_el.find("a")
            author_link = a.get("href") if a else None
            last_author, last_author_link = author, author_link

        text_el = body.select_one(".text")
        text = clean_text(text_el)

        forwarded = body.select_one(".forwarded")
        forwarded_from = None
        if forwarded is not None:
            fn = forwarded.select_one(".from_name")
            if fn is not None:
                forwarded_from = fn.get_text(" ", strip=True)

        reply_el = body.select_one(".reply_to")
        reply_to = None
        if reply_el is not None:
            a = reply_el.find("a")
            if a and a.get("href", "").startswith("#"):
                reply_to = a.get("href", "").lstrip("#")

        media_el = body.select_one(".media_wrap")
        media = None
        if media_el is not None:
            kind_el = media_el.select_one(".title.bold")
            media = kind_el.get_text(" ", strip=True) if kind_el else "media"
            desc_el = media_el.select_one(".description")
            if desc_el is not None:
                media += " | " + desc_el.get_text(" ", strip=True)

        photos = []
        for photo_el in body.select("a.photo_wrap"):
            href = photo_el.get("href", "")
            if href and href not in photos:
                photos.append(href)

        preview = body.select_one(".link_preview")
        preview_data = None
        if preview is not None:
            link_el = preview.select_one("a")
            title_el = preview.select_one(".title")
            desc_el = preview.select_one(".description")
            preview_data = {
                "url": link_el.get("href") if link_el else None,
                "title": clean_text(title_el),
                "description": clean_text(desc_el),
            }

        links = []
        for a in body.find_all("a"):
            href = a.get("href", "")
            if href.startswith("http") and href not in links:
                links.append(href)

        if not text and not media and not preview_data:
            continue

        out.append({
            "id": mid,
            "file": path.name,
            "dt": dt.isoformat(sep=" "),
            "author": author,
            "author_link": author_link,
            "text": text,
            "links": links,
            "media": media,
            "photos": photos,
            "preview": preview_data,
            "forwarded_from": forwarded_from,
            "reply_to": reply_to,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir")
    ap.add_argument("out")
    ap.add_argument("--days", type=int, default=365)
    args = ap.parse_args()

    export_dir = Path(args.export_dir)
    files = sorted(
        export_dir.glob("messages*.html"),
        key=lambda p: int(m.group(1)) if (m := re.search(r"(\d+)", p.stem)) else 0,
    )
    if not files:
        sys.exit("no messages*.html found")

    # Determine cutoff from the newest message in the export.
    newest = None
    for f in reversed(files):
        soup_head = f.read_text(encoding="utf-8", errors="replace")
        found = re.findall(r"(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})", soup_head)
        if found:
            d, mo, y, h, mi, s = map(int, found[-1])
            newest = datetime(y, mo, d, h, mi, s)
            break
    if newest is None:
        sys.exit("could not determine export end date")
    cutoff = newest - timedelta(days=args.days)

    total = written = 0
    with open(args.out, "w", encoding="utf-8") as fh:
        for f in files:
            messages = parse_file(f)
            for rec in messages:
                total += 1
                if datetime.fromisoformat(rec["dt"]) < cutoff:
                    continue
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                written += 1
    print(f"newest={newest} cutoff={cutoff}")
    print(f"parsed={total} written={written} -> {args.out}")


if __name__ == "__main__":
    main()
