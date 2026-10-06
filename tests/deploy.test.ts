import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');

const PACKAGE = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

const APP = JSON.parse(readFileSync(path.join(ROOT, 'app.json'), 'utf8')) as {
  expo: { experiments?: { baseUrl?: string } };
};

/**
 * إعداد النشر على GitHub Pages.
 *
 * ثلاثة أعطال وقعت فعلاً، وكلّها صامتة — البناء ينجح والرفع ينجح
 * والموقع صفحة بيضاء:
 *   ١. Jekyll يتجاهل كل مجلد يبدأ بشرطة سفلية، والحزمة كلها في _expo/.
 *   ٢. gh-pages لا يرفع الملفات المخفية بلا `-t`، ومنها `.nojekyll` نفسه.
 *   ٣. حزمة بُنيت بلا baseUrl تشير إلى جذر النطاق لا إلى المسار الفرعي.
 */

describe('نشر الويب على GitHub Pages', () => {
  test('سكربت النشر موجود ويمرّ على مُشغّل البيئة', () => {
    const script = PACKAGE.scripts['deploy:web'];
    assert.ok(script, 'السكربت deploy:web غير موجود');
    assert.match(
      script,
      /scripts\/expo\.js export --platform web/,
      'التصدير يتخطّى المُشغّل، فتضيع فحوص الحزمة وتنظيف البيئة',
    );
    assert.match(script, /gh-pages/, 'السكربت لا يرفع شيئاً');
  });

  test('كل أمر gh-pages يحمل -t', () => {
    // بلا -t لا يُرفع `.nojekyll`، فيعود العطب الأول كما هو.
    const commands = Object.entries(PACKAGE.scripts).filter(([, value]) =>
      value.includes('gh-pages'),
    );
    assert.ok(commands.length > 0, 'لا أمر نشر في package.json');
    for (const [name, value] of commands) {
      assert.match(value, /\s-t(\s|$)/, `السكربت ${name} بلا -t`);
    }
  });

  test('gh-pages ضمن devDependencies', () => {
    assert.ok(
      PACKAGE.devDependencies['gh-pages'],
      'gh-pages غير مُعلَنة، فالنشر يعتمد على حزمة قد لا تُثبَّت',
    );
  });

  test('baseUrl مضبوط، فالموقع يُخدَم من مسار فرعي لا من جذر نطاق', () => {
    assert.equal(APP.expo.experiments?.baseUrl, '/nuqoot-tracker');
  });

  test('public/.nojekyll متتبَّع في Git', () => {
    // ملف فارغ يسهل فقدانه، ووجوده في العمل وحده لا يكفي: النشر يبني
    // من نسخة نظيفة.
    const tracked = execFileSync('git', ['ls-files', 'public/.nojekyll'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    assert.equal(tracked, 'public/.nojekyll');
  });

  test('المُشغّل يفحص الحزمة قبل النشر', () => {
    const runner = readFileSync(path.join(ROOT, 'scripts', 'expo.js'), 'utf8');
    assert.match(runner, /function verifyWebBuild/);
    assert.match(runner, /function ensureNoJekyll/);
    assert.match(runner, /function verifyBundledConfig/);
    assert.ok(
      runner.includes('if (code === 0 && webExport && !verifyWebBuild('),
      'الفحص معرَّف ولا يُستدعى بعد البناء',
    );
  });

  test('تصدير الويب يمسح خزن Metro دائماً', () => {
    // العطب الرابع، وهو الذي نُشر فعلاً: Metro يدمج EXPO_PUBLIC_* عند
    // التحويل ولا يشمل البيئة في مفتاح خزنه، فحزمةٌ حُوّلت مرّة بقيمٍ
    // فارغة تبقى فارغة مهما صحّ الملف بعدها. ومقارنة بصمة ملفات البيئة
    // لا ترى ما فعله `npx expo export` المباشر بالخزن.
    const runner = readFileSync(path.join(ROOT, 'scripts', 'expo.js'), 'utf8');
    assert.ok(
      /if \(webExport && !finalArgs\.includes\('--clear'\)/.test(runner),
      'تصدير الويب قد يستعمل خزناً قديماً',
    );
  });

  test('الفحص لا يطبع أي قيمة اتصال', () => {
    // الحكم حضورٌ أو غياب: طباعة المفتاح في سجل بناء عام تسرّبه.
    const runner = readFileSync(path.join(ROOT, 'scripts', 'expo.js'), 'utf8');
    const check = runner.slice(
      runner.indexOf('function verifyBundledConfig'),
      runner.indexOf('function verifyWebBuild'),
    );
    assert.ok(check.length > 0, 'verifyBundledConfig غير موجودة');
    assert.ok(
      !/expected\[[^\]]*\]\s*\}?`/.test(check) &&
        !check.includes('${expected['),
      'الفحص يُقحم قيمة الاتصال في رسالة',
    );
  });
});
