import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  MODAL_TARGETS,
  SCREEN_TARGETS,
  TOOL_NAMES,
  describeAction,
  parseToolCall,
  requiresConfirmation,
} from '../src/lib/assistantTools.ts';

const ROOT = path.join(import.meta.dirname, '..');

/**
 * ما يصل من الطراز مدخلٌ غير موثوق: قد يهلوس وسيطاً، وقد يوجّهه نصّ
 * مدسوس في كلام المستخدم. هذه الاختبارات تثبّت الحدّ الذي يقف عنده.
 */

describe('تفكيك نداء الأداة — التنقّل', () => {
  test('يقبل وجهة معروفة', () => {
    const result = parseToolCall('navigateTo', { screen: 'contacts' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.action.tool, 'navigateTo');
  });

  test('يرفض وجهة مهلوسة ويسمّي البدائل', () => {
    const result = parseToolCall('navigateTo', { screen: 'AnalyticsDashboard' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /contacts/);
  });

  test('يرفض الوجهة الفارغة أو غير النصّية', () => {
    for (const screen of [undefined, null, 42, '', {}]) {
      assert.equal(parseToolCall('navigateTo', { screen }).ok, false);
    }
  });

  test('دفتر جهة الاتصال يلزمه اسم', () => {
    assert.equal(parseToolCall('navigateTo', { screen: 'contactProfile' }).ok, false);
    assert.equal(
      parseToolCall('navigateTo', {
        screen: 'contactProfile',
        contactName: 'سامي',
      }).ok,
      true,
    );
  });

  test('دفتر المناسبة يلزمه عنوان', () => {
    assert.equal(parseToolCall('navigateTo', { screen: 'eventLedger' }).ok, false);
  });

  test('يعقّم الاسم القادم من الطراز', () => {
    const result = parseToolCall('navigateTo', {
      screen: 'contactProfile',
      contactName: '  سامي   عبدالله  ',
    });
    assert.equal(result.ok, true);
    if (result.ok && result.action.tool === 'navigateTo') {
      assert.equal(result.action.contactName, 'سامي عبدالله');
    }
  });
});

describe('تفكيك نداء الأداة — إنشاء حركة', () => {
  const base = { amount: 500, type: 'expense', contactName: 'سامي' };

  test('يقبل النداء الكامل ويحوّل النوع إلى اتجاه', () => {
    const result = parseToolCall('createTransaction', base);
    assert.equal(result.ok, true);
    if (result.ok && result.action.tool === 'createTransaction') {
      assert.equal(result.action.direction, 'OUT');
      assert.equal(result.action.amount, 500);
    }
  });

  test('يقبل مرادفات الاتجاه التي يميل إليها الطراز', () => {
    const cases: Array<[string, 'IN' | 'OUT']> = [
      ['income', 'IN'],
      ['IN', 'IN'],
      ['received', 'IN'],
      ['expense', 'OUT'],
      ['out', 'OUT'],
      ['paid', 'OUT'],
    ];
    for (const [given, expected] of cases) {
      const result = parseToolCall('createTransaction', { ...base, type: given });
      assert.equal(result.ok, true, `يجب قبول ${given}`);
      if (result.ok && result.action.tool === 'createTransaction') {
        assert.equal(result.action.direction, expected, `${given} -> ${expected}`);
      }
    }
  });

  test('يرفض الاتجاه المجهول بدل تخمينه', () => {
    // التخمين هنا يعني قيد المبلغ في الاتجاه الخاطئ — عكسٌ صامت للرصيد.
    const result = parseToolCall('createTransaction', { ...base, type: 'transfer' });
    assert.equal(result.ok, false);
  });

  test('يرفض المبالغ التي تقبلها Number ضمناً', () => {
    for (const amount of ['0x10', '1e5', -5, 0, '12.345', null, 'خمسمئة']) {
      const result = parseToolCall('createTransaction', { ...base, amount });
      assert.equal(result.ok, false, `يجب رفض ${JSON.stringify(amount)}`);
    }
  });

  test('يرفض الحركة بلا جهة اتصال', () => {
    const result = parseToolCall('createTransaction', {
      amount: 100,
      type: 'income',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /جهة اتصال/);
  });

  test('المبلغ يُقرّب إلى خانتين', () => {
    const result = parseToolCall('createTransaction', { ...base, amount: '12.5' });
    if (result.ok && result.action.tool === 'createTransaction') {
      assert.equal(result.action.amount, 12.5);
    }
  });
});

describe('تفكيك نداء الأداة — النوافذ والأدوات المجهولة', () => {
  test('يقبل فتح المساعد وإغلاقه', () => {
    const open = parseToolCall('toggleModal', { modalName: 'assistant', state: true });
    assert.equal(open.ok, true);
    if (open.ok && open.action.tool === 'toggleModal') {
      assert.equal(open.action.open, true);
    }
  });

  test('يرفض نافذة غير مسجّلة', () => {
    assert.equal(
      parseToolCall('toggleModal', { modalName: 'settings', state: true }).ok,
      false,
    );
  });

  test('يرفض state غير المنطقية', () => {
    assert.equal(
      parseToolCall('toggleModal', { modalName: 'assistant', state: 'yes' }).ok,
      false,
    );
  });

  test('يرفض أداة لا وجود لها', () => {
    const result = parseToolCall('deleteAllTransactions', {});
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /أداة غير معروفة/);
  });
});

describe('بوّابة التأكيد', () => {
  test('ما يكتب يحتاج موافقة', () => {
    const result = parseToolCall('createTransaction', {
      amount: 100,
      type: 'income',
      contactName: 'سامي',
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(requiresConfirmation(result.action), true);
  });

  test('ما لا يكتب لا يحتاجها', () => {
    for (const call of [
      parseToolCall('navigateTo', { screen: 'home' }),
      parseToolCall('toggleModal', { modalName: 'assistant', state: false }),
    ]) {
      assert.equal(call.ok, true);
      if (call.ok) assert.equal(requiresConfirmation(call.action), false);
    }
  });

  test('كل فعل له وصف عربي صالح للعرض', () => {
    const calls = [
      parseToolCall('navigateTo', { screen: 'events' }),
      parseToolCall('createTransaction', {
        amount: 250,
        type: 'expense',
        contactName: 'نورهان',
      }),
      parseToolCall('toggleModal', { modalName: 'assistant', state: false }),
    ];
    for (const call of calls) {
      assert.equal(call.ok, true);
      if (call.ok) {
        const text = describeAction(call.action);
        assert.ok(text.length > 0);
        assert.ok(!text.includes('undefined'), text);
      }
    }
  });
});

describe('العقد بين الجهاز ودالّة الحافة', () => {
  const EDGE = readFileSync(
    path.join(ROOT, 'supabase', 'functions', 'assistant', 'index.ts'),
    'utf8',
  );

  test('أسماء الأدوات متطابقة في الجهتين', () => {
    // انحرافُ اسمٍ هنا يعني أداة يعلنها الخادم ولا يعرفها الجهاز، وهو
    // عطبٌ صامت: النموذج ينادي والجهاز يردّ «أداة غير معروفة».
    for (const name of TOOL_NAMES) {
      assert.ok(
        EDGE.includes(`name: '${name}'`),
        `الأداة ${name} غير معلنة في دالّة الحافة`,
      );
    }
    const declared = [...EDGE.matchAll(/^    name: '([a-zA-Z]+)',$/gm)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      [...declared].sort(),
      [...TOOL_NAMES].sort(),
      'قائمة الأدوات في الحافة تخالف العقد',
    );
  });

  test('كل وجهة في العقد معلنة للطراز', () => {
    for (const screen of Object.keys(SCREEN_TARGETS)) {
      assert.ok(
        EDGE.includes(`'${screen}'`),
        `الوجهة ${screen} غير معلنة في enum الحافة`,
      );
    }
  });

  test('كل نافذة في العقد معلنة للطراز', () => {
    for (const modal of Object.keys(MODAL_TARGETS)) {
      assert.ok(EDGE.includes(`'${modal}'`), `النافذة ${modal} غير معلنة`);
    }
  });

  test('دالّة الحافة تفرض هوية المستخدم وحدّ المعدّل', () => {
    assert.ok(EDGE.includes('requireUser(request)'), 'بلا تحقّق من الجلسة');
    assert.ok(EDGE.includes('enforceUserRateLimit'), 'بلا حدّ معدّل');
  });

  test('لا مفتاح Gemini في شيفرة العميل', () => {
    /*
     * الانحدار الذي يُخشى: نقل نداء Gemini إلى التطبيق «للسرعة».
     *
     * المرصود هو **الوصول** لا ذكر الاسم: قراءة متغيّر بيئة، أو إنشاء
     * عميل، أو نداء واجهة Gemini. أمّا ذكر `GEMINI_API_KEY` داخل رسالة
     * عربية تقول للمستخدم ما ينقص خادمه فليس تسريباً — ومنعُه كان
     * يدفع الرسائل إلى الغموض، وهو العطب الذي نصلحه هنا أصلاً.
     */
    const FORBIDDEN = [
      /process\.env\s*\.\s*GEMINI/,
      /process\.env\s*\[\s*['"`]GEMINI/,
      /Deno\.env/,
      /GoogleGenerativeAI\s*\(/,
      /generativelanguage\.googleapis/,
      /@google\/generative-ai/,
    ];

    for (const file of ['src/lib/gemini.ts', 'src/hooks/useAppAssistant.ts']) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      for (const pattern of FORBIDDEN) {
        assert.ok(
          !pattern.test(source),
          `${file} يلمس مفتاح Gemini أو واجهته مباشرة (${pattern})`,
        );
      }
    }
  });

  test('المفتاح لا يُقرأ إلا في دالّة الحافة', () => {
    // الحدّ الحقيقي: المفتاح يُقرأ في مكان واحد، على الخادم.
    const shared = readFileSync(
      path.join(ROOT, 'supabase', 'functions', '_shared', 'gemini.ts'),
      'utf8',
    );
    assert.match(shared, /Deno\.env\.get\(\s*['"]GEMINI_API_KEY['"]\s*\)/);
  });
});
