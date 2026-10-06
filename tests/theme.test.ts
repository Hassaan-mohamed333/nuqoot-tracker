import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '../src/lib/brand.ts';
import { BRAND, palette } from '../src/lib/palette.ts';

const ROOT = path.join(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

/* ------------------------------------------------------------------ */
/* حساب التباين — WCAG 2.1، بلا اعتماد على النظر.                      */
/* ------------------------------------------------------------------ */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  assert.equal(clean.length, 6, `لون غير سداسي: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) =>
    channel(Number.parseInt(clean.slice(i, i + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** نسبة التباين بين لونين، من ‎1:1‎ إلى ‎21:1‎. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** الحدّ الأدنى للنصّ العادي في WCAG AA. */
const AA_TEXT = 4.5;
/** الحدّ الأدنى لحدود عناصر الواجهة ومؤشّراتها (WCAG 1.4.11). */
const AA_UI = 3;

/**
 * اللوحة الكهرمانية.
 *
 * الخطر الذي تحرسه هذه الاختبارات: الأصفر يبدو جميلاً ولا يُقرأ. #F59E0B
 * فوق الأبيض تباينه ‎2.1:1‎ — فأي نصّ أو أيقونة تأخذ `primary` بدل
 * `primary-strong` تختفي عملياً، ولا يكشف ذلك إلا القياس.
 */
describe('تباين اللوحة', () => {
  test('الحساب نفسه صحيح على قيم معروفة', () => {
    assert.equal(contrast('#FFFFFF', '#000000'), 21);
    assert.equal(contrast('#FFFFFF', '#FFFFFF'), 1);
  });

  test('النصّ فوق الزرّ الكهرماني داكن ومقروء', () => {
    const ratio = contrast(palette.primary, palette.onPrimary);
    assert.ok(
      ratio >= AA_TEXT,
      `نصّ الزرّ الرئيسي ${ratio}:1 — دون ${AA_TEXT}:1`,
    );
    // الأبيض هو الخطأ الذي يُرتكب هنا تلقائياً؛ نثبت أنه مرفوض.
    assert.ok(
      contrast(palette.primary, '#FFFFFF') < AA_TEXT,
      'الأبيض صار مقروءاً فوق الكهرماني — راجع القيمة، فهذا غير متوقّع',
    );
  });

  test('الكهرماني الداكن يصلح نصّاً فوق الأسطح الفاتحة', () => {
    for (const surface of [palette.surface, palette.base, palette.surfaceRaised]) {
      const ratio = contrast(palette.primaryStrong, surface);
      assert.ok(
        ratio >= AA_TEXT,
        `primaryStrong فوق ${surface} = ${ratio}:1 — دون ${AA_TEXT}:1`,
      );
    }
  });

  test('الكهرماني الساطع لا يصلح نصّاً — ولهذا يوجد الداكن', () => {
    assert.ok(
      contrast(palette.primary, palette.surface) < AA_TEXT,
      'لو صار primary مقروءاً نصّاً فلا داعي لـ primaryStrong: راجع الفصل',
    );
  });

  test('نصوص الجسم والثانوي والخافت كلها مقروءة', () => {
    for (const [name, color] of [
      ['text', palette.text],
      ['muted', palette.muted],
      ['subtle', palette.subtle],
    ] as const) {
      const ratio = contrast(color, palette.surface);
      assert.ok(ratio >= AA_TEXT, `${name} = ${ratio}:1 — دون ${AA_TEXT}:1`);
    }
  });

  test('ما يُكتب به نصّ يُقرأ فوق الأبيض', () => {
    // هذه وحدها تظهر في `text-*`: الحدّ حدُّ النصّ.
    for (const [name, color] of [
      ['success', palette.success],
      ['danger', palette.danger],
      ['warning', palette.warning],
      ['secondary', palette.secondary],
      ['primaryStrong', palette.primaryStrong],
    ] as const) {
      const ratio = contrast(color, palette.surface);
      assert.ok(ratio >= AA_TEXT, `${name} = ${ratio}:1 — دون ${AA_TEXT}:1`);
    }
  });

  test('ما هو تعبئةٌ أو حدّ يُميَّز عمّا حوله', () => {
    /*
     * `accent` لا يظهر في `text-*` إطلاقاً — تحقّق من ذلك اختبارٌ أدناه —
     * بل حدّاً حول الحاويات وتعبئةً لحبّة التبويب النشط. فحدّه حدُّ عناصر
     * الواجهة ‎3:1‎ لا حدُّ النصّ، وشدُّه إلى ‎4.5:1‎ كان سيُعتم لوناً
     * وظيفتُه أن يُرى لا أن يُقرأ.
     */
    const ratio = contrast(palette.accent, palette.surface);
    assert.ok(ratio >= AA_UI, `accent = ${ratio}:1 — دون ${AA_UI}:1`);
  });

  test('التعبئة الساطعة تستعير حافّتها من الكهرماني الداكن', () => {
    /*
     * #F59E0B فوق الأبيض ‎2.15:1‎: لا يبلغ ‎3:1‎ ولن يبلغها وهو ساطع.
     * فالحافّة تأتي من حدٍّ داكن حوله بدل إعتام اللون نفسه.
     */
    assert.ok(
      contrast(palette.primary, palette.surface) < AA_UI,
      'لو بلغ primary الحدّ وحده فالحدّ حول الزرّ لم يعد ضرورياً',
    );
    assert.ok(contrast(palette.primaryStrong, palette.surface) >= AA_UI);
    assert.match(
      read('src/components/ui/Button.tsx'),
      /primary: 'border border-primary-strong\/\d+ bg-primary'/,
    );
  });

  test('ما يعلو الأسطح الملوّنة يُرى فوقها', () => {
    assert.ok(contrast(palette.secondary, palette.onSecondary) >= AA_TEXT);
    // أيقونة التبويب النشط فوق حبّة كهرمانية: عنصر واجهة لا نصّ.
    assert.ok(contrast(palette.accent, palette.onAccent) >= AA_UI);
  });

  test('لا لونَ كهرمانيّاً يُكتب به نصّ', () => {
    for (const token of ['accent', 'primary'] as const) {
      const files = [
        'src/components/ui/Card.tsx',
        'src/navigation/RootNavigator.tsx',
        'src/components/LedgerSummaryBar.tsx',
      ];
      for (const file of files) {
        assert.ok(
          !new RegExp(`text-${token}(?![\\w-])`).test(read(file)),
          `${file}: text-${token} تباينه دون حدّ النصّ`,
        );
      }
    }
  });

  test('الحدود والأسطح تُميَّز عمّا حولها', () => {
    // حدٌّ لا يُرى لا يفصل شيئاً؛ الحدّ الأدنى هنا أقلّ من حدّ النصّ.
    assert.ok(contrast(palette.border, palette.surface) < AA_UI);
    assert.ok(
      contrast(palette.text, palette.base) >= AA_TEXT,
      'النصّ فوق أرضية التطبيق',
    );
  });

  test('رسم الشارة يُرى فوق لوحها الكهرماني', () => {
    for (const plate of [BRAND.badgeFrom, BRAND.badgeTo]) {
      const ratio = contrast(BRAND.badgeMark, plate);
      assert.ok(ratio >= AA_UI, `رسم الشارة فوق ${plate} = ${ratio}:1`);
    }
  });
});

/**
 * اللوحتان مصدران لنفس الألوان: `global.css` للأصناف، و`palette.ts`
 * لما لا يقبل صنفاً (أيقونات lucide، مؤشّر التحميل، سمة التنقّل).
 * انحرافُ أحدهما يظهر أيقونةً بلونٍ لا يشبه ما حولها.
 */
describe('تطابق اللوحتين', () => {
  const css = read('global.css');

  /** قيمة رمز CSS بصيغة `#RRGGBB`. */
  function cssToken(name: string): string {
    const match = css.match(new RegExp(`--color-${name}:\\s*([\\d ]+);`));
    assert.ok(match, `رمز مفقود في global.css: --color-${name}`);
    const parts = match[1].trim().split(/\s+/).map(Number);
    assert.equal(parts.length, 3, `--color-${name} ليس ثلاثة مكوّنات`);
    return `#${parts.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }

  const PAIRS: ReadonlyArray<readonly [string, string]> = [
    ['primary', palette.primary],
    ['primary-strong', palette.primaryStrong],
    ['on-primary', palette.onPrimary],
    ['accent', palette.accent],
    ['on-accent', palette.onAccent],
    ['secondary', palette.secondary],
    ['success', palette.success],
    ['danger', palette.danger],
    ['warning', palette.warning],
    ['base', palette.base],
    ['surface', palette.surface],
    ['surface-raised', palette.surfaceRaised],
    ['border', palette.border],
    ['text', palette.text],
    ['text-muted', palette.muted],
    ['text-subtle', palette.subtle],
  ];

  for (const [token, value] of PAIRS) {
    test(`--color-${token} يطابق اللوحة`, () => {
      assert.equal(cssToken(token), value.toUpperCase());
    });
  }
});

/**
 * الكهرماني هو الهوية: ما كان يأخذ `primary` لوناً لعنصرٍ فوق سطح فاتح
 * صار يأخذ `primary-strong`. وبقاء `text-primary` في أي ملف يعني نصّاً
 * بتباين ‎2.1:1‎.
 */
describe('استعمال اللوحة في المكوّنات', () => {
  const sources = [
    'src/components/ui/Button.tsx',
    'src/components/ui/Field.tsx',
    'src/components/ui/Avatar.tsx',
    'src/components/LedgerSummaryBar.tsx',
    'src/navigation/RootNavigator.tsx',
    'src/screens/HomeScreen.tsx',
    'src/screens/AuthScreen.tsx',
  ];

  test('لا `text-primary` عارياً في أي مكوّن', () => {
    for (const file of sources) {
      const body = read(file);
      const stray = [...body.matchAll(/text-primary(?![\w-])/g)];
      assert.equal(
        stray.length,
        0,
        `${file}: text-primary تباينه 2.1:1 — استعمل text-primary-strong`,
      );
    }
  });

  test('الزرّ الرئيسي كهرماني بنصّ داكن', () => {
    const button = read('src/components/ui/Button.tsx');
    assert.match(button, /primary: '[^']*\bbg-primary'/);
    assert.match(button, /text-primary-fg/);
  });

  test('حدّ الحقل النشط يُرى', () => {
    // مؤشّر التركيز عنصر واجهة: يلزمه ‎3:1‎، والكهرماني الساطع دونها.
    const field = read('src/components/ui/Field.tsx');
    assert.match(field, /focus\.value > 0\.5\s*\?\s*palette\.primaryStrong/);
    assert.ok(
      contrast(palette.primaryStrong, palette.surface) >= AA_UI,
      'حدّ الحقل النشط لا يُرى فوق الأبيض',
    );
  });

  test('تعبئة الاختيار تبقى ساطعة بعلامةٍ داكنة', () => {
    const selection = read('src/components/ui/Selection.tsx');
    assert.match(selection, /activeColor=\{palette\.primary\}/);
    assert.match(selection, /markColor=\{palette\.onPrimary\}/);
  });

  test('ألوان الشريط مشتقّة من اللوحة لا مكتوبة', () => {
    const ledger = read('src/utils/ledger.ts');
    assert.match(ledger, /color: palette\.success/);
    assert.match(ledger, /color: palette\.danger/);
    assert.ok(
      !/color: '#[0-9A-Fa-f]{6}'/.test(ledger),
      'لونٌ مكتوب يدوياً عاد إلى ledger.ts — سينحرف عن اللوحة',
    );
  });
});

/**
 * الاسم: «الكراسة الصفرا».
 *
 * مصدره `src/lib/brand.ts`. وما لا يستطيع استيراده — app.json والصفحة
 * وملف الويب — يُقارَن به هنا، فانحرافُ أحدها يُسقط الاختبار.
 */
describe('اسم التطبيق', () => {
  test('الاسم معرَّف في موضع واحد', () => {
    assert.equal(APP_NAME, 'الكراسة الصفرا');
    assert.ok(APP_TAGLINE.length > 0);
    assert.ok(APP_DESCRIPTION.length > 0);
  });

  test('app.json يحمل الاسم', () => {
    const app = JSON.parse(read('app.json'));
    assert.equal(app.expo.name, APP_NAME);
  });

  test('عنوان الصفحة ووسوم المشاركة تحمل الاسم', () => {
    const html = read('public/index.html');
    assert.match(html, new RegExp(`<title>${APP_NAME}</title>`));
    for (const tag of [
      `property="og:title" content="${APP_NAME}"`,
      `property="og:site_name" content="${APP_NAME}"`,
      `name="twitter:title" content="${APP_NAME}"`,
      `name="application-name" content="${APP_NAME}"`,
    ]) {
      assert.ok(html.includes(tag), `وسم مفقود: ${tag}`);
    }
    assert.ok(html.includes(APP_DESCRIPTION), 'الوصف لا يطابق brand.ts');
  });

  test('ملف الويب يحمل الاسم واللون والنطاق الفرعي', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    const baseUrl = JSON.parse(read('app.json')).expo.experiments.baseUrl;

    assert.equal(manifest.name, APP_NAME);
    assert.equal(manifest.description, APP_DESCRIPTION);
    assert.equal(manifest.theme_color, palette.primary);
    assert.equal(manifest.background_color, palette.base);
    assert.equal(manifest.dir, 'rtl');
    assert.equal(manifest.lang, 'ar');
    // النشر في مجلد فرعي: بدون البادئة يفتح التطبيق المثبَّت على ٤٠٤.
    assert.equal(manifest.start_url, `${baseUrl}/`);
    assert.equal(manifest.scope, `${baseUrl}/`);
  });

  test('الصفحة تربط ملف الويب بمسارٍ يحمل البادئة', () => {
    const html = read('public/index.html');
    const baseUrl = JSON.parse(read('app.json')).expo.experiments.baseUrl;
    assert.ok(
      html.includes(`<link rel="manifest" href="${baseUrl}/manifest.json" />`),
      'رابط ملف الويب مفقود أو بلا بادئة',
    );
  });

  test('لا اسم قديم باقياً في الواجهة', () => {
    // «نقوط» تبقى اسماً للهدايا في النصوص، لكن لا تبقى اسماً للتطبيق.
    for (const [file, pattern] of [
      ['src/screens/AuthScreen.tsx', /text-display text-ink">نقوط</],
      ['src/components/BiometricGate.tsx', /نقوط مقفل/],
      ['src/lib/biometrics.ts', /افتح نقوط ببصمتك/],
      ['src/components/brand/AppLogo.tsx', /accessibilityLabel="نقوط"/],
    ] as const) {
      assert.ok(!pattern.test(read(file)), `${file}: الاسم القديم باقٍ`);
    }
  });

  test('الاسم يُقرأ من brand.ts لا يُكتب في المكوّنات', () => {
    for (const file of [
      'src/components/brand/AppLogo.tsx',
      'src/components/BiometricGate.tsx',
      'src/screens/AuthScreen.tsx',
      'src/lib/biometrics.ts',
    ]) {
      assert.match(
        read(file),
        /from '@\/lib\/brand'/,
        `${file} لا يستورد الاسم`,
      );
    }
  });
});
