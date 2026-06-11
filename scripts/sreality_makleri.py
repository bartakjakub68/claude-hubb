#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sreality makléři bez financování — v2.

Projde inzeráty na Sreality přes veřejné JSON API a vrátí JEN ty makléře,
v jejichž inzerátech NENÍ ŽÁDNÁ zmínka o financování / hypotéce / úvěru.

Vylepšení proti v1:
  • SQLite cache — při dalším běhu se nestahují detaily, které už máš.
  • Word-boundary regex — neoznačí "uvedeno" jako zmínku úvěru.
  • Telefon se normalizuje (jen číslice) → spolehlivější fallback klíč.
  • Náhodný jitter mezi requesty → vyšší šance proti rate-limitu.
  • CLI argumenty — region, max stránek, min počet inzerátů, force-refresh.
  • Resume — Ctrl+C / pád neuškodí, pokračuješ tam, kde jsi přestal.
  • Progress + ETA.

Použití:
    pip install requests
    python sreality_makleri.py                          # cely CR, byty + domy prodej
    python sreality_makleri.py --region 21              # jen Středočeský kraj
    python sreality_makleri.py --min-inzeratu 3         # jen makléři s 3+ inz.
    python sreality_makleri.py --force                  # ignoruj cache
    python sreality_makleri.py --max-pages 5            # jen prvních 500 inz.

Sreality kraje (locality_region_id):
    10=Praha · 11=Středočeský · 12=Jihočeský · 13=Plzeňský · 14=Karlovarský
    15=Ústecký · 16=Liberecký · 17=Královéhradecký · 18=Pardubický
    19=Vysočina · 20=Jihomoravský · 21=Olomoucký · 22=Zlínský · 23=Moravskoslezský
    (Pozor: ID se v sreality občas mění. Ověř v URL filtrace.)

Výstupy:
    makleri_bez_financovani.csv   — souhrn (1 řádek na makléře)
    inzeraty_makleru.csv          — detail (1 řádek na inzerát)
    .sreality_cache.db            — SQLite cache (mazat = full re-fetch)
"""

import argparse
import csv
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

API = "https://www.sreality.cz/api/cs/v2"
HEADERS = {"User-Agent": "Mozilla/5.0 (lead-research; kontakt: tvuj@email.cz)"}
DELAY_MIN, DELAY_MAX = 0.35, 0.75  # náhodný jitter
PER_PAGE = 100
CACHE_DB = ".sreality_cache.db"

# main: 1=byty 2=domy 3=pozemky 4=komerční 5=ostatní
# type: 1=prodej 2=pronájem 3=dražba
SEGMENTY = [
    {"category_main_cb": 1, "category_type_cb": 1},  # byty na prodej
    {"category_main_cb": 2, "category_type_cb": 1},  # domy na prodej
]

# Zmínky financování — slovní hranice (\b) pro krátké tvary, substring jen
# pro dlouhé, které nedělají falešné pozitivy.
# Bez diakritiky, lowercase (po normalize()).
ZMINKY_REGEX = [
    re.compile(r"\bfinancov\w*"),     # financování, financovat, profinancujeme
    re.compile(r"\bhypot\w*"),         # hypotéka, hypotéku, hypoteční
    re.compile(r"\buver\w*"),          # úvěr, úvěrování — \b zabrání matchnutí "uvedeno"
    re.compile(r"\bzafinanc"),         # zafinancuji, zafinancujeme
    re.compile(r"\bsplatk\w*"),        # splátka, splátkový (volitelné — pohlídej)
]

# ─── Helpers ────────────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    """Lowercase, bez diakritiky, bez HTML tagů, jednoduché mezery."""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).lower().strip()


def zminuje_financovani(popis: str) -> tuple[bool, str]:
    """Vrací (True, klíčové slovo) pokud popis zmiňuje financování."""
    n = normalize(popis)
    for pat in ZMINKY_REGEX:
        m = pat.search(n)
        if m:
            return True, m.group(0)
    return False, ""


def normalize_phone(phone: str) -> str:
    """+420 777 123 456 → 420777123456"""
    return re.sub(r"\D", "", phone or "")


def get_json(session, url, params=None, max_retries=4):
    for pokus in range(max_retries):
        try:
            r = session.get(url, params=params, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                wait = 5 * (pokus + 1)
                print(f"  ⚠ 429 rate-limit, čekám {wait}s …")
                time.sleep(wait)
                continue
            if r.status_code == 404:
                return None
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"  ! HTTP chyba ({e}), opakuji za {3 * (pokus + 1)}s …")
            time.sleep(3 * (pokus + 1))
    return None


def polite_sleep():
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


# ─── Cache ──────────────────────────────────────────────────────────────────────

def init_cache():
    conn = sqlite3.connect(CACHE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS detail (
            hash_id TEXT PRIMARY KEY,
            seller_id TEXT,
            makler TEXT, rk TEXT, telefon TEXT, telefon_norm TEXT, email TEXT,
            titulek TEXT, cena_czk INTEGER, lokalita TEXT,
            plocha TEXT, dispozice TEXT, stav TEXT,
            lat REAL, lon REAL, url TEXT,
            zminil_fin INTEGER, zminka TEXT,
            popis_raw TEXT,
            fetched_at TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seller ON detail(seller_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_telef ON detail(telefon_norm)")
    conn.commit()
    return conn


def cache_has(conn, hid: str) -> bool:
    cur = conn.execute("SELECT 1 FROM detail WHERE hash_id=?", (hid,))
    return cur.fetchone() is not None


def cache_save(conn, row: dict):
    conn.execute("""
        INSERT OR REPLACE INTO detail
        (hash_id, seller_id, makler, rk, telefon, telefon_norm, email,
         titulek, cena_czk, lokalita, plocha, dispozice, stav,
         lat, lon, url, zminil_fin, zminka, popis_raw, fetched_at)
        VALUES (:hash_id, :seller_id, :makler, :rk, :telefon, :telefon_norm, :email,
                :titulek, :cena_czk, :lokalita, :plocha, :dispozice, :stav,
                :lat, :lon, :url, :zminil_fin, :zminka, :popis_raw, :fetched_at)
    """, row)
    conn.commit()


# ─── Sreality extraktory ────────────────────────────────────────────────────────

def items_to_dict(detail: dict) -> dict:
    out = {}
    for it in detail.get("items", []) or []:
        name = it.get("name")
        val = it.get("value")
        if isinstance(val, (list, dict)):
            val = str(val)
        if name:
            out[name] = val
    return out


def extract_seller(detail: dict) -> dict:
    seller = (detail.get("_embedded", {}) or {}).get("seller", {}) or {}
    telefony = []
    for t in seller.get("phones", []) or []:
        cislo = (t.get("code", "") + t.get("number", "")).strip()
        if cislo:
            telefony.append(cislo)
    tel_str = "; ".join(telefony)
    return {
        "makler": seller.get("user_name") or seller.get("name") or "",
        "rk": seller.get("company_name") or seller.get("rk") or "",
        "telefon": tel_str,
        "telefon_norm": normalize_phone(tel_str.split(";")[0] if tel_str else ""),
        "email": seller.get("email", ""),
        "seller_id": str(seller.get("user_id") or seller.get("id") or ""),
    }


def extract_inzerat(detail: dict, hid: str) -> dict:
    items = items_to_dict(detail)
    cena = (detail.get("price_czk", {}) or {}).get("value_raw")
    mapa = detail.get("map", {}) or {}
    return {
        "hash_id": hid,
        "titulek": (detail.get("name", {}) or {}).get("value", ""),
        "cena_czk": cena,
        "lokalita": (detail.get("locality", {}) or {}).get("value", ""),
        "plocha": items.get("Užitná plocha") or items.get("Plocha")
                  or items.get("Plocha pozemku", ""),
        "dispozice": items.get("Dispozice", ""),
        "stav": items.get("Stav objektu", ""),
        "lat": mapa.get("lat"),
        "lon": mapa.get("lon"),
        "url": f"https://www.sreality.cz/detail/x/x/x/x/{hid}",
    }


# ─── Listing iterator ───────────────────────────────────────────────────────────

def iter_hash_ids(session, segment, max_pages=None, region_id=None):
    page = 1
    seen = set()
    while True:
        params = {**segment, "per_page": PER_PAGE, "page": page}
        if region_id:
            params["locality_region_id"] = region_id
        data = get_json(session, f"{API}/estates", params)
        if not data:
            break
        estates = data.get("_embedded", {}).get("estates", [])
        if not estates:
            break
        new_count = 0
        for e in estates:
            hid = e.get("hash_id")
            if hid and hid not in seen:
                seen.add(hid)
                new_count += 1
                yield str(hid)
        if new_count == 0:
            # Stránka neobsahuje nic nového — pravděpodobně konec
            break
        total = data.get("result_size", 0)
        if page * PER_PAGE >= total:
            break
        if max_pages and page >= max_pages:
            break
        page += 1
        polite_sleep()


# ─── Klíč makléře (deduplikace) ─────────────────────────────────────────────────

def makler_klic(row: dict) -> tuple:
    """Preferuj seller_id, fallback (normalizovaný telefon, jméno)."""
    if row.get("seller_id"):
        return ("sid", row["seller_id"])
    if row.get("telefon_norm"):
        return ("tel", row["telefon_norm"])
    return ("name", row.get("makler", ""))


# ─── Hlavní program ─────────────────────────────────────────────────────────────

def run(args):
    conn = init_cache()
    session = requests.Session()

    # Graceful Ctrl+C — průběžně se ukládá do cache, takže lze pokračovat.
    interrupted = {"flag": False}
    def on_sig(sig, frame):
        if interrupted["flag"]:
            print("\n💥 Druhý Ctrl+C — okamžitý exit.")
            sys.exit(130)
        interrupted["flag"] = True
        print("\n⚠ Ctrl+C — dokončím aktuální request a uložím … (znovu Ctrl+C = okamžitý exit)")
    signal.signal(signal.SIGINT, on_sig)

    # 1. Sber hash_ids (přes všechny segmenty)
    all_hids: list[str] = []
    for segment in SEGMENTY:
        seg_label = "byty" if segment["category_main_cb"] == 1 else "domy"
        print(f"== Segment: {seg_label} (prodej){'  · kraj ' + str(args.region) if args.region else ''} ==")
        for hid in iter_hash_ids(session, segment, args.max_pages, args.region):
            all_hids.append(hid)
            if interrupted["flag"]:
                break
        if interrupted["flag"]:
            break
        print(f"  → posbíráno {len(all_hids)} listings ID zatím")

    all_hids = list(dict.fromkeys(all_hids))  # dedup (zachovej pořadí)
    print(f"\nCelkem unikátních inzerátů: {len(all_hids)}")

    # 2. Detaily (s cache)
    start = time.time()
    fetched = 0
    cached = 0
    for i, hid in enumerate(all_hids, 1):
        if interrupted["flag"]:
            break

        if not args.force and cache_has(conn, hid):
            cached += 1
            continue

        detail = get_json(session, f"{API}/estates/{hid}")
        polite_sleep()
        if not detail:
            continue

        seller = extract_seller(detail)
        inz = extract_inzerat(detail, hid)
        popis = (detail.get("text", {}) or {}).get("value", "")
        zminil, zminka = zminuje_financovani(popis)

        row = {
            **seller, **inz,
            "zminil_fin": 1 if zminil else 0,
            "zminka": zminka,
            "popis_raw": popis[:5000],  # pro audit, max 5000 znaků
            "fetched_at": datetime.now().isoformat(timespec="seconds"),
        }
        cache_save(conn, row)
        fetched += 1

        if fetched % 20 == 0:
            elapsed = time.time() - start
            speed = fetched / elapsed if elapsed > 0 else 0
            zbyva = (len(all_hids) - i) / speed if speed > 0 else 0
            print(f"  [{i}/{len(all_hids)}]  fetch={fetched}  cache={cached}  "
                  f"rychlost={speed:.1f}/s  ETA={int(zbyva)}s")

    print(f"\nFetch hotov. Nové: {fetched}, z cache: {cached}.")

    # 3. Agregace po makléři z DB
    print("\nAgregace po makléři …")
    cur = conn.execute("""
        SELECT seller_id, telefon_norm, makler, rk, telefon, email,
               hash_id, titulek, cena_czk, lokalita, plocha, dispozice,
               stav, lat, lon, url, zminil_fin, zminka
        FROM detail
    """)
    makleri: dict = {}
    for r in cur.fetchall():
        d = dict(zip([c[0] for c in cur.description], r))
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
            if d["zminka"]:
                rec["zminky"].add(d["zminka"])
        rec["inzeraty"].append({
            "hash_id": d["hash_id"],
            "titulek": d["titulek"], "cena_czk": d["cena_czk"],
            "lokalita": d["lokalita"], "plocha": d["plocha"],
            "dispozice": d["dispozice"], "stav": d["stav"],
            "lat": d["lat"], "lon": d["lon"], "url": d["url"],
        })

    # 4. Filtr — jen čistí + min počet inzerátů
    cisti = [r for r in makleri.values()
             if not r["zminil"] and len(r["inzeraty"]) >= args.min_inzeratu]
    cisti.sort(key=lambda r: len(r["inzeraty"]), reverse=True)

    # 5. Export CSV
    out_souhrn = "makleri_bez_financovani.csv"
    out_detail = "inzeraty_makleru.csv"

    with open(out_souhrn, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["makler", "rk", "telefon", "email", "seller_id", "pocet_inzeratu"])
        for r in cisti:
            w.writerow([r["makler"], r["rk"], r["telefon"], r["email"],
                        r["seller_id"], len(r["inzeraty"])])

    with open(out_detail, "w", newline="", encoding="utf-8-sig") as f:
        cols = ["makler", "rk", "seller_id", "hash_id", "titulek", "cena_czk",
                "lokalita", "plocha", "dispozice", "stav", "lat", "lon", "url"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in cisti:
            for inz in r["inzeraty"]:
                w.writerow({
                    "makler": r["makler"], "rk": r["rk"],
                    "seller_id": r["seller_id"], **inz,
                })

    # 6. Souhrn
    s_total = len(makleri)
    s_zmin = sum(1 for r in makleri.values() if r["zminil"])
    print()
    print(f"📊 Souhrn:")
    print(f"   Inzerátů v cache:       {len(all_hids):>6}")
    print(f"   Unikátních makléřů:     {s_total:>6}")
    print(f"   Zmínili financování:    {s_zmin:>6}")
    print(f"   ČISTÍ makléři:          {s_total - s_zmin:>6}")
    print(f"   Splňují min {args.min_inzeratu} inz.: {len(cisti):>6}")
    print()
    print(f"   → {out_souhrn}")
    print(f"   → {out_detail}")

    session.close()
    conn.close()


def parse_args():
    p = argparse.ArgumentParser(description="Sreality makléři bez financování")
    p.add_argument("--region", type=int, default=None,
                   help="locality_region_id (např. 10=Praha, 11=Středočeský …); default celá ČR")
    p.add_argument("--max-pages", type=int, default=None,
                   help="strop pro počet stránek listingu (každá ≈100 inz.)")
    p.add_argument("--min-inzeratu", type=int, default=1,
                   help="exportovat jen makléře s tolika+ inzeráty (default 1)")
    p.add_argument("--force", action="store_true",
                   help="ignorovat cache, znovu stáhnout všechny detaily")
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
