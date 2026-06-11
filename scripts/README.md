# Skripty — lokální nástroje

## `sreality_makleri.py`

Hledá makléře na Sreality.cz, kteří v žádném inzerátu **nezmiňují**
financování / hypotéku / úvěr. Tj. potenciální obchodní partneři pro
finančního poradce, který hypoteční servis nemá.

### Spuštění

```bash
pip install requests          # jediná závislost
cd scripts
python sreality_makleri.py    # výchozí: byty + domy na prodej, celá ČR
```

### Možnosti

```bash
python sreality_makleri.py --region 10          # jen Praha
python sreality_makleri.py --region 11          # jen Středočeský
python sreality_makleri.py --min-inzeratu 3     # makléři s 3+ inzeráty
python sreality_makleri.py --max-pages 5        # test: prvních 500 inz.
python sreality_makleri.py --force              # ignoruj cache (full re-fetch)
```

### Sreality kraje (`locality_region_id`)

| ID | Kraj         | ID | Kraj            |
|----|--------------|----|-----------------|
| 10 | Praha        | 17 | Královéhradecký |
| 11 | Středočeský  | 18 | Pardubický      |
| 12 | Jihočeský    | 19 | Vysočina        |
| 13 | Plzeňský     | 20 | Jihomoravský    |
| 14 | Karlovarský  | 21 | Olomoucký       |
| 15 | Ústecký      | 22 | Zlínský         |
| 16 | Liberecký    | 23 | Moravskoslezský |

> Pozor: Sreality občas ID mění. Pokud ti to nevrací výsledky pro daný kraj,
> ověř ID v URL filtrace na webu.

### Co skript vyrobí

| Soubor | Co obsahuje |
|---|---|
| `makleri_bez_financovani.csv` | 1 řádek na makléře — jméno, RK, telefon, počet inz. |
| `inzeraty_makleru.csv` | 1 řádek na inzerát těchto makléřů (pro náhled portfolia) |
| `.sreality_cache.db` | SQLite cache — **při příštím běhu se nestahují detaily znovu** |

### Co dělat s výstupem

1. Otevři `makleri_bez_financovani.csv` v Excelu (UTF-8 BOM → diakritika OK)
2. Seřaď podle `pocet_inzeratu` sestupně — nahoře aktivní makléři
3. Pro každého oslov: *„Dobrý den, viděl jsem váš inzerát na Sreality. Hledám
   makléře, kteří klientům nezajišťují hypotéku — mám pro vás partnerskou
   nabídku..."* (transparentně řekni, odkud máš telefon — GDPR)

### Caveats

- **ToS Sreality**: scrapování *není* explicitně povoleno; běž slušně,
  malou frekvencí, výsledky nepublikuj. Cache + jitter pomáhají.
- **Email obvykle chybí** — Sreality API ho většinou nevrací. Mailing
  je tak jako tak rizikový (zákon č. 480/2004 Sb. o nevyžádaných obchodních sděleních).
- **Falešné pozitivy**: regex `\bsplatk` může chytit i text typu
  "splátkový kalendář (ne hypotéka)". Pokud zužuješ, řešení je v souboru
  v konstantě `ZMINKY_REGEX` — můžeš `splatk` odebrat.
- **Caching**: stačí smazat `.sreality_cache.db` pro full refresh. Cache
  drží i `popis_raw` (do 5000 znaků) pro pozdější audit, proč byl makléř
  vyřazen.

### Resume po Ctrl+C

První Ctrl+C → dokončí aktuální request, uloží do cache, ukončí.
Druhý Ctrl+C → okamžitý exit. Při dalším spuštění pokračuje od posledního
nezpracovaného listingu.

### Příklad výstupu konzole

```
== Segment: byty (prodej)  · kraj 10 ==
  → posbíráno 487 listings ID zatím
== Segment: domy (prodej)  · kraj 10 ==
  → posbíráno 612 listings ID zatím

Celkem unikátních inzerátů: 612
  [20/612]  fetch=20  cache=0  rychlost=2.1/s  ETA=281s
  [40/612]  fetch=40  cache=0  rychlost=2.0/s  ETA=286s
  ...

📊 Souhrn:
   Inzerátů v cache:          612
   Unikátních makléřů:        184
   Zmínili financování:        92
   ČISTÍ makléři:              92
   Splňují min 1 inz.:         92

   → makleri_bez_financovani.csv
   → inzeraty_makleru.csv
```
