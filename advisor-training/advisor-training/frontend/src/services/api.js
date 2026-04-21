// Vše na stejném originu jako hub (Flask :5000)
export const getToken = () => localStorage.getItem('auth_token') || '';

export const setToken = (t) => {
  if (t) localStorage.setItem('auth_token', t);
  else localStorage.removeItem('auth_token');
};

const headers = () => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}),
});

const handleRes = async (res) => {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// ── Auth — hub Flask ─────────────────────────────────────────────
export const login = async (email, password) => {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, heslo: password }),
  });
  const data = await handleRes(res);
  return {
    token: data.token,
    user: { name: data.jmeno, email, role: data.role },
  };
};

export const getMe = async () => {
  const res = await fetch('/api/me', { headers: headers() });
  const data = await handleRes(res);
  return { user: { name: data.jmeno, email: data.email, role: data.role, id: data.id } };
};

// ── AI proxy — Flask ─────────────────────────────────────────────
export const chat = (system, messages, max_tokens = 1000) => fetch('/api/at/chat', {
  method: 'POST', headers: headers(), body: JSON.stringify({ system, messages, max_tokens }),
}).then(handleRes);

export const evalChat = (system, messages, max_tokens = 2000) => fetch('/api/at/eval', {
  method: 'POST', headers: headers(), body: JSON.stringify({ system, messages, max_tokens }),
}).then(handleRes);

// ── Data — Flask ─────────────────────────────────────────────────
export const saveTraining = (data) => fetch('/api/at/trainings', {
  method: 'POST', headers: headers(), body: JSON.stringify(data),
}).then(handleRes);

export const getTrainings = (limit = 50) => fetch(`/api/at/trainings?limit=${limit}`, {
  headers: headers(),
}).then(handleRes);

export const saveEvaluation = (data) => fetch('/api/at/evaluations', {
  method: 'POST', headers: headers(), body: JSON.stringify(data),
}).then(handleRes);

export const getEvaluations = (limit = 50) => fetch(`/api/at/evaluations?limit=${limit}`, {
  headers: headers(),
}).then(handleRes);

// ── Manager ─────────────────────────────────────────────────────
export const getTeam = () => fetch('/api/at/manager/team', { headers: headers() }).then(handleRes);
export const getAdvisorEvals = (id) => fetch(`/api/at/manager/advisor/${id}/evaluations`, { headers: headers() }).then(handleRes);
export const addNote = (evaluation_id, note) => fetch('/api/at/manager/notes', {
  method: 'POST', headers: headers(), body: JSON.stringify({ evaluation_id, note }),
}).then(handleRes);

// ── TTS ─────────────────────────────────────────────────────────
export const textToSpeech = (text, gender = 'female') => fetch('/api/at/tts', {
  method: 'POST', headers: headers(), body: JSON.stringify({ text, gender }),
}).then(handleRes);
