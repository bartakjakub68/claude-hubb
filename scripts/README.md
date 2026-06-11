# Skripty — lokální nástroje

## `sreality_makleri.py` (v3 — Next.js scraping)

Hledá makléře na Sreality.cz, kteří v žádném inzerátu **nezmiňují**
financování / hypotéku / úvěr — potenciální obchodní partneři pro
finančního poradce.

> **Pozor:** v listopadu 2025 Sreality vypnulo veřejné REST API
> (`/api/cs/v2/estates` → 404). Skript proto extrahuje data z
> `__NEXT_DATA__` JSONu, který Next.js servíruje v každém HTML.

### Spuštění

```bash
pip install requests
cd scripts
python sreality_makleri.py --mesto brno     # default: byty + domy na prodej
```

### Lokality

Slug se vkládá do URL `/hledani/prodej/byty/{slug}`. Funguje:

- **Krajské slugy:** `jihomoravsky-kraj`, `zlinsky-kraj`, `olomoucky-kraj`,
  `stredocesky-kraj`, …
  - Vysočina nemá krajský slug — použij okresy ručně!
- **Okresní slugy:** `brno-venkov`, `blansko`, `breclav`, `hodonin`, `vyskov`,
  `znojmo`, `jihlava`, `trebic`, `zdar-nad-sazavou`, `havlickuv-brod`,
  `pelhrimov`, …
- **Městské slugy:** `brno`, `praha`, `ostrava`, …

Slug můžeš ověřit přímo na URL Sreality při filtrování.

### Více lokalit v jednom běhu

```bash
python sreality_makleri.py --mesto "brno,blansko,znojmo,brno-venkov"
```

### Další možnosti

```bash
python sreality_makleri.py --min-inzeratu 2     # makléři s 2+ inz.
python sreality_makleri.py --max-pages 5        # test: prvních 5 stránek × 2 kat.
python sreality_makleri.py --force              # ignoruj cache (full re-fetch)
```

### Doporučený postup — celá ČR

Po jednotlivých kusech kvůli rate-limitu a pro jednoduchou kontrolu:

```bash
# 1. Brno (Brno-město)
python sreality_makleri.py --mesto brno

# 2. Jihomoravský kraj — zbývající okresy
python sreality_makleri.py --mesto "brno-venkov,blansko,breclav,hodonin,vyskov,znojmo"

# 3. Zlínský kraj
python sreality_makleri.py --mesto zlinsky-kraj

# 4. Olomoucký kraj
python sreality_makleri.py --mesto olomoucky-kraj

# 5. Vysočina (přes okresy)
python sreality_makleri.py --mesto "jihlava,trebic,zdar-nad-sazavou,havlickuv-brod,pelhrimov"

# 6. Zbytek ČR — Praha + ostatní kraje
python sreality_makleri.py --mesto "praha,stredocesky-kraj,jihocesky-kraj,plzensky-kraj,karlovarsky-kraj,ustecky-kraj,liberecky-kraj,kralovehradecky-kraj,pardubicky-kraj,moravskoslezsky-kraj"
```

### Výstupy

| Soubor | Co obsahuje |
|---|---|
| `makleri_bez_financovani.csv` | 1 řádek na makléře — jméno, RK, telefon, počet inz. |
| `inzeraty_makleru.csv` | Detail inzerátů (s okresem a krajem) |
| `leady.json` | **Pro dashboard** — všichni makléři v cache, s primárním okresem a krajem, seznam okresů kde inzerují |
| `.sreality_cache.db` | SQLite cache — opakované běhy nestahují detaily znovu |

Po dokončení nakopíruj `leady.json` na dashboard:

```bash
cp leady.json ../public/data/leady.json
cd .. && git add public/data/leady.json && git commit -m "data: aktualizace leadů" && git push
```

Aplikace `🎯 Leady — makléři` v portálu si JSON načte a UI ho ukáže s filtry.

### Schema

Cache (`.sreality_cache.db`) má tabulku `detail`:

```
id, seller_id, makler, rk, telefon, telefon_norm, email,
titulek, cena_czk, lokalita, kraj, okres, mesto,
url, zminil_fin, zminka, popis_raw, fetched_at
```

Cache je idempotentní — script `INSERT OR REPLACE` přepíše záznamy
pokud najde nový. Při změně schématu (`ALTER TABLE`) se kdylo
spustí migrace na úvodu.

### Resume po Ctrl+C

První Ctrl+C → dokončí aktuální request, uloží do cache, ukončí.
Druhý Ctrl+C → okamžitý exit. Při dalším spuštění pokračuje od posledního
nezpracovaného listingu.

### GDPR caveats

- **Pracovní kontakt** podnikatele — lze pod oprávněným zájmem
  (čl. 6 odst. 1 písm. f GDPR), ale **transparentnost**: při prvním
  kontaktu hned řekni, odkud máš číslo.
- **Telefonický kontakt OK**, hromadný **email mailing bez souhlasu NE**
  (zákon č. 480/2004 Sb. o nevyžádaných obchodních sděleních).
- **Retention**: doporučujeme max 12 měsíců, pak smazat.

### Caveats

- **ToS Sreality**: scrapování *není* explicitně povoleno; běž slušně,
  nepublikuj data. Cache + jitter pomáhají.
- **Email často chybí** — Sreality nový web ho většinou nevrací.
- **Falešné pozitivy**: regex `\bsplatk` může chytit i text typu
  "splátkový kalendář (ne hypotéka)". Pokud zužuješ, řešení je v souboru
  v konstantě `ZMINKY_REGEX` — můžeš `splatk` odebrat.
- **Sreality občas mění strukturu HTML** — pokud skript přestane fungovat,
  je třeba update `extract_listing_results`, `extract_estate_detail`,
  `extract_detail_urls`.
