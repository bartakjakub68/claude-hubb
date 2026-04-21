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

export const apiMe = () => fetch('/api/me', { headers: hdr() }).then(ok);

export const metGetDocuments = (variant) =>
  fetch(`/api/met/documents?variant=${variant}`, { headers: hdr() }).then(ok);

export const metUpload = (variant, file, doc_type = 'full') => {
  const form = new FormData();
  form.append('variant', variant);
  form.append('doc_type', doc_type);
  form.append('file', file);
  return fetch('/api/met/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok()}` },
    body: form,
  }).then(ok);
};

export const metDeleteDocument = (id) =>
  fetch(`/api/met/documents/${id}`, { method: 'DELETE', headers: hdr() }).then(ok);

export const metGetExceptions = (variant) =>
  fetch(`/api/met/exceptions?variant=${variant}`, { headers: hdr() }).then(ok);

export const metAddException = (variant, text) =>
  fetch('/api/met/exceptions', {
    method: 'POST', headers: hdr(),
    body: JSON.stringify({ variant, text }),
  }).then(ok);

export const metDeleteException = (id) =>
  fetch(`/api/met/exceptions/${id}`, { method: 'DELETE', headers: hdr() }).then(ok);

export const metChat = (variant, question, history) =>
  fetch('/api/met/chat', {
    method: 'POST', headers: hdr(),
    body: JSON.stringify({ variant, question, history }),
  }).then(ok);

export const metGetChats = (variant) =>
  fetch(`/api/met/chats?variant=${variant}`, { headers: hdr() }).then(ok);
