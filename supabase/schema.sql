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
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- `with check` مع `using` في التحديث: الأولى تحمي الصفّ بعد التعديل،
-- والثانية قبله. وبلا الأولى يُنقل ملفٌ إلى مجلد غيرك بتحديث المسار.
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated using (
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

-- =====================================================================
-- تقسيم الفاتورة
-- =====================================================================
-- الفاتورة المقسومة تصير حركةً لكل مشارك، لا كياناً جديداً: الأرصدة
-- تُحسب بجمع حركات كل شخص، فالتقسيم يظهر في دفاتر الجميع فوراً بلا
-- طبقةِ «ديون» موازية تحتاج مزامنةً مع الأرصدة وتتباعد عنها.
--
-- و`split_group_id` هو ما يربط حركات الفاتورة الواحدة: بدونه تبدو
-- حركاتٍ متفرّقة وقع أن لها التاريخ والوصف نفسه.

alter table public.transactions
  add column if not exists split_group_id uuid;

create index if not exists transactions_split_group_idx
  on public.transactions (split_group_id)
  where split_group_id is not null;

-- =====================================================================
-- المناسبات المشتركة (عضوية متعدّدة المستخدمين)
-- =====================================================================
-- قبل هذا القسم كانت كل مناسبة ودفترها الجماعي ملكَ مستخدمٍ واحد. الآن
-- يشترك فيها مستخدمون حقيقيون بأدوار:
--   owner  : صاحب المناسبة، يدير الأعضاء والدعوات ويحذف المناسبة.
--   editor : يضيف ويعدّل المصروفات والأعضاء الاسميين.
--   viewer : يقرأ ويصدّر التقارير فقط.
--
-- ما يبقى خاصاً دائماً: جهات الاتصال والحركات الشخصية (contacts و
-- transactions). لا يراها عضو آخر مهما كان دوره؛ يرى فقط ما يخصّ المناسبة
-- (المشاركون والمصروفات والحصص). والأسماء داخل المناسبة تؤخذ من
-- display_name لا من جهة اتصال صاحبها.
--
-- القاعدة التي لا تتغيّر: عميلٌ معدَّل لا يستطيع قراءة أو كتابة صفٍّ في
-- مناسبة ليس عضواً فيها، ولا الإشارة إلى صفٍّ يملكه غيره (فحص المفتاح
-- الأجنبي لا يمرّ عبر RLS، فكل سياسة كتابة تتحقّق من الانتماء صراحةً).

create table if not exists public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_members_user_idx
  on public.event_members (user_id);

-- مالك واحد لكل مناسبة: يمنع ترقية عضو إلى owner بطريق جانبي.
create unique index if not exists event_members_one_owner_uniq
  on public.event_members (event_id)
  where role = 'owner';

-- دعوات الانضمام. لا يصلها العميل مباشرةً (RLS بلا أي سياسة)، بل عبر
-- الدوال أدناه فقط. نخزّن بصمة الكود لا الكود: تسريب الجدول لا يكشف
-- دعوةً صالحة.
create table if not exists public.event_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  code_hash text not null unique,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer not null default 5 check (max_uses between 1 and 50),
  uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now()
);

create index if not exists event_invites_event_idx
  on public.event_invites (event_id);

-- ربط المشارك الاسمي بحساب حقيقي بعد انضمامه (اختياري).
alter table public.event_participants
  add column if not exists member_user_id uuid
  references auth.users (id) on delete set null;

-- المالك الحالي لكل مناسبة قائمة يصير owner.
insert into public.event_members (event_id, user_id, role)
select id, user_id, 'owner' from public.events
on conflict do nothing;

-- ---------------------------------------------------------------------
-- دوال الانتماء. security definer كي لا تدخل سياسات event_members في
-- تكرارٍ لا ينتهي (السياسة تقرأ الجدول الذي تحميه)، وsearch_path فارغ
-- كي لا تُختطف بكائنٍ بالاسم نفسه في مخطط آخر.
-- ---------------------------------------------------------------------

create or replace function public.event_role(p_event uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.event_members m
  where m.event_id = p_event and m.user_id = auth.uid();
$$;

-- min_role: 'viewer' < 'editor' < 'owner'.
create or replace function public.is_event_member(
  p_event uuid,
  p_min_role text default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (case public.event_role(p_event)
       when 'owner' then 3
       when 'editor' then 2
       when 'viewer' then 1
       else 0
     end)
    >=
    (case p_min_role
       when 'owner' then 3
       when 'editor' then 2
       else 1
     end),
    false
  );
$$;

revoke all on function public.event_role(uuid) from public, anon;
revoke all on function public.is_event_member(uuid, text) from public, anon;
grant execute on function public.event_role(uuid) to authenticated;
grant execute on function public.is_event_member(uuid, text) to authenticated;

-- مناسبة جديدة => صاحبها عضو owner فوراً، بلا اعتماد على العميل.
create or replace function public.add_event_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_members (event_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists events_add_owner on public.events;
create trigger events_add_owner
  after insert on public.events
  for each row execute function public.add_event_owner();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.event_members enable row level security;
alter table public.event_invites enable row level security;
-- event_invites: بلا سياسات عمداً = ممنوع على العميل كلياً.

-- المناسبة: الأعضاء يقرؤونها. التعديل والحذف يبقيان لـ events_owner.
drop policy if exists "events_member_read" on public.events;
create policy "events_member_read" on public.events
  for select using (public.is_event_member(id));

-- الأعضاء يرون بعضهم داخل المناسبة نفسها فقط.
drop policy if exists "event_members_member_read" on public.event_members;
create policy "event_members_member_read" on public.event_members
  for select using (public.is_event_member(event_id));

-- لا سياسة insert: الانضمام عبر join_event_by_code وحدها.

-- تغيير الدور: المالك فقط، ولا يُرقّى أحد إلى owner ولا يُنزَّل المالك.
drop policy if exists "event_members_owner_update" on public.event_members;
create policy "event_members_owner_update" on public.event_members
  for update using (
    public.is_event_member(event_id, 'owner') and role <> 'owner'
  ) with check (
    public.is_event_member(event_id, 'owner') and role <> 'owner'
  );

-- الإزالة: المالك يزيل أي عضو غيره، والعضو يغادر بنفسه. المالك لا يُزال.
drop policy if exists "event_members_remove" on public.event_members;
create policy "event_members_remove" on public.event_members
  for delete using (
    role <> 'owner'
    and (
      public.is_event_member(event_id, 'owner')
      or user_id = auth.uid()
    )
  );

-- المشاركون في المناسبة.
drop policy if exists "event_participants_owner" on public.event_participants;
drop policy if exists "event_participants_member_read" on public.event_participants;
create policy "event_participants_member_read" on public.event_participants
  for select using (public.is_event_member(event_id));

drop policy if exists "event_participants_member_insert" on public.event_participants;
create policy "event_participants_member_insert" on public.event_participants
  for insert with check (
    auth.uid() = user_id
    and public.is_event_member(event_id, 'editor')
    and (
      contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.user_id = auth.uid()
      )
    )
    and (
      member_user_id is null
      or exists (
        select 1 from public.event_members m
        where m.event_id = event_participants.event_id
          and m.user_id = member_user_id
      )
    )
  );

drop policy if exists "event_participants_member_update" on public.event_participants;
create policy "event_participants_member_update" on public.event_participants
  for update using (
    public.is_event_member(event_id, 'editor')
    and (user_id = auth.uid() or public.is_event_member(event_id, 'owner'))
  ) with check (
    public.is_event_member(event_id, 'editor')
    and (
      contact_id is null
      or exists (
        select 1 from public.contacts c
        where c.id = contact_id and c.user_id = auth.uid()
      )
    )
    and (
      member_user_id is null
      or exists (
        select 1 from public.event_members m
        where m.event_id = event_participants.event_id
          and m.user_id = member_user_id
      )
    )
  );

drop policy if exists "event_participants_member_delete" on public.event_participants;
create policy "event_participants_member_delete" on public.event_participants
  for delete using (
    public.is_event_member(event_id, 'editor')
    and (user_id = auth.uid() or public.is_event_member(event_id, 'owner'))
  );

-- المصروفات المشتركة.
drop policy if exists "shared_expenses_owner" on public.shared_expenses;
drop policy if exists "shared_expenses_member_read" on public.shared_expenses;
create policy "shared_expenses_member_read" on public.shared_expenses
  for select using (public.is_event_member(event_id));

drop policy if exists "shared_expenses_member_insert" on public.shared_expenses;
create policy "shared_expenses_member_insert" on public.shared_expenses
  for insert with check (
    auth.uid() = user_id
    and public.is_event_member(event_id, 'editor')
    and (
      payer_participant_id is null
      or exists (
        select 1 from public.event_participants p
        where p.id = payer_participant_id
          and p.event_id = shared_expenses.event_id
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

drop policy if exists "shared_expenses_member_update" on public.shared_expenses;
create policy "shared_expenses_member_update" on public.shared_expenses
  for update using (
    public.is_event_member(event_id, 'editor')
    and (user_id = auth.uid() or public.is_event_member(event_id, 'owner'))
  ) with check (
    public.is_event_member(event_id, 'editor')
    and (
      payer_participant_id is null
      or exists (
        select 1 from public.event_participants p
        where p.id = payer_participant_id
          and p.event_id = shared_expenses.event_id
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

drop policy if exists "shared_expenses_member_delete" on public.shared_expenses;
create policy "shared_expenses_member_delete" on public.shared_expenses
  for delete using (
    public.is_event_member(event_id, 'editor')
    and (user_id = auth.uid() or public.is_event_member(event_id, 'owner'))
  );

-- حصص المصروفات: تتبع مناسبة المصروف الأب.
drop policy if exists "expense_shares_owner" on public.expense_shares;
drop policy if exists "expense_shares_member_read" on public.expense_shares;
create policy "expense_shares_member_read" on public.expense_shares
  for select using (
    exists (
      select 1 from public.shared_expenses e
      where e.id = expense_id and public.is_event_member(e.event_id)
    )
  );

drop policy if exists "expense_shares_member_insert" on public.expense_shares;
create policy "expense_shares_member_insert" on public.expense_shares
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.shared_expenses e
      where e.id = expense_id and public.is_event_member(e.event_id, 'editor')
    )
    and (
      participant_id is null
      or exists (
        select 1
        from public.event_participants p
        join public.shared_expenses e on e.event_id = p.event_id
        where p.id = participant_id and e.id = expense_id
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

drop policy if exists "expense_shares_member_update" on public.expense_shares;
create policy "expense_shares_member_update" on public.expense_shares
  for update using (
    exists (
      select 1 from public.shared_expenses e
      where e.id = expense_id
        and public.is_event_member(e.event_id, 'editor')
        and (expense_shares.user_id = auth.uid()
             or public.is_event_member(e.event_id, 'owner'))
    )
  ) with check (
    exists (
      select 1 from public.shared_expenses e
      where e.id = expense_id and public.is_event_member(e.event_id, 'editor')
    )
    and (
      participant_id is null
      or exists (
        select 1
        from public.event_participants p
        join public.shared_expenses e on e.event_id = p.event_id
        where p.id = participant_id and e.id = expense_id
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

drop policy if exists "expense_shares_member_delete" on public.expense_shares;
create policy "expense_shares_member_delete" on public.expense_shares
  for delete using (
    exists (
      select 1 from public.shared_expenses e
      where e.id = expense_id
        and public.is_event_member(e.event_id, 'editor')
        and (expense_shares.user_id = auth.uid()
             or public.is_event_member(e.event_id, 'owner'))
    )
  );

-- ---------------------------------------------------------------------
-- الدعوات والأسماء (دوال security definer، تتحقّق من الصلاحية بنفسها).
-- ---------------------------------------------------------------------

-- ينشئ دعوة ويعيد الكود الخام مرّةً واحدة؛ لا يُخزَّن ولا يُستعاد.
create or replace function public.create_event_invite(
  p_event uuid,
  p_role text default 'editor',
  p_ttl_hours integer default 72,
  p_max_uses integer default 5
)
returns text
language plpgsql
security definer
set search_path = extensions, pg_temp
as $$
declare
  v_code text;
begin
  if auth.uid() is null or not public.is_event_member(p_event, 'owner') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'bad_role' using errcode = '22023';
  end if;

  v_code := upper(encode(gen_random_bytes(6), 'hex'));
  insert into public.event_invites (
    event_id, code_hash, role, created_by, expires_at, max_uses
  ) values (
    p_event,
    encode(digest(v_code, 'sha256'), 'hex'),
    p_role,
    auth.uid(),
    now() + make_interval(hours => least(greatest(p_ttl_hours, 1), 24 * 14)),
    least(greatest(p_max_uses, 1), 50)
  );
  return v_code;
end;
$$;

-- ينضمّ بكود. رسالة خطأ واحدة لكل الأسباب كي لا يُستدلّ على وجود الكود.
create or replace function public.join_event_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = extensions, pg_temp
as $$
declare
  v_invite public.event_invites;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_invite
  from public.event_invites
  where code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    and expires_at > now()
    and uses < max_uses
  for update;

  if not found then
    raise exception 'invalid_invite' using errcode = 'P0002';
  end if;

  insert into public.event_members (event_id, user_id, role, invited_by)
  values (v_invite.event_id, auth.uid(), v_invite.role, v_invite.created_by)
  on conflict do nothing;

  if found then
    update public.event_invites set uses = uses + 1 where id = v_invite.id;

    -- المنضمّ يصير مشاركاً في قسمة المناسبة باسمه من ملفه الشخصي.
    select coalesce(nullif(trim(p.full_name), ''), 'عضو')
    into v_name
    from (select 1) one
    left join public.profiles p on p.id = auth.uid();

    begin
      insert into public.event_participants (
        user_id, event_id, display_name, member_user_id
      ) values (auth.uid(), v_invite.event_id, v_name, auth.uid());
    exception when unique_violation then
      -- اسم مأخوذ في المناسبة: نميّزه بجزء من المعرّف بدل رفض الانضمام.
      insert into public.event_participants (
        user_id, event_id, display_name, member_user_id
      ) values (
        auth.uid(), v_invite.event_id,
        v_name || ' ' || left(auth.uid()::text, 4), auth.uid()
      );
    end;
  end if;

  return v_invite.event_id;
end;
$$;

create or replace function public.revoke_event_invites(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_event_member(p_event, 'owner') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.event_invites where event_id = p_event;
end;
$$;

-- أسماء الأعضاء الحقيقيين داخل مناسبة. profiles خاص بصاحبه، فلا يُقرأ
-- مباشرةً؛ هذه الدالة تكشف الاسم وحده، وللأعضاء فقط.
create or replace function public.event_member_names(p_event uuid)
returns table (user_id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.full_name, m.role
  from public.event_members m
  left join public.profiles p on p.id = m.user_id
  where m.event_id = p_event
    and public.is_event_member(p_event);
$$;

revoke all on function public.create_event_invite(uuid, text, integer, integer)
  from public, anon;
revoke all on function public.join_event_by_code(text) from public, anon;
revoke all on function public.revoke_event_invites(uuid) from public, anon;
revoke all on function public.event_member_names(uuid) from public, anon;
grant execute on function public.create_event_invite(uuid, text, integer, integer)
  to authenticated;
grant execute on function public.join_event_by_code(text) to authenticated;
grant execute on function public.revoke_event_invites(uuid) to authenticated;
grant execute on function public.event_member_names(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- أسماء المشاركين تُرى من الأعضاء الآخرين
-- ---------------------------------------------------------------------
-- جهات الاتصال خاصة بصاحبها، فعضو آخر لا يستطيع قراءة اسم مشارك أُضيف من
-- جهة اتصال غيره. نحتفظ بنسخة من الاسم في الصف نفسه، يضبطها الخادم لا
-- العميل: اسم يرسله العميل يستطيع تزويره.
-- الأسماء الحرة (display_name) باقية: مشاركون بلا حساب ولا جهة اتصال.

alter table public.event_participants
  add column if not exists shown_name text;

create or replace function public.set_participant_shown_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.contact_id is not null then
    select c.full_name into new.shown_name
    from public.contacts c
    where c.id = new.contact_id;
  elsif new.display_name is not null then
    new.shown_name := new.display_name;
  else
    -- صفّ «أنا»: صاحبه حساب بعينه. بلا الربط يظهر «أنا» لكل عضو آخر.
    new.member_user_id := coalesce(new.member_user_id, new.user_id);
    select p.full_name into new.shown_name
    from public.profiles p
    where p.id = new.member_user_id;
    new.shown_name := coalesce(nullif(trim(new.shown_name), ''), 'صاحب المناسبة');
  end if;
  return new;
end;
$$;

drop trigger if exists event_participants_shown_name on public.event_participants;
create trigger event_participants_shown_name
  before insert or update of contact_id, display_name
  on public.event_participants
  for each row execute function public.set_participant_shown_name();

-- الصفوف القائمة.
update public.event_participants p
set shown_name = c.full_name
from public.contacts c
where p.contact_id = c.id and p.shown_name is null;

update public.event_participants
set shown_name = display_name
where shown_name is null and contact_id is null and display_name is not null;

-- صفّ «أنا» القديم: صاحبه من أنشأه.
update public.event_participants p
set member_user_id = p.user_id,
    shown_name = coalesce(
      nullif(trim((select pr.full_name from public.profiles pr where pr.id = p.user_id)), ''),
      'صاحب المناسبة'
    )
where p.contact_id is null
  and p.display_name is null
  and p.member_user_id is null;

-- ---------------------------------------------------------------------
-- حذف حساب المالك: تنتقل المناسبة إلى محرّر
-- ---------------------------------------------------------------------
-- بلا هذا يحذف ON DELETE CASCADE كل مناسبة يملكها الحساب المحذوف، ومعها
-- مصروفات الأعضاء الآخرين. الترتيب عند الحذف:
--   1) محرّر أقدم انضماماً يصير المالك (فإن لم يوجد فأقدم عضو آخر).
--   2) ما أنشأه الحساب المحذوف داخل المناسبة (مصروفات، مشاركون، حصص)
--      يُنقل إلى المالك الجديد بدل أن يُحذف معه.
--   3) المشاركون الذين أُضيفوا من جهات اتصاله يتحوّلون إلى أسماء حرّة،
--      لأن جهات اتصاله تُحذف مع حسابه وكانت ستسحب صفوفهم معها.
-- مناسبة لا عضو فيها غيره تُحذف مع حسابه.
-- والعضو غير المالك: ما أنشأه ينتقل إلى مالك المناسبة.

create or replace function public.transfer_events_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_target uuid;
  v_part record;
begin
  for v_member in
    select m.event_id, m.role
    from public.event_members m
    where m.user_id = old.id
  loop
    if v_member.role = 'owner' then
      select m.user_id into v_target
      from public.event_members m
      where m.event_id = v_member.event_id and m.user_id <> old.id
      order by (m.role = 'editor') desc, m.joined_at asc
      limit 1;

      -- لا أحد غيره: تُحذف المناسبة مع حسابه كما كان.
      continue when v_target is null;

      -- القيد الفريد يمنع مالكَين معاً: نزيل القديم قبل ترقية الجديد.
      delete from public.event_members
      where event_id = v_member.event_id and user_id = old.id;
      update public.event_members set role = 'owner'
      where event_id = v_member.event_id and user_id = v_target;
      update public.events set user_id = v_target
      where id = v_member.event_id;
    else
      select e.user_id into v_target
      from public.events e where e.id = v_member.event_id;
    end if;

    -- ما أنشأه الحساب المحذوف ينتقل، فلا تسحبه سلسلة الحذف.
    update public.shared_expenses set user_id = v_target
    where event_id = v_member.event_id and user_id = old.id;
    update public.event_participants set user_id = v_target
    where event_id = v_member.event_id and user_id = old.id;
    update public.expense_shares set user_id = v_target
    where user_id = old.id
      and expense_id in (
        select id from public.shared_expenses where event_id = v_member.event_id
      );

    -- صفّه هو («أنا» أو منضمّاً بدعوة) يصير اسماً حرّاً بدل صفٍّ بلا هوية.
    for v_part in
      select p.id, coalesce(nullif(trim(p.shown_name), ''), 'عضو سابق') as full_name
      from public.event_participants p
      where p.event_id = v_member.event_id
        and p.member_user_id = old.id
        and p.contact_id is null
    loop
      begin
        update public.event_participants
        set display_name = v_part.full_name, member_user_id = null
        where id = v_part.id;
      exception when unique_violation then
        update public.event_participants
        set display_name = v_part.full_name || ' ' || left(v_part.id::text, 4),
            member_user_id = null
        where id = v_part.id;
      end;
    end loop;

    -- مشاركون من جهات اتصاله يصيرون أسماءً حرّة. صفّاً صفّاً: تعارض اسمٍ
    -- مع آخر في المناسبة يجب ألا يُفشل حذف الحساب.
    for v_part in
      select p.id, c.full_name
      from public.event_participants p
      join public.contacts c on c.id = p.contact_id
      where p.event_id = v_member.event_id and c.user_id = old.id
    loop
      begin
        update public.event_participants
        set display_name = v_part.full_name, contact_id = null
        where id = v_part.id;
      exception when unique_violation then
        update public.event_participants
        set display_name = v_part.full_name || ' ' || left(v_part.id::text, 4),
            contact_id = null
        where id = v_part.id;
      end;
    end loop;
  end loop;

  return old;
end;
$$;

revoke all on function public.transfer_events_before_user_delete() from public, anon, authenticated;

drop trigger if exists users_transfer_events on auth.users;
create trigger users_transfer_events
  before delete on auth.users
  for each row execute function public.transfer_events_before_user_delete();

-- ===== فواتير المصروفات المشتركة: يقرؤها أعضاء المناسبة =====
-- الصورة تُرفع في مجلد من رفعها، فسياسة receipts_read_own وحدها تحجبها عن
-- بقية الأعضاء. هذه تفتحها لمن يرى المصروف الذي يشير إليها، لا أكثر: مسارٌ
-- لا يشير إليه مصروف يبقى لصاحبه وحده.
create index if not exists shared_expenses_receipt_idx
  on public.shared_expenses (receipt_url)
  where receipt_url is not null;

drop policy if exists "receipts_read_event_member" on storage.objects;
create policy "receipts_read_event_member" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.shared_expenses e
      where e.receipt_url = storage.objects.name
        and public.is_event_member(e.event_id)
    )
  );
