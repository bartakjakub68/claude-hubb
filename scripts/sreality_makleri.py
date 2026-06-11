#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sreality makléři bez financování — v3 (Next.js scraping).

Veřejné REST API /api/cs/v2/estates už Sreality vypnulo — nový web
běží na Next.js a data jsou v __NEXT_DATA__ JSONu uvnitř HTML.
v3 přepisuje scrape na tuto novou architekturu.

Postup:
  1) Listing stránka /hledani/prodej/{kategorie}/{město}?strana=N
     → __NEXT_DATA__ → queries[estatesSearch] → results[] (summary)
  2) Detail /detail/.../{id} → __NEXT_DATA__ → queries[estate]
     → description + seller{phones,email} + premise (RK)
  3) Pokud popis zmiňuje financování / hypotéku / úvěr → makléř ven.

Použití:
    pip install requests
    python sreality_makleri.py                          # Brno (default)
    python sreality_makleri.py --mesto praha            # jiné město
    python sreality_makleri.py --min-inzeratu 3
    python sreality_makleri.py --max-pages 5            # test: 5 stránek
    python sreality_makleri.py --force                  # ignoruj cache

Cache: .sreality_cache.db (SQLite) — opakovaný běh nestahuje detaily znova.
Výstupy: makleri_bez_financovani.csv + inzeraty_makleru.csv + leady.json
"""

import argparse
import csv
import json
import os
import random
import re
import signal
import sqlite3
import sys
import time
import unicodedata
from datetime import datetime

import requests

# ─── Konfigurace ───────────────────────────────────────────────────────────────

BASE = "https://www.sreality.cz"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
DELAY_MIN, DELAY_MAX = 0.6, 1.2
CACHE_DB = ".sreality_cache.db"

# Kategorie pro URL: /hledani/{type}/{kategorie}/{město}
KATEGORIE = ["byty", "domy"]  # pro prodej

# Zmínky financování — slovní hranice pro krátké tvary
ZMINKY_REGEX = [
    re.compile(r"\bfinancov\w*"),
    re.compile(r"\bhypot\w*"),
    re.compile(r"\buver\w*"),
    re.compile(r"\bzafinanc"),
    re.compile(r"\bsplatk\w*"),
]

# ─── Helpers ────────────────────────────────────────────────────────────────────

def normalize(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).lower().strip()


def zminuje_financovani(popis):
    n = normalize(popis)
    for pat in ZMINKY_REGEX:
        m = pat.search(n)
        if m:
            return True, m.group(0)
    return False, ""


def normalize_phone(phone):
    return re.sub(r"\D", "", phone or "")


def get_html(session, url, max_retries=4):
    for pokus in range(max_retries):
        try:
            r = session.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.text
            if r.status_code == 429:
                wait = 8 * (pokus + 1)
                print(f"  ! 429 rate-limit, cekam {wait}s ...")
                time.sleep(wait)
                continue
            if r.status_code in (404, 410):
                return None
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"  ! HTTP chyba ({e}), opakuji za {3*(pokus+1)}s ...")
            time.sleep(3 * (pokus + 1))
    return None


def parse_next_data(html):
    if not html:
        return None
    m = re.search(r'__NEXT_DATA__[^>]*>([\s\S]*?)</script>', html)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def polite_sleep():
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


# ─── Cache ──────────────────────────────────────────────────────────────────────

def init_cache():
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS detail (
            id INTEGER PRIMARY KEY,
            seller_id INTEGER,
            makler TEXT, rk TEXT, telefon TEXT, telefon_norm TEXT, email TEXT,
            titulek TEXT, cena_czk INTEGER, lokalita TEXT,
            kraj TEXT, okres TEXT, mesto TEXT,
            url TEXT,
            zminil_fin INTEGER, zminka TEXT,
            popis_raw TEXT,
            fetched_at TEXT
        )
    """)
    # Migrace: pokud uz tabulka existuje bez novych sloupcu, doplnit.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(detail)").fetchall()}
    for new in ('kraj', 'okres', 'mesto'):
        if new not in cols:
            conn.execute(f"ALTER TABLE detail ADD COLUMN {new} TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seller ON detail(seller_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_telef ON detail(telefon_norm)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_okres ON detail(okres)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_kraj ON detail(kraj)")
    conn.commit()
    return conn


def cache_has(conn, eid):
    cur = conn.execute("SELECT 1 FROM detail WHERE id=?", (eid,))
    return cur.fetchone() is not None


def cache_save(conn, row):
    conn.execute("""
        INSERT OR REPLACE INTO detail
        (id, seller_id, makler, rk, telefon, telefon_norm, email,
         titulek, cena_czk, lokalita, kraj, okres, mesto,
         url, zminil_fin, zminka, popis_raw, fetched_at)
        VALUES (:id, :seller_id, :makler, :rk, :telefon, :telefon_norm, :email,
                :titulek, :cena_czk, :lokalita, :kraj, :okres, :mesto,
                :url, :zminil_fin, :zminka, :popis_raw, :fetched_at)
    """, row)
    conn.commit()


# ─── Sreality Next.js extraktory ────────────────────────────────────────────────

def extract_listing_results(next_data):
    """Z listing stránky vrátí (results, total)."""
    try:
        queries = next_data['props']['pageProps']['dehydratedState']['queries']
        q = next(q for q in queries
                 if isinstance(q.get('queryKey'), list) and q['queryKey'] and q['queryKey'][0] == 'estatesSearch')
        data = q['state']['data']
        return data.get('results', []), data.get('pagination', {}).get('total', 0)
    except (KeyError, StopIteration, TypeError):
        return [], 0


# URL detailu se z __NEXT_DATA__ neda spolehlive sestavit (SEO slug zavisi
# na quarter/street kombinaci, ktera neni v summary). Spolehlive je extrahovat
# detail URLs primo z HTML listing stranky pres regex.
DETAIL_URL_RE = re.compile(r'(/detail/[a-z]+/[a-z]+/[a-z0-9+\-/]+/(\d+))')

def extract_detail_urls(html):
    """Vrátí dict {id: full_url} pro všechny detail URLs nalezené v HTML."""
    out = {}
    if not html:
        return out
    for path, eid in DETAIL_URL_RE.findall(html):
        out.setdefault(int(eid), BASE + path)
    return out


def extract_estate_detail(next_data):
    try:
        queries = next_data['props']['pageProps']['dehydratedState']['queries']
        q = next(q for q in queries
                 if isinstance(q.get('queryKey'), list) and q['queryKey'] and q['queryKey'][0] == 'estate')
        return q['state']['data']
    except (KeyError, StopIteration, TypeError):
        return None


def detail_url_from_summary(s):
    """Z listing summary složí URL detailu."""
    cat_sub_id = (s.get('categorySubCb') or {}).get('value', 0)
    # mapping zjednoduseny: subkategorie ID -> SEO slug
    sub_slug = {
        1: '1+kk', 2: '1+1', 3: '2+kk', 4: '2+kk',  # fallbacks
        5: '2+1', 6: '3+kk', 7: '3+1', 8: '4+kk',
        9: '4+1', 10: '5+kk', 11: '5+1', 12: '6-a-vice',
    }.get(cat_sub_id, 'jiny')
    loc = s.get('locality', {})
    city = loc.get('citySeoName') or 'cr'
    quarter = loc.get('quarterSeoName') or loc.get('wardSeoName') or ''
    street = loc.get('streetSeoName') or ''
    slug_parts = [city]
    if quarter and quarter not in city: slug_parts.append(quarter.replace(city+'-',''))
    if street: slug_parts.append(street)
    slug = '-'.join(slug_parts) if len(slug_parts) > 1 else slug_parts[0]
    cat_type = (s.get('categoryTypeCb') or {}).get('name', 'prodej').lower()
    cat_main = (s.get('categoryMainCb') or {}).get('name', 'byt').lower().rstrip('y')
    if cat_main == 'doma': cat_main = 'dum'
    # Anything works — Sreality redirects via the ID
    return f"{BASE}/detail/{cat_type}/{cat_main}/{sub_slug}/{slug}/{s['id']}"


def parse_seller(estate):
    s = estate.get('seller') or {}
    tels = []
    for p in s.get('phones', []) or []:
        ph = p.get('phone', '').strip()
        if ph:
            tels.append(ph)
    tel_str = "; ".join(tels)
    return {
        "seller_id": s.get('id') or 0,
        "makler": s.get('name', '') or '',
        "email": s.get('email', '') or '',
        "telefon": tel_str,
        "telefon_norm": normalize_phone(tels[0] if tels else ''),
    }


def parse_premise(estate):
    p = estate.get('premise') or {}
    return p.get('name', '') or ''


# ─── Crawl ──────────────────────────────────────────────────────────────────────

def iter_listings(session, mesto, kategorie, max_pages=None):
    """Yield (summary_dict, detail_url) ze všech stránek."""
    page = 1
    seen_total = None
    while True:
        url = f"{BASE}/hledani/prodej/{kategorie}/{mesto}"
        if page > 1:
            url += f"?strana={page}"
        html = get_html(session, url)
        nd = parse_next_data(html)
        if not nd:
            break
        results, total = extract_listing_results(nd)
        if not results:
            break
        detail_urls = extract_detail_urls(html)  # {id: full_url}
        if seen_total is None:
            seen_total = total
            print(f"  [{kategorie}] Sreality hlasi {total} inzeratu pro '{mesto}'")
        for s in results:
            yield s, detail_urls.get(s.get('id'))
        if len(results) < 20:
            break
        if max_pages and page >= max_pages:
            break
        page += 1
        polite_sleep()


def fetch_estate_detail(session, eid, hint_url=None):
    """Pokusi se nacist detail. Hint URL je SEO slug; jako fallback /detail/{id}."""
    candidates = []
    if hint_url:
        candidates.append(hint_url)
    candidates.append(f"{BASE}/detail/{eid}")  # holý ID jako fallback
    for url in candidates:
        html = get_html(session, url)
        nd = parse_next_data(html)
        if nd:
            detail = extract_estate_detail(nd)
            if detail:
                return detail, url
    return None, None


# ─── Hlavní program ─────────────────────────────────────────────────────────────

def makler_klic(row):
    if row.get("seller_id"):
        return ("sid", row["seller_id"])
    if row.get("telefon_norm"):
        return ("tel", row["telefon_norm"])
    return ("name", row.get("makler", ""))


def run(args):
    conn = init_cache()
    session = requests.Session()

    interrupted = {"flag": False}
    def on_sig(sig, frame):
        if interrupted["flag"]:
            print("\n💥 Druhy Ctrl+C — okamzity exit.")
            sys.exit(130)
        interrupted["flag"] = True
        print("\n⚠ Ctrl+C — dokoncim aktualni request a uzavru ...")
    signal.signal(signal.SIGINT, on_sig)

    # Lokality muzou byt comma-separated: "brno,blansko,breclav"
    lokality = [m.strip() for m in args.mesto.split(',') if m.strip()]

    # 1. Sber summary listings + detail URLs
    summaries = []  # [(summary_dict, detail_url)]
    for lokalita in lokality:
        if interrupted["flag"]: break
        for kat in KATEGORIE:
            if interrupted["flag"]: break
            print(f"== Listing: {kat} v '{lokalita}' ==")
            cnt = 0
            for s, durl in iter_listings(session, lokalita, kat, args.max_pages):
                summaries.append((s, durl))
                cnt += 1
                if interrupted["flag"]: break
            print(f"  -> {cnt} summary listings")

    # Dedup podle id
    seen = set()
    unique = []
    for s, durl in summaries:
        eid = s.get('id')
        if eid and eid not in seen:
            seen.add(eid)
            unique.append((s, durl))
    print(f"\nUnikatnich inzeratu: {len(unique)}")

    # 2. Detaily
    start = time.time()
    fetched = 0; cached = 0; failed = 0
    for i, (s, hint) in enumerate(unique, 1):
        if interrupted["flag"]: break
        eid = s['id']
        if not args.force and cache_has(conn, eid):
            cached += 1
            continue

        detail, used_url = fetch_estate_detail(session, eid, hint)
        polite_sleep()
        if not detail:
            failed += 1
            continue

        seller = parse_seller(detail)
        rk = parse_premise(detail)
        popis = detail.get('description', '') or ''
        zminil, zminka = zminuje_financovani(popis)
        loc = detail.get('locality') or {}
        lokalita_str = ', '.join(filter(None, [loc.get('street'), loc.get('quarter') or loc.get('cityPart'), loc.get('city')]))

        row = {
            "id": eid,
            "seller_id": seller["seller_id"],
            "makler": seller["makler"],
            "rk": rk,
            "telefon": seller["telefon"],
            "telefon_norm": seller["telefon_norm"],
            "email": seller["email"],
            "titulek": detail.get('name', '') or '',
            "cena_czk": detail.get('priceCzk') or 0,
            "lokalita": lokalita_str,
            "kraj": loc.get('region') or '',
            "okres": loc.get('district') or '',
            "mesto": loc.get('city') or '',
            "url": used_url or hint,
            "zminil_fin": 1 if zminil else 0,
            "zminka": zminka,
            "popis_raw": popis[:3000],
            "fetched_at": datetime.now().isoformat(timespec='seconds'),
        }
        cache_save(conn, row)
        fetched += 1

        if fetched % 10 == 0:
            elapsed = time.time() - start
            speed = fetched / elapsed if elapsed else 0
            eta = (len(unique) - i) / speed if speed > 0 else 0
            print(f"  [{i}/{len(unique)}] fetch={fetched} cache={cached} fail={failed} "
                  f"speed={speed:.1f}/s ETA={int(eta)}s")

    print(f"\nFetch hotov: nove={fetched}, cache={cached}, fail={failed}.")

    # 3. Agregace
    cur = conn.execute("SELECT * FROM detail")
    cols = [c[0] for c in cur.description]
    makleri = {}
    for r in cur.fetchall():
        d = dict(zip(cols, r))
        klic = makler_klic(d)
        rec = makleri.get(klic)
        if rec is None:
            rec = {
                "makler": d["makler"], "rk": d["rk"],
                "telefon": d["telefon"], "email": d["email"],
                "seller_id": d["seller_id"],
                "inzeraty": [], "zminil": False, "zminky": set(),
            }
            makleri[klic] = rec
        if d["zminil_fin"]:
            rec["zminil"] = True
            if d["zminka"]: rec["zminky"].add(d["zminka"])
        rec["inzeraty"].append({
            "id": d["id"], "titulek": d["titulek"],
            "cena_czk": d["cena_czk"], "lokalita": d["lokalita"],
            "kraj": d.get("kraj") or '',
            "okres": d.get("okres") or '',
            "mesto": d.get("mesto") or '',
            "url": d["url"],
        })

    cisti = [r for r in makleri.values()
             if not r["zminil"] and len(r["inzeraty"]) >= args.min_inzeratu]
    cisti.sort(key=lambda r: len(r["inzeraty"]), reverse=True)

    # 4. Export CSV
    out_souhrn = "makleri_bez_financovani.csv"
    out_detail = "inzeraty_makleru.csv"
    out_json   = "leady.json"

    with open(out_souhrn, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["makler", "rk", "telefon", "email", "seller_id", "pocet_inzeratu"])
        for r in cisti:
            w.writerow([r["makler"], r["rk"], r["telefon"], r["email"],
                        r["seller_id"], len(r["inzeraty"])])

    with open(out_detail, "w", newline="", encoding="utf-8-sig") as f:
        cols = ["makler", "rk", "seller_id", "id", "titulek",
                "cena_czk", "lokalita", "kraj", "okres", "mesto", "url"]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for r in cisti:
            for inz in r["inzeraty"]:
                w.writerow({"makler": r["makler"], "rk": r["rk"],
                            "seller_id": r["seller_id"], **inz})

    # Pro každého makléře zjistit primární okres + kraj (nejčastější)
    from collections import Counter
    def primary_loc(rec, field):
        c = Counter((inz.get(field) or '') for inz in rec["inzeraty"])
        c.pop('', None)
        return c.most_common(1)[0][0] if c else ''

    # Agregace pro JSON: celá DB, ne jen aktuální běh — uživatel chce vidět
    # vše napříč všemi krajskými runy, ne jen poslední batch.
    cur_all = conn.execute("SELECT * FROM detail")
    cols_all = [c[0] for c in cur_all.description]
    makleri_all = {}
    for r in cur_all.fetchall():
        d = dict(zip(cols_all, r))
        klic = makler_klic(d)
        rec = makleri_all.get(klic)
        if rec is None:
            rec = {
                "makler": d["makler"], "rk": d["rk"],
                "telefon": d["telefon"], "email": d["email"],
                "seller_id": d["seller_id"],
                "inzeraty": [], "zminil": False,
            }
            makleri_all[klic] = rec
        if d["zminil_fin"]:
            rec["zminil"] = True
        rec["inzeraty"].append({
            "id": d["id"], "titulek": d["titulek"],
            "cena_czk": d["cena_czk"], "lokalita": d["lokalita"],
            "kraj": d.get("kraj") or '', "okres": d.get("okres") or '',
            "mesto": d.get("mesto") or '',
            "url": d["url"],
        })
    cisti_all = [r for r in makleri_all.values()
                 if not r["zminil"] and len(r["inzeraty"]) >= args.min_inzeratu]
    cisti_all.sort(key=lambda r: len(r["inzeraty"]), reverse=True)

    # Sezna krajů a okresů pro UI filtry
    kraje = sorted({inz.get('kraj','') for r in makleri_all.values() for inz in r["inzeraty"] if inz.get('kraj')})
    okresy = sorted({inz.get('okres','') for r in makleri_all.values() for inz in r["inzeraty"] if inz.get('okres')})

    # JSON pro dashboard
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({
            "generovano": datetime.now().isoformat(timespec='seconds'),
            "mesto": args.mesto,  # aktualni batch label
            "kraje": kraje,
            "okresy": okresy,
            "celkem_inzeratu_v_cache": sum(len(r["inzeraty"]) for r in makleri_all.values()),
            "celkem_makleru": len(makleri_all),
            "zminili": sum(1 for r in makleri_all.values() if r["zminil"]),
            "cisti": [
                {
                    "makler": r["makler"], "rk": r["rk"],
                    "telefon": r["telefon"], "email": r["email"],
                    "seller_id": r["seller_id"],
                    "pocet_inzeratu": len(r["inzeraty"]),
                    "primarni_okres": primary_loc(r, 'okres'),
                    "primarni_kraj": primary_loc(r, 'kraj'),
                    "primarni_mesto": primary_loc(r, 'mesto'),
                    "okresy_makl": sorted({inz.get('okres','') for inz in r["inzeraty"] if inz.get('okres')}),
                    "inzeraty": r["inzeraty"][:8],  # top 8 ukázek
                }
                for r in cisti_all
            ],
        }, f, ensure_ascii=False, indent=2)

    s_total = len(makleri)
    s_zmin = sum(1 for r in makleri.values() if r["zminil"])
    print(f"\n📊 Souhrn:")
    print(f"   Inzeratu zpracovano: {len(unique)}")
    print(f"   Unikatnich makleru:  {s_total}")
    print(f"   Zminili financ.:     {s_zmin}")
    print(f"   CISTI makleri:       {s_total - s_zmin}")
    print(f"   Splnuji min {args.min_inzeratu} inz: {len(cisti)}")
    print(f"   → {out_souhrn}")
    print(f"   → {out_detail}")
    print(f"   → {out_json}")
    session.close()
    conn.close()


def parse_args():
    p = argparse.ArgumentParser(description="Sreality makléři bez financování (v3)")
    p.add_argument("--mesto", default="brno",
                   help="město v URL slugu (brno / praha / ostrava / ...). Default: brno")
    p.add_argument("--max-pages", type=int, default=None,
                   help="strop pro počet stránek na kategorii (každá ~20 inz.)")
    p.add_argument("--min-inzeratu", type=int, default=1,
                   help="exportovat jen makléře s tolika+ inzeráty")
    p.add_argument("--force", action="store_true",
                   help="ignorovat cache, znovu stáhnout všechny detaily")
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
