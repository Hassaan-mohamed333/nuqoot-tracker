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
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- لقواعد بيانات أُنشئت قبل إضافة الأرشفة
alter table public.contacts
  add column if not exists is_archived boolean not null default false;
alter table public.contacts
  add column if not exists archived_at timestamptz;

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

-- ===================== الدفتر الجماعي للمناسبات =====================
-- contact_id / payer_contact_id بقيمة null تعني المستخدم نفسه: هو طرف في
-- القسمة وليس جهة اتصال في دفتره.

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- null لا يتكرر في قيود unique العادية، لذا نفصل الحالتين بفهرسين جزئيين.
create unique index if not exists event_participants_contact_uniq
  on public.event_participants (event_id, contact_id)
  where contact_id is not null;
create unique index if not exists event_participants_self_uniq
  on public.event_participants (event_id)
  where contact_id is null;

create table if not exists public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  payer_contact_id uuid references public.contacts (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'EGP',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expense_id uuid not null references public.shared_expenses (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  share_amount numeric(12, 2) not null check (share_amount >= 0)
);

create index if not exists event_participants_event_idx
  on public.event_participants (event_id);
create index if not exists shared_expenses_event_idx
  on public.shared_expenses (event_id, occurred_at desc);
create index if not exists expense_shares_expense_idx
  on public.expense_shares (expense_id);

create index if not exists contacts_user_name_idx on public.contacts (user_id, full_name);
create index if not exists contacts_active_idx
  on public.contacts (user_id, is_archived);
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

alter table public.event_participants enable row level security;
alter table public.shared_expenses enable row level security;
alter table public.expense_shares enable row level security;

drop policy if exists "event_participants_owner" on public.event_participants;
create policy "event_participants_owner" on public.event_participants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shared_expenses_owner" on public.shared_expenses;
create policy "shared_expenses_owner" on public.shared_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "expense_shares_owner" on public.expense_shares;
create policy "expense_shares_owner" on public.expense_shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===================== تخزين صور الإيصالات =====================
-- دلو خاص: الملفات لا تُقرأ برابط عام، بل برابط موقّع مؤقت يولّده التطبيق.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- المسار يبدأ بمعرّف المستخدم، وهذه السياسات تمنع تجاوزه إلى مجلد غيره.
drop policy if exists "receipts_read_own" on storage.objects;
create policy "receipts_read_own" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
