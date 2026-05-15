# Audit aplikací – plošný report

**Datum auditu:** 2026-05-15
**Rozsah:** Backend (server.py), dashboard, login, kalkulačky (pojistné v3 + v20, důchod, spoření, úvěry, kalkulačka-4 KB/MPSS)
**Vyloučeno z testování funkcionality:** metodika/, adresář (kontakthub/)
**Metoda:** Statická analýza + funkční testy backendu přes curl (server běžel lokálně na portu 5001)

---

## ⚠️ EXECUTIVE SUMMARY — co řešit ihned

| # | Závada | Severita | Lokace |
|---|--------|----------|--------|
| **1** | **Default admin `admin@admin.cz / admin123` se vytváří automaticky** a zůstává v produkci. Login funguje, vrací admin JWT. | 🔴 CRITICAL | [server.py:402-410](server.py) |
| **2** | **JWT_SECRET má hardcoded fallback** `'change-this-secret-in-production-2024'`. Pokud env-var není v Railway, kdokoli si podepíše admin token. | 🔴 CRITICAL | [server.py:45](server.py) |
| **3** | **Hesla hashovaná SHA-256 bez saltu** – prolomitelné rainbow tables za sekundy. | 🔴 CRITICAL | [server.py:405, 416](server.py) |
| **4** | **Žádný rate limit na `/api/login`** – ověřeno curl testem (10 pokusů/s bez zpoždění). Brute-force triviální. | 🔴 CRITICAL | [server.py:456-479](server.py) |
| **5** | **CORS `Access-Control-Allow-Origin: *`** – ověřeno curl s `Origin: https://evil.com` → server vrátí `*`. | 🔴 CRITICAL | [server.py:420-428](server.py) |
| **6** | **Pojistná kalkulačka: sleva 30 840 Kč/rok aplikovaná na měsíční daňový základ** v OSVČ iteraci → daň vychází záporná, ořezaná na 0 → invalidní důchod OSVČ silně podhodnocený. | 🔴 CRITICAL | [public/pojistna-kalkulacka.html:1549](public/pojistna-kalkulacka.html), [public/pojistna-kalkulator-v20.html:1510](public/pojistna-kalkulator-v20.html) |
| **7** | **Důchodová kalkulačka: vdovský důchod pro vdovce bez dětí dělen 12** → 7 350 Kč/měs se zobrazí jako 613 Kč/měs. | 🔴 CRITICAL | [public/duchod-kalkulator-v3.html:507-508](public/duchod-kalkulator-v3.html) |
| **8** | **Důchodová kalkulačka: OVZ valorizace se matematicky kompletně zruší** (`hrubaMes * 12 / koef * koef`). Valorizace nikdy nic nemění. | 🔴 CRITICAL | [public/duchod-kalkulator-v3.html:422-428, 572-577](public/duchod-kalkulator-v3.html) |
| **9** | **XSS v dashboard.html v `onclick` přes `JSON.stringify(u)`** – jméno uživatele s apostrofem injektuje JS, který má přímý přístup k tokenu v localStorage. | 🔴 CRITICAL | [public/dashboard.html:659, 661, 694](public/dashboard.html) |
| **10** | **Kalkulátor B (úvěry) nepočítá RPSN** – pro spotřebitelský úvěr právní požadavek dle zák. 257/2016 Sb. | 🟠 HIGH | [public/kalkulator-B-uvery.html](public/kalkulator-B-uvery.html) |

**Verdikt:** Aplikace je funkční MVP, ale **není připravená pro produkční použití s reálnými klienty**, dokud nebudou opraveny minimálně body 1–9. Defaultní heslo `admin123` je triviálně exploitable z internetu.

---

## 1) BACKEND (server.py + deployment)

### 🔴 Critical

#### C1. Hesla bez salt, slabý hash (SHA-256)
- **Lokace:** `server.py:405, 416` (`hash_password`, vytvoření admin účtu)
- **Popis:** `hashlib.sha256(pwd.encode()).hexdigest()` — žádný salt, žádné iterace.
- **Proč to vadí:** Při leaku DB (auth.db = SQLite soubor na Railway containeru) jdou všechna hesla prolomit za sekundy na GPU. Stejná hesla mají stejný hash.
- **Fix:** Použít `werkzeug.security.generate_password_hash` (Werkzeug už je v requirements!), případně `argon2-cffi`/`bcrypt`. Migrovat hashe lazy při příštím přihlášení.

#### C2. Hardcoded JWT secret fallback
- **Lokace:** `server.py:45`
- **Popis:** `JWT_SECRET = os.environ.get('JWT_SECRET', 'change-this-secret-in-production-2024')`
- **Fix:** `if not os.environ.get('JWT_SECRET'): raise RuntimeError(...)` při startu mimo `@before_request`.

#### C3. Default admin účet s triviálním heslem (ověřeno!)
- **Lokace:** `server.py:402-410`
- **Popis:** Při prvním spuštění se vytvoří `admin@admin.cz / admin123`. **Testováno přes curl, vrátil platný admin JWT.**
- **Fix:** Generovat náhodné heslo, vypsat do logu jen jednou, vynutit změnu při prvním loginu.

#### C4. CORS `*` umožňuje cross-origin volání
- **Lokace:** `server.py:420-428`
- **Popis:** `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Headers: Authorization`. **Ověřeno: server vrací `*` i pro `Origin: https://evil.com`.**
- **Fix:** Whitelistovat origin(y) nebo odstranit CORS, pokud vše ze stejné domény.

#### C5. SQLite + gunicorn `--workers 2 --preload`
- **Lokace:** `Procfile:1`, `railway.toml:5`, `server.py:29-34`
- **Popis:** `init_db()` běží v každém workeru přes `@before_request`. Více writerů do SQLite → `database is locked`. Bez WAL módu.
- **Fix:** `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;` v `get_db()`. Případně `--workers 1 --threads N`, nebo Postgres.

#### C6. Žádný rate limit na /api/login (ověřeno!)
- **Lokace:** `server.py:456-479`
- **Popis:** **Curl test: 10 pokusů za <2.2s bez zpoždění, žádný 429.** Spolu s C1 (SHA-256 bez saltu) je brute-force triviální.
- **Fix:** Flask-Limiter (např. 5/min per IP, exponenciální backoff per email).

### 🟠 High

| ID | Lokace | Popis |
|----|--------|-------|
| H1 | `server.py:1620-1649` (at_save_evaluation) | IDOR: training_id se neověřuje proti volajícímu — poradce může vyrobit evaluaci pro cizí training. |
| H2 | `server.py:1741-1754` (at_add_note) | IDOR: manažer může psát noty k poradcům jiného manažera. |
| H3 | `server.py:691, 720, 752, 979, 1001` | Autorizační check používá legacy `users.manazer_id` místo `user_managers` → manažer se 2 manažery nemůže editovat svého poradce; JWT obsahuje stale `manazer_id` (privilege persistence po odebrání práv až do expirace tokenu). |
| H4 | `server.py:740-761` (set_permissions) | Manažer může poradci přidělit přístup do **libovolné** aplikace, i takové, ke které sám nemá přístup. |
| H5 | `server.py:790, 821, 845, 1493+` | Anthropic API key fallback `''`, error stringy se posílají do JSON response → leak SDK detailů. |
| H6 | `server.py:456-479` | Žádný rate limit na login (viz C6). |
| H7 | `server.py:1484, 1515, 1546, 2051` | Žádný rate limit / quota na AI endpointy — kompromitovaný účet poradce může za hodinu vyfaktůrovat firmě tisíce dolarů. |
| H8 | `server.py:1546-1575` (/api/claude) | Klient může poslat libovolný `system` prompt a `messages` array — žádná validace velikosti, jailbreak triviální. |
| H9 | `server.py:1781` (at_tts) | Google API klíč v URL query stringu — uniká do logů/reverse proxy. |
| H10 | `server.py:1274-1325` (billing_close) | Race condition: dva paralelní POST mohou oba projít kontrolou existence; `inserted` counter nedeterministický. |
| H11 | `public/login.html:175` + `auth-check.js:30` | JWT v `localStorage` (XSS-stealable, ne httpOnly). |
| H12 | Login formulář | Žádné vynucení HTTPS / HSTS / CSP. |

### 🟡 Medium / 🔵 Low / ⚪ Info

- **M1**: Legacy sloupec `users.manazer_id` se nedosledně udržuje vůči `user_managers`.
- **M2**: JWT 8h fixní expiry, žádný refresh token, žádná revokace.
- **M3**: `print(f'KH extract error: {e}')` — exception text z Anthropic SDK může obsahovat citlivá data.
- **M4**: Téměř všechny endpointy bez input validace (typ, délka, formát). Curl test: `{"email":12345,"heslo":67890}` → HTTP 500 (stack trace v server logu, ne v JSON).
- **M5**: `/api/me` vrací cached JWT payload (`server.py:481-484`) místo aktuálního DB stavu — deaktivovaný uživatel funguje 8h dál.
- **M6**: `require_auth` neověřuje `aktivni` ve middleware (`server.py:437-452`).
- **M8**: Žádné CSP / X-Frame-Options / HSTS / X-Content-Type-Options headers.
- **M9**: `kh_anonymize` (server.py:765-775) je iluzorní — text se posílá Anthropic do USA. GDPR risk.
- **L3**: **Business logic bug:** Náklady v `hub_costs` používají ceník **Opus 4.6** (`$5/$25 per 1M`), ale endpointy volají `claude-sonnet-4-6` (jiné ceny `$3/$15`). Fakturujete zákazníkům špatnou cenu.
- **L4**: Model `claude-sonnet-4-6` — pravděpodobně neexistuje jako alias; aktuální produkční je `claude-sonnet-4-6-20250929` apod.
- **L7**: Werkzeug už je v requirements (`generate_password_hash`), ale nepoužívá se.
- **L14**: `--timeout 120` v Procfile může zabít Anthropic volání → ztráta sledování tokenů.
- **L16**: Server neposílá HSTS, neredirektuje HTTP→HTTPS.
- **L18**: Žádný audit log (login pokusy, vytvoření uživatele, billing close).
- **L20**: `request.get_json()` může vrátit `None` → `.get()` hodí AttributeError → HTTP 500.

---

## 2) DASHBOARD + LOGIN + AUTH FLOW

### 🔴 Critical

#### XSS v dashboard.html přes `JSON.stringify(u)` v `onclick`
- **Lokace:** `dashboard.html:659, 661, 694`
- **Popis:**
  ```html
  <button ... onclick='openUserModal(${JSON.stringify(u)})'>
  ```
  Atribut je `'…'`, ale `JSON.stringify` obsahuje `"`. **Pokud DB obsahuje uživatele s `jmeno = "); alert(1);//`, apostrof ukončí atribut a injektuje JS** — token v localStorage hned k mání.
- Stejný vzor: `openAppModal(${JSON.stringify(a)})` (`:694`), `openManagersModal(...,${JSON.stringify(u.manageri||[])})` (`:661`).
- **Fix:** Data-attribute pattern + delegovaný listener, nebo escape pro HTML atributy s apostrofem.

#### XSS v `openPermsModal` parametrech
- **Lokace:** `dashboard.html:660-661`
- **Popis:** `onclick="openPermsModal(${u.id},'${escHtml(u.jmeno)}')"` — `escHtml` **neescapuje apostrof**. Atribut je uvozen `"`, ale string parametr `'…'`. `u.jmeno = X');alert(1);//` ukončí JS string.
- **Fix:** Rozšířit `escHtml` o `replace(/'/g,'&#39;')`, lépe data-attribute pattern.

#### JWT v localStorage
- **Lokace:** `public/login.html:175`, `public/auth-check.js:30`
- **Popis:** Token přístupný libovolnému JS → XSS = token leak. Bez `httpOnly`, `Secure`, `SameSite`.
- **Fix:** Přesunout do `httpOnly; Secure; SameSite=Lax` cookie + CSRF token. Pokud okamžitě nelze, zkrátit `exp` na 15–30 min + refresh-token.

### 🟠 High / 🟡 Medium

- **H**: Žádná detekce 401 ve `fetch()` na dashboardu — uživatel po expiraci tokenu vidí prázdné tabulky místo redirectu na login.
- **H**: Login nepředpokládá HTTPS (žádné CSP `upgrade-insecure-requests`, žádný HSTS hint).
- **M**: Open redirect / `javascript:` URL v `a.url` aplikací (dashboard.html:584, 688) — admin si může přidat aplikaci s `url = javascript:fetch('/api/users').then(...)`.
- **M**: `auth-check.js` neblokuje render → krátký flash chráněného obsahu před redirectem.
- **M**: Race condition `costsLoaded` / `billingLoaded` — flag nastavený před dokončením fetch, při chybě zůstane → tab se už nikdy znova nenačte.
- **L**: `confirm()` v `toggleUser`/`toggleApp` — blokující prompt, špatná UX.
- **L**: `escHtml` neumí ověřit `javascript:` schema.

---

## 3) POJISTNÉ KALKULAČKY (priorita)

**Soubory:**
- `public/pojistna-kalkulacka.html` (5158 řádků, dále **v21.1**)
- `public/pojistna-kalkulator-v20.html` (3775 řádků, dále **v20**)

### 🔴 Critical

#### P1. `vypocetNemocenske` váží 305 dní × 72 % → drasticky podhodnocená dávka PN
- **Lokace:** `pojistna-kalkulacka.html:1428-1462`, `pojistna-kalkulator-v20.html:1389-1423`
- **Popis:**
  ```js
  const celkem = nm14 + 16*d15_30 + 30*d31_60 + 305*d61p;
  return Math.round(celkem / 12);
  ```
  Funkce počítá průměr **za celoroční PN (365 dní)**, kde 305 dní × sazba 72 % drtí výsledek. Pro typickou PN ~30-45 dní je skutečný měsíční výpadek dramaticky vyšší.
- **Příklad:** Čistý 35 000 Kč → kalkulačka řekne "měsíční výpadek 30 945 Kč" → doporučí dávku ~150 Kč/den (4 500/měs). Reálně při PN 30 dní klient dostane ~20 000 Kč → mezera 15 000 Kč, ne 5 000.
- **Důsledek:** **Systematicky podhodnocuje denní dávku PN o ~50 %.**
- **Fix:** Přepočítat na realistickou délku 30/60/90 dní; nebo přejmenovat funkci a v UI uvést „pro celoroční PN".

#### P2. Sleva 30 840 Kč/rok aplikovaná na měsíční daňový základ (OSVČ)
- **Lokace:** `pojistna-kalkulacka.html:1549`, `pojistna-kalkulator-v20.html:1510`
- **Popis:** Pro 2026: sleva = 30 840 Kč/rok = **2 570 Kč/měsíc**. V `cistyNaHruby` použito správně (2570). V `odhadInvDuc` pro OSVČ ale použito 30 840 jako MĚSÍČNÍ konstanta → daň téměř vždy záporná → ořezaná na 0.
- **Příklad:** OSVČ čistý 50 000 Kč/měs:
  - Správně: `zaklad` ~ 90 000/měs, procentní výměra III. st. ~ 30 000 Kč
  - Chybně: `zaklad` ~ 65 000/měs, procentní výměra ~ 22 000 Kč
  - **Podhodnocení invalidního důchodu OSVČ o ~25 %.**

#### P3. `INV_CAP = 0` při nezadaném příjmu → falešné „Pokryto"
- **Lokace:** `pojistna-kalkulacka.html:1890`, `pojistna-kalkulator-v20.html:1820`
- **Popis:** `INV_CAP = Math.floor(D.prijem * 12 * 10 / 50000) * 50000`. Při `D.prijem = 0` (výchozí) je `INV_CAP = 0` → všechny PČ invalidity = 0 → UI zobrazí badge **„✓ Pokryto"**.
- **Důsledek:** Klient s nezadaným příjmem dostane **falešně uklidňující výsledek**, že invalidita je pokryta. Warning existuje v `warnings` poli, ale uživatel ho snadno přehlédne.
- **Fix:** Blokovat výpočet pokud `D.prijem <= 0` (alert + return).

#### P4. Neomezený rozsah textových polí
- **Lokace:** `pojistna-kalkulacka.html:522, 529, 536, 641, 655, 668, 679`...
- **Popis:** `<input type="text">` u všech finančních polí. `pN()` parsuje bez horního/dolního limitu. Záporné hodnoty projdou.
- **Příklad:** `prijem-ni = "-50000"` → záporné DVZ, redukce, denní dávky → některé `Math.max(...,0)` zachytí, jiné ne → NaN propagace.
- **Fix:** `type="number"` s `min=0`, nebo `pN()` přidat `Math.max(0, ...)`.

### 🟠 High

| ID | Lokace | Popis |
|----|--------|-------|
| P5 | `pojistna-kalkulator-v20.html:1895` | **v20**: `vdovDuc = Math.round(vdovDucSolo / 12)` pro netrvalý vdovský — matematicky nesmysl. v21.1 to opravil tím, že netrvalý vdovský zcela ignoruje. |
| P6 | `pojistna-kalkulacka.html:4845-4852` | `updateSens.calcInvKapital` ignoruje `MANUALNI_CAP` → citlivostní analýza nekonzistentní s hlavním engine pro manuální profese. |
| P7 | obě verze | **v20 a v21.1 dávají různé výsledky** na stejné vstupy (rozdíl +21 % v21.1 vs v20 pro modelovaný případ). v20 je obsoletní. |
| P8 | `pojistna-kalkulacka.html:1572`, `v20:1533` | Důchodový věk fixně 65 — ignoruje reformu 2023 (zákon 270/2023 Sb. zvyšuje až k 67 pro ročníky 1965+). Pro mladší klienty kalkulátor nadhodnocuje doporučenou PČ. |

### 🟡 Medium

- **P9**: Smrt horizont max 20 let (v21.1:2024) — krátké pro klienty s velmi malými dětmi (vyživování 25+ let).
- **P10**: `sirotciMinProc = 4900` (v21.1:1412) zaměňuje **základní výměru** se **minimální procentní výměrou** sirotčího (správně ~770 Kč dle § 50). Nadhodnocuje sirotčí o ~4 130 Kč/měs.
- **P11**: Pevná částka ZO 500 000 Kč pro všechny (v21.1:2154) — bez ohledu na anamnézu/OSVČ. Pro klienta s rodinnou anamnézou nebo OSVČ může být nedostatečné.
- **P12**: Nekonzistence `zvyseneVydaje I: 0.04` (`pojistna-kalkulacka.html:1478`) vs `cilK: 0.05` (`:1847`). Komentáře v různých blocích si protiřečí.
- **P13**: `dspl` (zbývající doba splácení) je v UI, ale **nikde nepoužívána** v kalkulaci → klient s krátkou hypotékou pojistí plnou hypotéku po celou dobu pojistky → předplaceno.

### 🔵 Low

- Fixní pojistné částky (500k ZO, 1M TN, 100k pohřeb) bez inflační adaptace — za 30 let mají poloviční reálnou hodnotu.
- `varElán` — proměnná s diakritikou v identifikátoru.
- Magic numbers napříč kódem (5000/měs/dítě, 750000 rezerva, 400000 single, ...) — měly by být v `CONFIG`.

### Validace vstupů

- `<input type="text">` u všech finančních polí — žádný HTML5 validátor, žádné `required`. Mobilní zařízení nezobrazí číselnou klávesnici.
- `vek` má `min=18 max=65` — pro klienta 60+ by měl být blokovaný (anuita s `rokiDD=1` → nesmyslné doporučení).
- Žádný `aria-label` u většiny polí — screen reader nemůže vstupy přečíst.

---

## 4) DŮCHODOVÁ KALKULAČKA (`duchod-kalkulator-v3.html`)

### 🔴 Critical

#### D1. Vdovský důchod „dočasný" vrací `vdovDucBase / 12`
- **Lokace:** `duchod-kalkulator-v3.html:507-508`
- **Popis:**
  ```js
  duchod: maDetiNeboZav ? vdovDucBase : Math.round(vdovDucBase / 12),
  ```
  Pro svobodného/vdovce bez závislých dětí kalkulačka vrací **měsíční částku vydělenou 12** → 7 350 Kč/měs se zobrazí jako 613 Kč/měs.
- **§ 50 zák. 155/1995 Sb.:** nárok trvá 1 rok, výplata stejná měsíční výše (12× měsíčně).
- **Fix:** Vždy zobrazit měsíční částku; v poli „Trvání" doplnit „Dočasný — 1 rok".

#### D2. OVZ valorizace se matematicky kompletně zruší
- **Lokace:** `duchod-kalkulator-v3.html:422-428, 572-577`
- **Popis:**
  ```js
  for(let rok = prvniRok; rok <= posledniRok; rok++){
    const koef = VALORIZACE_2026[rok] || 1.0;
    const odhadHrubaRok = hrubaMes * 12 / koef;
    sumValVZ += odhadHrubaRok * koef;  // koef se vykrátí!
    pocetDni += 365;
  }
  ```
  `(hrubaMes*12/koef) * koef = hrubaMes*12`. Suma přes všechny roky odpovídá `hrubaMes * 12 * pocetLet`, dělené `365 * pocetLet × 30,4167 ≈ hrubaMes`.
- **Důsledek:** OVZ = aktuální měsíční hrubá bez ohledu na rok začátku pojištění. Pole „rok začátku pojištění" je dekorace.
- **Fix:** Uložit reálné hrubé mzdy za jednotlivé roky (vstupní pole + sazba růstu); nebo přiznat, že kariéra je „plochá v dnešní hodnotě" a odstranit zmínku „valorizovaných příjmů" z UI.

### 🟠 High

- **D3**: Sazba III. stupně invalidity hardcoded `1.495 %` (`:445`) — neaktualizovaná pro budoucí rok přiznání. Pro klienta narozeného 1995 s invaliditou za 30 let je sazba špatně.
- **D4**: Důchodový věk pro 1988 přesahuje strop 67 let (`:298-301`): `zaklad + (rokNarozeni - 1973)` dá pro 1988 = 67 let 11 měsíců, ale pro 1989 skok dolů na 67 let. Fix: `Math.min(67*12, ...)`.
- **D5**: Měsíc důchodu zaokrouhlen nahoru (`:543`): pro 1 měsíc překročení posune rok přiznání o celý rok → procentní výměra nadhodnocena o ~1.5 %.

### 🟡 Medium

- **D6**: `setMode` (`:1018`) používá `event.target` v inline onClick — funguje v Chrome, selže ve Firefoxu strict mode.
- **D7**: Děti zadání 0–25 let, ale sirotčí důchod má jiné podmínky (§ 52, do 26 jen při nezaopatřenosti).
- **D8**: `posledniRok = 2025` fixně v invalidní kalkulačce — nezohledňuje dopočtenou dobu pro velmi mladé klienty (vznikne riziko podhodnocení).

### 🔵 Low

- Daňová sleva 2570 hardcoded bez verze (`:386, 553`).
- Min. částky sirotčí `1960`, vdovské `2450` bez komentáře o roční valorizaci.
- Chybí radio-button stupeň I/II/III — zobrazí 3 čísla zároveň.

---

## 5) SPOŘICÍ KALKULAČKA (`kalkulator-A-sporeni.html`)

### 🟠 High

- **S1**: Modul „Investice": optimistický/pesimistický scénář `±3 p.b.` nominálně (`:904`). Historicky pro akcie ±5 p.b., pro dluhopisy ±1 p.b. Konstantní offset může poradce mýlit.
- **S2**: Modul Důchod: nominální → reálná renta jen pro hodnotu **v okamžiku odchodu**, ne pro každý měsíc výplaty (`:1205-1207`). Klient vidí rentu „11 000 Kč/měs po 20 let" jako konstantu, ale reálně klesá s inflací (po 20 letech ~55 % původní hodnoty).

### 🟡 Medium

- **S3**: `calcFV` předpokládá vklad na konci měsíce (ordinary annuity), ale klient typicky platí začátkem (annuity-due) — podhodnocení o ~0.5 % pro 30 let při 6 %.
- **S4**: What-if „Trh spadne o 30 % v půlce" (`:1062-1077`) modeluje propad + pokračování stejným výnosem — pro kratší horizont (10 let) je odhad zavádějící.
- **S5**: Modul Rezerva: `Roční výnos z rezervy` (`:1527`) nezohledňuje srážkovou daň 15 % na úroky.
- **S6**: While-loop `months < 600` (cap 50 let) — pokud klient zadá nereálné parametry, loop skončí dřív a zobrazí 50 let bez varování, že cíle nebylo dosaženo.

### 🔵 Low

- Slider `iv-poc` rozsah 0–2 000 000 (klient s děděním 5M může psát víc, ale slider ho omezí).
- Max státní příspěvek 340 Kč/měs DPS (`:1352`) — neukotveno datem.
- `parseK` (`:655`) projde negativní hodnoty.
- Daňový odpočet z DPS 48 000 Kč/rok zmíněn jen v promptu pro AI, ne v výpočtu.

---

## 6) ÚVĚROVÁ KALKULAČKA (`kalkulator-B-uvery.html`)

### 🔴 Critical / 🟠 High

#### U1. Chybí RPSN
- **Lokace:** celý `kalkulator-B-uvery.html`
- **Popis:** Pro spotřebitelský úvěr **právní požadavek** dle zák. 257/2016 Sb. § 92-93 a směrnice 2008/48/ES.
- **Fix:** Portovat `calcRPSN` z `kalkulacka-4.html:431`.

#### U2. Refinance: úspora počítaná z `spl1 − spl2`, ne z kumulovaných úroků
- **Lokace:** `kalkulator-B-uvery.html:1219-1221`
- **Popis:** `usporaFix = (spl1 − spl2) * fix2 * 12` nezohledňuje, že po fixaci budou zůstatky odlišné. Pro 2.5M Kč/20 let/5.2 % vs 4.6 %/5 let fixace: rozdíl splátek × 60 ≈ 41 400 Kč. Reálný úrokový rozdíl ≈ 70-75 tisíc.
- **Fix:** Spočítat kumulované zaplacené úroky z amortizace.

#### U3. Invest vs. splátka, scénář A — nereálný
- **Lokace:** `kalkulator-B-uvery.html:1527-1536`
- **Popis:** Modeluje „snížit splátku po mimořádné splátce", ale banka standardně neumožní snížit splátku bez nového sjednání. Doporučení „investice se vyplatí" je systematicky vychýleno ve prospěch investice.
- **Fix:** Modelovat „stejná splátka + kratší doba + investice celé splátky po splacení".

#### U4. Daň 15 % aplikovaná na sazbu, ne na zisk
- **Lokace:** `kalkulator-B-uvery.html:1825`
- **Popis:** `netVyn = vyn * 0.85` — chybně. Daň 15 % se v ČR aplikuje na **zisk**, ne hrubý výnos p.a.
- **Příklad:** 200 000 PV, 20 let, 7 %:
  - Správně: FV nominálně 773 947, zisk 573 947, daň 86 092, netto 687 855
  - Chybně (zde): `r=5,95 %`, FV 632 250 (podhodnoceno o ~55 000 Kč)
- Časový test 3 roky není aplikován.

### 🟡 Medium

- **U5**: `dobaZb = doba − fixace` (`:911`) — pokud klient zadá `doba=3` a `fixace=5`, `dobaZb=-2` → `Math.pow(1+rm, -24)` nesmysl.
- **U6**: Heatmap (`:982-984`) může pro `dobaZb=3` zobrazit dva sloupce „1 let" se zápornými labely.

### 🔵 Low

- Žádný strop na DTI / DSTI — ČNB doporučuje DTI < 8.5×, DSTI < 50 %.
- Break-even refinance lineární — nezohledňuje další fixaci.

---

## 7) KALKULAČKA-4 (KB/MPSS produktová, `kalkulacka-4.html`)

Jediná, která **počítá RPSN** korektně.

### 🟠 High

- **K1**: RPSN bisekce s `hi = 1/12` (~100 % p.a. nominálně) (`:431`). Pro krátké úvěry s vysokou sazbou + poplatkem může RPSN > 100 %. Fix: `hi = 1.0`.
- **K2**: Mimořádná splátka aplikována **před úrokem** (`:614-620`) — benevolentnější ke klientovi než realita (KB k 25. v měsíci). Konvenci uvést v UI.

### 🟡 Medium

- **K3**: Spotřebitelský úvěr: pojištění 0.17 %/měs z **původní jistiny** (`:533, 562`) → 2.04 % p.a. místo z aktuálního zůstatku.
- **K4**: MPSS překlenovací fáze 25 měs fixně — needitovatelné (tarif 12-36 měs).
- **K5**: Konsolidace srovnává staré úvěry + novou hypotéku za přesně 36 měsíců.
- **K6**: Americká hypotéka: limit příjmu 70 000 binární (`:513`) — klient s 70 001 dostane 4× vyšší limit.

### 🔵 Low

- Skoky v UX při hraničních hodnotách jistiny (binární sazby).
- Funkce `calcMPfn`, `calcSS`, `calcRPSN` jsou jednořádkové bez mezer (`:431-433`) — komplikuje audit.

---

## 8) SPOLEČNÉ UX / A11Y PROBLÉMY

| # | Závada | Severita |
|---|--------|----------|
| 1 | Inline `oninput`/`onclick` napříč všemi soubory — blokuje strict CSP | 🟡 Medium |
| 2 | Slidery bez `aria-label` — screen-reader slyší jen „slider 35 of 70" | 🟡 Medium |
| 3 | Žádná React/Vue komponentizace — duplicitní `calcFV`/`calcMonthly`/`remainingBalance` ve více souborech | 🔵 Low |
| 4 | Formátování měny — ` ` (NBSP) jen v kalkulačce-4, jinde běžná mezera → různý vizuální výstup | 🔵 Low |
| 5 | Žádné varování při výsledku „nelze splnit" (rezerva s `months=600` cap) | 🔵 Low |
| 6 | Tisk/PDF — `<input>` v tisku prázdné, popisky chybí | 🔵 Low |
| 7 | `type="text"` u finančních polí — žádná HTML5 validace, mobilní klávesnice | 🟡 Medium |

---

## 9) DEPLOYMENT (Procfile, railway.toml, requirements.txt)

| # | Závada | Severita |
|---|--------|----------|
| 1 | `gunicorn --workers 2 --preload` + SQLite + `init_db()` v `@before_request` → race condition při paralelním init | 🔴 Critical |
| 2 | `--timeout 120` může zabít Anthropic volání → ztráta sledování tokenů | 🔵 Low |
| 3 | Server na Windows padá kvůli emoji v `print()` (UnicodeEncodeError cp1250) — produkčně OK (Linux), ale local-dev workflow rozbité | ⚪ Info |
| 4 | Werkzeug v requirements ale `generate_password_hash` se nepoužívá | ⚪ Info |
| 5 | `anthropic==0.86.0` — velmi nová verze, sledovat CVE | ⚪ Info |

---

## 10) FUNKČNÍ TESTY BACKENDU (curl)

Server běžel lokálně na portu 5001, JWT_SECRET=local-test-secret. Výsledky:

| Test | Výsledek | Hodnocení |
|------|----------|-----------|
| `POST /api/login` `admin@admin.cz` / `admin123` | HTTP 200, vrátil admin JWT | 🔴 **Default heslo funguje!** |
| `GET /api/users` bez tokenu | HTTP 401 | ✅ OK |
| `GET /api/users` se špatným tokenem | HTTP 401 | ✅ OK |
| `GET /api/users` s admin tokenem | `[]` (prázdné — neobsahuje sebe) | 🟡 Drobnost |
| 10× špatný login za <2.2s | Žádné zpoždění, žádné 429 | 🔴 **Žádný rate limit** |
| POST /api/login s `NOT JSON` | HTTP 400 | ✅ OK |
| POST /api/login bez Content-Type | HTTP 415 | ✅ OK |
| POST /api/login s `{"email":12345,"heslo":67890}` | HTTP 500 | 🔴 **Žádná typová validace** |
| OPTIONS /api/login s `Origin: https://evil.com` | `Access-Control-Allow-Origin: *` | 🔴 **CORS *** |
| POST /api/login s 10MB JSON | HTTP 401 | ✅ Server přežil |
| Poradce → GET /api/users | HTTP 403 | ✅ OK |
| Poradce → POST /api/users (vytvořit admin) | HTTP 403 | ✅ OK |
| Poradce → DELETE /api/users/1 | HTTP 403 | ✅ OK |
| Poradce → PUT /api/users/2 (sám sebe, role:admin) | HTTP 403 | ✅ OK |
| Path traversal `/../etc/passwd`, `/.git/HEAD` | HTTP 404 | ✅ OK |

**Závěr funkčního testu:** Role-based authorization v základě funguje pro běžné scénáře, ale **default heslo + chybějící rate limit + CORS *** dělají z aplikace lehký terč.

---

## 11) PRIORITY OPRAV — pořadí, ve kterém začít

### 🔴 Krok 0 — Hotfixy (každá by měla být dnes / zítra)
1. **[server.py:402-410]** Odstranit default admin nebo vynutit změnu hesla při prvním loginu
2. **[server.py:45]** Vynutit `JWT_SECRET` env var (raise při startu bez něj)
3. **[server.py:405]** Migrovat na `werkzeug.security.generate_password_hash`
4. **[server.py:420-428]** Omezit CORS na konkrétní origin
5. **[server.py:456-479]** Přidat Flask-Limiter na `/api/login` (5/min per IP)
6. **[dashboard.html:659,661,694]** Opravit XSS — rozšířit `escHtml` o apostrof + backslash; ideálně data-attribute pattern
7. **[duchod-kalkulator-v3.html:507]** Opravit vdovský /12
8. **[pojistna-kalkulacka.html:1549, pojistna-kalkulator-v20.html:1510]** Sleva 30 840 → 2 570 v OSVČ iteraci
9. **[pojistna-kalkulacka.html:1890]** Blokovat výpočet pokud `D.prijem <= 0`

### 🟠 Krok 1 — Tento týden
10. Odstranit / přesměrovat `pojistna-kalkulator-v20.html` (zastaralá verze, má vlastní bug `vdovDuc/12`)
11. `init_db()` na module-level + `PRAGMA journal_mode=WAL`
12. Rate limit + per-user quota na AI endpointy (server.py:1484, 1515, 1546, 2051)
13. IDOR opravy v at_save_evaluation, at_add_note
14. Validace input typů + délek (Pydantic / marshmallow)
15. Detekce 401 ve `fetch()` na dashboardu → auto-logout
16. Opravit `vypocetNemocenske` v pojistné kalkulačce (realistická délka PN)
17. Opravit `OVZ valorizaci` v důchodové kalkulačce (nebo přiznat plochou kariéru)
18. Přidat RPSN do kalkulátoru úvěrů (portovat z kalkulacka-4)

### 🟡 Krok 2 — Tento měsíc
19. Migrace SQLite → Postgres (pokud poroste počet uživatelů)
20. JWT refresh tokeny (krátký access 15-30 min)
21. Audit log (login pokusy, vytvoření uživatele, billing close)
22. CSP / HSTS / X-Frame-Options headers
23. Důchodový věk dle ročníku (reforma 2023)
24. Sjednocení `calcFV`/`calcMonthly` napříč kalkulačkami (sdílená knihovna)
25. Ověřit CSSZ konstanty pro 2026 u oficiálních zdrojů (MPSV, Sbírka zákonů)
26. Inflační adaptace fixních PČ (500k ZO, 1M TN)
27. Per-model ceník v `hub_costs` (oddělit Opus vs Sonnet)
28. Aria-label u sliderů + `type="number" inputmode="numeric"` u finančních polí

### 🔵 Krok 3 — Dlouhodobé refactory
29. Migrace na React komponenty (úvěry/spoření/pojistné — jsou to JS aplikace v HTML)
30. CI/CD security scan (Bandit, Trivy, npm audit)
31. Externí pen-test třetí stranou

---

## 12) NEAUDITOVÁNO (přeskočeno)

- `metodika/` (React aplikace) — uživatel řekl, že není třeba testovat funkcionalitu
- `kontakthub/` (React aplikace) — uživatel řekl, že není třeba testovat funkcionalitu
- `advisor-training/` — letmé poznámky v backendu, ale frontend ne plně auditován
- Statická CSS / branding — mimo rozsah
- E2E test v reálném prohlížeči — Chrome MCP nebylo dostupné, takže místo kliků v UI proběhly statická analýza JS funkcí + curl testy backendu

---

*Konec reportu.*
