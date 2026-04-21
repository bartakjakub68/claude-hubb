// Všechno na stejném originu jako hub (Flask :5000)
const tok = () => localStorage.getItem('auth_token') || '';
const hdr = () => ({
  'Content-Type': 'application/json',
  ...(tok() ? { Authorization: `Bearer ${tok()}` } : {}),
});

const ok = async (res) => {
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};

export const apiMe = () =>
  fetch('/api/me', { headers: hdr() }).then(ok);

export const khContacts = () =>
  fetch('/api/kh/contacts', { headers: hdr() }).then(ok);

export const khCreateContact = (data) =>
  fetch('/api/kh/contacts', { method: 'POST', headers: hdr(), body: JSON.stringify(data) }).then(ok);

export const khGetContact = (id) =>
  fetch(`/api/kh/contacts/${id}`, { headers: hdr() }).then(ok);

export const khUpdateContact = (id, data) =>
  fetch(`/api/kh/contacts/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(data) }).then(ok);

export const khDeleteContact = (id) =>
  fetch(`/api/kh/contacts/${id}`, { method: 'DELETE', headers: hdr() }).then(ok);

export const khAddEntry = (data) =>
  fetch('/api/kh/entries', { method: 'POST', headers: hdr(), body: JSON.stringify(data) }).then(ok);

export const khSearch = (query) =>
  fetch('/api/kh/search', { method: 'POST', headers: hdr(), body: JSON.stringify({ query }) }).then(ok);

export const khTaxonomy = () =>
  fetch('/api/kh/taxonomy', { headers: hdr() }).then(ok);

export const khAddTag = (tag, popis = '') =>
  fetch('/api/kh/taxonomy', { method: 'POST', headers: hdr(), body: JSON.stringify({ tag, popis }) }).then(ok);

export const khDeleteTag = (tag) =>
  fetch(`/api/kh/taxonomy/${encodeURIComponent(tag)}`, { method: 'DELETE', headers: hdr() }).then(ok);

export const khUsage = () =>
  fetch('/api/kh/usage', { headers: hdr() }).then(ok);
