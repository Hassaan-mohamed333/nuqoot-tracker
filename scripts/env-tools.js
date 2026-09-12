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

/** ملفات البيئة بترتيب أسبقية Expo: الأخص أولاً. */
const ENV_FILES = ['.env.local', '.env'];

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

/** قيم ملفات البيئة مدموجة بأسبقية Expo. */
function readEnvFiles() {
  const merged = new Map();
  for (const file of ENV_FILES) {
    for (const [key, value] of readEnvFile(file)) {
      if (!merged.has(key)) merged.set(key, value);
    }
  }
  return merged;
}

/**
 * يحذف من البيئة كل قيمة فاسدة، ويعيد وصفاً لما جرى.
 *
 * كل متغيّر يُفحص وحده: الفحص المزدوج يتوقّف عند أوّل عطب، فلا يصلح
 * للحكم على متغيّر بعينه.
 */
function cleanEnvironment(inspectors) {
  const fileValues = readEnvFiles();
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

    const replacement = (fileValues.get(name) ?? '').trim();
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
    const effective = process.env[name] ?? fileValues.get(name) ?? '';
    hash.update(`${name}=${effective}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}


module.exports = {
  CHECKED,
  note,
  loadInspectors,
  readEnvFiles,
  cleanEnvironment,
  reportCleaning,
  fingerprint,
};
