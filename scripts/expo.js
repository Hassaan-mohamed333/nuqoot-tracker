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
  CHECKED,
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

/** هل هذا تصديرٌ للويب؟ فحوص النشر أدناه تخصّه وحده. */
function isWebExport(args) {
  const command = args.find((arg) => !arg.startsWith('-'));
  if (command !== 'export') return false;
  if (args.includes('--platform=web')) return true;
  const index = args.indexOf('--platform');
  return index >= 0 && args[index + 1] === 'web';
}

/** مجلد الإخراج كما طُلب، أو dist افتراضاً. */
function outputDir(args) {
  const inline = args.find((arg) => arg.startsWith('--output-dir='));
  if (inline) return inline.slice('--output-dir='.length);
  const index = args.indexOf('--output-dir');
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return 'dist';
}

/** baseUrl المضبوط في app.json، أو '' إن لم يُضبط. */
function configuredBaseUrl() {
  try {
    const app = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'),
    );
    return app?.expo?.experiments?.baseUrl ?? '';
  } catch {
    return '';
  }
}

/**
 * يضمن وجود `public/.nojekyll` قبل التصدير.
 *
 * Expo ينسخ محتوى `public/` كما هو إلى مجلد الإخراج، وهذا الملف الفارغ
 * هو ما يمنع GitHub Pages من تشغيل Jekyll. وJekyll يتجاهل كل مجلد يبدأ
 * اسمه بشرطة سفلية — وحزمة التطبيق كلها تحت `_expo/`، فيصير كل سكربت
 * وكل ورقة أنماط ٤٠٤. ملفٌ فارغ يُحذف بالخطأ بسهولة، فنعيد إنشاءه هنا
 * بدل انتظار أن يكتشف أحدٌ الأمر من موقع أبيض.
 */
function ensureNoJekyll() {
  const file = path.join(ROOT, 'public', '.nojekyll');
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  note('أُنشئ public/.nojekyll (كان مفقوداً).');
}

/**
 * يفحص ناتج تصدير الويب قبل أن يُرفع.
 *
 * السبب من واقعة حقيقية: نُشرت حزمةٌ بُنيت قبل ضبط `baseUrl`، فكانت
 * وسومها تشير إلى `/_expo/...` من جذر النطاق بدل `/nuqoot-tracker/_expo/...`.
 * البناء نجح، والرفع نجح، والموقع كان صفحةً بيضاء وأربعة عشر طلباً
 * فاشلاً. لا شيء في السلسلة كان يشكو. هذا الفحص يجعلها تشكو.
 */
/**
 * القيم العامّة التي يُفترض أن تدخل الحزمة، بعد تنظيف البيئة.
 *
 * تُقرأ بعد `cleanEnvironment`، فما يبقى في `process.env` هو ما سيراه
 * Metro فعلاً، وما عداه يأتي من ملفات البيئة كما يقرؤها Expo.
 */
function expectedPublicValues(mode) {
  const files = readEnvFiles(mode);
  const values = {};
  for (const { name } of CHECKED) {
    const value = process.env[name] ?? files.get(name)?.value ?? '';
    if (value) values[name] = value;
  }
  return values;
}

/** كل حزم JavaScript في ناتج التصدير. */
function bundleFiles(target) {
  const dir = path.join(target, '_expo', 'static', 'js', 'web');
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.js'))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/**
 * هل دخلت قيم الاتصال الحزمةَ فعلاً؟
 *
 * ليست زينة: Metro يدمج `EXPO_PUBLIC_*` في الحزمة عند التحويل **ولا
 * يشمل البيئة في مفتاح خزنه**. فحزمةٌ حُوّلت مرّة بقيمٍ فارغة تبقى
 * فارغة مهما صحّ الملف بعدها، ما لم يُمسح الخزن. وهذا ما وقع: نُشر
 * بناءٌ بلا أي إعداد اتصال، فانفتح الموقع في «الوضع المحلي» بلا تسجيل
 * دخول ولا مزامنة — وكل خطوة في السلسلة كانت تقول «تم».
 *
 * لا تُطبع أي قيمة: الحكم حضورٌ أو غياب، والعنوان نفسه لا يُذكر إلا
 * باسم متغيّره.
 */
function verifyBundledConfig(target, mode) {
  const expected = expectedPublicValues(mode);
  const names = Object.keys(expected);
  // بلا إعداد أصلاً: بناءٌ محلّي مقصود، لا عطب. لا شيء نتحقّق منه.
  if (names.length === 0) return [];

  const files = bundleFiles(target);
  if (files.length === 0) {
    return ['لا حزم JavaScript في الناتج — بناء ناقص.'];
  }

  const sources = files.map((file) => fs.readFileSync(file, 'utf8'));
  const missing = names.filter(
    (name) => !sources.some((source) => source.includes(expected[name])),
  );

  if (missing.length === 0) return [];
  return [
    `${missing.join(' و')} لم تدخل الحزمة رغم وجودها في البيئة. ` +
      'الأرجح خزن Metro قديم — أعد البناء بـ --clear.',
  ];
}

function verifyWebBuild(dir, mode) {
  const target = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  const problems = [];

  if (!fs.existsSync(path.join(target, '.nojekyll'))) {
    problems.push(
      `${dir}/.nojekyll مفقود — سيتجاهل GitHub Pages مجلد _expo/ كاملاً.`,
    );
  }

  const indexFile = path.join(target, 'index.html');
  if (!fs.existsSync(indexFile)) {
    problems.push(`${dir}/index.html مفقود.`);
  } else {
    const html = fs.readFileSync(indexFile, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map(
      (match) => match[1],
    );
    if (refs.length === 0) {
      problems.push(`${dir}/index.html لا يشير إلى أي أصل — بناء ناقص.`);
    }

    const baseUrl = configuredBaseUrl();
    if (baseUrl) {
      const stray = refs.filter((ref) => !ref.startsWith(`${baseUrl}/`));
      if (stray.length) {
        problems.push(
          `الأصول لا تحمل البادئة ${baseUrl} (مثال: ${stray[0]}). ` +
            'ستُطلب من جذر النطاق وتردّ ٤٠٤ على مسار فرعي.',
        );
      }
    }
  }

  problems.push(...verifyBundledConfig(target, mode));

  if (problems.length === 0) return true;

  console.error('[env] حزمة الويب غير صالحة للنشر:');
  for (const problem of problems) console.error(`[env]   • ${problem}`);
  return false;
}

/**
 * الوضع الذي سيعمل به Expo، وهو ما يحدّد أي ملفات بيئة تُقرأ.
 *
 * `expo export` ينتج production والبقية development. نستنتجه هنا لأن
 * NODE_ENV لم يُضبط بعد وقت تشغيلنا، وسلسلة الملفات تختلف بينهما.
 */
function expoMode(args) {
  if (process.env.NODE_ENV) return process.env.NODE_ENV;
  const command = args.find((arg) => !arg.startsWith('-'));
  return command === 'export' ? 'production' : 'development';
}

function needsClear(args) {
  const command = args.find((arg) => !arg.startsWith('-'));
  if (!command || !CLEARABLE.has(command)) return false;
  if (args.includes('--clear') || args.includes('-c')) return false;

  const current = fingerprint(readEnvFiles(expoMode(args)));
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

  const mode = expoMode(args);
  const inspectors = loadInspectors();
  if (inspectors) reportCleaning(cleanEnvironment(inspectors, mode));

  const webExport = isWebExport(args);
  if (webExport) ensureNoJekyll();

  const finalArgs = args.slice();

  /*
   * تصدير الويب يمسح خزن Metro دائماً.
   *
   * `needsClear` يقارن بصمة ملفات البيئة ببصمة آخر تشغيل **لهذا
   * المُشغّل**، فلا يرى ما فعله `npx expo export` المباشر ولا خطوةُ
   * تكامل مستمر ولا أداة أخرى. أيٌّ منها يترك في الخزن تحويلاً بقيمٍ
   * أخرى والبصمة على حالها، فيخرج بناءٌ يبدو سليماً وليس كذلك. والتصدير
   * للويب مقدّمةُ نشرٍ عادةً: دقيقة بناء أرخص من حزمةٍ منشورة خاطئة.
   */
  if (webExport && !finalArgs.includes('--clear') && !finalArgs.includes('-c')) {
    note('تصدير للويب: نمسح خزن Metro لضمان أن الحزمة تطابق البيئة الحالية.');
    finalArgs.push('--clear');
  } else if (needsClear(finalArgs)) {
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
    // الفحص بعد نجاح البناء وحده: البناء الفاشل يشرح نفسه، وإضافة
    // شكوى ثانية فوقه تُخفي السبب الأصلي.
    if (code === 0 && webExport && !verifyWebBuild(outputDir(args), mode)) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
  child.on('error', (error) => {
    console.error('[env] تعذّر تشغيل Expo:', error.message);
    process.exit(1);
  });
}

main();
