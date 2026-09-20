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

-- ===== أعضاء بلا جهة اتصال + هوية العضو داخل المناسبة =====
-- العضو قد يكون: جهة اتصال، أو المستخدم نفسه، أو اسماً حراً لرحلة عابرة.

alter table public.event_participants
  add column if not exists display_name text;

do $$
begin
  -- مصدر واحد للاسم: إما جهة اتصال وإما اسم حر، لا الاثنان.
  if not exists (
    select 1 from pg_constraint where conname = 'event_participants_name_source'
  ) then
    alter table public.event_participants
      add constraint event_participants_name_source
      check (contact_id is null or display_name is null);
  end if;
end $$;

-- الفهرس القديم كان يسمح بصف واحد بلا contact_id لكل مناسبة، وهو ما يمنع
-- وجود أكثر من عضو بلا جهة اتصال. نفصل الحالتين: صف "أنا" وحيد، والأسماء
-- الحرة فريدة بالاسم.
drop index if exists event_participants_self_uniq;
create unique index if not exists event_participants_self_uniq
  on public.event_participants (event_id)
  where contact_id is null and display_name is null;
create unique index if not exists event_participants_adhoc_uniq
  on public.event_participants (event_id, display_name)
  where contact_id is null and display_name is not null;

-- هوية العضو داخل المناسبة هي صف event_participants نفسه، لا جهة الاتصال:
-- عضوان بلا جهة اتصال كانا سيتصادمان لو اعتمدنا contact_id وحده.
alter table public.shared_expenses
  add column if not exists payer_participant_id uuid
  references public.event_participants (id) on delete set null;
alter table public.shared_expenses
  add column if not exists receipt_url text;

alter table public.expense_shares
  add column if not exists participant_id uuid
  references public.event_participants (id) on delete cascade;

-- ترحيل الصفوف القديمة التي كانت تشير إلى جهة الاتصال مباشرةً.
update public.expense_shares s
set participant_id = p.id
from public.shared_expenses e
join public.event_participants p on p.event_id = e.event_id
where s.expense_id = e.id
  and s.participant_id is null
  and p.contact_id is not distinct from s.contact_id;

update public.shared_expenses e
set payer_participant_id = p.id
from public.event_participants p
where p.event_id = e.event_id
  and e.payer_participant_id is null
  and p.contact_id is not distinct from e.payer_contact_id;

create index if not exists expense_shares_participant_idx
  on public.expense_shares (participant_id);

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

-- =====================================================================
-- تشديد أمني (٢٠٢٦-٠٩): إعادة تشغيل هذا القسم آمنة.
--
-- الفجوة التي يسدّها: سياسات الدفتر الجماعي كانت تتحقّق من ملكية الصفّ
-- نفسه (`auth.uid() = user_id`) دون التحقّق من ملكية ما يشير إليه. فحصُ
-- المفتاح الأجنبي لا يمرّ عبر RLS، فكان بإمكان عميلٍ معدَّل أن يُدرج صفّاً
-- يملكه هو لكنه يشير إلى مناسبة أو مصروف يملكه غيره. لا يكشف ذلك بيانات
-- الآخرين (القراءة محكومة بالملكية)، لكنه يربط سجلّاتنا بسجلّاتهم ويفتح
-- باب إفساد التقارير. الجداول الثلاثة الأخرى تتبع هذا النمط أصلاً، وهذا
-- توحيدٌ له.
-- =====================================================================

drop policy if exists "event_participants_owner" on public.event_participants;
create policy "event_participants_owner" on public.event_participants
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.user_id = auth.uid()
    )
    and (
      contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists "shared_expenses_owner" on public.shared_expenses;
create policy "shared_expenses_owner" on public.shared_expenses
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.user_id = auth.uid()
    )
    and (
      payer_participant_id is null
      or exists (
        select 1 from public.event_participants p
        where p.id = payer_participant_id and p.user_id = auth.uid()
      )
    )
    and (
      payer_contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = payer_contact_id and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists "expense_shares_owner" on public.expense_shares;
create policy "expense_shares_owner" on public.expense_shares
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.shared_expenses e
      where e.id = expense_id and e.user_id = auth.uid()
    )
    and (
      participant_id is null
      or exists (
        select 1 from public.event_participants p
        where p.id = participant_id and p.user_id = auth.uid()
      )
    )
    and (
      contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.user_id = auth.uid()
      )
    )
  );

-- حدود دلو الإيصالات.
--
-- بلا سقف حجم يرفع أي حساب ما شاء حتى تنفد الحصة، وبلا قائمة أنواع
-- مسموحة يُرفع HTML يُفتح لاحقاً برابط موقّع داخل نطاق التخزين — نصٌّ
-- ينفّذ في أصلٍ يملك ملفات مستخدمين آخرين.
update storage.buckets
set
  file_size_limit = 6 * 1024 * 1024,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
where id = 'receipts';

-- طول الحقول النصّية: حاجز أخير لو أُدرج صفّ من خارج التطبيق.
-- التحقّق الأساسي في src/lib/validation.ts، وهذا ما لا يمكن الالتفاف عليه.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_text_limits') then
    alter table public.contacts add constraint contacts_text_limits check (
      length(full_name) between 2 and 120
      and (phone is null or length(phone) <= 32)
      and (relation is null or length(relation) <= 60)
      and (notes is null or length(notes) <= 500)
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'events_text_limits') then
    alter table public.events add constraint events_text_limits check (
      length(title) between 2 and 140
      and (location is null or length(location) <= 160)
      and (notes is null or length(notes) <= 500)
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_text_limits') then
    alter table public.transactions add constraint transactions_text_limits check (
      (note is null or length(note) <= 500)
      and length(currency) = 3
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shared_expenses_text_limits') then
    alter table public.shared_expenses add constraint shared_expenses_text_limits check (
      length(description) between 2 and 200
      and length(currency) = 3
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'event_participants_name_limit') then
    alter table public.event_participants add constraint event_participants_name_limit check (
      display_name is null or length(display_name) between 2 and 120
    );
  end if;
end $$;

-- =====================================================================
-- الملف الشخصي للمستخدم + دلو الصور الرمزية
-- =====================================================================
-- الصفّ واحد لكل مستخدم ومفتاحه هو معرّفه في auth.users، لا عمود user_id
-- منفصل: بهذا يستحيل وجود ملفّين لشخص واحد، وشرط الملكية يصير مقارنةً
-- بالمفتاح الأساسي نفسه.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  -- تاريخ لا طابع زمني: تاريخ الميلاد لا وقت له، وتخزينه timestamptz
  -- يزيحه يوماً كاملاً لكل من يسكن غرب غرينتش.
  birth_date date,
  avatar_url text,
  phone text,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- الأعمدة تُضاف صراحةً بعد إنشاء الجدول، لا بالاعتماد عليه.
--
-- `create table if not exists` **لا يفعل شيئاً** إن كان الجدول موجوداً
-- ولو بأعمدة مختلفة. فمن كان عنده `profiles` من عمل سابق لم يحصل على
-- العمود الجديد، ولا تُغيّر إعادةُ تشغيل الملف شيئاً — ثم يردّ PostgREST
-- بـ PGRST204 ويقال له «شغّل الهجرة»، وقد شغّلها. هذه السطور هي ما يجعل
-- تشغيل الملف مفيداً على جدول قائم.
-- ---------------------------------------------------------------------

-- ترحيل الاسم القديم قبل إضافة الجديد، حتى لا يضيع ما كان مخزَّناً.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'date_of_birth'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'birth_date'
  ) then
    alter table public.profiles rename column date_of_birth to birth_date;
  end if;
end $$;

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists currency text;
alter table public.profiles
  add column if not exists created_at timestamptz not null default now();
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

drop policy if exists "profiles_owner" on public.profiles;
create policy "profiles_owner" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- حاجز أخير لو أُدرج صفّ من خارج التطبيق. التحقّق الأساسي في
-- src/lib/validation.ts، وهذا ما لا يمكن الالتفاف عليه.
-- القيد يُسقط ويُعاد بناؤه: نسخته القديمة تشير إلى `date_of_birth`،
-- والعمود صار اسمه `birth_date`.
alter table public.profiles drop constraint if exists profiles_limits;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_limits') then
    alter table public.profiles add constraint profiles_limits check (
      (full_name is null or length(full_name) between 2 and 120)
      and (avatar_url is null or length(avatar_url) <= 500)
      -- تاريخ ميلاد في المستقبل خطأ إدخال لا نيّة.
      and (birth_date is null or birth_date <= current_date)
      and (birth_date is null or birth_date >= date '1900-01-01')
      and (phone is null or length(phone) <= 32)
      and (currency is null or length(currency) = 3)
    );
  end if;
end $$;

-- تحديث updated_at من قاعدة البيانات لا من العميل: قيمةٌ يرسلها العميل
-- يستطيع العميل تزويرها، وهذه يُقاس عليها آخر تعديل.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- دلو الصور الرمزية.
--
-- عامّ، بخلاف دلو الإيصالات: الصورة تُعرض برابط ثابت في الواجهة، والرابط
-- الموقّت ينتهي فيظهر مربّع مكسور. والمقايضة مفهومة: من يعرف الرابط يرى
-- الصورة. لذا لا يوضع هنا إلا ما يقصد صاحبه عرضه.
--
-- والكتابة تبقى مقصورة على مجلد صاحبها: المسار يبدأ بمعرّف المستخدم،
-- والسياسات تمنع تجاوزه. بلا ذلك يستبدل أيّ حساب صورة أيّ حساب آخر.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

update storage.buckets
set
  -- سقف أصغر من الإيصالات: الصورة الرمزية تُعرض في دائرة صغيرة.
  file_size_limit = 2 * 1024 * 1024,
  -- بلا قائمة أنواع يُرفع HTML يُفتح لاحقاً داخل نطاق التخزين — نصٌّ
  -- ينفّذ في أصلٍ يملك ملفات مستخدمين آخرين.
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

drop policy if exists "avatars_read_all" on storage.objects;
create policy "avatars_read_all" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- الأرشفة الليّنة للحركات
-- =====================================================================
-- الحذف في دفتر مالي فعلٌ لا رجعة فيه، وأكثر ما يُحذف يُحذف بالخطأ.
-- فالأرشفة تُخفي الصفّ من القوائم والإجماليات وتُبقيه قابلاً للاستعادة،
-- والحذف النهائي يبقى متاحاً من شاشة الأرشيف وحدها بتأكيد صريح.
--
-- جهات الاتصال تحمل العمودين أصلاً منذ أوّل مخطّط؛ هذا يسوّي الحركات بها.

alter table public.transactions
  add column if not exists is_archived boolean not null default false;
alter table public.transactions
  add column if not exists archived_at timestamptz;

-- القوائم والإجماليات تقرأ النشط وحده، فالفهرس على الحالة لا على الصفّ.
create index if not exists transactions_active_idx
  on public.transactions (user_id, is_archived, occurred_at desc);
