import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { checkImageUrl } from '../src/lib/validation.ts';

const ROOT = path.join(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

/** توجيهة بعينها من وسم سياسة المحتوى في صفحة الويب. */
function directive(name: string): string {
  const html = read('public/index.html');
  const policy =
    (html.match(
      /http-equiv="Content-Security-Policy"[\s\S]*?content="([\s\S]*?)"/,
    ) ?? [])[1] ?? '';
  assert.ok(policy.length > 0, 'لم يُعثر على وسم سياسة المحتوى');
  return (policy.match(new RegExp(`${name}([^;]*);`)) ?? [])[1] ?? '';
}

const SUPABASE_AVATAR =
  'https://abcdefghijklm.supabase.co/storage/v1/object/public/avatars/8f1c/1758300000000.jpg';

/**
 * الصورة الرمزية تختفي بعد الحفظ.
 *
 * العطب لم يكن في الرفع ولا في الحفظ — كلاهما ينجح — بل في سياسة
 * المحتوى: `img-src` لم يكن يذكر نطاق Supabase، و CSP يمنع قبل الشبكة
 * فلا طلبَ يفشل ولا خطأ يظهر. تُرسم الدائرة فارغةً وكفى. والوضع المحلي
 * كان يعمل لأن عنوانه `data:` وهو مسموح — وهو ما جعل العطب يبدو عشوائياً.
 */
describe('سياسة المحتوى تسمح بصور التخزين', () => {
  test('img-src يذكر نطاق Supabase', () => {
    const value = directive('img-src');
    assert.ok(
      value.includes('https://*.supabase.co'),
      'نطاق Supabase خارج img-src: الصورة المرفوعة لن تُرسم على الويب',
    );
  });

  test('img-src يُبقي data: و blob: للوضع المحلي وللمعاينة', () => {
    const value = directive('img-src');
    assert.ok(value.includes('data:'), 'data: خارج img-src');
    assert.ok(value.includes('blob:'), 'blob: خارج img-src');
  });

  test('media-src يذكر نطاق Supabase كذلك', () => {
    // الإيصالات تُقرأ من التخزين بالعنوان نفسه.
    assert.ok(directive('media-src').includes('https://*.supabase.co'));
  });

  test('الانفتاح لم يتجاوز الصور: script-src يبقى ذاتياً', () => {
    const value = directive('script-src');
    assert.ok(value.includes("'self'"), "script-src فقد 'self'");
    assert.ok(
      !value.includes('supabase') && !value.includes("'unsafe-inline'"),
      'script-src انفتح مع img-src — وهو التوجيه الذي يهمّ ضد الحقن',
    );
  });
});

describe('التحقّق من رابط الصورة', () => {
  test('رابط التخزين العامّ يمرّ كما هو', () => {
    const result = checkImageUrl('avatar_url', SUPABASE_AVATAR, 'رابط الصورة');
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value, SUPABASE_AVATAR);
  });

  test('عنوان data: لصورة يمرّ، للوضع المحلي', () => {
    const uri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
    const result = checkImageUrl('avatar_url', uri, 'رابط الصورة');
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value, uri);
  });

  test('ما ليس صورةً أو ليس مشفَّراً يُرفض', () => {
    for (const bad of [
      'javascript:alert(1)',
      'http://abcdefghijklm.supabase.co/storage/v1/object/public/avatars/a.jpg',
      'data:text/html;base64,PHNjcmlwdD4=',
    ]) {
      const result = checkImageUrl('avatar_url', bad, 'رابط الصورة');
      assert.equal(result.ok, false, `مرّ رابط خطر: ${bad}`);
    }
  });

  test('الفراغ يعني «لا صورة» لا خطأ', () => {
    const result = checkImageUrl('avatar_url', '', 'رابط الصورة');
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value, null);
  });
});

/**
 * البديل عند فشل التحميل.
 *
 * رابطٌ صار بلا معنى — دلوٌ خاص، أو ملفٌ حُذف — لا يرفع خطأً في
 * التطبيق. فبلا `onError` تبقى الدائرة شفّافةً فارغة: لا صورةَ ولا
 * علامةَ على أن شيئاً فُقد.
 */
describe('مكوّن الصورة الرمزية', () => {
  const AVATAR = read('src/components/ui/Avatar.tsx');

  test('فشل التحميل يُطبع برابطه في الطرفية', () => {
    assert.match(AVATAR, /onError=\{\(\) => \{/);
    assert.match(
      AVATAR,
      /console\.error\('Avatar load error for URL:', url\)/,
    );
  });

  test('فشل التحميل يعود إلى البديل لا إلى دائرة فارغة', () => {
    assert.match(AVATAR, /setFailed\(true\)/);
    assert.match(AVATAR, /const showImage = Boolean\(url\) && !failed/);
    // البديل: الحرف الأوّل أو أيقونة شخص.
    assert.match(AVATAR, /initialOf\(\{ profileName, metadataName \}\)/);
    assert.match(AVATAR, /<User size=/);
  });

  test('رابط جديد يستحقّ محاولةً جديدة', () => {
    // بدون هذا يلتصق الفشل بالمكوّن فلا تظهر الصورة التالية وإن سلمت.
    assert.match(AVATAR, /useEffect\(\(\) => setFailed\(false\), \[url\]\)/);
  });

  test('الترويسة وشاشة الملف تستعملان المكوّن نفسه', () => {
    const home = read('src/screens/HomeScreen.tsx');
    const profile = read('src/screens/ProfileScreen.tsx');

    assert.match(home, /<Avatar\s+url=\{profile\?\.avatar_url\}/);
    assert.match(profile, /<Avatar\s+url=\{shownAvatar\}/);
    // لا صورة خام بلا بديل في أيٍّ منهما.
    for (const [name, source] of [
      ['HomeScreen', home],
      ['ProfileScreen', profile],
    ] as const) {
      assert.ok(
        !/<Image\s+source=\{\{ uri: (?:profile\?\.avatar_url|shownAvatar)/.test(
          source,
        ),
        `${name} ما زال يرسم الصورة الرمزية بلا بديل`,
      );
    }
  });
});

/**
 * الرابط المحفوظ يصل إلى الحالة فوراً.
 *
 * الترويسة وشاشة الملف تقرآن من مصدرين: الشاشة من حالتها، والترويسة من
 * `useUserProfile` الذي يُعاد جلبه عند كل عودة إلى الشاشة.
 */
describe('وصول الرابط إلى الحالة', () => {
  test('الرفع يعيد العنوان العامّ ويُحفظ في العمود', () => {
    const repo = read('src/lib/repository.ts');
    assert.match(repo, /getPublicUrl\(path\)/);
    assert.match(repo, /if \(!data\?\.publicUrl\)/);
    assert.match(repo, /return data\.publicUrl;/);
    assert.ok(
      /const PROFILE_COLUMNS = \[[\s\S]*?'avatar_url',/.test(repo),
      'avatar_url ليس ضمن الأعمدة المرسَلة',
    );
  });

  test('الشاشة تأخذ ما ردّه الخادم لا ما أرسلته', () => {
    const profile = read('src/screens/ProfileScreen.tsx');
    assert.match(profile, /const saved = await updateUserProfile\(/);
    assert.match(profile, /setSavedAvatar\(saved\.avatar_url\)/);
  });

  test('الترويسة تُعيد الجلب عند كل عودة إلى الشاشة', () => {
    const hook = read('src/hooks/useUserProfile.ts');
    assert.match(hook, /useFocusEffect\(/);
    assert.match(hook, /setProfile\(await fetchUserProfile\(profileId\)\)/);
  });
});
