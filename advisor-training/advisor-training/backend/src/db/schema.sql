-- ================================================
-- Advisor Training – Database Schema
-- Run this in Supabase SQL Editor
-- ================================================

-- Enable UUID
create extension if not exists "uuid-ossp";

-- Users table
create table users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  password_hash text not null,
  name text not null,
  role text not null default 'advisor' check (role in ('advisor', 'manager', 'admin')),
  branch text,
  region text,
  created_at timestamptz default now(),
  last_login timestamptz
);

-- Teams (manager → advisors)
create table teams (
  id uuid primary key default uuid_generate_v4(),
  manager_id uuid references users(id),
  advisor_id uuid references users(id),
  created_at timestamptz default now(),
  unique(manager_id, advisor_id)
);

-- Training sessions
create table trainings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) not null,
  mode text not null, -- personal, preset, manual, pair, phone-in, phone-out, chain-a, chain-b, reverse
  difficulty real not null, -- 1, 2, 3, 3.5, 4, 4.5, 5, 5.5
  situation text,
  reason text,
  highlight text,
  personality text,
  duration text,
  message_count integer,
  client_left boolean default false,
  meeting_scheduled boolean default false,
  chain_phase integer,
  profile_json jsonb, -- full profile for manager view
  messages_json jsonb, -- full conversation
  created_at timestamptz default now()
);

-- Evaluations
create table evaluations (
  id uuid primary key default uuid_generate_v4(),
  training_id uuid references trainings(id) not null,
  user_id uuid references users(id) not null,
  overall_score integer,
  result text, -- success, partial, fail
  highlight_discovered boolean,
  highlight_product_offered boolean,
  sub_goals jsonb,
  skills jsonb, -- {cross_sell:{score,note}, ...}
  phone_skills jsonb,
  advisor_feedback jsonb,
  manager_feedback jsonb,
  suggested_questions jsonb,
  ideal_approach text,
  summary text,
  quiz_score integer,
  quiz_total integer,
  created_at timestamptz default now()
);

-- Manager notes on evaluations
create table manager_notes (
  id uuid primary key default uuid_generate_v4(),
  evaluation_id uuid references evaluations(id) not null,
  manager_id uuid references users(id) not null,
  note text not null,
  created_at timestamptz default now()
);

-- Indexes
create index idx_trainings_user on trainings(user_id);
create index idx_trainings_created on trainings(created_at desc);
create index idx_evaluations_user on evaluations(user_id);
create index idx_evaluations_training on evaluations(training_id);

-- Row Level Security
alter table trainings enable row level security;
alter table evaluations enable row level security;
alter table manager_notes enable row level security;

-- Policies: advisors see only their own data
create policy "Users see own trainings" on trainings
  for select using (auth.uid() = user_id);

create policy "Users insert own trainings" on trainings
  for insert with check (auth.uid() = user_id);

-- Managers can see their team's data
create policy "Managers see team trainings" on trainings
  for select using (
    exists (
      select 1 from teams
      where teams.manager_id = auth.uid()
      and teams.advisor_id = trainings.user_id
    )
  );

create policy "Users see own evaluations" on evaluations
  for select using (auth.uid() = user_id);

create policy "Users insert own evaluations" on evaluations
  for insert with check (auth.uid() = user_id);

-- Insert test users (password: bcrypt hash of 'manager123' and 'poradce123')
-- Generate proper hashes in your backend on first run
insert into users (email, name, role, branch) values
  ('manager@test.cz', 'Jan Manažer', 'manager', 'Praha 2'),
  ('poradce@test.cz', 'Eva Poradcová', 'advisor', 'Praha 2');

-- Link them
insert into teams (manager_id, advisor_id)
select m.id, a.id from users m, users a
where m.email = 'manager@test.cz' and a.email = 'poradce@test.cz';
