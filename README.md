# Auth Portal

Centrální přihlašovací portál s rolemi admin / manažer / poradce.

## Spuštění

```bash
python3 server.py
```

Server běží na **http://localhost:5000**

### Výchozí přihlášení
- Email: `admin@admin.cz`
- Heslo: `admin123`

⚠️ **Změňte heslo admina po prvním přihlášení!**

---

## Struktura

```
auth-system/
├── server.py          # Backend (Flask + SQLite)
├── auth.db            # Databáze (vytvoří se automaticky)
├── start.sh           # Spouštěcí skript
└── public/
    ├── login.html     # Přihlašovací stránka
    ├── dashboard.html # Dashboard s dlaždicemi aplikací
    └── auth-check.js  # Snippet pro vaše aplikace
```

---

## Integrace do nové aplikace

Do každé vaší aplikace vložte na začátek `<body>`:

```html
<script src="http://localhost:5000/auth-check.js"></script>
```

Pak máte k dispozici objekt `AuthUser`:

```javascript
AuthUser.id        // ID uživatele
AuthUser.jmeno     // Jméno
AuthUser.email     // Email
AuthUser.role      // 'admin' | 'manazer' | 'poradce'
AuthUser.token     // JWT token

AuthUser.isAdmin()    // true/false
AuthUser.isManazer()  // true/false
AuthUser.isPoradce()  // true/false

AuthUser.authHeader() // { 'Authorization': 'Bearer ...', 'Content-Type': 'application/json' }
AuthUser.logout()     // Odhlásí a přesměruje na login
```

### Příklad použití v aplikaci:

```html
<!DOCTYPE html>
<html>
<head><title>Moje Aplikace</title></head>
<body>
<script src="http://localhost:5000/auth-check.js"></script>

<h1>Vítejte, <span id="name"></span></h1>

<div id="admin-only" style="display:none">
  <p>Toto vidí jen admin</p>
</div>

<script>
  document.getElementById('name').textContent = AuthUser.jmeno;
  
  if (AuthUser.isAdmin()) {
    document.getElementById('admin-only').style.display = 'block';
  }
</script>
</body>
</html>
```

---

## API Endpoints

| Metoda | URL | Popis |
|--------|-----|-------|
| POST | /api/login | Přihlášení |
| GET | /api/me | Info o přihlášeném uživateli |
| GET | /api/apps | Seznam aplikací (dle role) |
| POST | /api/apps | Nová aplikace (admin) |
| PUT | /api/apps/:id | Úprava aplikace (admin) |
| DELETE | /api/apps/:id | Smazání aplikace (admin) |
| GET | /api/users | Seznam uživatelů |
| POST | /api/users | Nový uživatel |
| PUT | /api/users/:id | Úprava uživatele |
| DELETE | /api/users/:id | Deaktivace uživatele |
| GET | /api/users/:id/permissions | Oprávnění poradce |
| PUT | /api/users/:id/permissions | Nastavení oprávnění |

---

## Produkční nasazení

1. Změňte `JWT_SECRET` v `server.py` nebo nastavte env proměnnou:
   ```bash
   JWT_SECRET=vas-tajny-klic python3 server.py
   ```

2. Pro produkci použijte gunicorn:
   ```bash
   pip install gunicorn
   gunicorn -w 4 server:app
   ```

3. Nastavte HTTPS (nginx reverse proxy)

4. V `auth-check.js` změňte `LOGIN_URL` na skutečnou URL portálu
