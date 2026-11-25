#!/usr/bin/env python3
"""Find food-related candidate messages in parsed export.

Prints a compact, human-readable digest grouped by author so the cards can be
curated semantically. Not part of the website build; a curation helper.
"""
import json
import re
import sys
from collections import Counter, defaultdict

KW = [
    "домашн", "готовая еда", "готовлю", "приготовлю", "пеку", "испеку", "стряпаю",
    "выпечк", "торт", "пирог", "пирож", "пельмен", "вареник", "манты", "хачапури",
    "борщ", "суп", "солянк", "окрошк", "салат", "закуск", "котлет", "тефтел",
    "голубц", "плов", "шашлык", "люля", "буженин", "холодец", "студен", "сало",
    "колбас", "паштет", "консерв", "заготовк", "полуфабрикат", "заказ еды",
    "меню", "порци", "рацион", "ланч", "обед", "ужин", "десерт", "печень",
    "конфет", "мед", "мёд", "варень", "джем", "соус", "аджик", "квас", "компот",
    "пастил", "зефир", "мармелад", "чизкейк", "тирамису", "блин", "оладь",
    "творог", "сырник", "сыр ", "молоко", "кефир", "сметан", "масло ", "яйц",
    "икра", "сельд", "рыб", "копчен", "вялен", "хлеб", "кулич", "пасх",
    "доставка", "самовывоз", "принимаю заказ", "принимаю заказы", "на заказ",
    "цена", "дин", "din", "rsd", "евро", "eur", "кг", "литр", "банк",
]
KW_RE = re.compile("|".join(re.escape(k) for k in KW), re.I)
TG_RE = re.compile(r"(?:https?://)?t\.me/([A-Za-z0-9_+%]{3,})")


def norm(t):
    return (t or "").replace("\n", " ⏎ ")


def main(path, out):
    msgs = [json.loads(l) for l in open(path, encoding="utf-8")]
    by_author = Counter(m["author"] or "?" for m in msgs)
    cand = [m for m in msgs if KW_RE.search(m["text"] or "") or KW_RE.search(
        (m.get("preview") or {}).get("title", "") or "")]
    print("messages:", len(msgs), "candidates:", len(cand), file=sys.stderr)
    print("top authors:", file=sys.stderr)
    for a, c in by_author.most_common(25):
        print(f"  {c:5d} {a}", file=sys.stderr)

    groups = defaultdict(list)
    for m in cand:
        groups[m["author"] or "?"].append(m)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(f"# candidates={len(cand)} authors={len(groups)}\n")
        for author, items in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            fh.write(f"\n\n===== {author} ({len(items)} msg, link={items[0].get('author_link')}) =====\n")
            for m in items:
                links = " ".join(m.get("links") or [])
                prev = m.get("preview") or {}
                fh.write(f"[{m['dt']}] (#{m['id']}) {norm(m['text'])}"
                         + (f"  LINKS:{links}" if links else "")
                         + (f"  MEDIA:{m['media']}" if m.get("media") else "")
                         + (f"  PREVIEW:{prev.get('url')} {prev.get('title')} {prev.get('description')}" if prev else "")
                         + "\n")
    print("->", out, file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
