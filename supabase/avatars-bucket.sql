-- =====================================================================
-- دلو الصور الرمزية — مقتطف مستقلّ
-- =====================================================================
-- هذا الجزء مقتطع من supabase/schema.sql ليُشغَّل وحده عند الحاجة.
-- تشغيله آمن التكرار، ولا يمسّ شيئاً غير الدلو وسياساته.
--
-- شغّله في: لوحة Supabase ← SQL Editor ← New query ← Run.
--
-- ثم تحقّق: Storage ← يجب أن يظهر دلو اسمه avatars وعلامة Public.
-- ---------------------------------------------------------------------

-- ١) الدلو نفسه، عامّاً للقراءة.
--
-- عامّ بخلاف دلو الإيصالات: الصورة تُعرض في كل تصيير للشاشة، والرابط
-- الموقّت ينتهي فيتحوّل إلى مربّع مكسور. والمقايضة مفهومة: من يعرف
-- الرابط يرى صورةً وضعها صاحبها ليراها الناس.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- ٢) حدود الدلو.
--
-- بلا سقف حجم يرفع أي حساب ما شاء حتى تنفد الحصة. وبلا قائمة أنواع
-- يُرفع HTML يُفتح لاحقاً داخل نطاق التخزين — نصٌّ ينفّذ في أصلٍ يملك
-- ملفات مستخدمين آخرين.
update storage.buckets
set
  file_size_limit = 2 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

-- ٣) السياسات.
--
-- القراءة للجميع (الدلو عامّ)، والكتابة محصورة في مجلد صاحبها: المسار
-- يبدأ بمعرّف المستخدم، و`(storage.foldername(name))[1]` هو أوّل جزء
-- منه. بلا هذا الشرط يستبدل أيّ حساب صورة أيّ حساب آخر.

drop policy if exists "avatars_read_all" on storage.objects;
create policy "avatars_read_all" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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

-- ٤) تحقّق سريع: يجب أن يعيد صفّاً واحداً public = true وأربع سياسات.
-- select id, public, file_size_limit from storage.buckets where id = 'avatars';
-- select policyname from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'avatars_%';
