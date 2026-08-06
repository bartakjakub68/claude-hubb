#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nová Zelená Úsporám — energetičtí poradci (scrape z official NZÚ portálu).

Endpoint: POST /wp-json/nzu/v1/advisor2026-search/html
Payload:  {"searchType":"address","query":...,"lat":...,"lng":...,"page":N,"seed":123}
Response: {"html": "...", "items": [...], "loadMore": ...}
          Kaslime na items — parsujeme HTML kvůli spolehlivosti.

Vrací top 20 nejbližších poradců k daným souřadnicím. Iterací stránek 1..N
získáme cca 900 poradců (celé ČR, seřazeno podle vzdálenosti od centra).

Použití:
    python nzu_poradci.py                       # celá ČR, ~15 min
    python nzu_poradci.py --max-pages 5         # rychlý test

Výstup: nzu_poradci.json (nasledně přehodit do data/)
"""

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import datetime

import urllib.request
import urllib.error

BASE = "https://novazelenausporam.cz"
API = BASE + "/wp-json/nzu/v1/advisor2026-search/html"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; portal-leads/1.0)",
    "Content-Type": "application/json",
}

# Střed ČR (u Havlíčkova Brodu) — použitá defaultně NZÚ formulářem.
CENTRUM_CR = {"lat": 49.8175, "lng": 15.473}


def post_json(url, payload, max_retries=3):
    body = json.dumps(payload).encode("utf-8")
    for pokus in range(max_retries):
        try:
            req = urllib.request.Request(url, data=body, headers=HEADERS, method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as e:
            print(f"  ! chyba {type(e).__name__}: {e}", file=sys.stderr)
            time.sleep(2 * (pokus + 1))
    return None


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"&amp;", "&", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# Regex pro extrakci polí z HTML karty
RE_CARD = re.compile(r'<div class="advisor-card-2026"[^>]*id="advisor-2026-(\d+)"[\s\S]*?(?=<div class="advisor-card-2026"|<div class="advisor-list__more_wrapper"|$)')
RE_NAME = re.compile(r'class="advisor-card-2026__name"[^>]*>([^<]+)<')
RE_REGIONS = re.compile(r'class="advisor-card-2026__regions"[^>]*>\s*Působnost:\s*([^<]+)<')
RE_PHONE = re.compile(r'href="tel:([^"]+)"')
RE_EMAIL = re.compile(r'href="mailto:([^"]+)"')
RE_SUBJECT = re.compile(r'class="advisor-card-2026__subject"[^>]*>([\s\S]{0,600}?)</div>')
RE_PASS = re.compile(r'advisor-card-2026__badge--active"')
RE_PHOTO = re.compile(r"background-image:\s*url\('([^']+)'\)")


def parse_html(html):
    """Vrací list dict s údaji o poradcích."""
    poradci = []
    for m in RE_CARD.finditer(html or ""):
        card = m.group(0)
        pid = m.group(1)
        n = RE_NAME.search(card)
        r = RE_REGIONS.search(card)
        p = RE_PHONE.search(card)
        e = RE_EMAIL.search(card)
        s = RE_SUBJECT.search(card)
        photo = RE_PHOTO.search(card)
        poradci.append({
            "id": pid,
            "jmeno": strip_html(n.group(1)) if n else "",
            "regiony": strip_html(r.group(1)) if r else "",
            "telefon": p.group(1).replace(" ", "").replace("&nbsp;", "") if p else "",
            "email": e.group(1) if e else "",
            "subject": strip_html(s.group(1))[:300] if s else "",
            "renovacni_pas": bool(RE_PASS.search(card)),
            "foto": photo.group(1).replace("\\/", "/").replace("\\:", ":") if photo else "",
        })
    return poradci


def run(args):
    seen = {}  # id -> record (dedup přes rerun / duplicity)
    empty_pages = 0

    for page in range(1, (args.max_pages or 200) + 1):
        payload = {
            "searchType": "address",
            "query": "",
            "lat": CENTRUM_CR["lat"],
            "lng": CENTRUM_CR["lng"],
            "page": page,
            "seed": 123,
        }
        data = post_json(API, payload)
        if not data or not data.get("html"):
            empty_pages += 1
            if empty_pages >= 3:
                print(f"[stránka {page}] 3× prázdná odpověď v řadě → konec.")
                break
            time.sleep(1)
            continue

        page_poradci = parse_html(data["html"])
        if not page_poradci:
            empty_pages += 1
            if empty_pages >= 3:
                print(f"[stránka {page}] 3× bez karet → konec.")
                break
            continue
        empty_pages = 0

        new_on_page = 0
        for p in page_poradci:
            if p["id"] not in seen:
                seen[p["id"]] = p
                new_on_page += 1

        print(f"[stránka {page:>3}] +{new_on_page:>2} nových (celkem {len(seen)})")
        time.sleep(0.4)  # polite

    poradci = list(seen.values())
    poradci.sort(key=lambda x: (x["jmeno"] or "z").lower())

    # Odvození statistik
    with_email = sum(1 for p in poradci if p["email"])
    with_phone = sum(1 for p in poradci if p["telefon"])
    with_pas = sum(1 for p in poradci if p["renovacni_pas"])

    # Rozklad regionů — Působnost je typicky comma-separated
    all_okresy = set()
    for p in poradci:
        for o in re.split(r",\s*", p["regiony"] or ""):
            o = o.strip()
            if o:
                all_okresy.add(o)

    out = {
        "generovano": datetime.now().isoformat(timespec="seconds"),
        "zdroj": "novazelenausporam.cz (advisor2026-search)",
        "celkem": len(poradci),
        "s_emailem": with_email,
        "s_telefonem": with_phone,
        "s_renovacnim_pasem": with_pas,
        "okresy": sorted(all_okresy),
        "poradci": poradci,
    }
    fname = args.output
    with open(fname, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print()
    print(f"✅ Uloženo: {fname}")
    print(f"   Celkem poradců:      {len(poradci)}")
    print(f"   S emailem:           {with_email}")
    print(f"   S telefonem:         {with_phone}")
    print(f"   S Renovačním pasem:  {with_pas}")
    print(f"   Různých okresů:      {len(all_okresy)}")


def parse_args():
    p = argparse.ArgumentParser(description="NZÚ energetičtí poradci")
    p.add_argument("--max-pages", type=int, default=60,
                   help="strop pro počet stránek (default 60, ~1200 poradců)")
    p.add_argument("--output", default="nzu_poradci.json",
                   help="výstupní JSON soubor (default nzu_poradci.json)")
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
