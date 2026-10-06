/**
 * أدوات البيئة المشتركة بين مُشغّل Expo وسكربت التشخيص.
 *
 * موضعها هنا لا في أحدهما حتى لا يتفرّق حكمان على القيمة نفسها: ما يحذفه
 * المُشغّل هو ما يشكو منه التشخيص بالضبط.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** المتغيّران اللذان يُفحصان، وباسم الفاحص الخاص بكلٍّ منهما. */
const CHECKED = [
  { name: 'EXPO_PUBLIC_SUPABASE_URL', inspector: 'inspectUrl' },
  { name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', inspector: 'inspectAnonKey' },
];

/**
 * ملفات البيئة بترتيب أسبقية Expo: الأخصّ أولاً، وأوّل ملف يعرّف المتغيّر
 * يفوز.
 *
 * `.env` آخر القائمة لا أوّلها: ملف `.env.local` أو `.env.development`
 * متروك من تجربة سابقة يحجب تصحيحك في `.env` حجباً تامّاً وصامتاً.
 *
 * الوضع يتبع NODE_ENV كما يحدّده أمر Expo نفسه: `expo export` ينتج
 * production و`expo start` ينتج development، فلكلٍّ سلسلة ملفات مختلفة.
 */
function envFileOrder(mode = process.env.NODE_ENV || 'development') {
  return [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env'];
}

function note(message) {
  console.log(`[env] ${message}`);
}

/**
 * يحمّل الفاحص من مصدر التطبيق مباشرة.
 *
 * Node ≥ 22.18 يجرّد أنواع TypeScript عند الاستيراد، فلا حاجة لخطوة بناء
 * ولا لنسخة ثانية من المنطق. وعلى إصدار أقدم نمضي بلا تنظيف بدل أن
 * نُسقط الأمر: التطبيق نفسه سيشرح الخلل في لافتة شاشة الدخول.
 */
function loadInspectors() {
  try {
    const { inspectUrl, inspectAnonKey } = require(
      path.join(ROOT, 'src', 'lib', 'supabaseConfig.ts'),
    );
    return { inspectUrl, inspectAnonKey };
  } catch (error) {
    note(
      `تعذّر تحميل فاحص الإعداد (${process.version}؛ يلزم Node 22.18 فأحدث). ` +
        'سنمضي بلا تنظيف للبيئة.',
    );
    note(String(error && error.message ? error.message : error));
    return null;
  }
}

/**
 * قراءة مبسّطة لملف بيئة: KEY=VALUE، مع تجاهل التعليقات والفراغ.
 *
 * لا نستدعي dotenv لأن الغرض معرفة ما *سيملأ* الخانة بعد الحذف، لا
 * تحميلها الآن — التحميل شغل @expo/env وحده.
 */
function readEnvFile(file) {
  const values = new Map();
  let text;
  try {
    text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return values;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!values.has(key)) values.set(key, value);
  }
  return values;
}

/**
 * قيم ملفات البيئة مدموجة بأسبقية Expo.
 *
 * كل قيمة مقرونة بالمسار المطلق للملف الذي جاءت منه: بدونه يصير السؤال
 * «من أين جاءت هذه القيمة؟» بلا جواب، وهو أوّل سؤال عند تصحيحٍ لا أثر له.
 */
function readEnvFiles(mode) {
  const merged = new Map();
  for (const file of envFileOrder(mode)) {
    const absolute = path.join(ROOT, file);
    for (const [key, value] of readEnvFile(file)) {
      if (!merged.has(key)) merged.set(key, { value, file, absolute });
    }
  }
  return merged;
}

/**
 * كل ملف بيئة موجود في جذر المشروع، لا الداخل في السلسلة وحده.
 *
 * ملفٌ خارج السلسلة (مثل `.env.production` أثناء `expo start`) لا يقرأه
 * Expo الآن لكنه يقرأه في أمر آخر، ورؤيته تمنع مطاردة الوهم في الاتجاهين.
 */
function listEnvFiles(names, mode) {
  const chain = envFileOrder(mode);
  let present;
  try {
    present = fs
      .readdirSync(ROOT)
      .filter((entry) => entry === '.env' || entry.startsWith('.env.'));
  } catch {
    present = [];
  }

  const all = [...new Set([...chain, ...present])];
  return all.map((file) => {
    const absolute = path.join(ROOT, file);
    const exists = fs.existsSync(absolute);
    const values = exists ? readEnvFile(file) : new Map();
    return {
      file,
      absolute,
      exists,
      // `.env.example` ليس ملف بيئة يُحمَّل، لكنه يظهر في السرد فلا يُربك.
      inChain: chain.includes(file),
      precedence: chain.indexOf(file),
      defines: names.filter((name) => values.has(name)),
    };
  });
}

/**
 * يحذف من البيئة كل قيمة فاسدة، ويعيد وصفاً لما جرى.
 *
 * كل متغيّر يُفحص وحده: الفحص المزدوج يتوقّف عند أوّل عطب، فلا يصلح
 * للحكم على متغيّر بعينه.
 */
function cleanEnvironment(inspectors, mode) {
  const fileValues = readEnvFiles(mode);
  const dropped = [];
  const kept = [];

  for (const { name, inspector } of CHECKED) {
    const inspect = inspectors[inspector];
    const shellValue = (process.env[name] ?? '').trim();
    if (!shellValue) continue;

    const issue = inspect(shellValue);
    if (issue === null) {
      kept.push(name);
      continue;
    }

    delete process.env[name];

    const replacement = (fileValues.get(name)?.value ?? '').trim();
    const replacementIssue = replacement ? inspect(replacement) : 'missing';
    dropped.push({ name, issue, replacementIssue });
  }

  return { dropped, kept };
}

function reportCleaning({ dropped, kept }) {
  for (const name of kept) {
    note(`${name}: قيمة الصدفة سليمة، أُبقيت (البيئة أقوى من .env).`);
  }

  for (const { name, issue, replacementIssue } of dropped) {
    note(`${name}: قيمة الصدفة مرفوضة (${issue}) — حُذفت قبل الإقلاع.`);
    if (replacementIssue === null) {
      note(`${name}: ستُقرأ القيمة الصحيحة من ملف .env.`);
    } else if (replacementIssue === 'missing') {
      note(
        `${name}: ولا بديل لها في .env — سيعمل التطبيق بالبيانات المحلية.`,
      );
    } else {
      note(
        `${name}: والبديل في .env مرفوض أيضاً (${replacementIssue}) — ستظهر لافتة الإعداد.`,
      );
    }
  }
}

/**
 * بصمة القيم الفعّالة، بلا كشفها.
 *
 * Metro يُدمج قيم EXPO_PUBLIC_* داخل الحزمة ويخزّن ناتج التحويل، ومفتاح
 * الخزن لا يشمل البيئة: تصحيحُ مفتاحٍ في .env وحده لا يُبطل النسخة
 * القديمة، فيقلع التطبيق بالمفتاح المعطوب ويبدو التصحيح بلا أثر. نرصد
 * التغيّر هنا ونطلب مسح الخزن مرّة واحدة عنده.
 */
function fingerprint(fileValues) {
  const hash = crypto.createHash('sha256');
  for (const { name } of CHECKED) {
    const effective = process.env[name] ?? fileValues.get(name)?.value ?? '';
    hash.update(`${name}=${effective}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}


/**
 * وصفٌ آمن لقيمة سرّية: بادئتها وطولها وبصمتها، لا القيمة.
 *
 * البادئة وحدها تميّز نوع المفتاح (`eyJ` قديم، `sb_publishable_` جديد)،
 * والبصمة تكفي لمطابقة ما في الملف بما دخل الحزمة دون كشف أيّهما.
 */
function describeSecret(value, prefixLength = 12) {
  if (!value) return '(فارغ)';

  // علامة النوع ثابتة لا سرّ فيها، فتُعرض كاملة مع أربعة أحرف تكفي
  // لمطابقة المفتاح بما في لوحة التحكم. والمفتاح السرّي لا يُعرض منه شيء
  // بعد علامته: عرضُه هنا خطأ يُصلَح لا يُوثَّق.
  let prefix;
  if (value.startsWith('sb_secret_')) {
    prefix = 'sb_secret_';
  } else if (value.startsWith('sb_publishable_')) {
    prefix = value.slice(0, 'sb_publishable_'.length + 4);
  } else {
    prefix = value.slice(0, prefixLength);
  }
  const digest = crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, 8);
  return `${prefix}… (الطول ${value.length}، البصمة ${digest})`;
}

module.exports = {
  CHECKED,
  note,
  loadInspectors,
  envFileOrder,
  readEnvFile,
  readEnvFiles,
  listEnvFiles,
  cleanEnvironment,
  reportCleaning,
  fingerprint,
  describeSecret,
};
