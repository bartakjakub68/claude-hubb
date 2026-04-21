# Advisor Training – Simulátor klientských schůzek

Kompletní webová aplikace pro trénink finančních poradců.

## Architektura

```
Frontend (React)  →  Backend (Node.js)  →  Anthropic API
     ↓                    ↓
  Vercel              Railway
                         ↓
                    Supabase (PostgreSQL)
```

## Než začneš: potřebuješ tyto účty

### 1. Anthropic API klíč
1. Jdi na https://console.anthropic.com
2. Zaregistruj se (potřebuješ platební kartu)
3. V sekci "API Keys" klikni "Create Key"
4. Zkopíruj klíč (začíná `sk-ant-...`)
5. Dobij kredit – pro testování stačí $10

### 2. Supabase (databáze)
1. Jdi na https://supabase.com → Sign up (přes GitHub)
2. Klikni "New Project" → vyber region "West EU (Frankfurt)"
3. Zadej název "advisor-training" a heslo pro databázi
4. Počkej na vytvoření (~2 min)
5. V Settings → API najdeš:
   - Project URL (např. `https://xyz.supabase.co`)
   - `anon` public key
   - `service_role` secret key
6. V SQL Editor spusť obsah souboru `backend/src/db/schema.sql`

### 3. Railway (backend hosting)
1. Jdi na https://railway.app → Sign up (přes GitHub)
2. Klikni "New Project" → "Deploy from GitHub repo"
3. Připoj svůj GitHub repozitář (složka `backend`)
4. V Settings → Variables přidej:
   - `ANTHROPIC_API_KEY` = tvůj klíč z kroku 1
   - `SUPABASE_URL` = URL z kroku 2
   - `SUPABASE_KEY` = service_role key z kroku 2
   - `JWT_SECRET` = vygeneruj: `openssl rand -hex 32`
   - `CORS_ORIGIN` = URL tvého frontendu (nastavíš po deployi)
5. Railway automaticky deployne

### 4. Vercel (frontend hosting)
1. Jdi na https://vercel.com → Sign up (přes GitHub)
2. Klikni "Import Project" → vyber svůj GitHub repo (složka `frontend`)
3. V Settings → Environment Variables přidej:
   - `VITE_API_URL` = URL tvého Railway backendu (např. `https://advisor-training-production.up.railway.app`)
4. Deploy

### 5. Finální propojení
1. Zkopíruj URL Vercel frontendu
2. V Railway nastav `CORS_ORIGIN` na tuto URL
3. Hotovo!

## Lokální vývoj

```bash
# Backend
cd backend
npm install
cp .env.example .env  # vyplň hodnoty
npm run dev            # běží na http://localhost:3001

# Frontend (v jiném terminálu)
cd frontend
npm install
cp .env.example .env  # vyplň VITE_API_URL=http://localhost:3001
npm run dev            # běží na http://localhost:5173
```

## Výchozí účty po prvním spuštění

Po spuštění SQL schématu se vytvoří:
- **Manager:** email `manager@test.cz`, heslo `manager123`
- **Poradce:** email `poradce@test.cz`, heslo `poradce123`

Změň hesla po prvním přihlášení!

## Náklady

| Služba | Free tier | Placený |
|--------|-----------|---------|
| Vercel | 100GB bandwidth/měs | od $20/měs |
| Railway | $5 kredit/měs | od $5/měs |
| Supabase | 500MB DB, 50k auth | od $25/měs |
| Anthropic API | — | ~$0.15-0.50/trénink |

Pro 10 poradců × 3 tréninky/den: **~$5/měs hosting + ~$150/měs API**
