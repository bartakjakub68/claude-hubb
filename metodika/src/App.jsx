import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './useAuth.jsx';
import {
  metGetDocuments, metUpload, metDeleteDocument,
  metGetExceptions, metAddException, metDeleteException,
  metChat, metGetChats, metResetChat,
} from './api.js';

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEMES = {
  kb: { primary: '#CC0000', light: '#F9EDED', border: '#E8BEBE', name: 'Červená', fullName: 'Červená varianta' },
  mp: { primary: '#0055A4', light: '#E8EFF8', border: '#B3C8E8', name: 'Modrá', fullName: 'Modrá varianta' },
};

// ─── Global styles ────────────────────────────────────────────────────────────
const globalCss = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #F6F5F3; color: #1A1A1A; font-size: 14px; }
  button { cursor: pointer; font-family: inherit; }
  textarea, input { font-family: inherit; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
`;

// ─── Chat View ─────────────────────────────────────────────────────────────────
function ChatView({ variant, theme }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [histLoaded, setHistLoaded] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    metGetChats(variant)
      .then(hist => { setMessages(hist); setHistLoaded(true); })
      .catch(() => setHistLoaded(true));
  }, [variant]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    const newMsg = { role: 'user', content: q };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setLoading(true);
    try {
      const history = messages.slice(-10);
      const res = await metChat(variant, q, history);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Chyba: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = async () => {
    if (!window.confirm('Smazat historii chatu?')) return;
    await metResetChat(variant).catch(() => {});
    setMessages([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}>
        {!histLoaded && (
          <div style={{ textAlign: 'center', color: '#999', padding: '32px' }}>Načítám historii...</div>
        )}
        {histLoaded && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '32px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
            <div style={{ fontWeight: 500, marginBottom: '4px' }}>Zeptejte se na metodiku</div>
            <div style={{ fontSize: '0.85rem' }}>Např: Jaké je maximální LTV pro refinancování?</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.role === 'user' ? theme.primary : '#fff',
              color: m.role === 'user' ? '#fff' : '#1A1A1A',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              fontSize: '0.9rem',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 16px', borderRadius: '16px 16px 16px 4px',
              background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              color: '#999', fontSize: '0.85rem',
            }}>
              <span style={{ animation: 'pulse 1s infinite' }}>Přemýšlím...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{
        padding: '12px 16px', borderTop: `1px solid ${theme.border}`,
        background: '#fff', display: 'flex', gap: '8px', alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Napište dotaz... (Enter = odeslat, Shift+Enter = nový řádek)"
          rows={2}
          style={{
            flex: 1, resize: 'none', border: `1px solid ${theme.border}`,
            borderRadius: '8px', padding: '8px 12px', fontSize: '0.9rem',
            outline: 'none', lineHeight: 1.4,
          }}
          onFocus={e => e.target.style.borderColor = theme.primary}
          onBlur={e => e.target.style.borderColor = theme.border}
        />
        <button
          onClick={reset}
          title="Smazat historii chatu"
          style={{
            padding: '8px 12px', background: '#f5f5f5', color: '#666',
            border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.875rem',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          🗑 Reset
        </button>
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            padding: '8px 16px', background: input.trim() && !loading ? theme.primary : '#ccc',
            color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600,
            fontSize: '0.875rem', transition: 'background 0.15s',
          }}
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}

// ─── Exceptions View ──────────────────────────────────────────────────────────
function ExceptionsView({ variant, theme, user }) {
  const [exceptions, setExceptions] = useState([]);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const canWrite = user?.role === 'admin' || user?.role === 'manazer';

  const load = () => {
    metGetExceptions(variant)
      .then(setExceptions)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [variant]);

  const add = async () => {
    if (!newText.trim() || adding) return;
    setAdding(true);
    try {
      await metAddException(variant, newText.trim());
      setNewText('');
      load();
    } catch (e) {
      alert('Chyba: ' + e.message);
    } finally {
      setAdding(false);
    }
  };

  const del = async (id) => {
    if (!confirm('Smazat výjimku?')) return;
    try { await metDeleteException(id); load(); }
    catch (e) { alert('Chyba: ' + e.message); }
  };

  return (
    <div style={{ padding: '16px', maxWidth: '800px', margin: '0 auto' }}>
      {canWrite && (
        <div style={{
          background: '#fff', borderRadius: '10px', padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '10px', color: theme.primary }}>
            Přidat výjimku / zvláštní případ
          </div>
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Popište výjimku nebo zvláštní případ metodiky..."
            rows={4}
            style={{
              width: '100%', resize: 'vertical', border: `1px solid ${theme.border}`,
              borderRadius: '8px', padding: '10px', fontSize: '0.9rem',
              outline: 'none', lineHeight: 1.5,
            }}
            onFocus={e => e.target.style.borderColor = theme.primary}
            onBlur={e => e.target.style.borderColor = theme.border}
          />
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={add}
              disabled={!newText.trim() || adding}
              style={{
                padding: '8px 20px',
                background: newText.trim() && !adding ? theme.primary : '#ccc',
                color: '#fff', border: 'none', borderRadius: '6px',
                fontWeight: 600, fontSize: '0.875rem',
              }}
            >
              {adding ? 'Ukládám...' : 'Přidat výjimku'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '32px' }}>Načítám...</div>
      ) : exceptions.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '32px' }}>
          Žádné výjimky zatím nejsou přidány.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {exceptions.map(ex => (
            <div key={ex.id} style={{
              background: '#fff', borderRadius: '10px', padding: '14px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderLeft: `3px solid ${theme.primary}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                    {ex.text_raw}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#999' }}>
                    {ex.autor} · {ex.created_at?.slice(0, 10)}
                    {ex.keywords && (
                      <span style={{
                        marginLeft: '8px', background: theme.light, color: theme.primary,
                        padding: '1px 6px', borderRadius: '4px',
                      }}>
                        klíčová slova: {ex.keywords.split(' ').slice(0, 5).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <button
                    onClick={() => del(ex.id)}
                    style={{
                      background: 'none', border: 'none', color: '#ccc',
                      fontSize: '1.1rem', padding: '2px 6px', borderRadius: '4px',
                      flexShrink: 0,
                    }}
                    onMouseOver={e => e.currentTarget.style.color = '#CC0000'}
                    onMouseOut={e => e.currentTarget.style.color = '#ccc'}
                    title="Smazat"
                  >×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Documents View ───────────────────────────────────────────────────────────
function DocumentsView({ variant, theme, user }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState('full');
  const fileRef = useRef();
  const canWrite = user?.role === 'admin';

  const load = () => {
    metGetDocuments(variant)
      .then(setDocs)
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [variant]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await metUpload(variant, file, docType);
      alert(`Nahráno! ${res.chunks} chunků z ${res.pages} stránek.`);
      load();
    } catch (err) {
      alert('Chyba: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const del = async (id, nazev) => {
    if (!confirm(`Smazat dokument "${nazev}"?`)) return;
    try { await metDeleteDocument(id); load(); }
    catch (e) { alert('Chyba: ' + e.message); }
  };

  return (
    <div style={{ padding: '16px', maxWidth: '800px', margin: '0 auto' }}>
      {canWrite && (
        <div style={{
          background: '#fff', borderRadius: '10px', padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px',
          textAlign: 'center',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '6px', color: theme.primary }}>
            Nahrát PDF metodiku
          </div>
          <div style={{ fontSize: '0.8rem', color: '#999', marginBottom: '14px' }}>
            PDF bude automaticky rozčleněno do bloků pro vyhledávání
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '14px' }}>
            {[['full', '📘 Celá metodika'], ['list', '📄 Metodický list']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setDocType(val)}
                style={{
                  padding: '6px 16px', border: `2px solid ${docType === val ? theme.primary : '#E2E0DC'}`,
                  borderRadius: '6px', background: docType === val ? theme.light : '#fff',
                  color: docType === val ? theme.primary : '#666',
                  fontWeight: docType === val ? 600 : 400, fontSize: '0.82rem', cursor: 'pointer',
                }}
              >{label}</button>
            ))}
          </div>
          {docType === 'list' && (
            <div style={{ fontSize: '0.78rem', color: theme.primary, marginBottom: '10px', background: theme.light, padding: '6px 12px', borderRadius: '6px' }}>
              Metodický list má přednost před základní metodikou při odpovídání.
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            onChange={upload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '10px 24px',
              background: uploading ? '#ccc' : theme.primary,
              color: '#fff', border: 'none', borderRadius: '8px',
              fontWeight: 600, fontSize: '0.875rem',
            }}
          >
            {uploading ? 'Nahrávám a zpracovávám...' : '📎 Vybrat PDF'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '32px' }}>Načítám...</div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#999', padding: '32px' }}>
          Žádné dokumenty nejsou nahrány.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {docs.map(doc => (
            <div key={doc.id} style={{
              background: '#fff', borderRadius: '10px', padding: '14px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '8px',
                background: theme.light, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0,
              }}>
                📄
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, truncate: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {doc.nazev}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#999', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    background: doc.doc_type === 'list' ? theme.light : '#F0F0EE',
                    color: doc.doc_type === 'list' ? theme.primary : '#666',
                    padding: '1px 7px', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem',
                  }}>
                    {doc.doc_type === 'list' ? 'Metodický list' : 'Celá metodika'}
                  </span>
                  {doc.strany} stránek · {doc.chunks} bloků · {doc.autor} · {doc.created_at?.slice(0, 10)}
                </div>
              </div>
              {canWrite && (
                <button
                  onClick={() => del(doc.id, doc.nazev)}
                  style={{
                    background: 'none', border: '1px solid #E2E0DC', color: '#999',
                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem',
                    flexShrink: 0,
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#CC0000'; e.currentTarget.style.color = '#CC0000'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E0DC'; e.currentTarget.style.color = '#999'; }}
                >
                  Smazat
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Variant App ──────────────────────────────────────────────────────────────
function VariantApp({ variant, onBack }) {
  const { user, logout } = useAuth();
  const theme = THEMES[variant];
  const [tab, setTab] = useState('chat');
  const canSeeExceptions = user?.role === 'admin' || user?.role === 'manazer';
  const canSeeDocs = user?.role === 'admin';

  const tabs = [
    { id: 'chat', label: '💬 Chat' },
    ...(canSeeExceptions ? [{ id: 'exceptions', label: '⚡ Výjimky' }] : []),
    ...(canSeeDocs ? [{ id: 'documents', label: '📁 Dokumenty' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F6F5F3' }}>
      {/* Header */}
      <div style={{
        background: theme.primary, color: '#fff', padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: '12px', height: '52px',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            borderRadius: '6px', padding: '4px 10px', fontSize: '0.8rem',
            fontWeight: 500,
          }}
        >
          ← Zpět
        </button>
        <div style={{ fontWeight: 700, fontSize: '1rem', flex: 1 }}>
          Metodika — {theme.fullName}
        </div>
        <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>{user?.jmeno}</div>
        <button
          onClick={logout}
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            borderRadius: '6px', padding: '4px 10px', fontSize: '0.78rem',
          }}
        >
          Odhlásit
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        background: '#fff', borderBottom: `1px solid ${theme.border}`,
        display: 'flex', padding: '0 16px', flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 16px',
              background: 'none', border: 'none',
              borderBottom: tab === t.id ? `2px solid ${theme.primary}` : '2px solid transparent',
              color: tab === t.id ? theme.primary : '#666',
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'chat' && <ChatView variant={variant} theme={theme} />}
        {tab === 'exceptions' && canSeeExceptions && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ExceptionsView variant={variant} theme={theme} user={user} />
          </div>
        )}
        {tab === 'documents' && canSeeDocs && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <DocumentsView variant={variant} theme={theme} user={user} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function Landing({ onSelect }) {
  const { user, logout } = useAuth();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #F6F5F3 0%, #ECEAE5 100%)',
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1A1A1A', marginBottom: '8px' }}>
          Metodika
        </h1>
        <p style={{ color: '#666', fontSize: '0.95rem' }}>
          Vyberte variantu metodiky
        </p>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* KB Card */}
        <button
          onClick={() => onSelect('kb')}
          style={{
            width: '200px', padding: '32px 24px', background: '#fff',
            border: '2px solid #E2E0DC', borderRadius: '16px',
            cursor: 'pointer', textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            transition: 'all 0.2s', outline: 'none',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#CC0000'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(204,0,0,0.15)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E0DC'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
        >
          <div style={{
            width: '56px', height: '56px', borderRadius: '12px',
            background: '#CC0000', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: '1.1rem',
          }}>
            KB
          </div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A', marginBottom: '4px' }}>
            Červená varianta
          </div>
          <div style={{ fontSize: '0.78rem', color: '#999' }}>Metodika HÚ</div>
        </button>

        {/* MP Card */}
        <button
          onClick={() => onSelect('mp')}
          style={{
            width: '200px', padding: '32px 24px', background: '#fff',
            border: '2px solid #E2E0DC', borderRadius: '16px',
            cursor: 'pointer', textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            transition: 'all 0.2s', outline: 'none',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#0055A4'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,85,164,0.15)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E0DC'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
        >
          <div style={{
            width: '56px', height: '56px', borderRadius: '12px',
            background: '#0055A4', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: '1.1rem',
          }}>
            MP
          </div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1A1A', marginBottom: '4px' }}>
            Modrá varianta
          </div>
          <div style={{ fontSize: '0.78rem', color: '#999' }}>Metodika HÚ</div>
        </button>
      </div>

      <div style={{ marginTop: '40px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ color: '#999', fontSize: '0.85rem' }}>
          Přihlášen: {user?.jmeno}
        </span>
        <button
          onClick={() => { window.location.href = '/dashboard'; }}
          style={{
            background: 'none', border: '1px solid #E2E0DC',
            borderRadius: '6px', padding: '6px 14px',
            fontSize: '0.8rem', color: '#666', cursor: 'pointer',
          }}
        >
          ← Dashboard
        </button>
        <button
          onClick={logout}
          style={{
            background: 'none', border: '1px solid #E2E0DC',
            borderRadius: '6px', padding: '6px 14px',
            fontSize: '0.8rem', color: '#666', cursor: 'pointer',
          }}
        >
          Odhlásit
        </button>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage() {
  const [email, setEmail] = useState('');
  const [heslo, setHeslo] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, heslo }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      localStorage.setItem('auth_token', d.token);
      window.location.reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#F6F5F3',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '40px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: '360px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
          <h2 style={{ fontWeight: 700, color: '#1A1A1A' }}>Metodika</h2>
        </div>
        <form onSubmit={login}>
          <div style={{ marginBottom: '14px' }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="E-mail" required
              style={{
                width: '100%', padding: '10px 14px', border: '1px solid #E2E0DC',
                borderRadius: '8px', fontSize: '0.9rem', outline: 'none',
              }}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="password" value={heslo} onChange={e => setHeslo(e.target.value)}
              placeholder="Heslo" required
              style={{
                width: '100%', padding: '10px 14px', border: '1px solid #E2E0DC',
                borderRadius: '8px', fontSize: '0.9rem', outline: 'none',
              }}
            />
          </div>
          {err && <div style={{ color: '#CC0000', fontSize: '0.85rem', marginBottom: '12px' }}>{err}</div>}
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '11px', background: loading ? '#ccc' : '#CC0000',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontWeight: 600, fontSize: '0.9rem',
            }}
          >
            {loading ? 'Přihlašuji...' : 'Přihlásit se'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function Root() {
  const { user, loading } = useAuth();
  const [variant, setVariant] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('variant') || null;
  });

  const selectVariant = (v) => {
    setVariant(v);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', v);
    window.history.replaceState({}, '', url.toString());
  };

  const back = () => {
    setVariant(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('variant');
    window.history.replaceState({}, '', url.toString());
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#999' }}>Načítám...</div>
      </div>
    );
  }
  if (!user) return <LoginPage />;
  if (variant && THEMES[variant]) return <VariantApp variant={variant} onBack={back} />;
  return <Landing onSelect={selectVariant} />;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <style>{globalCss}</style>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </>
  );
}
