import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Příliš mnoho požadavků, zkuste za minutu' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Příliš mnoho pokusů o přihlášení' } });

// ── AUTH MIDDLEWARE ──
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Nepřihlášen' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Neplatný token' }); }
};

const managerOnly = (req, res, next) => {
  if (req.user.role !== 'manager' && req.user.role !== 'admin') return res.status(403).json({ error: 'Pouze pro manažery' });
  next();
};

// ── AUTH ROUTES ──
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email a heslo jsou povinné' });

  const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
  if (!user) return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Neplatné přihlašovací údaje' });

  await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, branch: user.branch }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, branch: user.branch } });
});

app.post('/api/auth/register', auth, managerOnly, async (req, res) => {
  const { email, password, name, role = 'advisor', branch } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Email, heslo a jméno jsou povinné' });

  const hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.from('users').insert({ email, password_hash: hash, name, role, branch }).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Auto-link to manager's team
  await supabase.from('teams').insert({ manager_id: req.user.id, advisor_id: data.id });
  res.json({ user: { id: data.id, name: data.name, email: data.email, role: data.role } });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

// ── ANTHROPIC PROXY ──
app.post('/api/chat', auth, apiLimiter, async (req, res) => {
  const { system, messages, max_tokens = 1000 } = req.body;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens, system, messages }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API chyba' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Chyba komunikace s AI: ' + err.message }); }
});

app.post('/api/eval', auth, apiLimiter, async (req, res) => {
  const { system, messages, max_tokens = 2000 } = req.body;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens, system, messages }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API chyba' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Chyba komunikace s AI: ' + err.message }); }
});

// ── TRAINING HISTORY ──
app.post('/api/trainings', auth, async (req, res) => {
  const { mode, difficulty, situation, reason, highlight, personality, duration, message_count, client_left, meeting_scheduled, chain_phase, profile_json, messages_json } = req.body;
  const { data, error } = await supabase.from('trainings').insert({
    user_id: req.user.id, mode, difficulty, situation, reason, highlight, personality,
    duration, message_count, client_left, meeting_scheduled, chain_phase, profile_json, messages_json,
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.get('/api/trainings', auth, async (req, res) => {
  const { limit = 50 } = req.query;
  const { data, error } = await supabase.from('trainings').select('*')
    .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(limit);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── EVALUATIONS ──
app.post('/api/evaluations', auth, async (req, res) => {
  const { training_id, overall_score, result, highlight_discovered, highlight_product_offered,
    sub_goals, skills, phone_skills, advisor_feedback, manager_feedback, suggested_questions,
    ideal_approach, summary, quiz_score, quiz_total } = req.body;
  const { data, error } = await supabase.from('evaluations').insert({
    training_id, user_id: req.user.id, overall_score, result, highlight_discovered,
    highlight_product_offered, sub_goals, skills, phone_skills, advisor_feedback,
    manager_feedback, suggested_questions, ideal_approach, summary, quiz_score, quiz_total,
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.get('/api/evaluations', auth, async (req, res) => {
  const { limit = 50 } = req.query;
  const { data, error } = await supabase.from('evaluations').select('*, trainings(*)')
    .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(limit);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── MANAGER ROUTES ──
app.get('/api/manager/team', auth, managerOnly, async (req, res) => {
  const { data: team } = await supabase.from('teams').select('advisor_id, users!teams_advisor_id_fkey(id, name, email, branch, last_login)')
    .eq('manager_id', req.user.id);
  res.json(team || []);
});

app.get('/api/manager/advisor/:advisorId/evaluations', auth, managerOnly, async (req, res) => {
  // Verify advisor is in manager's team
  const { data: link } = await supabase.from('teams')
    .select('id').eq('manager_id', req.user.id).eq('advisor_id', req.params.advisorId).single();
  if (!link) return res.status(403).json({ error: 'Poradce není ve vašem týmu' });

  const { data } = await supabase.from('evaluations').select('*, trainings(*)')
    .eq('user_id', req.params.advisorId).order('created_at', { ascending: false }).limit(50);
  res.json(data || []);
});

app.post('/api/manager/notes', auth, managerOnly, async (req, res) => {
  const { evaluation_id, note } = req.body;
  const { data, error } = await supabase.from('manager_notes').insert({
    evaluation_id, manager_id: req.user.id, note,
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── TEXT-TO-SPEECH (Google Cloud) ──
app.post('/api/tts', auth, apiLimiter, async (req, res) => {
  const { text, gender = 'female' } = req.body;
  if (!text || text.length > 500) return res.status(400).json({ error: 'Text je povinný (max 500 znaků)' });
  if (!process.env.GOOGLE_TTS_KEY) return res.status(500).json({ error: 'Google TTS není nakonfigurováno' });

  try {
    const voice = gender === 'male'
      ? { languageCode: 'cs-CZ', name: 'cs-CZ-Neural2-A', ssmlGender: 'MALE' }
      : { languageCode: 'cs-CZ', name: 'cs-CZ-Neural2-A', ssmlGender: 'FEMALE' };

    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice,
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: 0 },
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'TTS chyba' });
    res.json({ audio: data.audioContent }); // base64 MP3
  } catch (err) { res.status(500).json({ error: 'TTS chyba: ' + err.message }); }
});

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start
app.listen(PORT, () => {
  console.log(`Advisor Training API running on port ${PORT}`);
});
