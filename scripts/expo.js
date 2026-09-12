#!/usr/bin/env node
/**
 * مُشغّل Expo الذي ينظّف بيئة الصدفة قبل تسليم الأمر.
 *
 * Expo يحمّل ملف .env عبر @expo/env، لكنه **لا يدهس** متغيّراً موجوداً
 * أصلاً في بيئة الصدفة: القاعدة أن البيئة الحقيقية أقوى من الملف. وهي
 * قاعدة صحيحة في النشر، ومُعطِّلة على جهاز التطوير حين تكون البيئة
 * محمّلة سلفاً بقيم نموذجية (your-supabase-id، your-anon-key…): الملف
 * الصحيح يُقرأ ثم يُهمَل، والتطبيق يقلع بمفتاح لا يعمل.
 *
 * ما يفعله هذا المُشغّل: يفحص المتغيّرين قبل الإقلاع، ويحذف من البيئة كل
 * قيمة يثبت فسادها — لا كل قيمة، فبيئةٌ صحيحة يجب أن تبقى أقوى من الملف
 * كما هو متوقّع. بعد الحذف يجد @expo/env الخانة فارغة فيملأها من .env.
 *
 * الفحص نفسه المستعمل داخل التطبيق (src/lib/supabaseConfig.ts)، حتى لا
 * يتفرّق الحكم بين ما يقبله المُشغّل وما تشكو منه الشاشة.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const {
  note,
  loadInspectors,
  readEnvFiles,
  cleanEnvironment,
  reportCleaning,
  fingerprint,
} = require('./env-tools.js');

const ROOT = path.join(__dirname, '..');

/** الأوامر التي تقبل --clear؛ غيرها يُترك كما هو. */
const CLEARABLE = new Set(['start', 'export']);

function needsClear(args) {
  const command = args.find((arg) => !arg.startsWith('-'));
  if (!command || !CLEARABLE.has(command)) return false;
  if (args.includes('--clear') || args.includes('-c')) return false;

  const current = fingerprint(readEnvFiles());
  const stampFile = path.join(ROOT, 'node_modules', '.cache', 'nuqoot-env');

  let previous = null;
  try {
    previous = fs.readFileSync(stampFile, 'utf8').trim();
  } catch {
    // لا بصمة سابقة.
  }

  try {
    fs.mkdirSync(path.dirname(stampFile), { recursive: true });
    fs.writeFileSync(stampFile, current);
  } catch {
    // تعذّر الحفظ: نخسر الرصد في المرّة القادمة لا أكثر.
  }

  // غياب البصمة لا يعني خزناً نظيفاً: قد يكون الخزن أقدم من هذا المُشغّل
  // نفسه، محتفظاً بمفتاح دُمج قبل أن يوجد ما يرصد تغيّره. أوّل تشغيل
  // يمسح مرّة واحدة — بناءٌ بطيء واحد أرخص من مطاردة مفتاح صُحّح في
  // الملف وبقي معطوباً في الحزمة.
  if (previous === null) return true;
  return previous !== current;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('الاستعمال: node scripts/expo.js <أمر expo> [خيارات]');
    process.exit(2);
  }

  const inspectors = loadInspectors();
  if (inspectors) reportCleaning(cleanEnvironment(inspectors));

  const finalArgs = args.slice();
  if (needsClear(finalArgs)) {
    note(
      'قيم الاتصال قد لا تطابق ما في خزن Metro — نمسحه مرّة واحدة. ' +
        '(Metro يدمج EXPO_PUBLIC_* في الحزمة ولا يشمل البيئة في مفتاح الخزن.)',
    );
    finalArgs.push('--clear');
  }

  const child = spawn(
    process.execPath,
    [require.resolve('expo/bin/cli'), ...finalArgs],
    { stdio: 'inherit', env: process.env, cwd: ROOT },
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
  child.on('error', (error) => {
    console.error('[env] تعذّر تشغيل Expo:', error.message);
    process.exit(1);
  });
}

main();
