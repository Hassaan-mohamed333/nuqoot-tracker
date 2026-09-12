#!/usr/bin/env node
/**
 * تشخيص إعداد Supabase: ما يمكن قوله محلياً، ثم ما يقوله الخادم.
 *
 * «Invalid API key» من الخادم لا يفرّق بين مفتاحٍ لمشروع آخر، ومفتاحٍ
 * أُبطل، ومشروعٍ موقوف. هذا السكربت يفصل بينها: يقارن معرّف المشروع في
 * العنوان بالمُدّعى في المفتاح دون أي طلب، ثم يسأل الخادم سؤالاً واحداً
 * ويعرض ردّه كما هو.
 *
 * لا يطبع المفتاح ولا أي جزء منه.
 */
const path = require('node:path');

const {
  CHECKED,
  loadInspectors,
  readEnvFiles,
  cleanEnvironment,
} = require('./env-tools.js');

const ROOT = path.join(__dirname, '..');

function line(label, value) {
  console.log(`  ${label.padEnd(28)} ${value}`);
}

/** حمولة JWT دون التحقّق من التوقيع: للقراءة لا للثقة. */
function jwtClaims(key) {
  const segments = key.split('.');
  if (segments.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function resolveEnv() {
  const inspectors = loadInspectors();
  if (inspectors) cleanEnvironment(inspectors);

  const fileValues = readEnvFiles();
  const resolved = {};
  for (const { name } of CHECKED) {
    resolved[name] = (
      process.env[name] ??
      fileValues.get(name) ??
      ''
    ).trim();
  }
  return { resolved, inspectors };
}

async function ask(url, key, pathname) {
  const target = new URL(pathname, url).toString();
  try {
    const response = await fetch(target, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const text = await response.text();
    return { status: response.status, body: text.slice(0, 300) };
  } catch (error) {
    return { status: null, body: String(error && error.message) };
  }
}

/** يترجم ردّ الخادم إلى سبب مرجّح وخطوة تالية. */
function diagnose(status, body) {
  if (status === null) {
    return [
      'لم يُرَدّ على الطلب أصلاً: الخادم غير قابل للوصول من هذه الشبكة.',
      'تحقّق من الاتصال، ومن أن المشروع ليس موقوفاً (Paused) في لوحة التحكم.',
    ];
  }
  if (status >= 200 && status < 300) {
    return ['المفتاح مقبول. المشكلة — إن بقيت — في الحزمة لا في المفتاح.'];
  }
  const lowered = body.toLowerCase();
  if (lowered.includes('invalid api key') || lowered.includes('no api key')) {
    return [
      'الخادم يرفض المفتاح رغم سلامة شكله ومطابقته للمشروع. الأسباب المرجّحة:',
      '  ١. مفاتيح JWT القديمة مُعطّلة في المشروع بعد الانتقال إلى مفاتيح',
      '     sb_publishable_ الجديدة — انسخ المفتاح العام الجديد من صفحة API.',
      '  ٢. المفتاح دُوّر (rotated) بعد نسخه — انسخ القيمة الحالية.',
      '  ٣. المشروع حُذف وأُعيد إنشاؤه بالمعرّف نفسه.',
    ];
  }
  if (status === 404) {
    return [
      'المسار غير موجود: تأكّد أن العنوان جذر المشروع بلا /rest/v1 ولا /auth/v1.',
    ];
  }
  return ['ردّ غير متوقّع — انظر النص أعلاه.'];
}

async function main() {
  const { resolved, inspectors } = resolveEnv();
  const url = resolved.EXPO_PUBLIC_SUPABASE_URL;
  const key = resolved.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  console.log('\nفحص محلي');
  if (!url || !key) {
    line('المتغيّرات', 'ناقصة — لا يمكن المتابعة.');
    line('EXPO_PUBLIC_SUPABASE_URL', url ? 'موجود' : 'مفقود');
    line('EXPO_PUBLIC_SUPABASE_ANON_KEY', key ? 'موجود' : 'مفقود');
    process.exit(1);
  }

  if (inspectors) {
    line('شكل العنوان', inspectors.inspectUrl(url) ?? 'سليم');
    line('شكل المفتاح', inspectors.inspectAnonKey(key) ?? 'سليم');
  }

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    line('العنوان', 'غير قابل للتحليل.');
    process.exit(1);
  }

  // مكدّس Supabase المحلي يعمل على 127.0.0.1 بمفتاحٍ معرّفُه ثابت لا
  // علاقة له بالمضيف، فمقارنة المعرّفين هناك تُنذر بعطب لا وجود له.
  const isLoopback = host === 'localhost' || host === '127.0.0.1';
  const urlRef = host.split('.')[0];
  line('معرّف المشروع في العنوان', isLoopback ? '(مكدّس محلي)' : urlRef);

  if (key.startsWith('sb_publishable_')) {
    line('نوع المفتاح', 'عام جديد (sb_publishable_)');
    line('مطابقة المشروع', 'لا تُقرأ من هذا النوع — يحكم الخادم وحده.');
  } else {
    const claims = jwtClaims(key);
    if (!claims) {
      line('نوع المفتاح', 'JWT غير مقروء الحمولة');
    } else {
      line('نوع المفتاح', 'JWT قديم');
      line('الدور (role)', String(claims.role ?? '(غائب)'));
      line('معرّف المشروع في المفتاح', String(claims.ref ?? '(غائب)'));
      line(
        'انتهاء الصلاحية',
        claims.exp
          ? new Date(claims.exp * 1000).toISOString().slice(0, 10)
          : '(غائب)',
      );
      const matches = isLoopback || claims.ref === urlRef;
      line(
        'المشروعان متطابقان؟',
        isLoopback ? 'لا تُقارن على المكدّس المحلي' : matches ? 'نعم' : '>>> لا — هذا هو العطب',
      );
      if (!matches) {
        console.log(
          '\nالمفتاح يخصّ مشروعاً آخر. انسخ المفتاح من صفحة API للمشروع ' +
            `«${urlRef}» نفسه.\n`,
        );
        process.exit(1);
      }
    }
  }

  console.log('\nسؤال الخادم (GET /auth/v1/settings)');
  const result = await ask(url, key, '/auth/v1/settings');
  line('الحالة', result.status === null ? 'لا ردّ' : String(result.status));
  console.log(`  الردّ: ${result.body.replace(/\s+/g, ' ').slice(0, 200)}`);

  console.log('');
  for (const advice of diagnose(result.status, result.body)) {
    console.log(advice);
  }
  console.log('');

  process.exit(result.status && result.status < 300 ? 0 : 1);
}

void main();
