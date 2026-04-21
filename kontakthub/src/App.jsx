import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth.jsx';
import { T } from './theme.js';
import {
  khContacts, khCreateContact, khGetContact, khUpdateContact, khDeleteContact,
  khAddEntry, khSearch, khTaxonomy, khAddTag, khDeleteTag, khUsage,
} from './api.js';

// ── Shared styles ───────────────────────────────────────────────────────────

const s = {
  page: { minHeight: '100vh', background: T.bg, fontFamily: T.font },
  topbar: {
    background: T.surface, borderBottom: `1px solid ${T.border}`,
    padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16,
    height: 52, position: 'sticky', top: 0, zIndex: 100,
  },
  logo: { fontWeight: 600, fontSize: '0.95rem', color: T.accent, letterSpacing: '-0.02em' },
  hubLink: {
    marginLeft: 'auto', fontSize: '0.8rem', color: T.dim, textDecoration: 'none',
    padding: '4px 10px', border: `1px solid ${T.border}`, borderRadius: 2,
  },
  userName: { fontSize: '0.8rem', color: T.textSoft },
  main: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px' },
  card: {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3,
    padding: 20, marginBottom: 16,
  },
  row: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  h2: { fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, color: T.text },
  h3: { fontSize: '0.95rem', fontWeight: 600, marginBottom: 12, color: T.text },
  label: { fontSize: '0.78rem', color: T.dim, display: 'block', marginBottom: 4 },
  input: {
    padding: '8px 10px', fontSize: '0.88rem', border: `1px solid ${T.border}`,
    borderRadius: 2, background: T.surface, color: T.text, outline: 'none',
    width: '100%', transition: 'border-color 0.15s',
  },
  textarea: {
    padding: '8px 10px', fontSize: '0.88rem', border: `1px solid ${T.border}`,
    borderRadius: 2, background: T.surface, color: T.text, outline: 'none',
    width: '100%', minHeight: 100, resize: 'vertical', transition: 'border-color 0.15s',
  },
  btn: {
    padding: '8px 16px', fontSize: '0.85rem', fontWeight: 500, border: 'none',
    borderRadius: 2, cursor: 'pointer', transition: 'background 0.15s',
  },
  btnPrimary: { background: T.accent, color: '#fff' },
  btnGhost: { background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}` },
  btnDanger: { background: 'transparent', color: '#CC0000', border: `1px solid #CC0000` },
  tag: {
    display: 'inline-block', padding: '2px 8px', fontSize: '0.75rem',
    background: T.tealBg, color: T.teal, borderRadius: 20, fontWeight: 500,
  },
  tagMatched: {
    display: 'inline-block', padding: '2px 8px', fontSize: '0.75rem',
    background: T.accentBg, color: T.accent, borderRadius: 20, fontWeight: 500,
  },
  err: { fontSize: '0.82rem', color: T.accent, marginTop: 8 },
  dim: { fontSize: '0.8rem', color: T.dim },
  divider: { borderTop: `1px solid ${T.border}`, margin: '16px 0' },
  tabBar: { display: 'flex', gap: 0, height: '100%', alignSelf: 'stretch' },
  tab: (active) => ({
    padding: '0 18px', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
    border: 'none', borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
    background: 'none', color: active ? T.accent : T.textSoft, height: '100%',
    display: 'flex', alignItems: 'center',
  }),
  contactRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
    transition: 'background 0.12s',
  },
  avatar: {
    width: 36, height: 36, borderRadius: '50%', background: T.bgSub,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.85rem', fontWeight: 600, color: T.textSoft, flexShrink: 0,
  },
  badge: {
    display: 'inline-block', padding: '2px 8px', fontSize: '0.72rem',
    background: T.amberBg, color: T.amber, borderRadius: 2, fontWeight: 500,
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const initials = (jmeno, prijmeni) =>
  `${(jmeno || '')[0] || ''}${(prijmeni || '')[0] || ''}`.toUpperCase();

function Tag({ text, matched }) {
  return <span style={matched ? s.tagMatched : s.tag}>{text}</span>;
}

function Spinner() {
  return (
    <span style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite', verticalAlign: 'middle' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={s.label}>{label}</label>
      {children}
    </div>
  );
}

// ── Login ────────────────────────────────────────────────────────────────────

// ── Contact form (create/edit) ───────────────────────────────────────────────

function ContactForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    jmeno: '', prijmeni: '', pozice: '', oddeleni: '', email: '', telefon: '',
    ...initial,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.jmeno || !form.prijmeni) { setErr('Jméno a příjmení jsou povinné'); return; }
    setLoading(true); setErr('');
    try { await onSave(form); }
    catch (e2) { setErr(e2.message); setLoading(false); }
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Jméno *"><input style={s.input} value={form.jmeno} onChange={set('jmeno')} /></Field>
        <Field label="Příjmení *"><input style={s.input} value={form.prijmeni} onChange={set('prijmeni')} /></Field>
        <Field label="Pozice"><input style={s.input} value={form.pozice} onChange={set('pozice')} /></Field>
        <Field label="Oddělení"><input style={s.input} value={form.oddeleni} onChange={set('oddeleni')} /></Field>
        <Field label="E-mail"><input style={s.input} value={form.email} onChange={set('email')} type="email" /></Field>
        <Field label="Telefon"><input style={s.input} value={form.telefon} onChange={set('telefon')} /></Field>
      </div>
      {err && <div style={s.err}>{err}</div>}
      <div style={{ ...s.row, marginTop: 8, marginBottom: 0 }}>
        <button style={{ ...s.btn, ...s.btnPrimary }} disabled={loading}>
          {loading ? <Spinner /> : 'Uložit'}
        </button>
        <button type="button" style={{ ...s.btn, ...s.btnGhost }} onClick={onCancel}>Zrušit</button>
      </div>
    </form>
  );
}

// ── Entry form ───────────────────────────────────────────────────────────────

function EntryForm({ contactId, onDone }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState(null);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true); setErr(''); setTags(null);
    try {
      const res = await khAddEntry({ contact_id: contactId, text });
      setTags(res.tags);
      setText('');
    } catch (e2) { setErr(e2.message); }
    setLoading(false);
    onDone?.();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={s.h3}>Přidat poznámku</div>
      <form onSubmit={submit}>
        <Field label="Text poznámky (kompetence se extrahují automaticky)">
          <textarea style={s.textarea} value={text} onChange={e => setText(e.target.value)}
            placeholder="Např.: Jan je velmi zkušený v oblasti finančního reportingu, ovládá Excel na pokročilé úrovni a má zkušenosti s vedením projektů..." />
        </Field>
        {err && <div style={s.err}>{err}</div>}
        {tags && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ ...s.dim, marginRight: 8 }}>Extrahované tagy:</span>
            {tags.map(t => <Tag key={t} text={t} />)}
            {tags.length === 0 && <span style={s.dim}>žádné tagy extrahovány</span>}
          </div>
        )}
        <button style={{ ...s.btn, ...s.btnPrimary }} disabled={loading || !text.trim()}>
          {loading ? <><Spinner /> Analyzuji…</> : 'Uložit a extrahovat kompetence'}
        </button>
      </form>
    </div>
  );
}

// ── Contact detail ───────────────────────────────────────────────────────────

function ContactDetail({ contactId, onBack, canEdit }) {
  const [contact, setContact] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setContact(await khGetContact(contactId)); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    await khUpdateContact(contactId, form);
    setEditing(false);
    load();
  };

  const del = async () => {
    if (!confirm('Smazat kontakt? Tato akce je nevratná.')) return;
    await khDeleteContact(contactId);
    onBack();
  };

  if (loading) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>;
  if (err) return <div style={{ padding: 32, color: T.accent }}>{err}</div>;
  if (!contact) return null;

  return (
    <div>
      <button style={{ ...s.btn, ...s.btnGhost, marginBottom: 20, fontSize: '0.82rem' }} onClick={onBack}>
        ← Zpět na seznam
      </button>

      <div style={s.card}>
        {editing ? (
          <ContactForm initial={contact} onSave={save} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              <div style={{ ...s.avatar, width: 48, height: 48, fontSize: '1rem' }}>
                {initials(contact.jmeno, contact.prijmeni)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 600 }}>{contact.jmeno} {contact.prijmeni}</div>
                {contact.pozice && <div style={{ fontSize: '0.88rem', color: T.textSoft }}>{contact.pozice}</div>}
                {contact.oddeleni && <div style={{ ...s.dim }}>{contact.oddeleni}</div>}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...s.btn, ...s.btnGhost, fontSize: '0.8rem' }} onClick={() => setEditing(true)}>Upravit</button>
                  <button style={{ ...s.btn, ...s.btnDanger, fontSize: '0.8rem' }} onClick={del}>Smazat</button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 24, fontSize: '0.85rem', color: T.textSoft, flexWrap: 'wrap' }}>
              {contact.email && <span>✉ {contact.email}</span>}
              {contact.telefon && <span>📞 {contact.telefon}</span>}
            </div>
          </>
        )}
      </div>

      <div style={s.card}>
        <div style={s.h3}>Kompetence</div>
        {contact.competencies?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {contact.competencies.map(c => <Tag key={c.tag} text={c.tag} />)}
          </div>
        ) : (
          <div style={s.dim}>Zatím žádné kompetence. Přidejte poznámku níže.</div>
        )}
      </div>

      {canEdit && (
        <div style={s.card}>
          <EntryForm contactId={contactId} onDone={load} />
        </div>
      )}

      {contact.entries?.length > 0 && (
        <div style={s.card}>
          <div style={s.h3}>Historie poznámek</div>
          {contact.entries.map(e => (
            <div key={e.id} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: '0.88rem', lineHeight: 1.5, marginBottom: 6 }}>{e.text}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {e.tags?.map(t => <Tag key={t} text={t} />)}
                <span style={{ ...s.dim, marginLeft: 'auto' }}>{e.autor} · {e.created_at?.slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Manager view ─────────────────────────────────────────────────────────────

function ManagerView() {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user } = useAuth();

  const load = async () => {
    setLoading(true);
    try { setContacts(await khContacts()); }
    catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (form) => {
    await khCreateContact(form);
    setCreating(false);
    load();
  };

  const filtered = contacts.filter(c =>
    `${c.jmeno} ${c.prijmeni} ${c.pozice} ${c.oddeleni}`.toLowerCase().includes(search.toLowerCase())
  );

  if (selected) {
    return (
      <ContactDetail
        contactId={selected}
        canEdit={user?.role === 'manazer' || user?.role === 'admin'}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ ...s.row, marginBottom: 20 }}>
        <div style={s.h2}>Kontakty</div>
        <button style={{ ...s.btn, ...s.btnPrimary, marginLeft: 'auto' }} onClick={() => setCreating(true)}>
          + Nový kontakt
        </button>
      </div>

      {creating && (
        <div style={s.card}>
          <div style={{ ...s.h3, marginBottom: 16 }}>Nový kontakt</div>
          <ContactForm onSave={create} onCancel={() => setCreating(false)} />
        </div>
      )}

      <div style={{ ...s.card, padding: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <input style={{ ...s.input }} placeholder="Hledat v seznamu…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: T.dim }}>
            {contacts.length === 0 ? 'Zatím žádné kontakty. Přidejte první.' : 'Nic nenalezeno.'}
          </div>
        ) : filtered.map(c => (
          <div key={c.id} style={s.contactRow}
            onClick={() => setSelected(c.id)}
            onMouseEnter={e => e.currentTarget.style.background = T.bgSub}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={s.avatar}>{initials(c.jmeno, c.prijmeni)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: '0.92rem' }}>{c.jmeno} {c.prijmeni}</div>
              <div style={{ fontSize: '0.8rem', color: T.textSoft }}>{[c.pozice, c.oddeleni].filter(Boolean).join(' · ')}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 300 }}>
              {c.tags?.slice(0, 4).map(t => <Tag key={t} text={t} />)}
              {c.tags?.length > 4 && <span style={s.dim}>+{c.tags.length - 4}</span>}
            </div>
            <span style={{ color: T.dim, fontSize: '1.1rem' }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Poradce search view ──────────────────────────────────────────────────────

function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [matchedTags, setMatchedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(null);

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setErr(''); setResults(null);
    try {
      const res = await khSearch(query);
      setResults(res.results);
      setMatchedTags(res.matched_tags || []);
    } catch (e2) { setErr(e2.message); }
    setLoading(false);
  };

  if (selected) {
    return (
      <ContactDetail contactId={selected} canEdit={false} onBack={() => setSelected(null)} />
    );
  }

  return (
    <div>
      <div style={{ ...s.card, background: T.accentBg, border: `1px solid rgba(204,0,0,0.15)` }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 6 }}>Vyhledat kontakt dle kompetencí</div>
        <div style={{ ...s.dim, marginBottom: 16 }}>
          Popište slovně, co hledáte — AI rozloží dotaz na kompetence a najde nejlepší shody.
        </div>
        <form onSubmit={search}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Např.: Potřebuji někoho se zkušenostmi s finančním výkaznictvím a Excelem"
              autoFocus
            />
            <button style={{ ...s.btn, ...s.btnPrimary, whiteSpace: 'nowrap' }} disabled={loading || !query.trim()}>
              {loading ? <Spinner /> : 'Hledat'}
            </button>
          </div>
        </form>
      </div>

      {err && <div style={{ ...s.card, color: T.accent }}>{err}</div>}

      {matchedTags.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={s.dim}>AI rozpoznala:</span>
          {matchedTags.map(t => <Tag key={t} text={t} matched />)}
        </div>
      )}

      {results !== null && (
        <div>
          <div style={{ ...s.h3, marginBottom: 12 }}>
            {results.length === 0 ? 'Žádné shody' : `Nalezeno ${results.length} kontaktů`}
          </div>
          {results.map((r, i) => (
            <div key={r.id} style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', marginBottom: 10 }}
              onClick={() => setSelected(r.id)}
              onMouseEnter={e => e.currentTarget.style.background = T.bgSub}
              onMouseLeave={e => e.currentTarget.style.background = T.surface}
            >
              <div style={{ ...s.avatar, background: i === 0 ? T.accentBg : T.bgSub, color: i === 0 ? T.accent : T.textSoft, fontSize: '1rem', fontWeight: 700 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{r.jmeno} {r.prijmeni}</div>
                <div style={{ fontSize: '0.8rem', color: T.textSoft }}>{[r.pozice, r.oddeleni].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {r.matched_tags?.map(t => <Tag key={t} text={t} matched />)}
              </div>
              <div style={{ ...s.badge }}>{r.shody} shod</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Taxonomy view ────────────────────────────────────────────────────────────

function TaxonomyView() {
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const load = async () => {
    setLoading(true);
    try { setTags(await khTaxonomy()); }
    catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    await khAddTag(newTag.trim().toLowerCase());
    setNewTag('');
    load();
  };

  const del = async (tag) => {
    if (!confirm(`Smazat tag "${tag}"? Odstraní se ze všech kontaktů.`)) return;
    await khDeleteTag(tag);
    load();
  };

  return (
    <div>
      <div style={s.h2}>Taxonomie kompetencí</div>
      {(user?.role === 'admin' || user?.role === 'manazer') && (
        <div style={{ ...s.card, marginBottom: 20 }}>
          <form onSubmit={add} style={{ display: 'flex', gap: 10 }}>
            <input style={{ ...s.input, flex: 1 }} value={newTag} onChange={e => setNewTag(e.target.value)}
              placeholder="Přidat nový tag…" />
            <button style={{ ...s.btn, ...s.btnPrimary }} disabled={!newTag.trim()}>Přidat</button>
          </form>
        </div>
      )}
      <div style={s.card}>
        {loading ? <Spinner /> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.length === 0 && <span style={s.dim}>Taxonomie je prázdná.</span>}
            {tags.map(t => (
              <span key={t.tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Tag text={t.tag} />
                {user?.role === 'admin' && (
                  <button onClick={() => del(t.tag)} style={{ background: 'none', border: 'none', color: T.dim, cursor: 'pointer', fontSize: '0.85rem', padding: '0 2px' }}>×</button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin usage view ─────────────────────────────────────────────────────────

function UsageView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    khUsage().then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalIn = rows.reduce((a, r) => a + (r.vstup_celkem || 0), 0);
  const totalOut = rows.reduce((a, r) => a + (r.vystup_celkem || 0), 0);
  // rough cost: opus4 $5/1M input, $25/1M output
  const cost = ((totalIn * 5 + totalOut * 25) / 1_000_000).toFixed(4);

  return (
    <div>
      <div style={s.h2}>Spotřeba tokenů (Claude API)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          ['Vstupní tokeny celkem', totalIn.toLocaleString()],
          ['Výstupní tokeny celkem', totalOut.toLocaleString()],
          ['Odhadované náklady', `$${cost}`],
        ].map(([label, val]) => (
          <div key={label} style={{ ...s.card, textAlign: 'center', marginBottom: 0 }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 600, color: T.accent }}>{val}</div>
            <div style={s.dim}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ ...s.card, padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: T.bgSub }}>
              {['Uživatel', 'Role', 'Vstup', 'Výstup', 'Volání', 'Naposledy'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: T.textSoft, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center' }}><Spinner /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: T.dim }}>Žádná data</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.jmeno}</td>
                <td style={{ padding: '10px 14px', color: T.textSoft }}>{r.role}</td>
                <td style={{ padding: '10px 14px', fontFamily: T.mono }}>{(r.vstup_celkem || 0).toLocaleString()}</td>
                <td style={{ padding: '10px 14px', fontFamily: T.mono }}>{(r.vystup_celkem || 0).toLocaleString()}</td>
                <td style={{ padding: '10px 14px', color: T.textSoft }}>{r.pocet_volani}</td>
                <td style={{ padding: '10px 14px', color: T.dim }}>{r.posledni?.slice(0, 10) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── App shell ────────────────────────────────────────────────────────────────

const TABS = {
  admin: [
    { id: 'contacts', label: 'Kontakty' },
    { id: 'search', label: 'Vyhledat' },
    { id: 'taxonomy', label: 'Taxonomie' },
    { id: 'usage', label: 'Spotřeba API' },
  ],
  manazer: [
    { id: 'contacts', label: 'Kontakty' },
    { id: 'search', label: 'Vyhledat' },
    { id: 'taxonomy', label: 'Taxonomie' },
    { id: 'usage', label: 'Spotřeba API' },
  ],
  poradce: [
    { id: 'search', label: 'Vyhledat' },
  ],
};

export default function App() {
  const { user, logout, loading } = useAuth();
  const [tab, setTab] = useState(null);

  useEffect(() => {
    if (user) {
      const def = TABS[user.role]?.[0]?.id || 'search';
      setTab(t => t || def);
    }
  }, [user]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      <Spinner />
    </div>
  );

  if (!user) {
    window.location.href = '/';
    return null;
  }

  const tabs = TABS[user.role] || TABS.poradce;

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <span style={s.logo}>KontaktHub</span>
        <div style={s.tabBar}>
          {tabs.map(t => (
            <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <span style={{ ...s.userName, marginLeft: 'auto' }}>{user.jmeno} · {user.role}</span>
        <button style={{ ...s.btn, ...s.btnGhost, fontSize: '0.78rem' }} onClick={logout}>Odhlásit</button>
        <a href="/dashboard.html" style={{ ...s.hubLink }}>← Hub</a>
      </div>
      <div style={s.main}>
        {tab === 'contacts' && <ManagerView />}
        {tab === 'search' && <SearchView />}
        {tab === 'taxonomy' && <TaxonomyView />}
        {tab === 'usage' && <UsageView />}
      </div>
    </div>
  );
}
