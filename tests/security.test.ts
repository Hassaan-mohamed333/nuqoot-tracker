import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY,
  INITIAL_LINK_STATE,
  OTP_LENGTH,
  checkOtp,
  findCountry,
  formatPhone,
  linkReducer,
  toE164,
  type LinkState,
} from '../src/lib/phoneAuth.ts';

const ROOT = path.join(import.meta.dirname, '..');

describe('تطبيع رقم الهاتف', () => {
  test('مصر افتراضاً', () => {
    assert.equal(DEFAULT_COUNTRY.iso, 'EG');
    assert.equal(DEFAULT_COUNTRY.dial, '+20');
  });

  test('صفر البداية يُحذف كما يكتبه المستخدم', () => {
    // المصري يكتب رقمه كما في هاتفه، وE.164 لا تقبل الصفر. رفضُ ما
    // كتبه وتعليمه صيغةً لا يستعملها أسوأ من حذف صفرٍ نعرف معناه.
    const result = toE164('EG', '01012345678');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, '+201012345678');
  });

  test('الأرقام العربية-الهندية والمسافات والشرطات', () => {
    for (const raw of ['٠١٠١٢٣٤٥٦٧٨', '010 123 45678', '010-1234-5678']) {
      const result = toE164('EG', raw);
      assert.equal(result.ok, true, `يجب قبول ${raw}`);
      if (result.ok) assert.equal(result.value, '+201012345678');
    }
  });

  test('الرقم المكتوب بمفتاحه لا يُكرَّر', () => {
    for (const raw of ['+201012345678', '00201012345678', '201012345678']) {
      const result = toE164('EG', raw);
      assert.equal(result.ok, true, `يجب قبول ${raw}`);
      if (result.ok) assert.equal(result.value, '+201012345678');
    }
  });

  test('الطول الخاطئ يُرفض برسالة تذكر العدد', () => {
    for (const raw of ['0101234', '010123456789012', '1']) {
      const result = toE164('EG', raw);
      assert.equal(result.ok, false, `يجب رفض ${raw}`);
      if (!result.ok) assert.match(result.message, /10/);
    }
  });

  test('الفارغ يُرفض', () => {
    assert.equal(toE164('EG', '').ok, false);
    assert.equal(toE164('EG', '   ').ok, false);
  });

  test('كل دولة بطولها', () => {
    const saudi = toE164('SA', '0512345678');
    assert.equal(saudi.ok, true);
    if (saudi.ok) assert.equal(saudi.value, '+966512345678');

    // الطول المصري لا يمرّ على السعودية.
    assert.equal(toE164('SA', '01012345678').ok, false);
  });

  test('دولة مجهولة ترجع إلى الافتراضي بدل أن تنهار', () => {
    assert.equal(findCountry('ZZ').iso, DEFAULT_COUNTRY.iso);
  });

  test('العرض يقسّم الرقم ويُبقي المفتاح', () => {
    const shown = formatPhone('+201012345678');
    assert.ok(shown.startsWith('+20 '));
    assert.ok(shown.includes(' '));
  });

  test('كل دولة لها مفتاح فريد', () => {
    const dials = COUNTRY_CODES.map((country) => country.dial);
    assert.equal(new Set(dials).size, dials.length);
  });
});

describe('رمز التحقّق', () => {
  test('ستّة أرقام تُقبل', () => {
    const result = checkOtp('123456');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, '123456');
  });

  test('الأرقام العربية-الهندية تُقبل', () => {
    const result = checkOtp('١٢٣٤٥٦');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, '123456');
  });

  test('الطول الخاطئ يُرفض', () => {
    for (const raw of ['12345', '1234567', '', 'abcdef']) {
      assert.equal(checkOtp(raw).ok, false, `يجب رفض «${raw}»`);
    }
  });

  test('الطول ثابت في مكان واحد', () => {
    assert.equal(OTP_LENGTH, 6);
  });
});

describe('آلة حالة ربط الهاتف', () => {
  const PHONE = '+201012345678';

  function run(events: Parameters<typeof linkReducer>[1][]): LinkState {
    return events.reduce(linkReducer, INITIAL_LINK_STATE);
  }

  test('المسار الكامل ينتهي بالربط', () => {
    const state = run([
      { type: 'send', phone: PHONE },
      { type: 'sent' },
      { type: 'submit' },
      { type: 'verified' },
    ]);
    assert.equal(state.stage, 'linked');
    assert.equal(state.pendingPhone, PHONE);
    assert.equal(state.error, null);
  });

  test('إرسالٌ ثانٍ أثناء الإرسال لا يُقبل', () => {
    // ضغطتان على «إرسال» كانتا سترسلان رسالتين وتحسبان على المستخدم.
    const sending = run([{ type: 'send', phone: PHONE }]);
    const again = linkReducer(sending, { type: 'send', phone: '+201099999999' });
    assert.equal(again, sending, 'الحالة تغيّرت رغم أن الإرسال جارٍ');
  });

  test('تحقّقٌ ثانٍ أثناء التحقّق لا يُقبل', () => {
    const verifying = run([
      { type: 'send', phone: PHONE },
      { type: 'sent' },
      { type: 'submit' },
    ]);
    assert.equal(linkReducer(verifying, { type: 'submit' }), verifying);
  });

  test('رمز خاطئ يعيد إلى إدخال الرمز لا إلى إدخال الرقم', () => {
    // من أخطأ في الرمز لا يُعاد إليه كتابة رقمه من جديد.
    const state = run([
      { type: 'send', phone: PHONE },
      { type: 'sent' },
      { type: 'submit' },
      { type: 'failed', message: 'الرمز غير صحيح.' },
    ]);
    assert.equal(state.stage, 'awaiting-code');
    assert.equal(state.pendingPhone, PHONE);
    assert.equal(state.error, 'الرمز غير صحيح.');
  });

  test('فشل قبل أي إرسال يبقى في البداية', () => {
    const state = run([{ type: 'failed', message: 'رقم غير صالح.' }]);
    assert.equal(state.stage, 'idle');
    assert.equal(state.pendingPhone, null);
  });

  test('إعادة الإرسال متاحة أثناء انتظار الرمز', () => {
    const waiting = run([{ type: 'send', phone: PHONE }, { type: 'sent' }]);
    const resent = linkReducer(waiting, { type: 'send', phone: PHONE });
    assert.equal(resent.stage, 'sending');
  });

  test('نجاحٌ بعد فشل يمسح الخطأ', () => {
    const state = run([
      { type: 'send', phone: PHONE },
      { type: 'sent' },
      { type: 'submit' },
      { type: 'failed', message: 'خطأ' },
      { type: 'submit' },
      { type: 'verified' },
    ]);
    assert.equal(state.error, null);
  });

  test('reset يعيد كل شيء', () => {
    const state = run([
      { type: 'send', phone: PHONE },
      { type: 'sent' },
      { type: 'reset' },
    ]);
    assert.deepEqual(state, INITIAL_LINK_STATE);
  });
});

describe('نداء Supabase لربط الهاتف', () => {
  const SOURCE = readFileSync(path.join(ROOT, 'src', 'lib', 'phoneAuth.ts'), 'utf8');

  test('الربط يعدّل الحساب القائم لا يُنشئ جلسة', () => {
    // `signInWithOtp` يُنشئ حساباً أو يبدّل الجلسة؛ المطلوب إضافة رقم.
    assert.match(SOURCE, /auth\.updateUser\(\{ phone: e164 \}\)/);
    // النداء لا ذكرُ الاسم: التعليق يشرح لماذا لا نستعمله.
    assert.ok(
      !/auth\.signInWithOtp\s*\(/.test(SOURCE),
      'الربط يُنشئ جلسة بدل أن يعدّل الحساب',
    );
  });

  test('التأكيد بنوع phone_change لا sms', () => {
    // `sms` نوع تسجيل الدخول، ويردّ الخادم عليه بخطأ غامض هنا.
    assert.match(SOURCE, /type: 'phone_change'/);
  });

  test('بلا جلسة لا نداء', () => {
    assert.ok(SOURCE.includes('usesServerData()'));
  });

  test('الفشل يُسجَّل برمزه وتفصيله', () => {
    const calls = SOURCE.match(/logSupabaseFailure/g) ?? [];
    assert.ok(calls.length >= 2, 'مسار فشلٍ بلا تشخيص');
  });
});

describe('القفل الحيوي', () => {
  const BIO = readFileSync(path.join(ROOT, 'src', 'lib', 'biometrics.ts'), 'utf8');
  const HOOK = readFileSync(
    path.join(ROOT, 'src', 'hooks', 'useBiometricLock.ts'),
    'utf8',
  );
  const FLAG = readFileSync(path.join(ROOT, 'src', 'lib', 'secureFlag.ts'), 'utf8');

  test('يفحص العتاد والتسجيل معاً قبل الإتاحة', () => {
    assert.match(BIO, /hasHardwareAsync\(\)/);
    assert.match(BIO, /isEnrolledAsync\(\)/);
  });

  test('لكل تعذّر سببٌ مكتوب لا صمت', () => {
    const native = BIO.slice(
      BIO.indexOf('async function inspectNative'),
      BIO.indexOf('async function promptNative'),
    );
    assert.match(native, /لا يحمل هذا الجهاز مستشعر/);
    assert.match(native, /سجّل بصمتك أو وجهك في إعدادات الجهاز/);
  });

  test('الويب لا يعتمد على المكتبة، بل على WebAuthn', () => {
    // شيمة الويب في expo-local-authentication تعيد hasHardware=false
    // دائماً، وبناء الويب هو ما يُنشر. فالاقتصار عليها ميزةٌ لا تعمل.
    assert.match(BIO, /isUserVerifyingPlatformAuthenticatorAvailable/);
    assert.match(BIO, /navigator\.credentials\.create/);
    assert.match(BIO, /navigator\.credentials\.get/);
    assert.match(BIO, /userVerification: 'required'/);
    assert.match(BIO, /authenticatorAttachment: 'platform'/);
  });

  test('السياق غير الآمن يُكشف قبل الضغط لا بعده', () => {
    // WebAuthn ترفض عنوان IP بـ «invalid domain» عند أوّل تسجيل لا عند
    // الفحص، فبلا هذا الشرط يبدو المفتاح متاحاً ثم يفشل بلا سبب مفهوم.
    const fn = BIO.slice(
      BIO.indexOf('async function inspectWeb'),
      BIO.indexOf('async function enrollWeb'),
    );
    assert.match(fn, /isSecureContext/);
    assert.match(fn, /isIpAddress/);
    assert.match(fn, /https أو localhost/);
  });

  test('الإلغاء ليس عطباً', () => {
    // NotAllowedError تعني الإلغاء أو انتهاء المهلة؛ عرضُها خطأً أحمر
    // يجعل كل تراجعٍ يبدو خللاً.
    assert.match(BIO, /NotAllowedError/);
    assert.match(BIO, /cancelled/);
  });

  test('التفعيل يمرّ بتحقّق ناجح', () => {
    // من لا يستطيع فتح القفل الآن لن يستطيع فتحه بعد الإغلاق، وتفعيلُه
    // له حبسٌ مؤجَّل.
    const fn = HOOK.slice(HOOK.indexOf('const setEnabled = useCallback'));
    assert.ok(fn.includes('await enrollBiometrics()'));
    assert.ok(
      fn.includes('if (!result.ok)'),
      'التفعيل يُحفظ حتى لو فشل التحقّق',
    );
  });

  test('تفضيلٌ مفعَّل على جهاز لم يعد يدعم القفل لا يَحبس صاحبه', () => {
    assert.match(HOOK, /const active = stored && found\.available/);
  });

  test('الإطفاء ينسى اعتماد المتصفّح', () => {
    assert.match(HOOK, /forgetBiometrics\(\)/);
    assert.match(BIO, /removeItem\(WEB_CREDENTIAL_KEY\)/);
  });

  test('إعادة القفل بعد غياب لا عند كل تبديل', () => {
    assert.match(HOOK, /RELOCK_AFTER_MS/);
    assert.match(HOOK, /leftAt\.current === null/);
  });

  test('التخزين آمن على الهاتف ومتاح على الويب', () => {
    assert.match(FLAG, /expo-secure-store/);
    assert.match(FLAG, /Platform\.OS === 'web'/);
    assert.match(FLAG, /localStorage/);
  });

  test('تعذّر القراءة يعني «مطفأ» لا «مقفل»', () => {
    // الافتراض الآمن: لا نقفل التطبيق على صاحبه بسبب تخزين متعذّر.
    const fn = FLAG.slice(
      FLAG.indexOf('export async function readSecureFlag'),
      FLAG.indexOf('export async function writeSecureFlag'),
    );
    assert.match(fn, /return false;/);
  });

  test('الحاجب لا يُتجاوَز بزرّ الرجوع', () => {
    const gate = readFileSync(
      path.join(ROOT, 'src', 'components', 'BiometricGate.tsx'),
      'utf8',
    );
    assert.match(gate, /onRequestClose=\{\(\) => undefined\}/);
    assert.match(gate, /visible=\{lock\.locked\}/);
  });
});

describe('حفظ الملف الشخصي', () => {
  const REPO = readFileSync(path.join(ROOT, 'src', 'lib', 'repository.ts'), 'utf8');
  const SCREEN = readFileSync(
    path.join(ROOT, 'src', 'screens', 'ProfileScreen.tsx'),
    'utf8',
  );

  test('upsert لا update: الصفّ لا يوجد قبل أوّل حفظ', () => {
    const fn = REPO.slice(REPO.indexOf('export async function updateUserProfile'));
    assert.match(fn, /\.upsert\(buildProfilePayload\(userId, patch\), \{ onConflict: 'id' \}\)/);
  });

  test('الجسم يُبنى من قائمة أعمدة صريحة لا بنشر الكائن', () => {
    // `{ id, ...patch }` يرسل كل مفتاح يصل إليه، وأيّ مفتاح لا يقابله
    // عمود يردّ عليه PostgREST بـ PGRST204 ويُفشل الطلب كلّه.
    const fn = REPO.slice(
      REPO.indexOf('const PROFILE_COLUMNS'),
      REPO.indexOf('export async function updateUserProfile'),
    );
    assert.ok(fn.length > 0 && fn.length < 1500, 'حدود القصّ خاطئة');
    for (const column of [
      'full_name',
      'birth_date',
      'avatar_url',
      'phone',
      'currency',
    ]) {
      assert.ok(fn.includes(`'${column}'`), `${column} خارج القائمة`);
    }
    // الإسناد لا ذكرُ الاسم: التعليق يشرح لماذا لا يُرسل من العميل.
    assert.ok(
      !/updated_at\s*:/.test(fn) && !/payload\['updated_at'\]/.test(fn),
      'updated_at يُرسل من العميل بدل المُشغِّل',
    );
    assert.ok(
      REPO.includes('satisfies readonly (keyof UserProfileInput)[]'),
      'القائمة غير مربوطة بالنوع، فينحرف الاسم بلا أن يشكو tsc',
    );
  });

  test('صفر صفوف يُرفض ويُسجَّل', () => {
    const fn = REPO.slice(REPO.indexOf('export async function updateUserProfile'));
    assert.match(fn, /\.maybeSingle\(\)/);
    assert.match(fn, /if \(!row\)/);
    assert.ok(fn.includes('logSupabaseFailure'));
  });

  test('فشل رفع الصورة لا يُسقط حفظ النصّ', () => {
    // الرفع أكثر ما يفشل هنا، وكان فشله يمنع حفظ الاسم وتاريخ الميلاد
    // معهما — فيخسر المستخدم ما كتبه من أجل صورة.
    const fn = SCREEN.slice(
      SCREEN.indexOf('async function resolveAvatarUrl'),
      SCREEN.indexOf('async function handleSave'),
    );
    assert.ok(fn.includes('try {'), 'الرفع بلا try/catch');
    assert.ok(fn.includes('uploadError: error'), 'الفشل يُرمى بدل أن يُبلَّغ');
    assert.ok(
      fn.includes('return { url: savedAvatar'),
      'الفشل يمحو صورةً كانت تعمل',
    );

    const save = SCREEN.slice(SCREEN.indexOf('async function handleSave'));
    assert.ok(
      save.includes('await updateUserProfile(profileId, patch)'),
      'الحفظ لا يجري بعد فشل الرفع',
    );
    assert.match(save, /حُفظت بياناتك، والصورة لا/);
  });

  test('بلا جلسة يُحفظ محلياً', () => {
    // عنوان `data:` لا `blob:`: الثاني يموت مع إعادة تحميل الصفحة.
    assert.match(SCREEN, /toDataUri\(pendingAvatar\.bytes, pendingAvatar\.mimeType\)/);
    const fn = REPO.slice(REPO.indexOf('export async function updateUserProfile'));
    assert.ok(fn.includes('writeJson(STORAGE_KEYS.profile'), 'بلا نسخة محلية');
  });

  test('التشخيص يُطبع ولا يُعرض', () => {
    const helper = readFileSync(
      path.join(ROOT, 'src', 'lib', 'supabaseError.ts'),
      'utf8',
    );
    const fn = helper.slice(helper.indexOf('export function logSupabaseFailure'));
    for (const field of ['code', 'status', 'message', 'details', 'hint']) {
      assert.ok(fn.includes(`line('${field}'`), `${field} غير مطبوع`);
    }
    assert.ok(fn.includes('console.error'), 'لا يُطبع في الطرفية');
    assert.ok(fn.includes('redactText'), 'يُطبع بلا تنقية');
  });
});

describe('عقد أعمدة الملف الشخصي', () => {
  const SCHEMA = readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const TYPES = readFileSync(path.join(ROOT, 'src', 'types', 'index.ts'), 'utf8');
  const REPO = readFileSync(path.join(ROOT, 'src', 'lib', 'repository.ts'), 'utf8');

  /** الأعمدة كما هي في قاعدة البيانات. */
  const COLUMNS = ['full_name', 'birth_date', 'avatar_url', 'phone', 'currency'];

  test('المخطّط والنوع وقائمة الإرسال تتّفق على الأسماء', () => {
    /*
     * العطب الذي أوقع «قاعدة بياناتك أقدم من التطبيق»: الشيفرة كانت
     * ترسل `date_of_birth` وقاعدة البيانات تحمل `birth_date`. ثلاثة
     * مواضع تحمل الأسماء نفسها، وانحرافُ أحدها لا يظهر إلا عند
     * المستخدم — فهذا الاختبار يجعله يظهر هنا.
     */
    const payload = REPO.slice(
      REPO.indexOf('const PROFILE_COLUMNS'),
      REPO.indexOf('export async function updateUserProfile'),
    );

    for (const column of COLUMNS) {
      assert.match(
        SCHEMA,
        new RegExp(`add column if not exists ${column}\\b`),
        `المخطّط بلا ${column}`,
      );
      assert.ok(payload.includes(`'${column}'`), `قائمة الإرسال بلا ${column}`);
    }

    const profileType = TYPES.slice(
      TYPES.indexOf('export interface UserProfile {'),
      TYPES.indexOf('export interface UserProfileInput {'),
    );
    for (const column of COLUMNS) {
      assert.ok(profileType.includes(`${column}:`), `النوع بلا ${column}`);
    }
  });

  test('الاسم القديم لم يبقَ في الشيفرة', () => {
    for (const file of [
      'src/types/index.ts',
      'src/lib/repository.ts',
      'src/lib/validateEntities.ts',
      'src/screens/ProfileScreen.tsx',
    ]) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        !source.includes('date_of_birth'),
        `${file} ما زال يستعمل الاسم القديم`,
      );
    }
  });

  test('رسالة خلل المخطّط تحمل نصّ الخادم لا جملة عامّة', async () => {
    // رسالة PostgREST تسمّي العمود المفقود بالحرف، وهي ما يحسم الأمر
    // لمن شغّل الهجرة وظنّ العطب في التطبيق.
    const { userMessage } = await import('../src/lib/supabaseError.ts');
    const message = userMessage({
      code: 'PGRST204',
      message: "Could not find the 'birth_date' column of 'profiles' in the schema cache",
    });
    assert.match(message, /birth_date/);
    assert.match(message, /profiles/);
    assert.match(message, /schema\.sql/);
  });
});
