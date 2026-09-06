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

-- =====================================================================
-- أمن الصفوف (RLS): كل مستخدم يرى ويكتب بياناته فقط.
--
-- ملاحظات تشغيلية:
-- 1) user_id يأخذ القيمة الافتراضية auth.uid()، فلا يرسله التطبيق إطلاقاً.
--    إرسال null صراحةً يتجاوز القيمة الافتراضية ويكسر قيد NOT NULL.
-- 2) لتفعيل «متابعة كضيف» في التطبيق فعّل:
--    Authentication -> Sign In / Providers -> Anonymous sign-ins.
--    المستخدم المجهول له auth.uid() حقيقي، فتنطبق عليه السياسات نفسها.
-- 3) هذا القسم قابل لإعادة التشغيل بفضل drop policy if exists.
-- =====================================================================

alter table public.contacts enable row level security;
alter table public.events enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "contacts_owner" on public.contacts;
create policy "contacts_owner" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- إضافة إلى ملكية الصف، نمنع الإشارة إلى جهة اتصال يملكها مستخدم آخر:
-- فحص المفتاح الأجنبي وحده لا يمرّ عبر RLS.
drop policy if exists "events_owner" on public.events;
create policy "events_owner" on public.events
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      host_contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = host_contact_id and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists "transactions_owner" on public.transactions;
create policy "transactions_owner" on public.transactions
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.user_id = auth.uid()
    )
    and (
      event_id is null
      or exists (
        select 1 from public.events e
        where e.id = event_id and e.user_id = auth.uid()
      )
    )
  );
