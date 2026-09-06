-- مخطط قاعدة بيانات تطبيق النقوط والواجبات (Supabase / PostgreSQL)
-- شغّل هذا الملف من SQL Editor في لوحة تحكم Supabase.

create extension if not exists "pgcrypto";

-- جهات الاتصال
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  relation text,
  notes text,
  created_at timestamptz not null default now()
);

-- المناسبات
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  event_type text not null default 'other'
    check (event_type in ('wedding','engagement','newborn','graduation','funeral','other')),
  host_contact_id uuid references public.contacts (id) on delete set null,
  event_date timestamptz not null,
  location text,
  notes text,
  created_at timestamptz not null default now()
);

-- الحركات المالية: IN = استلمت، OUT = دفعت
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  direction text not null check (direction in ('IN','OUT')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'EGP',
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists contacts_user_name_idx on public.contacts (user_id, full_name);
create index if not exists events_user_date_idx on public.events (user_id, event_date desc);
create index if not exists transactions_contact_idx on public.transactions (contact_id, occurred_at desc);

-- كل مستخدم يرى بياناته فقط
alter table public.contacts enable row level security;
alter table public.events enable row level security;
alter table public.transactions enable row level security;

create policy "contacts_owner" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "events_owner" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions_owner" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
