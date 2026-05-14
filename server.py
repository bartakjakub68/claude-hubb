#!/usr/bin/env python3
"""
Auth Portal Backend - Flask + SQLite v3
Roles: admin, manazer, poradce
"""

import sqlite3
import hashlib
import hmac
import os
import json
import time
import base64
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from flask import Flask, request, jsonify, send_from_directory, send_file

app = Flask(__name__, static_folder='public')

DB_PATH = os.environ.get('DB_PATH', 'auth.db')
_db_dir = os.path.dirname(DB_PATH)
if _db_dir:
    os.makedirs(_db_dir, exist_ok=True)

_db_initialized = False

@app.before_request
def ensure_db_initialized():
    global _db_initialized
    if not _db_initialized:
        init_db()
        _db_initialized = True

@app.after_request
def no_cache_html(response):
    """Zakáže cachování HTML souborů — uživatelé vždy vidí aktuální verzi."""
    ct = response.content_type or ''
    if 'text/html' in ct:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-this-secret-in-production-2024')
JWT_EXPIRY = 8 * 60 * 60  # 8 hodin

# ─── JWT (bez knihovny) ───────────────────────────────────────────────────────

def b64url_encode(data):
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def b64url_decode(s):
    s += '=' * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)

def jwt_create(payload):
    header = b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}))
    payload['exp'] = int(time.time()) + JWT_EXPIRY
    body = b64url_encode(json.dumps(payload))
    sig_input = f"{header}.{body}".encode()
    sig = hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
    return f"{header}.{body}.{b64url_encode(sig)}"

def jwt_verify(token):
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header, body, sig = parts
        sig_input = f"{header}.{body}".encode()
        expected = hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
        if not hmac.compare_digest(b64url_decode(sig), expected):
            return None
        payload = json.loads(b64url_decode(body))
        if payload.get('exp', 0) < time.time():
            return None
        return payload
    except Exception:
        return None

# ─── Database ────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    c.executescript('''
        CREATE TABLE IF NOT EXISTS hub_settings (
            klic TEXT PRIMARY KEY,
            hodnota TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS hub_billing (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mesic TEXT NOT NULL,
            manazer_id INTEGER REFERENCES users(id),
            vstupni_tokeny INTEGER DEFAULT 0,
            vystupni_tokeny INTEGER DEFAULT 0,
            cost_api REAL DEFAULT 0,
            marze_procent REAL DEFAULT 0,
            cost_faktura REAL DEFAULT 0,
            uzavreno_at TEXT DEFAULT (datetime('now')),
            uzavreno_by INTEGER REFERENCES users(id),
            UNIQUE(mesic, manazer_id)
        );

        CREATE TABLE IF NOT EXISTS kh_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jmeno TEXT NOT NULL,
            prijmeni TEXT NOT NULL,
            pozice TEXT DEFAULT '',
            oddeleni TEXT DEFAULT '',
            email TEXT DEFAULT '',
            telefon TEXT DEFAULT '',
            manazer_id INTEGER REFERENCES users(id),
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS kh_competencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag TEXT UNIQUE NOT NULL,
            popis TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS kh_contact_competencies (
            contact_id INTEGER REFERENCES kh_contacts(id) ON DELETE CASCADE,
            competency_id INTEGER REFERENCES kh_competencies(id) ON DELETE CASCADE,
            skore INTEGER DEFAULT 3 CHECK(skore BETWEEN 1 AND 5),
            PRIMARY KEY (contact_id, competency_id)
        );

        CREATE TABLE IF NOT EXISTS kh_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER REFERENCES kh_contacts(id) ON DELETE CASCADE,
            autor_id INTEGER REFERENCES users(id),
            text_raw TEXT NOT NULL,
            text_anon TEXT DEFAULT '',
            extracted_tags TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS kh_token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            akce TEXT NOT NULL,
            vstupni_tokeny INTEGER DEFAULT 0,
            vystupni_tokeny INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jmeno TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            heslo_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','manazer','poradce')),
            manazer_id INTEGER REFERENCES users(id),
            aktivni INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_managers (
            poradce_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            manazer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            je_billing INTEGER DEFAULT 1,
            PRIMARY KEY (poradce_id, manazer_id)
        );

        CREATE TABLE IF NOT EXISTS apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nazev TEXT NOT NULL,
            url TEXT NOT NULL,
            ikona TEXT DEFAULT '📦',
            popis TEXT DEFAULT '',
            poradi INTEGER DEFAULT 0,
            aktivni INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS permissions (
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            app_id INTEGER REFERENCES apps(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, app_id)
        );

        CREATE TABLE IF NOT EXISTS at_trainings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            mode TEXT DEFAULT '',
            difficulty TEXT DEFAULT '',
            situation TEXT DEFAULT '',
            reason TEXT DEFAULT '',
            highlight TEXT DEFAULT '',
            personality TEXT DEFAULT '',
            duration INTEGER DEFAULT 0,
            message_count INTEGER DEFAULT 0,
            client_left INTEGER DEFAULT 0,
            meeting_scheduled INTEGER DEFAULT 0,
            chain_phase INTEGER DEFAULT 0,
            profile_json TEXT DEFAULT '{}',
            messages_json TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS at_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            training_id INTEGER REFERENCES at_trainings(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            overall_score REAL DEFAULT 0,
            result TEXT DEFAULT '',
            highlight_discovered INTEGER DEFAULT 0,
            highlight_product_offered INTEGER DEFAULT 0,
            sub_goals TEXT DEFAULT '{}',
            skills TEXT DEFAULT '{}',
            phone_skills TEXT DEFAULT '{}',
            advisor_feedback TEXT DEFAULT '',
            manager_feedback TEXT DEFAULT '',
            suggested_questions TEXT DEFAULT '[]',
            ideal_approach TEXT DEFAULT '',
            summary TEXT DEFAULT '',
            quiz_score INTEGER DEFAULT 0,
            quiz_total INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS at_manager_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            evaluation_id INTEGER REFERENCES at_evaluations(id) ON DELETE CASCADE,
            manager_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            note TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS met_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            variant TEXT NOT NULL CHECK(variant IN ('kb', 'mp')),
            doc_type TEXT NOT NULL DEFAULT 'full' CHECK(doc_type IN ('full', 'list')),
            nazev TEXT NOT NULL,
            filename TEXT NOT NULL,
            strany INTEGER DEFAULT 0,
            chunks INTEGER DEFAULT 0,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS met_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id INTEGER REFERENCES met_documents(id) ON DELETE CASCADE,
            variant TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            stranka_od INTEGER DEFAULT 0,
            stranka_do INTEGER DEFAULT 0,
            text TEXT NOT NULL,
            keywords TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS met_exceptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            variant TEXT NOT NULL CHECK(variant IN ('kb', 'mp')),
            text_raw TEXT NOT NULL,
            keywords TEXT DEFAULT '',
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS met_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            variant TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id),
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS news_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT UNIQUE NOT NULL,
            description TEXT DEFAULT '',
            published_at TEXT DEFAULT '',
            category TEXT DEFAULT 'finance',
            fetched_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS news_meta (
            klic TEXT PRIMARY KEY,
            hodnota TEXT NOT NULL
        );
    ''')

    # Migrace: doc_type sloupec do met_documents
    try:
        c.execute("ALTER TABLE met_documents ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'full'")
        conn.commit()
    except Exception:
        pass  # sloupec už existuje

    # Migrace: přesun manazer_id → user_managers
    c.execute("""
        INSERT OR IGNORE INTO user_managers (poradce_id, manazer_id, je_billing)
        SELECT id, manazer_id, 1 FROM users
        WHERE role='poradce' AND manazer_id IS NOT NULL
    """)
    conn.commit()

    # Výchozí aplikace
    # Smaž případné duplikáty a ponech jen jednu správnou položku
    c.execute("DELETE FROM apps WHERE nazev='KontaktHub' AND url LIKE '%5174%'")
    dupl = c.execute("SELECT id FROM apps WHERE nazev='KontaktHub' ORDER BY id").fetchall()
    for row in dupl[1:]:  # ponech první, smaž zbytek
        c.execute("DELETE FROM apps WHERE id=?", (row[0],))
    kh_exists = c.execute("SELECT id FROM apps WHERE nazev='KontaktHub'").fetchone()
    if not kh_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('KontaktHub', '/kontakthub/', '🤝', 'Správa kontaktů a kompetencí s AI', 1)
        )
    else:
        c.execute("UPDATE apps SET url='/kontakthub/' WHERE nazev='KontaktHub'")

    # Advisor Training app
    at_exists = c.execute("SELECT id FROM apps WHERE nazev='Advisor Training'").fetchone()
    if not at_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('Advisor Training', '/advisor-training/', '🎓', 'Trénink poradců s AI klientem', 3)
        )
    else:
        c.execute("UPDATE apps SET url='/advisor-training/' WHERE nazev='Advisor Training'")

    # Metodika app
    met_exists = c.execute("SELECT id FROM apps WHERE nazev='Metodika'").fetchone()
    if not met_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('Metodika', '/metodika/', '📋', 'Rádce pro metodiku hypotečních úvěrů', 2)
        )
    else:
        c.execute("UPDATE apps SET url='/metodika/' WHERE nazev='Metodika'")

    # Novinky
    news_exists = c.execute("SELECT id FROM apps WHERE nazev='Novinky'").fetchone()
    if not news_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('Novinky', '/novinky/', '📰', 'Novinky ze světa hypoték a financí', 0)
        )

    # Pojistná kalkulačka
    pk_exists = c.execute("SELECT id FROM apps WHERE nazev='Pojistná kalkulačka'").fetchone()
    if not pk_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('Pojistná kalkulačka', '/pojistna-kalkulacka.html', '🛡️', 'Kalkulačka pojistných částek', 4)
        )
    else:
        c.execute("UPDATE apps SET url='/pojistna-kalkulacka.html' WHERE nazev='Pojistná kalkulačka'")

    # Kalkulačka úvěrů
    ku_exists = c.execute("SELECT id FROM apps WHERE nazev='Kalkulačka úvěrů'").fetchone()
    if not ku_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('Kalkulačka úvěrů', '/kalkulacka-4.html', '🏦', 'Kalkulačka úvěrů', 5)
        )

    # Spoření test
    sp_exists = c.execute("SELECT id FROM apps WHERE nazev='Spoření test'").fetchone()
    if not sp_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('Spoření test', '/kalkulator-A-sporeni.html', '💰', 'Kalkulačka spoření', 6)
        )

    # Úvěry test
    ut_exists = c.execute("SELECT id FROM apps WHERE nazev='Úvěry test'").fetchone()
    if not ut_exists:
        c.execute(
            "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
            ('Úvěry test', '/kalkulator-B-uvery.html', '📊', 'Kalkulačka úvěrů test', 7)
        )

    # Výchozí admin účet
    existing = c.execute("SELECT id FROM users WHERE role='admin'").fetchone()
    if not existing:
        heslo_hash = hashlib.sha256('admin123'.encode()).hexdigest()
        c.execute(
            "INSERT INTO users (jmeno, email, heslo_hash, role) VALUES (?, ?, ?, ?)",
            ('Admin', 'admin@admin.cz', heslo_hash, 'admin')
        )
        print("✅ Výchozí admin: admin@admin.cz / admin123")

    conn.commit()
    conn.close()

def hash_password(pwd):
    return hashlib.sha256(pwd.encode()).hexdigest()

# ─── CORS helper ─────────────────────────────────────────────────────────────

def cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response

@app.after_request
def after_request(response):
    return cors(response)

@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        return cors(jsonify({}))

# ─── Auth middleware ──────────────────────────────────────────────────────────

def require_auth(roles=None):
    def decorator(f):
        def wrapper(*args, **kwargs):
            auth = request.headers.get('Authorization', '')
            if not auth.startswith('Bearer '):
                return jsonify({'error': 'Chybí token'}), 401
            payload = jwt_verify(auth[7:])
            if not payload:
                return jsonify({'error': 'Neplatný nebo expirovaný token'}), 401
            if roles and payload.get('role') not in roles:
                return jsonify({'error': 'Nedostatečná oprávnění'}), 403
            request.user = payload
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator

# ─── API Routes ──────────────────────────────────────────────────────────────

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    heslo = data.get('heslo', '')
    
    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE email=? AND aktivni=1", (email,)
    ).fetchone()
    conn.close()
    
    if not user or user['heslo_hash'] != hash_password(heslo):
        return jsonify({'error': 'Nesprávný email nebo heslo'}), 401
    
    token = jwt_create({
        'id': user['id'],
        'jmeno': user['jmeno'],
        'email': user['email'],
        'role': user['role'],
        'manazer_id': user['manazer_id']
    })
    
    return jsonify({'token': token, 'role': user['role'], 'jmeno': user['jmeno']})

@app.route('/api/me', methods=['GET'])
@require_auth()
def me():
    return jsonify(request.user)

# ─── Aplikace ─────────────────────────────────────────────────────────────────

@app.route('/api/apps', methods=['GET'])
@require_auth()
def get_apps():
    conn = get_db()
    user = request.user
    show_all = request.args.get('all') == '1' and user['role'] == 'admin'

    if user['role'] == 'admin':
        if show_all:
            apps = conn.execute(
                "SELECT * FROM apps ORDER BY poradi, nazev"
            ).fetchall()
        else:
            apps = conn.execute(
                "SELECT * FROM apps WHERE aktivni=1 ORDER BY poradi, nazev"
            ).fetchall()
    else:
        # manazer i poradce filtrují přes permissions
        apps = conn.execute('''
            SELECT a.* FROM apps a
            JOIN permissions p ON p.app_id = a.id
            WHERE p.user_id = ? AND a.aktivni = 1
            ORDER BY a.poradi, a.nazev
        ''', (user['id'],)).fetchall()

    conn.close()
    return jsonify([dict(a) for a in apps])

@app.route('/api/apps', methods=['POST'])
@require_auth(['admin'])
def create_app():
    data = request.get_json()
    conn = get_db()
    conn.execute(
        "INSERT INTO apps (nazev, url, ikona, popis, poradi) VALUES (?, ?, ?, ?, ?)",
        (data['nazev'], data['url'], data.get('ikona', '📦'), data.get('popis', ''), data.get('poradi', 0))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/apps/<int:app_id>', methods=['PUT'])
@require_auth(['admin'])
def update_app(app_id):
    data = request.get_json()
    conn = get_db()
    conn.execute(
        "UPDATE apps SET nazev=?, url=?, ikona=?, popis=?, poradi=?, aktivni=? WHERE id=?",
        (data['nazev'], data['url'], data.get('ikona', '📦'), data.get('popis', ''), data.get('poradi', 0), data.get('aktivni', 1), app_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/apps/<int:app_id>/toggle', methods=['POST'])
@require_auth(['admin'])
def toggle_app(app_id):
    conn = get_db()
    conn.execute("UPDATE apps SET aktivni = 1 - aktivni WHERE id=?", (app_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/apps/<int:app_id>', methods=['DELETE'])
@require_auth(['admin'])
def delete_app(app_id):
    conn = get_db()
    conn.execute("UPDATE apps SET aktivni=0 WHERE id=?", (app_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Uživatelé ────────────────────────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
@require_auth(['admin', 'manazer'])
def get_users():
    conn = get_db()
    user = request.user

    if user['role'] == 'admin':
        users_raw = conn.execute(
            "SELECT id, jmeno, email, role, manazer_id, aktivni, created_at FROM users WHERE role != 'admin' ORDER BY role, jmeno"
        ).fetchall()
    else:
        # Manažer vidí poradce ze svojí junction tabulky
        users_raw = conn.execute('''
            SELECT u.id, u.jmeno, u.email, u.role, u.manazer_id, u.aktivni, u.created_at
            FROM users u
            JOIN user_managers um ON um.poradce_id = u.id
            WHERE um.manazer_id = ?
            ORDER BY u.jmeno
        ''', (user['id'],)).fetchall()

    # Přidáme manageri list ke každému poradci
    um_rows = conn.execute("SELECT poradce_id, manazer_id, je_billing FROM user_managers").fetchall()
    managers_raw = conn.execute("SELECT id, jmeno FROM users WHERE role='manazer'").fetchall()
    mgr_names = {r['id']: r['jmeno'] for r in managers_raw}

    managers_map = {}
    for r in um_rows:
        managers_map.setdefault(r['poradce_id'], []).append({
            'manazer_id': r['manazer_id'],
            'jmeno': mgr_names.get(r['manazer_id'], '?'),
            'je_billing': r['je_billing'],
        })

    conn.close()
    result = []
    for u in users_raw:
        d = dict(u)
        d['manageri'] = managers_map.get(u['id'], [])
        result.append(d)
    return jsonify(result)

@app.route('/api/users', methods=['POST'])
@require_auth(['admin', 'manazer'])
def create_user():
    data = request.get_json()
    caller = request.user
    role = data.get('role')

    if caller['role'] == 'manazer' and role != 'poradce':
        return jsonify({'error': 'Manažer může zakládat pouze poradce'}), 403

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email=?", (data['email'].lower(),)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Email již existuje'}), 400

    # Billing manazer_id (legacy column — ukládáme billing manažera)
    if caller['role'] == 'manazer':
        billing_id = caller['id']
        manazer_ids = [caller['id']]
    else:
        manazer_ids = data.get('manazer_ids', [])
        billing_id = data.get('billing_manazer_id') or (manazer_ids[0] if manazer_ids else None)

    heslo_hash = hash_password(data['heslo'])
    cur = conn.execute(
        "INSERT INTO users (jmeno, email, heslo_hash, role, manazer_id) VALUES (?, ?, ?, ?, ?)",
        (data['jmeno'], data['email'].lower(), heslo_hash, role, billing_id)
    )
    new_id = cur.lastrowid

    # user_managers junction
    if role == 'poradce':
        for mid in manazer_ids[:2]:
            je_billing = 1 if mid == billing_id else 0
            conn.execute(
                "INSERT OR IGNORE INTO user_managers (poradce_id, manazer_id, je_billing) VALUES (?,?,?)",
                (new_id, mid, je_billing)
            )

    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/users/<int:user_id>/managers', methods=['PUT'])
@require_auth(['admin'])
def set_managers(user_id):
    """Admin nastaví manažery poradce (max 2) a billing manažera."""
    data = request.get_json()
    managers = data.get('managers', [])  # [{manazer_id: X, je_billing: 0|1}, ...]
    if len(managers) > 2:
        return jsonify({'error': 'Max 2 manažeři'}), 400

    conn = get_db()
    target = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not target or target['role'] != 'poradce':
        conn.close()
        return jsonify({'error': 'Poradce nenalezen'}), 404

    # Nastav billing_id
    billing = next((m['manazer_id'] for m in managers if m.get('je_billing')), None)
    if not billing and managers:
        billing = managers[0]['manazer_id']

    conn.execute("DELETE FROM user_managers WHERE poradce_id=?", (user_id,))
    for m in managers:
        je_b = 1 if m['manazer_id'] == billing else 0
        conn.execute(
            "INSERT INTO user_managers (poradce_id, manazer_id, je_billing) VALUES (?,?,?)",
            (user_id, m['manazer_id'], je_b)
        )
    conn.execute("UPDATE users SET manazer_id=? WHERE id=?", (billing, user_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@require_auth(['admin', 'manazer'])
def update_user(user_id):
    data = request.get_json()
    caller = request.user
    conn = get_db()
    
    target = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not target:
        conn.close()
        return jsonify({'error': 'Uživatel nenalezen'}), 404
    
    if caller['role'] == 'manazer' and target['manazer_id'] != caller['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403
    
    updates = []
    params = []
    if 'jmeno' in data:
        updates.append('jmeno=?'); params.append(data['jmeno'])
    if 'aktivni' in data:
        updates.append('aktivni=?'); params.append(data['aktivni'])
    if 'heslo' in data and data['heslo']:
        updates.append('heslo_hash=?'); params.append(hash_password(data['heslo']))
    
    if updates:
        params.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_auth(['admin', 'manazer'])
def delete_user(user_id):
    caller = request.user
    conn = get_db()
    target = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not target:
        conn.close()
        return jsonify({'error': 'Uživatel nenalezen'}), 404
    if caller['role'] == 'manazer' and target['manazer_id'] != caller['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403
    conn.execute("UPDATE users SET aktivni=0 WHERE id=?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── Oprávnění poradců ────────────────────────────────────────────────────────

@app.route('/api/users/<int:user_id>/permissions', methods=['GET'])
@require_auth(['admin', 'manazer'])
def get_permissions(user_id):
    conn = get_db()
    perms = conn.execute(
        "SELECT app_id FROM permissions WHERE user_id=?", (user_id,)
    ).fetchall()
    conn.close()
    return jsonify([p['app_id'] for p in perms])

@app.route('/api/users/<int:user_id>/permissions', methods=['PUT'])
@require_auth(['admin', 'manazer'])
def set_permissions(user_id):
    data = request.get_json()
    app_ids = data.get('app_ids', [])
    caller = request.user
    
    conn = get_db()
    target = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not target:
        conn.close()
        return jsonify({'error': 'Uživatel nenalezen'}), 404
    if caller['role'] == 'manazer' and target['manazer_id'] != caller['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403
    
    conn.execute("DELETE FROM permissions WHERE user_id=?", (user_id,))
    for app_id in app_ids:
        conn.execute("INSERT OR IGNORE INTO permissions (user_id, app_id) VALUES (?, ?)", (user_id, app_id))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ─── KontaktHub ───────────────────────────────────────────────────────────────

def kh_anonymize(text, contact_name=None):
    """Nahradí jméno kontaktu a citlivé vzory anonymními zástupci."""
    anon = text
    if contact_name:
        parts = [p for p in contact_name.split() if len(p) > 2]
        for p in parts:
            anon = re.sub(re.escape(p), '[JMÉNO]', anon, flags=re.IGNORECASE)
    # e-maily a telefony
    anon = re.sub(r'\b[\w.+-]+@[\w-]+\.\w+\b', '[EMAIL]', anon)
    anon = re.sub(r'\b(\+?\d[\d\s\-]{7,14}\d)\b', '[TELEFON]', anon)
    return anon

def kh_log_tokens(user_id, akce, vstup, vystup):
    conn = get_db()
    conn.execute(
        "INSERT INTO kh_token_usage (user_id, akce, vstupni_tokeny, vystupni_tokeny) VALUES (?,?,?,?)",
        (user_id, akce, vstup, vystup)
    )
    conn.commit()
    conn.close()

def kh_claude_extract(text_anon, existing_tags):
    """Extrahuje kompetence z anonymizovaného textu. Vrátí list tagů."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))
        tags_str = ', '.join(existing_tags) if existing_tags else 'žádné zatím'
        prompt = f"""Analyzuj následující poznámku o kontaktu a extrahuj kompetence jako krátké tagy (1-3 slova, česky, lowercase).

Stávající tagy v systému (používej je pokud sedí, nebo vytvoř nové):
{tags_str}

Poznámka:
{text_anon}

Vrať JSON pole tagů, max 8. Příklad: ["projektové řízení", "excel", "fakturace", "prezentace"]
Vrať POUZE JSON pole, bez dalšího textu."""

        msg = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=300,
            messages=[{'role': 'user', 'content': prompt}]
        )
        raw = msg.content[0].text.strip()
        tags = json.loads(raw)
        return tags, msg.usage.input_tokens, msg.usage.output_tokens
    except Exception as e:
        print(f'KH extract error: {e}')
        return [], 0, 0

def kh_claude_normalize(new_tag, existing_tags):
    """Normalizuje nový tag vůči existující taxonomii. Vrátí kanonický tag."""
    if not existing_tags:
        return new_tag.lower().strip()
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))
        prompt = f"""Mám nový tag: "{new_tag}"

Existující tagy v taxonomii: {', '.join(existing_tags)}

Pokud nový tag znamená totéž co některý existující (např. "fakturování" = "fakturace"), vrať existující tag.
Jinak vrať nový tag v lowercase, zkrácený na 1-3 slova.
Vrať POUZE tag jako prostý text, bez uvozovek."""

        msg = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=50,
            messages=[{'role': 'user', 'content': prompt}]
        )
        normalized = msg.content[0].text.strip().lower()
        return normalized, msg.usage.input_tokens, msg.usage.output_tokens
    except Exception as e:
        print(f'KH normalize error: {e}')
        return new_tag.lower().strip(), 0, 0

def kh_claude_search(query, all_tags):
    """Rozloží search query na relevantní tagy pro matching. Vrátí list tagů."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))
        prompt = f"""Mám vyhledávací dotaz: "{query}"

Dostupné tagy v systému: {', '.join(all_tags)}

Vyber tagy, které jsou relevantní pro tento dotaz. Můžeš vybrat 1-6 tagů.
Vrať JSON pole vybraných tagů. Příklad: ["excel", "reporting", "finance"]
Vrať POUZE JSON pole, bez dalšího textu."""

        msg = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=200,
            messages=[{'role': 'user', 'content': prompt}]
        )
        raw = msg.content[0].text.strip()
        tags = json.loads(raw)
        return tags, msg.usage.input_tokens, msg.usage.output_tokens
    except Exception as e:
        print(f'KH search error: {e}')
        # fallback: keyword matching
        query_lower = query.lower()
        fallback = [t for t in all_tags if any(w in t for w in query_lower.split())]
        return fallback[:6], 0, 0


# ── Kontakty ──────────────────────────────────────────────────────

@app.route('/api/kh/contacts', methods=['GET'])
@require_auth(['admin', 'manazer', 'poradce'])
def kh_get_contacts():
    conn = get_db()
    user = request.user
    if user['role'] == 'admin':
        contacts = conn.execute('''
            SELECT c.*, u.jmeno as manazer_jmeno,
                   GROUP_CONCAT(comp.tag) as tags
            FROM kh_contacts c
            LEFT JOIN users u ON u.id = c.manazer_id
            LEFT JOIN kh_contact_competencies cc ON cc.contact_id = c.id
            LEFT JOIN kh_competencies comp ON comp.id = cc.competency_id
            GROUP BY c.id ORDER BY c.prijmeni, c.jmeno
        ''').fetchall()
    elif user['role'] == 'manazer':
        contacts = conn.execute('''
            SELECT c.*, u.jmeno as manazer_jmeno,
                   GROUP_CONCAT(comp.tag) as tags
            FROM kh_contacts c
            LEFT JOIN users u ON u.id = c.manazer_id
            LEFT JOIN kh_contact_competencies cc ON cc.contact_id = c.id
            LEFT JOIN kh_competencies comp ON comp.id = cc.competency_id
            WHERE c.manazer_id = ?
            GROUP BY c.id ORDER BY c.prijmeni, c.jmeno
        ''', (user['id'],)).fetchall()
    else:
        # Poradce vidí všechny kontakty, ale jen jméno/pozici/tagy
        contacts = conn.execute('''
            SELECT c.id, c.jmeno, c.prijmeni, c.pozice, c.oddeleni,
                   GROUP_CONCAT(comp.tag) as tags
            FROM kh_contacts c
            LEFT JOIN kh_contact_competencies cc ON cc.contact_id = c.id
            LEFT JOIN kh_competencies comp ON comp.id = cc.competency_id
            GROUP BY c.id ORDER BY c.prijmeni, c.jmeno
        ''').fetchall()
    conn.close()
    result = []
    for c in contacts:
        d = dict(c)
        d['tags'] = d['tags'].split(',') if d.get('tags') else []
        result.append(d)
    return jsonify(result)

@app.route('/api/kh/contacts', methods=['POST'])
@require_auth(['admin', 'manazer'])
def kh_create_contact():
    data = request.get_json()
    user = request.user
    manazer_id = user['id'] if user['role'] == 'manazer' else data.get('manazer_id', user['id'])
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO kh_contacts (jmeno, prijmeni, pozice, oddeleni, email, telefon, manazer_id, created_by) VALUES (?,?,?,?,?,?,?,?)",
        (data['jmeno'], data['prijmeni'], data.get('pozice',''), data.get('oddeleni',''),
         data.get('email',''), data.get('telefon',''), manazer_id, user['id'])
    )
    contact_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': contact_id})

@app.route('/api/kh/contacts/<int:cid>', methods=['GET'])
@require_auth(['admin', 'manazer', 'poradce'])
def kh_get_contact(cid):
    conn = get_db()
    user = request.user
    contact = conn.execute("SELECT * FROM kh_contacts WHERE id=?", (cid,)).fetchone()
    if not contact:
        conn.close()
        return jsonify({'error': 'Nenalezeno'}), 404
    # Zápis (edit/delete) jen pro vlastního manažera nebo admina
    if user['role'] == 'manazer' and contact['manazer_id'] != user['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403

    comps = conn.execute('''
        SELECT comp.tag, cc.skore FROM kh_competencies comp
        JOIN kh_contact_competencies cc ON cc.competency_id = comp.id
        WHERE cc.contact_id = ?
    ''', (cid,)).fetchall()

    entries = conn.execute('''
        SELECT e.id, e.text_raw, e.extracted_tags, e.created_at, u.jmeno as autor
        FROM kh_entries e LEFT JOIN users u ON u.id = e.autor_id
        WHERE e.contact_id = ? ORDER BY e.created_at DESC
    ''', (cid,)).fetchall()

    conn.close()
    d = dict(contact)
    d['competencies'] = [{'tag': r['tag'], 'skore': r['skore']} for r in comps]
    d['entries'] = [
        {'id': r['id'], 'text': r['text_raw'], 'tags': json.loads(r['extracted_tags'] or '[]'),
         'created_at': r['created_at'], 'autor': r['autor']}
        for r in entries
    ]
    return jsonify(d)

@app.route('/api/kh/contacts/<int:cid>', methods=['PUT'])
@require_auth(['admin', 'manazer'])
def kh_update_contact(cid):
    data = request.get_json()
    user = request.user
    conn = get_db()
    contact = conn.execute("SELECT * FROM kh_contacts WHERE id=?", (cid,)).fetchone()
    if not contact:
        conn.close()
        return jsonify({'error': 'Nenalezeno'}), 404
    if user['role'] == 'manazer' and contact['manazer_id'] != user['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403
    conn.execute(
        "UPDATE kh_contacts SET jmeno=?, prijmeni=?, pozice=?, oddeleni=?, email=?, telefon=?, updated_at=datetime('now') WHERE id=?",
        (data.get('jmeno', contact['jmeno']), data.get('prijmeni', contact['prijmeni']),
         data.get('pozice', contact['pozice']), data.get('oddeleni', contact['oddeleni']),
         data.get('email', contact['email']), data.get('telefon', contact['telefon']), cid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/kh/contacts/<int:cid>', methods=['DELETE'])
@require_auth(['admin', 'manazer'])
def kh_delete_contact(cid):
    user = request.user
    conn = get_db()
    contact = conn.execute("SELECT * FROM kh_contacts WHERE id=?", (cid,)).fetchone()
    if not contact:
        conn.close()
        return jsonify({'error': 'Nenalezeno'}), 404
    if user['role'] == 'manazer' and contact['manazer_id'] != user['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403
    conn.execute("DELETE FROM kh_contacts WHERE id=?", (cid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ── Záznamy (entries) ─────────────────────────────────────────────

@app.route('/api/kh/entries', methods=['POST'])
@require_auth(['admin', 'manazer'])
def kh_add_entry():
    data = request.get_json()
    user = request.user
    cid = data.get('contact_id')
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'error': 'Text je povinný'}), 400

    conn = get_db()
    contact = conn.execute("SELECT * FROM kh_contacts WHERE id=?", (cid,)).fetchone()
    if not contact:
        conn.close()
        return jsonify({'error': 'Kontakt nenalezen'}), 404
    if user['role'] == 'manazer' and contact['manazer_id'] != user['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403

    # Anonymizace před odesláním do Claude
    contact_name = f"{contact['jmeno']} {contact['prijmeni']}"
    text_anon = kh_anonymize(text, contact_name)

    # Načtení existujících tagů
    existing = conn.execute("SELECT tag FROM kh_competencies").fetchall()
    existing_tags = [r['tag'] for r in existing]

    # Extrakce kompetencí přes Claude
    extracted, inp_tok, out_tok = kh_claude_extract(text_anon, existing_tags)
    kh_log_tokens(user['id'], 'extract', inp_tok, out_tok)

    # Normalizace + uložení tagů
    final_tags = []
    for raw_tag in extracted:
        normalized, ni, no = kh_claude_normalize(raw_tag, existing_tags)
        kh_log_tokens(user['id'], 'normalize', ni, no)
        # Upsert do taxonomie
        conn.execute("INSERT OR IGNORE INTO kh_competencies (tag) VALUES (?)", (normalized,))
        comp = conn.execute("SELECT id FROM kh_competencies WHERE tag=?", (normalized,)).fetchone()
        if comp:
            conn.execute(
                "INSERT OR IGNORE INTO kh_contact_competencies (contact_id, competency_id) VALUES (?,?)",
                (cid, comp['id'])
            )
            final_tags.append(normalized)
        existing_tags = list(set(existing_tags + [normalized]))

    # Uložení záznamu
    conn.execute(
        "INSERT INTO kh_entries (contact_id, autor_id, text_raw, text_anon, extracted_tags) VALUES (?,?,?,?,?)",
        (cid, user['id'], text, text_anon, json.dumps(final_tags))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'tags': final_tags})


# ── Vyhledávání ───────────────────────────────────────────────────

@app.route('/api/kh/search', methods=['POST'])
@require_auth(['admin', 'manazer', 'poradce'])
def kh_search():
    data = request.get_json()
    query = data.get('query', '').strip()
    if not query:
        return jsonify({'error': 'Dotaz je prázdný'}), 400

    conn = get_db()
    user = request.user

    all_tags = [r['tag'] for r in conn.execute("SELECT tag FROM kh_competencies").fetchall()]
    if not all_tags:
        conn.close()
        return jsonify({'results': [], 'matched_tags': []})

    matched_tags, inp_tok, out_tok = kh_claude_search(query, all_tags)
    kh_log_tokens(user['id'], 'search', inp_tok, out_tok)

    if not matched_tags:
        conn.close()
        return jsonify({'results': [], 'matched_tags': []})

    # Skórování: počet shod tagů na kontakt
    placeholders = ','.join('?' * len(matched_tags))

    # Všichni vidí všechny kontakty — omezení je jen na zápis
    scope_filter = ''
    scope_params = []

    rows = conn.execute(f'''
        SELECT c.id, c.jmeno, c.prijmeni, c.pozice, c.oddeleni,
               COUNT(cc.competency_id) as shody,
               GROUP_CONCAT(comp.tag) as matched
        FROM kh_contacts c
        JOIN kh_contact_competencies cc ON cc.contact_id = c.id
        JOIN kh_competencies comp ON comp.id = cc.competency_id
        WHERE comp.tag IN ({placeholders}){scope_filter}
        GROUP BY c.id
        ORDER BY shody DESC, c.prijmeni
        LIMIT 10
    ''', matched_tags + scope_params).fetchall()

    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d['matched_tags'] = d['matched'].split(',') if d.get('matched') else []
        del d['matched']
        results.append(d)

    return jsonify({'results': results, 'matched_tags': matched_tags})


# ── Taxonomie ─────────────────────────────────────────────────────

@app.route('/api/kh/taxonomy', methods=['GET'])
@require_auth()
def kh_get_taxonomy():
    conn = get_db()
    tags = conn.execute("SELECT tag, popis FROM kh_competencies ORDER BY tag").fetchall()
    conn.close()
    return jsonify([dict(t) for t in tags])

@app.route('/api/kh/taxonomy', methods=['POST'])
@require_auth(['admin', 'manazer'])
def kh_add_tag():
    data = request.get_json()
    tag = data.get('tag', '').strip().lower()
    if not tag:
        return jsonify({'error': 'Tag je povinný'}), 400
    conn = get_db()
    conn.execute("INSERT OR IGNORE INTO kh_competencies (tag, popis) VALUES (?,?)",
                 (tag, data.get('popis', '')))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/kh/taxonomy/<string:tag>', methods=['DELETE'])
@require_auth(['admin'])
def kh_delete_tag(tag):
    conn = get_db()
    conn.execute("DELETE FROM kh_competencies WHERE tag=?", (tag,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ── Hub nastavení ────────────────────────────────────────────────

@app.route('/api/hub/settings', methods=['GET'])
@require_auth(['admin', 'manazer'])
def get_settings():
    conn = get_db()
    rows = conn.execute("SELECT klic, hodnota FROM hub_settings").fetchall()
    conn.close()
    defaults = {'api_marze_procent': '0'}
    result = {**defaults, **{r['klic']: r['hodnota'] for r in rows}}
    return jsonify(result)

@app.route('/api/hub/settings', methods=['PUT'])
@require_auth(['admin'])
def put_settings():
    data = request.get_json()
    conn = get_db()
    for k, v in data.items():
        conn.execute("INSERT OR REPLACE INTO hub_settings (klic, hodnota) VALUES (?,?)", (k, str(v)))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ── Agregované náklady pro hub ────────────────────────────────────

@app.route('/api/hub/costs', methods=['GET'])
@require_auth(['admin', 'manazer'])
def hub_costs():
    """Vrátí náklady na Claude API per manažer (vlastní + tým)."""
    conn = get_db()
    user = request.user

    if user['role'] == 'admin':
        # Všichni manažeři
        managers = conn.execute(
            "SELECT id, jmeno, email FROM users WHERE role='manazer' AND aktivni=1"
        ).fetchall()
    else:
        managers = conn.execute(
            "SELECT id, jmeno, email FROM users WHERE id=?", (user['id'],)
        ).fetchall()

    result = []
    for m in managers:
        # Poradci pod manažerem
        team = conn.execute(
            "SELECT poradce_id FROM user_managers WHERE manazer_id=? AND je_billing=1",
            (m['id'],)
        ).fetchall()
        team_ids = [r['poradce_id'] for r in team] + [m['id']]
        placeholders = ','.join('?' * len(team_ids))

        # Tokeny ze všech zdrojů (kh_token_usage + případné další v budoucnu)
        row = conn.execute(f'''
            SELECT
                SUM(vstupni_tokeny) as vstup,
                SUM(vystupni_tokeny) as vystup,
                COUNT(*) as volani,
                MAX(created_at) as posledni
            FROM kh_token_usage
            WHERE user_id IN ({placeholders})
        ''', team_ids).fetchone()

        vstup = row['vstup'] or 0
        vystup = row['vystup'] or 0
        # Opus 4.6: $5/1M input, $25/1M output
        cost_usd = (vstup * 5 + vystup * 25) / 1_000_000

        result.append({
            'manazer_id': m['id'],
            'manazer_jmeno': m['jmeno'],
            'team_size': len(team),
            'vstupni_tokeny': vstup,
            'vystupni_tokeny': vystup,
            'volani': row['volani'] or 0,
            'posledni': row['posledni'],
            'cost_usd': round(cost_usd, 4),
        })

    # Breakdown per user (pro detail manažera nebo admin)
    breakdown = []
    if user['role'] == 'manazer':
        team_ids_all = [r['poradce_id'] for r in conn.execute(
            "SELECT poradce_id FROM user_managers WHERE manazer_id=?", (user['id'],)
        ).fetchall()] + [user['id']]
        placeholders2 = ','.join('?' * len(team_ids_all))
        rows = conn.execute(f'''
            SELECT u.jmeno, u.role,
                   SUM(t.vstupni_tokeny) as vstup,
                   SUM(t.vystupni_tokeny) as vystup,
                   COUNT(t.id) as volani
            FROM users u
            LEFT JOIN kh_token_usage t ON t.user_id = u.id
            WHERE u.id IN ({placeholders2})
            GROUP BY u.id
        ''', team_ids_all).fetchall()
        for r in rows:
            cost = ((r['vstup'] or 0) * 5 + (r['vystup'] or 0) * 25) / 1_000_000
            breakdown.append({
                'jmeno': r['jmeno'], 'role': r['role'],
                'vstup': r['vstup'] or 0, 'vystup': r['vystup'] or 0,
                'volani': r['volani'] or 0, 'cost_usd': round(cost, 4),
            })

    # Marže z nastavení
    marze_row = conn.execute("SELECT hodnota FROM hub_settings WHERE klic='api_marze_procent'").fetchone()
    marze_procent = float(marze_row['hodnota']) if marze_row else 0.0

    conn.close()
    return jsonify({'managers': result, 'breakdown': breakdown, 'marze_procent': marze_procent})


# ── Měsíční uzávěrka & fakturace ─────────────────────────────────

@app.route('/api/hub/billing/close', methods=['POST'])
@require_auth(['admin'])
def billing_close():
    """Uzavře měsíc — uloží snapshot nákladů se současnou marží. Nelze přepsat."""
    data  = request.get_json()
    mesic = data.get('mesic')  # format YYYY-MM
    if not mesic or not __import__('re').match(r'^\d{4}-\d{2}$', mesic):
        return jsonify({'error': 'Neplatný formát měsíce (YYYY-MM)'}), 400

    conn  = get_db()
    # Zkontroluj jestli uzávěrka ještě neexistuje
    existing = conn.execute("SELECT id FROM hub_billing WHERE mesic=?", (mesic,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': f'Měsíc {mesic} již byl uzavřen'}), 409

    marze_row = conn.execute("SELECT hodnota FROM hub_settings WHERE klic='api_marze_procent'").fetchone()
    marze = float(marze_row['hodnota']) if marze_row else 0.0

    managers = conn.execute("SELECT id, jmeno FROM users WHERE role='manazer' AND aktivni=1").fetchall()
    inserted = 0
    for m in managers:
        team = conn.execute(
            "SELECT poradce_id FROM user_managers WHERE manazer_id=? AND je_billing=1",
            (m['id'],)
        ).fetchall()
        team_ids = [r['poradce_id'] for r in team] + [m['id']]
        placeholders = ','.join('?' * len(team_ids))

        # Tokeny pouze za daný měsíc
        row = conn.execute(f'''
            SELECT SUM(vstupni_tokeny) as vstup, SUM(vystupni_tokeny) as vystup
            FROM kh_token_usage
            WHERE user_id IN ({placeholders})
              AND strftime('%Y-%m', created_at) = ?
        ''', team_ids + [mesic]).fetchone()

        vstup  = row['vstup']  or 0
        vystup = row['vystup'] or 0
        cost_api     = (vstup * 5 + vystup * 25) / 1_000_000
        cost_faktura = cost_api * (1 + marze / 100)

        conn.execute('''
            INSERT OR IGNORE INTO hub_billing
            (mesic, manazer_id, vstupni_tokeny, vystupni_tokeny, cost_api, marze_procent, cost_faktura, uzavreno_by)
            VALUES (?,?,?,?,?,?,?,?)
        ''', (mesic, m['id'], vstup, vystup, round(cost_api,6), marze, round(cost_faktura,6), request.user['id']))
        inserted += 1

    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'mesic': mesic, 'managers': inserted, 'marze_procent': marze})


@app.route('/api/hub/billing', methods=['GET'])
@require_auth(['admin'])
def billing_list():
    conn = get_db()
    rows = conn.execute('''
        SELECT b.*, u.jmeno as manazer_jmeno
        FROM hub_billing b JOIN users u ON u.id = b.manazer_id
        ORDER BY b.mesic DESC, u.jmeno
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/hub/billing/<mesic>/invoice', methods=['GET'])
@require_auth(['admin'])
def billing_invoice(mesic):
    """Vrátí HTML fakturu pro daný měsíc (tisknutelné PDF přes prohlížeč)."""
    conn = get_db()
    rows = conn.execute('''
        SELECT b.*, u.jmeno as manazer_jmeno, u.email as manazer_email
        FROM hub_billing b JOIN users u ON u.id = b.manazer_id
        WHERE b.mesic = ?
        ORDER BY u.jmeno
    ''', (mesic,)).fetchall()
    conn.close()

    if not rows:
        return jsonify({'error': 'Žádná data pro tento měsíc'}), 404

    rows = [dict(r) for r in rows]
    total_api     = sum(r['cost_api']     for r in rows)
    total_faktura = sum(r['cost_faktura'] for r in rows)
    marze         = rows[0]['marze_procent']
    uzavreno      = rows[0]['uzavreno_at'][:10]

    radky = ''.join(f'''
        <tr>
          <td>{r["manazer_jmeno"]}</td>
          <td style="color:#666">{r["manazer_email"]}</td>
          <td class="num">{r["vstupni_tokeny"]:,}</td>
          <td class="num">{r["vystupni_tokeny"]:,}</td>
          <td class="num">${r["cost_api"]:.4f}</td>
          <td class="num bold">${r["cost_faktura"]:.4f}</td>
        </tr>''' for r in rows)

    html = f'''<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>Faktura API — {mesic}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono&display=swap');
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'IBM Plex Sans', sans-serif; color: #1A1A1A; background: #fff; padding: 48px; font-size: 13px; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #CC0000; padding-bottom: 20px; }}
  .logo {{ font-size: 1.4rem; font-weight: 700; color: #CC0000; letter-spacing: -0.02em; }}
  .meta {{ text-align: right; color: #555; line-height: 1.6; }}
  h2 {{ font-size: 1rem; font-weight: 600; margin-bottom: 16px; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; }}
  thead tr {{ background: #F6F5F3; }}
  th {{ padding: 10px 12px; text-align: left; font-weight: 600; font-size: 0.78rem; color: #555; border-bottom: 1px solid #E2E0DC; }}
  td {{ padding: 10px 12px; border-bottom: 1px solid #E2E0DC; }}
  .num {{ text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 0.82rem; }}
  .bold {{ font-weight: 600; }}
  .totals {{ margin-left: auto; width: 320px; }}
  .totals tr td {{ padding: 8px 12px; }}
  .totals tr:last-child td {{ font-weight: 700; font-size: 1rem; color: #CC0000; border-top: 2px solid #CC0000; padding-top: 12px; }}
  .note {{ margin-top: 32px; font-size: 0.78rem; color: #888; line-height: 1.6; }}
  .badge {{ display: inline-block; background: #F9EDED; color: #CC0000; padding: 2px 8px; font-size: 0.75rem; font-weight: 600; border-radius: 2px; }}
  @media print {{ body {{ padding: 24px; }} button {{ display: none; }} }}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">PORTÁL</div>
    <div style="margin-top:6px;color:#555">Interní faktura Claude API nákladů</div>
  </div>
  <div class="meta">
    <div><strong>Období:</strong> {mesic}</div>
    <div><strong>Uzavřeno:</strong> {uzavreno}</div>
    <div><strong>Marže:</strong> <span class="badge">{marze:.0f} %</span></div>
  </div>
</div>

<h2>Přehled nákladů dle manažera</h2>
<table>
  <thead>
    <tr>
      <th>Manažer</th>
      <th>E-mail</th>
      <th style="text-align:right">Vstupní tok.</th>
      <th style="text-align:right">Výstupní tok.</th>
      <th style="text-align:right">Náklady API</th>
      <th style="text-align:right">K fakturaci</th>
    </tr>
  </thead>
  <tbody>{radky}</tbody>
</table>

<table class="totals">
  <tr><td>Celkem náklady API:</td><td class="num">${total_api:.4f}</td></tr>
  <tr><td>Marže ({marze:.0f} %):</td><td class="num">${total_faktura - total_api:.4f}</td></tr>
  <tr><td>Celkem k fakturaci:</td><td class="num">${total_faktura:.4f}</td></tr>
</table>

<div class="note">
  Ceny dle ceníku Anthropic Claude Opus 4.6: $5,00 / 1M vstupních tokenů · $25,00 / 1M výstupních tokenů.<br>
  Marže {marze:.0f} % byla platná k datu uzávěrky {uzavreno} a zpětně se nemění.<br>
  Tento dokument byl vygenerován automaticky systémem Portál.
</div>

<br><br>
<button onclick="window.print()" style="padding:10px 24px;background:#CC0000;color:#fff;border:none;font-family:inherit;font-size:0.875rem;font-weight:500;cursor:pointer">🖨 Tisk / Uložit jako PDF</button>
</body>
</html>'''
    from flask import Response
    return Response(html, mimetype='text/html')


# ── Token usage (billing) ─────────────────────────────────────────

@app.route('/api/kh/usage', methods=['GET'])
@require_auth(['admin', 'manazer'])
def kh_get_usage():
    conn = get_db()
    user = request.user
    if user['role'] == 'admin':
        rows = conn.execute('''
            SELECT u.jmeno, u.email, u.role, u.manazer_id,
                   SUM(t.vstupni_tokeny) as vstup_celkem,
                   SUM(t.vystupni_tokeny) as vystup_celkem,
                   COUNT(*) as pocet_volani,
                   MAX(t.created_at) as posledni
            FROM kh_token_usage t
            JOIN users u ON u.id = t.user_id
            GROUP BY t.user_id ORDER BY vstup_celkem DESC
        ''').fetchall()
    else:
        rows = conn.execute('''
            SELECT u.jmeno, u.email, u.role,
                   SUM(t.vstupni_tokeny) as vstup_celkem,
                   SUM(t.vystupni_tokeny) as vystup_celkem,
                   COUNT(*) as pocet_volani,
                   MAX(t.created_at) as posledni
            FROM kh_token_usage t
            JOIN users u ON u.id = t.user_id
            WHERE u.manazer_id = ? OR u.id = ?
            GROUP BY t.user_id ORDER BY vstup_celkem DESC
        ''', (user['id'], user['id'])).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── Advisor Training ────────────────────────────────────────────────────────

@app.route('/api/at/chat', methods=['POST'])
@require_auth()
def at_chat():
    data = request.get_json()
    system = data.get('system', '')
    messages = data.get('messages', [])
    max_tokens = data.get('max_tokens', 1000)
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY', ''))
        resp = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        conn = get_db()
        conn.execute(
            "INSERT INTO kh_token_usage (user_id, akce, vstupni_tokeny, vystupni_tokeny) VALUES (?,?,?,?)",
            (request.user['id'], 'at_chat', resp.usage.input_tokens, resp.usage.output_tokens)
        )
        conn.commit()
        conn.close()
        return jsonify({
            'content': [{'text': resp.content[0].text}],
            'usage': {'input_tokens': resp.usage.input_tokens, 'output_tokens': resp.usage.output_tokens},
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/at/eval', methods=['POST'])
@require_auth()
def at_eval():
    data = request.get_json()
    system = data.get('system', '')
    messages = data.get('messages', [])
    max_tokens = data.get('max_tokens', 2000)
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY', ''))
        resp = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        conn = get_db()
        conn.execute(
            "INSERT INTO kh_token_usage (user_id, akce, vstupni_tokeny, vystupni_tokeny) VALUES (?,?,?,?)",
            (request.user['id'], 'at_eval', resp.usage.input_tokens, resp.usage.output_tokens)
        )
        conn.commit()
        conn.close()
        return jsonify({
            'content': [{'text': resp.content[0].text}],
            'usage': {'input_tokens': resp.usage.input_tokens, 'output_tokens': resp.usage.output_tokens},
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/claude', methods=['POST'])
@require_auth()
def claude_proxy():
    """Obecný Claude API proxy pro kalkulátory a ostatní appky."""
    data = request.get_json()
    system   = data.get('system', '')
    messages = data.get('messages', [])
    max_tokens = int(data.get('max_tokens', 1000))
    # Vždy použij ověřený model — ignoruj co pošle klient
    model = 'claude-sonnet-4-6'
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY', ''))
        kwargs = dict(model=model, max_tokens=max_tokens, messages=messages)
        if system:
            kwargs['system'] = system
        resp = client.messages.create(**kwargs)
        conn = get_db()
        conn.execute(
            "INSERT INTO kh_token_usage (user_id, akce, vstupni_tokeny, vystupni_tokeny) VALUES (?,?,?,?)",
            (request.user['id'], 'claude_proxy', resp.usage.input_tokens, resp.usage.output_tokens)
        )
        conn.commit()
        conn.close()
        return jsonify({
            'content': [{'text': resp.content[0].text}],
            'usage': {'input_tokens': resp.usage.input_tokens, 'output_tokens': resp.usage.output_tokens},
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/at/trainings', methods=['POST'])
@require_auth()
def at_save_training():
    data = request.get_json()
    conn = get_db()
    cur = conn.execute('''
        INSERT INTO at_trainings
        (user_id, mode, difficulty, situation, reason, highlight, personality,
         duration, message_count, client_left, meeting_scheduled, chain_phase,
         profile_json, messages_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', (
        request.user['id'],
        data.get('mode', ''), data.get('difficulty', ''),
        data.get('situation', ''), data.get('reason', ''),
        data.get('highlight', ''), data.get('personality', ''),
        data.get('duration', 0), data.get('message_count', 0),
        int(data.get('client_left', False)), int(data.get('meeting_scheduled', False)),
        data.get('chain_phase', 0),
        json.dumps(data.get('profile_json', {})),
        json.dumps(data.get('messages_json', [])),
    ))
    training_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM at_trainings WHERE id=?", (training_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.route('/api/at/trainings', methods=['GET'])
@require_auth()
def at_get_trainings():
    limit = request.args.get('limit', 50)
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM at_trainings WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
        (request.user['id'], limit)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/at/evaluations', methods=['POST'])
@require_auth()
def at_save_evaluation():
    data = request.get_json()
    conn = get_db()
    cur = conn.execute('''
        INSERT INTO at_evaluations
        (training_id, user_id, overall_score, result, highlight_discovered,
         highlight_product_offered, sub_goals, skills, phone_skills,
         advisor_feedback, manager_feedback, suggested_questions,
         ideal_approach, summary, quiz_score, quiz_total)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', (
        data.get('training_id'), request.user['id'],
        data.get('overall_score', 0), data.get('result', ''),
        int(data.get('highlight_discovered', False)),
        int(data.get('highlight_product_offered', False)),
        json.dumps(data.get('sub_goals', {})),
        json.dumps(data.get('skills', {})),
        json.dumps(data.get('phone_skills', {})),
        data.get('advisor_feedback', ''), data.get('manager_feedback', ''),
        json.dumps(data.get('suggested_questions', [])),
        data.get('ideal_approach', ''), data.get('summary', ''),
        data.get('quiz_score', 0), data.get('quiz_total', 0),
    ))
    eval_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM at_evaluations WHERE id=?", (eval_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.route('/api/at/evaluations', methods=['GET'])
@require_auth()
def at_get_evaluations():
    limit = request.args.get('limit', 50)
    conn = get_db()
    rows = conn.execute('''
        SELECT e.*, t.mode, t.difficulty, t.situation, t.reason, t.highlight,
               t.personality, t.duration, t.message_count, t.profile_json, t.created_at as training_created_at
        FROM at_evaluations e
        LEFT JOIN at_trainings t ON t.id = e.training_id
        WHERE e.user_id=?
        ORDER BY e.created_at DESC LIMIT ?
    ''', (request.user['id'], limit)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        # Nest training data like Supabase did
        d['trainings'] = {
            'mode': d.pop('mode', ''), 'difficulty': d.pop('difficulty', ''),
            'situation': d.pop('situation', ''), 'reason': d.pop('reason', ''),
            'highlight': d.pop('highlight', ''), 'personality': d.pop('personality', ''),
            'duration': d.pop('duration', 0), 'message_count': d.pop('message_count', 0),
            'profile_json': d.pop('profile_json', '{}'),
            'created_at': d.pop('training_created_at', ''),
        }
        result.append(d)
    return jsonify(result)


@app.route('/api/at/manager/team', methods=['GET'])
@require_auth(['admin', 'manazer'])
def at_manager_team():
    conn = get_db()
    user = request.user
    if user['role'] == 'admin':
        advisors = conn.execute(
            "SELECT id, jmeno as name, email, aktivni FROM users WHERE role='poradce' ORDER BY jmeno"
        ).fetchall()
    else:
        advisors = conn.execute('''
            SELECT u.id, u.jmeno as name, u.email, u.aktivni
            FROM users u
            JOIN user_managers um ON um.poradce_id = u.id
            WHERE um.manazer_id=?
            ORDER BY u.jmeno
        ''', (user['id'],)).fetchall()
    conn.close()
    return jsonify([dict(a) for a in advisors])


@app.route('/api/at/manager/advisor/<int:advisor_id>/evaluations', methods=['GET'])
@require_auth(['admin', 'manazer'])
def at_advisor_evaluations(advisor_id):
    conn = get_db()
    user = request.user
    # Verify access
    if user['role'] == 'manazer':
        link = conn.execute(
            "SELECT 1 FROM user_managers WHERE manazer_id=? AND poradce_id=?",
            (user['id'], advisor_id)
        ).fetchone()
        if not link:
            conn.close()
            return jsonify({'error': 'Poradce není ve vašem týmu'}), 403
    rows = conn.execute('''
        SELECT e.*, t.mode, t.difficulty, t.situation, t.reason, t.highlight,
               t.personality, t.duration, t.message_count, t.profile_json, t.created_at as training_created_at
        FROM at_evaluations e
        LEFT JOIN at_trainings t ON t.id = e.training_id
        WHERE e.user_id=?
        ORDER BY e.created_at DESC LIMIT 50
    ''', (advisor_id,)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d['trainings'] = {
            'mode': d.pop('mode', ''), 'difficulty': d.pop('difficulty', ''),
            'situation': d.pop('situation', ''), 'reason': d.pop('reason', ''),
            'highlight': d.pop('highlight', ''), 'personality': d.pop('personality', ''),
            'duration': d.pop('duration', 0), 'message_count': d.pop('message_count', 0),
            'profile_json': d.pop('profile_json', '{}'),
            'created_at': d.pop('training_created_at', ''),
        }
        result.append(d)
    return jsonify(result)


@app.route('/api/at/manager/notes', methods=['POST'])
@require_auth(['admin', 'manazer'])
def at_add_note():
    data = request.get_json()
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO at_manager_notes (evaluation_id, manager_id, note) VALUES (?,?,?)",
        (data['evaluation_id'], request.user['id'], data['note'])
    )
    note_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM at_manager_notes WHERE id=?", (note_id,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.route('/api/at/tts', methods=['POST'])
@require_auth()
def at_tts():
    data = request.get_json()
    text = data.get('text', '')
    gender = data.get('gender', 'female')
    if not text or len(text) > 500:
        return jsonify({'error': 'Text je povinný (max 500 znaků)'}), 400
    google_key = os.environ.get('GOOGLE_TTS_KEY', '')
    if not google_key:
        return jsonify({'error': 'Google TTS není nakonfigurováno'}), 500
    import urllib.request
    import urllib.error
    voice = {
        'languageCode': 'cs-CZ',
        'name': 'cs-CZ-Neural2-A',
        'ssmlGender': 'MALE' if gender == 'male' else 'FEMALE',
    }
    payload = json.dumps({
        'input': {'text': text},
        'voice': voice,
        'audioConfig': {'audioEncoding': 'MP3', 'speakingRate': 0.95, 'pitch': 0},
    }).encode()
    req = urllib.request.Request(
        f'https://texttospeech.googleapis.com/v1/text:synthesize?key={google_key}',
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
        return jsonify({'audio': result['audioContent']})
    except Exception as e:
        return jsonify({'error': f'TTS chyba: {e}'}), 500


# ─── Metodika ────────────────────────────────────────────────────────────────

_data_root = os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else os.path.join(os.path.dirname(__file__), 'data')
MET_UPLOAD_DIR = os.path.join(_data_root, 'met_pdfs')
os.makedirs(MET_UPLOAD_DIR, exist_ok=True)


def _met_extract_keywords(text):
    """Jednoduchá extrakce klíčových slov - dolní case, unikátní tokeny 4+ znaků."""
    words = re.findall(r'[a-záčďéěíňóřšťúůýžA-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{4,}', text)
    seen = set()
    result = []
    for w in words:
        lw = w.lower()
        if lw not in seen:
            seen.add(lw)
            result.append(lw)
    return ' '.join(result[:80])


def _met_stem(word):
    """Jednoduchý stem — ořízne časté české přípony pro lepší shodu."""
    w = word.lower()
    for suffix in ('ích', 'ním', 'ního', 'nímu', 'ové', 'ovi', 'ech', 'emi',
                   'ách', 'ami', 'ům', 'ou', 'ého', 'ému', 'ém', 'ím',
                   'ký', 'ká', 'ké', 'kých', 'kému', 'kém',
                   'ní', 'ná', 'né', 'ních', 'nímu',
                   'ost', 'osti', 'ostí',
                   'ům', 'ovi', 'ova', 'ovo'):
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            return w[:-len(suffix)]
    return w

def _met_search_chunks(conn, variant, query, limit=15):
    """Keyword search v met_chunks — vrátí nejrelevantnější chunky.
    Metodické listy (doc_type='list') mají bonus skóre a přednost."""
    words = re.findall(r'[a-záčďéěíňóřšťúůýžA-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3,}', query)
    if not words:
        return []
    stems = [_met_stem(w) for w in words]
    chunks = conn.execute('''
        SELECT c.*, d.doc_type
        FROM met_chunks c
        JOIN met_documents d ON d.id = c.doc_id
        WHERE c.variant=?
        ORDER BY c.doc_id, c.chunk_index
    ''', (variant,)).fetchall()
    scored = []
    for ch in chunks:
        text_lower = ch['text'].lower() + ' ' + ch['keywords'].lower()
        # Skóre: přesná shoda + stem shoda (půl bodu)
        score = 0
        for w, s in zip(words, stems):
            if w.lower() in text_lower:
                score += 1
            elif s in text_lower:
                score += 0.5
        if score > 0:
            if ch['doc_type'] == 'list':
                score += 100
            scored.append((score, dict(ch)))
    scored.sort(key=lambda x: -x[0])
    return [x[1] for x in scored[:limit]]


def _met_search_exceptions(conn, variant, query):
    """Keyword search ve výjimkách."""
    words = re.findall(r'[a-záčďéěíňóřšťúůýžA-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3,}', query)
    excepts = conn.execute(
        "SELECT * FROM met_exceptions WHERE variant=?", (variant,)
    ).fetchall()
    result = []
    for ex in excepts:
        text_lower = ex['text_raw'].lower() + ' ' + ex['keywords'].lower()
        if any(w.lower() in text_lower for w in words):
            result.append(dict(ex))
    return result


@app.route('/api/met/documents', methods=['GET'])
@require_auth()
def met_get_documents():
    variant = request.args.get('variant', 'kb')
    conn = get_db()
    docs = conn.execute('''
        SELECT d.*, u.jmeno as autor
        FROM met_documents d
        LEFT JOIN users u ON u.id = d.created_by
        WHERE d.variant=? ORDER BY d.created_at DESC
    ''', (variant,)).fetchall()
    conn.close()
    return jsonify([dict(d) for d in docs])


@app.route('/api/met/upload', methods=['POST'])
@require_auth(['admin'])
def met_upload():
    variant = request.form.get('variant', 'kb')
    doc_type = request.form.get('doc_type', 'full')
    if variant not in ('kb', 'mp'):
        return jsonify({'error': 'Neplatná varianta'}), 400
    if doc_type not in ('full', 'list'):
        doc_type = 'full'
    file = request.files.get('file')
    if not file or not file.filename.endswith('.pdf'):
        return jsonify({'error': 'Vyžadován PDF soubor'}), 400

    import pdfplumber

    safe_name = re.sub(r'[^\w\-.]', '_', file.filename)
    filepath = os.path.join(MET_UPLOAD_DIR, f"{variant}_{int(time.time())}_{safe_name}")
    file.save(filepath)

    # Extract text and chunk
    pages_text = []
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ''
                pages_text.append(t)
    except Exception as e:
        return jsonify({'error': f'Chyba při čtení PDF: {e}'}), 500

    # Chunk: ~600 chars per chunk, respect page boundaries
    CHUNK_SIZE = 1200
    chunks = []
    buf = ''
    buf_pages = []
    for page_idx, page_text in enumerate(pages_text):
        page_num = page_idx + 1
        for line in page_text.split('\n'):
            buf += line + '\n'
            if page_num not in buf_pages:
                buf_pages.append(page_num)
            if len(buf) >= CHUNK_SIZE:
                chunks.append({'text': buf.strip(), 'pages': buf_pages[:]})
                buf = ''
                buf_pages = []
    if buf.strip():
        chunks.append({'text': buf.strip(), 'pages': buf_pages[:]})

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO met_documents (variant, doc_type, nazev, filename, strany, chunks, created_by) VALUES (?,?,?,?,?,?,?)",
        (variant, doc_type, file.filename, os.path.basename(filepath), len(pages_text), len(chunks), request.user['id'])
    )
    doc_id = cur.lastrowid

    for idx, ch in enumerate(chunks):
        kw = _met_extract_keywords(ch['text'])
        p = ch['pages']
        conn.execute(
            "INSERT INTO met_chunks (doc_id, variant, chunk_index, stranka_od, stranka_do, text, keywords) VALUES (?,?,?,?,?,?,?)",
            (doc_id, variant, idx, p[0] if p else 0, p[-1] if p else 0, ch['text'], kw)
        )

    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'doc_id': doc_id, 'chunks': len(chunks), 'pages': len(pages_text)})


@app.route('/api/met/documents/<int:doc_id>', methods=['DELETE'])
@require_auth(['admin'])
def met_delete_document(doc_id):
    conn = get_db()
    doc = conn.execute("SELECT * FROM met_documents WHERE id=?", (doc_id,)).fetchone()
    if not doc:
        conn.close()
        return jsonify({'error': 'Nenalezeno'}), 404
    # Delete file from disk
    filepath = os.path.join(MET_UPLOAD_DIR, doc['filename'])
    if os.path.exists(filepath):
        os.remove(filepath)
    conn.execute("DELETE FROM met_documents WHERE id=?", (doc_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/met/exceptions', methods=['GET'])
@require_auth()
def met_get_exceptions():
    variant = request.args.get('variant', 'kb')
    conn = get_db()
    rows = conn.execute('''
        SELECT e.*, u.jmeno as autor
        FROM met_exceptions e
        LEFT JOIN users u ON u.id = e.created_by
        WHERE e.variant=? ORDER BY e.created_at DESC
    ''', (variant,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/met/exceptions', methods=['POST'])
@require_auth(['admin', 'manazer'])
def met_add_exception():
    data = request.get_json()
    variant = data.get('variant', 'kb')
    text_raw = data.get('text', '').strip()
    if not text_raw:
        return jsonify({'error': 'Text výjimky je prázdný'}), 400
    if variant not in ('kb', 'mp'):
        return jsonify({'error': 'Neplatná varianta'}), 400

    # Use Claude to extract keywords
    keywords = ''
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY', ''))
        resp = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=200,
            messages=[{
                'role': 'user',
                'content': f'Extrahuj 5-10 klíčových slov z této výjimky pro metodiku hypoték. Vrať jen slova oddělená mezerou, bez interpunkce:\n\n{text_raw}'
            }]
        )
        keywords = resp.content[0].text.strip()
        conn = get_db()
        conn.execute(
            "INSERT INTO kh_token_usage (user_id, akce, vstupni_tokeny, vystupni_tokeny) VALUES (?,?,?,?)",
            (request.user['id'], 'met_exception_keywords', resp.usage.input_tokens, resp.usage.output_tokens)
        )
        conn.commit()
        conn.close()
    except Exception:
        keywords = _met_extract_keywords(text_raw)

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO met_exceptions (variant, text_raw, keywords, created_by) VALUES (?,?,?,?)",
        (variant, text_raw, keywords, request.user['id'])
    )
    exc_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'id': exc_id})


@app.route('/api/met/exceptions/<int:exc_id>', methods=['DELETE'])
@require_auth(['admin', 'manazer'])
def met_delete_exception(exc_id):
    conn = get_db()
    exc = conn.execute("SELECT * FROM met_exceptions WHERE id=?", (exc_id,)).fetchone()
    if not exc:
        conn.close()
        return jsonify({'error': 'Nenalezeno'}), 404
    if request.user['role'] == 'manazer' and exc['created_by'] != request.user['id']:
        conn.close()
        return jsonify({'error': 'Nedostatečná oprávnění'}), 403
    conn.execute("DELETE FROM met_exceptions WHERE id=?", (exc_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/met/chat', methods=['POST'])
@require_auth()
def met_chat():
    data = request.get_json()
    variant = data.get('variant', 'kb')
    question = data.get('question', '').strip()
    history = data.get('history', [])  # [{role, content}, ...]

    if not question:
        return jsonify({'error': 'Otázka je prázdná'}), 400

    conn = get_db()

    # Find relevant chunks and exceptions
    relevant_chunks = _met_search_chunks(conn, variant, question)
    relevant_exceptions = _met_search_exceptions(conn, variant, question)

    variant_name = 'červená varianta' if variant == 'kb' else 'modrá varianta'

    # Build context
    context_parts = []
    if relevant_chunks:
        list_chunks = [ch for ch in relevant_chunks if ch.get('doc_type') == 'list']
        full_chunks = [ch for ch in relevant_chunks if ch.get('doc_type') != 'list']
        if list_chunks:
            context_parts.append('=== AKTUALIZACE — METODICKÉ LISTY (mají přednost před základní metodikou) ===')
            for ch in list_chunks:
                context_parts.append(f'[str. {ch["stranka_od"]}-{ch["stranka_do"]}]\n{ch["text"]}')
        if full_chunks:
            context_parts.append('=== ZÁKLADNÍ METODIKA ===')
            for ch in full_chunks:
                context_parts.append(f'[str. {ch["stranka_od"]}-{ch["stranka_do"]}]\n{ch["text"]}')
    if relevant_exceptions:
        context_parts.append('\n=== VÝJIMKY A ZVLÁŠTNÍ PŘÍPADY ===')
        for ex in relevant_exceptions:
            context_parts.append(f'- {ex["text_raw"]}')

    context = '\n\n'.join(context_parts) if context_parts else 'Žádná relevantní metodika není k dispozici.'

    system_prompt = f"""Jsi odborný poradce pro metodiku hypotečních úvěrů ({variant_name}).
DŮLEŽITÉ: Pokud jsou k dispozici METODICKÉ LISTY (aktualizace), mají vždy přednost před základní metodikou. Při konfliktu mezi metodickým listem a základní metodikou se řiď metodickým listem.
Odpovídáš na dotazy poradců a manažerů o metodice poskytování úvěrů.
Odpovídej stručně, věcně a v češtině. Pokud informace není v metodice, řekni to.
Vždy uveď číslo stránky nebo sekci, pokud čerpáš z metodiky.

{context}"""

    messages = []
    for h in history[-10:]:  # last 10 messages
        if h.get('role') in ('user', 'assistant'):
            messages.append({'role': h['role'], 'content': h['content']})
    messages.append({'role': 'user', 'content': question})

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY', ''))
        resp = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=1024,
            system=system_prompt,
            messages=messages
        )
        answer = resp.content[0].text

        # Track tokens
        conn.execute(
            "INSERT INTO kh_token_usage (user_id, akce, vstupni_tokeny, vystupni_tokeny) VALUES (?,?,?,?)",
            (request.user['id'], f'met_chat_{variant}', resp.usage.input_tokens, resp.usage.output_tokens)
        )

        # Store chat messages
        conn.execute(
            "INSERT INTO met_chats (variant, user_id, role, content) VALUES (?,?,?,?)",
            (variant, request.user['id'], 'user', question)
        )
        conn.execute(
            "INSERT INTO met_chats (variant, user_id, role, content) VALUES (?,?,?,?)",
            (variant, request.user['id'], 'assistant', answer)
        )
        conn.commit()
        conn.close()

        return jsonify({
            'answer': answer,
            'chunks_used': len(relevant_chunks),
            'exceptions_used': len(relevant_exceptions)
        })
    except Exception as e:
        conn.close()
        return jsonify({'error': f'Chyba AI: {e}'}), 500


@app.route('/api/met/chats', methods=['GET'])
@require_auth()
def met_get_chats():
    variant = request.args.get('variant', 'kb')
    conn = get_db()
    rows = conn.execute('''
        SELECT role, content, created_at
        FROM met_chats
        WHERE variant=? AND user_id=?
        ORDER BY created_at DESC LIMIT 100
    ''', (variant, request.user['id'])).fetchall()
    conn.close()
    # Return in chronological order
    result = [dict(r) for r in rows]
    result.reverse()
    return jsonify(result)


@app.route('/api/met/chats', methods=['DELETE'])
@require_auth()
def met_delete_chats():
    variant = request.args.get('variant', 'kb')
    conn = get_db()
    conn.execute("DELETE FROM met_chats WHERE variant=? AND user_id=?", (variant, request.user['id']))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── Novinky (RSS agregátor) ──────────────────────────────────────────────────

NEWS_SOURCES = [
    {'url': 'https://www.hypoindex.cz/feed/', 'source': 'Hypoindex', 'category': 'hypoteky'},
    {'url': 'https://www.finparada.cz/rss/clanky.aspx', 'source': 'Finparáda', 'category': 'hypoteky'},
    {'url': 'https://www.cnb.cz/cs/rss/aktuality.xml', 'source': 'ČNB', 'category': 'hypoteky'},
    {'url': 'https://www.e15.cz/rss', 'source': 'E15', 'category': 'finance'},
    {'url': 'https://www.patria.cz/rss/zpravy.xml', 'source': 'Patria', 'category': 'finance'},
    {'url': 'https://www.financninoviny.cz/finance/rss/index_rss.php', 'source': 'Finanční noviny', 'category': 'finance'},
]

MORTGAGE_KEYWORDS = ['hypotéka', 'hypotéky', 'hypoték', 'hypoteční', 'hypotece',
                     'refinancování', 'ltv', 'dti', 'dsti', 'rpsn',
                     'úvěr na bydlení', 'stavební spoření', 'fixace sazby',
                     'zástavní', 'předhypoteční', 'meziúvěr',
                     'úrokové sazby hypoték', 'sazby hypoték']

def _parse_rss(source_cfg):
    """Stáhne a parsuje RSS feed, vrátí list článků."""
    articles = []
    try:
        req = urllib.request.Request(source_cfg['url'], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_data = resp.read()
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        # RSS 2.0
        items = root.findall('.//item')
        # Atom
        if not items:
            items = root.findall('.//atom:entry', ns) or root.findall('.//entry')
        for item in items[:20]:
            def txt(tag, alt=''):
                el = item.find(tag)
                if el is None:
                    el = item.find(f'atom:{tag}', ns)
                return (el.text or '').strip() if el is not None and el.text else alt
            title = txt('title')
            url = txt('link') or txt('guid')
            # Atom link
            if not url:
                link_el = item.find('link') or item.find('atom:link', ns)
                if link_el is not None:
                    url = link_el.get('href', link_el.text or '')
            desc = txt('description') or txt('summary')
            # strip HTML tags from description
            desc = re.sub(r'<[^>]+>', '', desc)[:300]
            pub = txt('pubDate') or txt('published') or txt('updated')
            if title and url:
                # Prioritize mortgage-related articles
                combined = (title + ' ' + desc).lower()
                cat = source_cfg['category']
                if any(kw in combined for kw in MORTGAGE_KEYWORDS):
                    cat = 'hypoteky'
                articles.append({
                    'source': source_cfg['source'],
                    'title': title,
                    'url': url,
                    'description': desc,
                    'published_at': pub,
                    'category': cat,
                })
    except Exception:
        pass
    return articles

def _refresh_news(conn):
    """Stáhne všechny RSS zdroje a uloží do DB."""
    conn.execute("DELETE FROM news_articles")
    all_articles = []
    for src in NEWS_SOURCES:
        all_articles.extend(_parse_rss(src))
    now = datetime.now(timezone.utc).isoformat()
    for a in all_articles:
        try:
            conn.execute('''
                INSERT OR IGNORE INTO news_articles (source, title, url, description, published_at, category, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (a['source'], a['title'], a['url'], a['description'], a['published_at'], a['category'], now))
        except Exception:
            pass
    # Ponech jen posledních 500 článků
    conn.execute('''
        DELETE FROM news_articles WHERE id NOT IN (
            SELECT id FROM news_articles ORDER BY fetched_at DESC, id DESC LIMIT 500
        )
    ''')
    conn.execute("INSERT OR REPLACE INTO news_meta (klic, hodnota) VALUES ('last_refresh', ?)", (now,))
    conn.commit()

@app.route('/api/news', methods=['GET'])
@require_auth()
def get_news():
    conn = get_db()
    # Zkontroluj kdy byl posledni refresh (12 hodin)
    meta = conn.execute("SELECT hodnota FROM news_meta WHERE klic='last_refresh'").fetchone()
    needs_refresh = True
    if meta:
        try:
            last = datetime.fromisoformat(meta['hodnota'])
            if (datetime.now(timezone.utc) - last).total_seconds() < 43200:  # 12h
                needs_refresh = False
        except Exception:
            pass
    if needs_refresh:
        _refresh_news(conn)
    category = request.args.get('category', '')
    if category:
        rows = conn.execute('''
            SELECT * FROM news_articles WHERE category=?
            ORDER BY fetched_at DESC, id DESC LIMIT 100
        ''', (category,)).fetchall()
    else:
        rows = conn.execute('''
            SELECT * FROM news_articles
            ORDER BY category='hypoteky' DESC, fetched_at DESC, id DESC LIMIT 100
        ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/news/refresh', methods=['POST'])
@require_auth(['admin'])
def refresh_news():
    conn = get_db()
    _refresh_news(conn)
    conn.close()
    return jsonify({'ok': True})


# ─── Statické soubory ─────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('public', 'login.html')

@app.route('/advisor-training/')
@app.route('/advisor-training')
def at_index():
    return send_from_directory('public/advisor-training', 'index.html')

@app.route('/advisor-training/<path:path>')
def at_static(path):
    full = os.path.join('public', 'advisor-training', path)
    if os.path.isfile(full):
        return send_from_directory('public/advisor-training', path)
    return send_from_directory('public/advisor-training', 'index.html')

@app.route('/metodika/')
@app.route('/metodika')
def metodika_index():
    return send_from_directory('public/metodika', 'index.html')

@app.route('/novinky/')
@app.route('/novinky')
def novinky_index():
    return send_from_directory('public/novinky', 'index.html')

@app.route('/metodika/<path:path>')
def metodika_static(path):
    full = os.path.join('public', 'metodika', path)
    if os.path.isfile(full):
        return send_from_directory('public/metodika', path)
    return send_from_directory('public/metodika', 'index.html')

@app.route('/kontakthub/')
@app.route('/kontakthub')
def kontakthub_index():
    return send_from_directory('public/kontakthub', 'index.html')

@app.route('/kontakthub/<path:path>')
def kontakthub_static(path):
    import os
    full = os.path.join('public', 'kontakthub', path)
    if os.path.isfile(full):
        return send_from_directory('public/kontakthub', path)
    return send_from_directory('public/kontakthub', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('public', path)

# ─── Start ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    print(f"🚀 Auth server běží na portu {port}")
    app.run(debug=debug, host='0.0.0.0', port=port)
