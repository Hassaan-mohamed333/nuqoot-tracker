import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { checkBirthDate, checkImageUrl, ValidationError } from '../src/lib/validation.ts';
import { validateProfilePatch } from '../src/lib/validateEntities.ts';

const ROOT = path.join(import.meta.dirname, '..');

/** `YYYY-MM-DD` بالتوقيت المحلي، كما تبنيه الواجهة. */
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('تاريخ الميلاد', () => {
  test('يقبل تاريخاً سليماً ويعيده نصّاً كما هو', () => {
    // بلا مرور على Date.toISOString: تلك الرحلة تزيح اليوم لمن يسكن غرب
    // غرينتش، وهذا الحقل لا يتغيّر بتغيّر المنطقة الزمنية.
    const result = checkBirthDate('date_of_birth', '1990-05-01', 'تاريخ الميلاد');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, '1990-05-01');
  });

  test('الفارغ اختياري لا خطأ', () => {
    for (const raw of ['', '   ', null, undefined]) {
      const result = checkBirthDate('date_of_birth', raw, 'تاريخ الميلاد');
      assert.equal(result.ok, true, `يجب قبول ${JSON.stringify(raw)}`);
      if (result.ok) assert.equal(result.value, null);
    }
  });

  test('يرفض يوماً لا وجود له بدل أن يزحلقه', () => {
    // Date يقبل 2025-02-30 ويحوّلها بصمت إلى 2 مارس.
    for (const raw of ['2025-02-30', '2025-13-01', '2025-00-10', '2025-04-31']) {
      assert.equal(
        checkBirthDate('date_of_birth', raw, 'تاريخ الميلاد').ok,
        false,
        `يجب رفض ${raw}`,
      );
    }
  });

  test('يرفض الصيغ التي يبتلعها Date.parse', () => {
    for (const raw of ['1990', 'May 1 1990', '01/05/1990', '1990-5-1', 'أمس']) {
      assert.equal(
        checkBirthDate('date_of_birth', raw, 'تاريخ الميلاد').ok,
        false,
        `يجب رفض ${raw}`,
      );
    }
  });

  test('يقبل اليوم ويرفض الغد', () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    assert.equal(
      checkBirthDate('date_of_birth', localDate(today), 'تاريخ الميلاد').ok,
      true,
      'تاريخ اليوم يجب أن يُقبل',
    );
    assert.equal(
      checkBirthDate('date_of_birth', localDate(tomorrow), 'تاريخ الميلاد').ok,
      false,
    );
  });

  test('يرفض ما قبل ١٩٠٠', () => {
    assert.equal(checkBirthDate('date_of_birth', '1899-12-31', 'ت').ok, false);
  });

  test('يقبل الأرقام العربية-الهندية', () => {
    const result = checkBirthDate('date_of_birth', '١٩٩٠-٠٥-٠١', 'ت');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, '1990-05-01');
  });
});

describe('رابط الصورة', () => {
  test('يقبل رابط التخزين العام', () => {
    const url = 'https://demo.supabase.co/storage/v1/object/public/avatars/u/1.jpg';
    const result = checkImageUrl('avatar_url', url, 'رابط الصورة');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, url);
  });

  test('يقبل مسار المنتقي على الجهاز وعلى الويب', () => {
    for (const url of ['file:///data/user/0/photo.jpg', 'blob:http://localhost:8081/x']) {
      assert.equal(
        checkImageUrl('avatar_url', url, 'رابط الصورة').ok,
        true,
        `يجب قبول ${url}`,
      );
    }
  });

  test('يرفض المخطّطات التي تُنفَّذ', () => {
    // javascript: ينفّذ إن وصل إلى عنصر قابل للنقر، و http: يُرسل بلا
    // تشفير، وما ليس عنواناً أصلاً لا يُعرض.
    for (const url of [
      'javascript:alert(1)',
      'http://example.com/a.png',
      'not a url',
    ]) {
      assert.equal(
        checkImageUrl('avatar_url', url, 'رابط الصورة').ok,
        false,
        `يجب رفض ${url}`,
      );
    }
  });

  test('data: لصورة مضغوطة فقط', () => {
    /*
     * يُقبل للوضع المحلي وحده: عنوان `blob:` يموت مع إعادة تحميل
     * الصفحة فتعود الصورة مربّعاً مكسوراً. وقيد قاعدة البيانات
     * (٥٠٠ محرفاً) يمنع وصول عنوان `data:` إلى الخادم أصلاً.
     */
    assert.equal(
      checkImageUrl('avatar_url', 'data:image/jpeg;base64,/9j/4AAQ', 'ر').ok,
      true,
    );

    for (const url of [
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:application/javascript;base64,YWxlcnQ=',
      'data:image/png,notbase64',
    ]) {
      assert.equal(
        checkImageUrl('avatar_url', url, 'رابط الصورة').ok,
        false,
        `يجب رفض ${url}`,
      );
    }
  });

  test('الطول محدود في الحالتين', () => {
    const long = `https://demo.supabase.co/${'a'.repeat(600)}`;
    assert.equal(checkImageUrl('avatar_url', long, 'ر').ok, false);

    const hugeData = `data:image/jpeg;base64,${'A'.repeat(500_000)}`;
    assert.equal(checkImageUrl('avatar_url', hugeData, 'ر').ok, false);
  });
});

describe('تعديل الملف الشخصي', () => {
  test('الحقل الغائب لا يظهر في الحمولة', () => {
    const clean = validateProfilePatch({ full_name: '  سامي   عبدالله ' });
    assert.deepEqual(Object.keys(clean), ['full_name']);
    assert.equal(clean.full_name, 'سامي عبدالله');
  });

  test('null مسحٌ مقصود لا خطأ', () => {
    const clean = validateProfilePatch({
      full_name: null,
      birth_date: null,
      avatar_url: null,
      phone: null,
      currency: null,
    });
    assert.equal(clean.full_name, null);
    assert.equal(clean.birth_date, null);
    assert.equal(clean.avatar_url, null);
    assert.equal(clean.phone, null);
    assert.equal(clean.currency, null);
  });

  test('يرفض اسماً من حرف واحد', () => {
    assert.throws(() => validateProfilePatch({ full_name: 'ا' }), ValidationError);
  });

  test('يرفض الحمولة الفارغة', () => {
    assert.throws(() => validateProfilePatch({}), ValidationError);
  });

  test('يعقّم محارف التوجيه من الاسم', () => {
    // U+202E يقلب عرض ما بعده: اسمٌ يحمله يظهر للعين غير ما هو مخزَّن.
    const clean = validateProfilePatch({ full_name: '‮سامي' });
    assert.equal(clean.full_name, 'سامي');
  });
});

describe('مخطّط الملف الشخصي ودلو الصور', () => {
  const SCHEMA = readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');

  test('جدول profiles مؤمَّن بالمفتاح الأساسي نفسه', () => {
    assert.match(SCHEMA, /create table if not exists public\.profiles/);
    assert.match(SCHEMA, /alter table public\.profiles enable row level security/);
    assert.match(SCHEMA, /create policy "profiles_owner"[\s\S]*?auth\.uid\(\) = id/);
  });

  test('تاريخ الميلاد عمود date لا timestamptz', () => {
    // timestamptz يزيح اليوم لمن يسكن غرب غرينتش، والميلاد يوم لا لحظة.
    assert.match(SCHEMA, /birth_date date,/);
  });

  test('كل عمود يُضاف صراحةً، لا بالاعتماد على create table', () => {
    /*
     * `create table if not exists` لا يفعل شيئاً إن كان الجدول موجوداً
     * ولو بأعمدة مختلفة. فمن كان عنده `profiles` من عمل سابق لم يحصل
     * على العمود الجديد، ولا تُغيّر إعادةُ تشغيل الملف شيئاً — ثم يردّ
     * PostgREST بـ PGRST204 ويقال له «شغّل الهجرة»، وقد شغّلها.
     */
    for (const column of [
      'full_name',
      'birth_date',
      'avatar_url',
      'phone',
      'currency',
    ]) {
      assert.match(
        SCHEMA,
        new RegExp(
          `alter table public\\.profiles\\s+add column if not exists ${column}\\b`,
        ),
        `العمود ${column} لا يُضاف على جدول قائم`,
      );
    }
  });

  test('الاسم القديم يُرحَّل لا يُترك', () => {
    assert.match(
      SCHEMA,
      /alter table public\.profiles rename column date_of_birth to birth_date/,
    );
  });

  test('دلو avatars عام، والكتابة محصورة في مجلد صاحبها', () => {
    assert.match(SCHEMA, /values \('avatars', 'avatars', true\)/);
    for (const policy of ['avatars_insert_own', 'avatars_update_own', 'avatars_delete_own']) {
      const body = new RegExp(
        `create policy "${policy}"[\\s\\S]*?foldername\\(name\\)\\)\\[1\\] = auth\\.uid\\(\\)::text`,
      );
      assert.match(SCHEMA, body, `السياسة ${policy} لا تحصر الكتابة في مجلد المستخدم`);
    }
  });

  test('دلو avatars له سقف حجم وقائمة أنواع', () => {
    // بلا قائمة أنواع يُرفع HTML يُفتح لاحقاً داخل نطاق التخزين.
    const block = SCHEMA.slice(SCHEMA.indexOf("update storage.buckets\nset\n  -- سقف أصغر"));
    assert.ok(block.includes('file_size_limit'), 'بلا سقف حجم');
    assert.ok(block.includes("'image/jpeg'"), 'بلا قائمة أنواع مسموحة');
    assert.ok(!block.includes("'text/html'"), 'HTML مسموح في دلو الصور');
  });
});
