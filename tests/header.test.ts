import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  FALLBACK_NAME,
  displayName,
  greeting,
  initialOf,
} from '../src/lib/displayName.ts';

const ROOT = path.join(import.meta.dirname, '..');

describe('اسم العرض في الترويسة', () => {
  test('اسم الملف أولاً', () => {
    assert.equal(
      displayName({ profileName: 'أحمد حسّان', metadataName: 'Ahmed H' }),
      'أحمد حسّان',
    );
  });

  test('ثم اسم مزوّد الدخول', () => {
    // Google يضع الاسم في user_metadata.full_name.
    assert.equal(
      displayName({ profileName: null, metadataName: 'Ahmed Hassan' }),
      'Ahmed Hassan',
    );
  });

  test('ثم كلمة محايدة', () => {
    assert.equal(displayName({}), FALLBACK_NAME);
    assert.equal(displayName({ profileName: '   ' }), FALLBACK_NAME);
    assert.equal(displayName({ metadataName: 42 }), FALLBACK_NAME);
  });

  test('الاسم يُعقَّم قبل العرض', () => {
    // U+202E يقلب عرض ما بعده: اسمٌ يحمله يظهر للعين غير ما هو مخزَّن.
    assert.equal(displayName({ profileName: '‮أحمد  حسّان ' }), 'أحمد حسّان');
  });

  test('التحية تحمل الاسم', () => {
    assert.equal(greeting({ profileName: 'سامي' }), 'مرحباً سامي');
    assert.match(greeting({}), /مرحباً مستخدم/);
  });

  test('الحرف الأوّل حرفٌ لا رمز', () => {
    assert.equal(initialOf({ profileName: 'أحمد' }), 'أ');
    assert.equal(initialOf({ profileName: 'Ahmed' }), 'A');
    // اسم من رموز محضة: دائرةٌ فارغة تبدو عطباً.
    assert.equal(initialOf({ profileName: '!!!' }), 'م');
    assert.equal(initialOf({}), 'م');
  });
});

describe('الترويسة بعد إعادة البناء', () => {
  const HOME = readFileSync(
    path.join(ROOT, 'src', 'screens', 'HomeScreen.tsx'),
    'utf8',
  );
  const PROFILE = readFileSync(
    path.join(ROOT, 'src', 'screens', 'ProfileScreen.tsx'),
    'utf8',
  );

  test('لا بريد في الترويسة', () => {
    // البريد معرّف حساب لا اسم: يطول فيُقصّ، ويُرى ممّن ينظر إلى الشاشة.
    assert.ok(!HOME.includes('user.email'), 'الترويسة ما زالت تعرض البريد');
    assert.match(HOME, /greeting\(\{/);
  });

  test('الصورة في الترويسة، والحرف الأوّل بديلها', () => {
    // الرسم انتقل إلى مكوّن `Avatar` المشترك: هو من يحمل الصورة والحرف
    // البديل معاً، ويعود إلى الحرف حين يفشل تحميل الرابط كذلك.
    assert.match(HOME, /<Avatar\s+url=\{profile\?\.avatar_url\}/);
    assert.match(HOME, /profileName=\{profile\?\.full_name\}/);

    const AVATAR = readFileSync(
      path.join(ROOT, 'src', 'components', 'ui', 'Avatar.tsx'),
      'utf8',
    );
    assert.match(AVATAR, /initialOf\(\{/);
  });

  test('لا خروج من الترويسة', () => {
    // زرُّ خروجٍ بجانب زرّ إضافةٍ يُضغط بالخطأ، وثمنُه جلسةٌ تُفقد.
    // الاستدعاء لا ذكرُ الاسم: التعليق يشرح لماذا لم يعد هنا.
    for (const pattern of [
      /<LogOut\b/,
      /confirmSignOut\s*\(/,
      /await signOut\(\)/,
      /,\s*signOut\s*\}\s*=\s*useAuth/,
    ]) {
      assert.ok(!pattern.test(HOME), `الترويسة ما زالت تستعمل ${pattern}`);
    }
  });

  test('الخروج في صفحة الحساب', () => {
    assert.match(PROFILE, /async function handleAuthAction/);
    assert.match(PROFILE, /await signOut\(\)/);
    assert.match(PROFILE, /تسجيل الخروج/);
    assert.match(PROFILE, /تسجيل الدخول/);
    // تأكيد قبل الخروج: النسخة المحلية تُمسح معه.
    assert.match(PROFILE, /confirmAction\(\{\s*title: 'تسجيل الخروج'/);
  });
});

describe('قراءة الملفات المحلية على الويب', () => {
  const CSP = readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const FILES = readFileSync(path.join(ROOT, 'src', 'lib', 'files.ts'), 'utf8');

  test('connect-src يسمح بـ blob: و data:', () => {
    /*
     * العطب الذي أوقع «تعذّر الاتصال بالخادم» على رفع الصور: قراءة
     * الملف المنتقى تمرّ بـ `fetch` على عنوان blob:، و`fetch` يخضع لـ
     * `connect-src` لا لـ `img-src`. فيُرفَض بـ "Failed to fetch" الذي
     * يُترجَم رسالة شبكة — والخادم لم يُخاطَب أصلاً.
     */
    // الوسم نفسه لا التعليق فوقه: التعليق يذكر الاسم أيضاً.
    const policy = (CSP.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([\s\S]*?)"/) ?? [])[1] ?? '';
    assert.ok(policy.length > 0, 'لم يُعثر على وسم سياسة المحتوى');
    const directive = (policy.match(/connect-src([^;]*);/) ?? [])[1] ?? '';
    assert.ok(directive.includes('blob:'), 'blob: خارج connect-src');
    assert.ok(directive.includes('data:'), 'data: خارج connect-src');
    assert.ok(
      directive.includes('https://*.supabase.co'),
      'نطاق Supabase سقط من connect-src',
    );
  });

  test('الملف يُقرأ مباشرةً حين يكون بين أيدينا', () => {
    // `expo-image-picker` يعيد `asset.file` على الويب، وقراءته أضمن من
    // جلب عنوان blob: — ولا تمرّ بسياسة المحتوى أصلاً.
    assert.match(FILES, /blob\?: Blob/);
    assert.match(FILES, /if \(blob\) \{/);
  });

  test('فشل القراءة يسمّي السبب لا الشبكة', () => {
    assert.match(FILES, /connect-src/);
  });
});

describe('ضغط الصورة قبل الرفع', () => {
  const COMPRESS = readFileSync(
    path.join(ROOT, 'src', 'lib', 'imageCompress.ts'),
    'utf8',
  );
  const PROFILE = readFileSync(
    path.join(ROOT, 'src', 'screens', 'ProfileScreen.tsx'),
    'utf8',
  );
  const REPO = readFileSync(path.join(ROOT, 'src', 'lib', 'repository.ts'), 'utf8');

  test('خلفيّتان: canvas على الويب والمكتبة على الهاتف', () => {
    assert.match(COMPRESS, /canvas\.toBlob/);
    assert.match(COMPRESS, /expo-image-manipulator/);
    assert.match(COMPRESS, /MAX_AVATAR_EDGE/);
  });

  test('تعذّر الضغط يرفع الأصل لا يُسقط العملية', () => {
    // الضغط تحسينٌ لا شرط: صورةٌ لم تُضغط ترفع أبطأ، وصورةٌ لم تُرفع
    // لا تُعرض — والثاني أسوأ.
    const fn = COMPRESS.slice(COMPRESS.indexOf('export async function compressForUpload'));
    assert.match(fn, /catch \(error\)/);
    assert.match(fn, /readLocalFile\(uri, blob\)/);
  });

  test('الضغط عند الاختيار لا عند الحفظ', () => {
    // عنوان blob: يعيش ما دامت الصفحة، والقراءة المؤجَّلة تمرّ بـ fetch
    // عليه. وإمساك البايتات مبكّراً يُخرج الرفع من ذلك كلّه.
    const fn = PROFILE.slice(
      PROFILE.indexOf('async function useAsset'),
      PROFILE.indexOf('async function pickFromLibrary'),
    );
    assert.match(fn, /await compressForUpload\(/);
    assert.match(fn, /asset as \{ file\?: Blob \}/);
  });

  test('الرفع يقبل بايتات جاهزة ولا يقرأ مرّتين', () => {
    const fn = REPO.slice(
      REPO.indexOf('export async function uploadAvatar'),
      REPO.indexOf('export const LOCAL_PROFILE_ID'),
    );
    assert.match(fn, /prepared\?: \{ bytes: ArrayBuffer; mimeType: string \}/);
    assert.match(fn, /let file = prepared;/);
  });

  test('فشل الرفع يُطبع برمز حالته', () => {
    const fn = REPO.slice(
      REPO.indexOf('export async function uploadAvatar'),
      REPO.indexOf('export const LOCAL_PROFILE_ID'),
    );
    assert.match(fn, /logSupabaseFailure\(/);
    assert.match(fn, /بايت/, 'الحجم غير مذكور، وهو أوّل ما يُشكّ فيه');
  });
});

describe('رسائل التخزين', () => {
  test('كل حالة تُسمّى بعلاجها', async () => {
    // 404 دلوٌ غير موجود، و403 سياسةٌ تمنع، و413 أكبر من الحدّ — وكانت
    // ثلاثتها تُقرأ رسالةً واحدة.
    const { userMessage } = await import('../src/lib/supabaseError.ts');
    assert.match(userMessage({ statusCode: '404', message: 'Bucket not found' }), /دلو/);
    assert.match(userMessage({ statusCode: '403', message: 'new row violates' }), /سياس/);
    assert.match(userMessage({ statusCode: '413', message: 'too large' }), /ميغابايت/);
    assert.match(userMessage({ statusCode: '415', message: 'bad mime' }), /JPEG/);
  });
});
