import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { parseToolCall, requiresConfirmation } from '../src/lib/assistantTools.ts';
import { foldArabic, parseLocalCommand } from '../src/lib/localIntent.ts';

const ROOT = path.join(import.meta.dirname, '..');

/**
 * المفسّر المحلي.
 *
 * وُجد لأن «سجل 50ج باسم احمد» كان يفشل كلّما لم تكن دالّة الحافة
 * منشورة أو انقطعت الشبكة أو كان التطبيق في الوضع المحلي. هذه
 * الاختبارات تثبّت ما يفهمه، وأهمّ منها: ما يرفض أن يفهمه.
 */

/** يفكّ الأمر إلى فعل متحقَّق منه، كما يفعل الخطّاف تماماً. */
function resolve(text: string) {
  const intent = parseLocalCommand(text);
  if (!intent) return null;
  const parsed = parseToolCall(intent.name, intent.args);
  assert.equal(parsed.ok, true, `رُفض ما فُهم محلياً: ${text}`);
  return parsed.ok ? parsed.action : null;
}

describe('أوامر التسجيل بالعامية', () => {
  test('الأمر الذي كان يفشل: «سجل 50ج باسم احمد»', () => {
    const action = resolve('سجل 50ج باسم احمد');
    assert.ok(action && action.tool === 'createTransaction');
    if (action?.tool === 'createTransaction') {
      assert.equal(action.amount, 50, 'وحدة العملة الملتصقة أفسدت المبلغ');
      assert.equal(action.contactName, 'احمد');
      assert.equal(action.direction, 'OUT');
    }
  });

  test('«سجل 500 لسامي» — لام الجرّ لا لام «سجّل»', () => {
    // العطب الأصلي: نمط اللام التقط لام «سجل» نفسها، فصار الاسم
    // «500 لسامي». حدود الكلمات في JavaScript لا تعمل مع العربية.
    const action = resolve('سجل 500 لسامي');
    if (action?.tool === 'createTransaction') {
      assert.equal(action.contactName, 'سامي');
      assert.equal(action.amount, 500);
    }
  });

  test('الأرقام العربية-الهندية ووحدة العملة المنفصلة', () => {
    const action = resolve('سجل ٧٥٠ جنيه لأحمد');
    if (action?.tool === 'createTransaction') {
      assert.equal(action.amount, 750);
      assert.equal(action.contactName, 'أحمد');
    }
  });

  test('الاتجاه من الفعل', () => {
    const cases: Array<[string, 'IN' | 'OUT']> = [
      ['دفعت 200 لمحمود', 'OUT'],
      ['نقّطت 1000 لبسمة', 'OUT'],
      ['ادي 100 لحسن', 'OUT'],
      ['استلمت 1200 من سارة', 'IN'],
      ['قبضت ٣٠٠ من نورهان', 'IN'],
      ['وصلني 400 من عمر', 'IN'],
    ];
    for (const [text, expected] of cases) {
      const action = resolve(text);
      assert.ok(action, `لم يُفهم: ${text}`);
      if (action?.tool === 'createTransaction') {
        assert.equal(action.direction, expected, text);
      }
    }
  });

  test('«من» تقلب الاتجاه ولو بلا فعل', () => {
    const action = resolve('سجل 300 من سارة');
    if (action?.tool === 'createTransaction') {
      assert.equal(action.direction, 'IN');
      assert.equal(action.contactName, 'سارة');
    }
  });

  test('ذيل الجملة لا يدخل الاسم', () => {
    const action = resolve('سجل 50 باسم احمد نقوط الفرح');
    if (action?.tool === 'createTransaction') {
      assert.equal(action.contactName, 'احمد');
    }
  });

  test('كل ما يُفهم محلياً يمرّ على بوّابة التأكيد', () => {
    // المفسّر المحلي ليس طريقاً أقصر إلى الدفتر: ما يكتب يحتاج موافقة
    // كاقتراح الطراز تماماً.
    const action = resolve('سجل 50 لأحمد');
    assert.ok(action);
    if (action) assert.equal(requiresConfirmation(action), true);
  });
});

describe('ما يرفض المفسّر المحلي فهمه', () => {
  test('الغامض يذهب إلى الطراز لا إلى تخمين محلّي', () => {
    for (const text of [
      'كام رصيدي؟',
      'مرحبا',
      'سجل حاجة',
      'ايه اللي حصل الشهر ده',
      'احمد',
      '',
      '   ',
    ]) {
      assert.equal(
        parseLocalCommand(text),
        null,
        `كان يجب ترك «${text}» للطراز`,
      );
    }
  });

  test('رقم بلا اسم لا يكفي', () => {
    assert.equal(parseLocalCommand('سجل 500'), null);
  });

  test('اسم بلا رقم لا يكفي', () => {
    assert.equal(parseLocalCommand('سجل لأحمد'), null);
  });

  test('المبالغ غير المقبولة يرفضها التحقّق لا المفسّر', () => {
    // المفسّر يلتقط الرقم، و`parseToolCall` هو من يحكم عليه — طبقتان
    // لا واحدة، فلا يصل إلى الدفتر مبلغٌ لم يمرّ على `checkAmount`.
    const intent = parseLocalCommand('سجل 0 لأحمد');
    if (intent) {
      assert.equal(parseToolCall(intent.name, intent.args).ok, false);
    }
  });
});

describe('توحيد الحروف العربية', () => {
  test('صور الألف والياء والتاء المربوطة تتوحّد', () => {
    assert.equal(foldArabic('أحمد'), foldArabic('احمد'));
    assert.equal(foldArabic('إيمان'), foldArabic('ايمان'));
    assert.equal(foldArabic('سارة'), foldArabic('ساره'));
    assert.equal(foldArabic('مصطفى'), foldArabic('مصطفي'));
  });

  test('التشكيل والتطويل يُحذفان', () => {
    assert.equal(foldArabic('نقَّطــت'), 'نقطت');
  });
});

describe('التنقّل المحلي', () => {
  test('أوامر الفتح الشائعة', () => {
    const cases: Array<[string, string]> = [
      ['افتح جهات الاتصال', 'contacts'],
      ['اعرض المناسبات', 'events'],
      ['روح الرئيسية', 'home'],
    ];
    for (const [text, screen] of cases) {
      const action = resolve(text);
      assert.ok(action, `لم يُفهم: ${text}`);
      if (action?.tool === 'navigateTo') assert.equal(action.screen, screen);
    }
  });

  test('التنقّل لا يحتاج تأكيداً', () => {
    const action = resolve('افتح جهات الاتصال');
    if (action) assert.equal(requiresConfirmation(action), false);
  });
});

describe('المساعد يعمل بلا خادم', () => {
  const HOOK = readFileSync(
    path.join(ROOT, 'src', 'hooks', 'useAppAssistant.ts'),
    'utf8',
  );
  const GEMINI = readFileSync(path.join(ROOT, 'src', 'lib', 'gemini.ts'), 'utf8');

  test('المفسّر المحلي يُجرَّب قبل نداء الشبكة', () => {
    const send = HOOK.slice(HOOK.indexOf('const send = useCallback'));
    const localAt = send.indexOf('parseLocalCommand');
    const remoteAt = send.indexOf('runTurn([{ role');
    assert.ok(localAt > 0, 'المفسّر المحلي غير مستعمل في send');
    assert.ok(
      localAt < remoteAt,
      'نداء الشبكة يسبق المفسّر المحلي، فيفشل الأمر بلا خادم',
    );
  });

  test('مدخل المساعد لا يختفي في الوضع المحلي', () => {
    assert.match(
      GEMINI,
      /export function isAssistantAvailable\(\): boolean \{\s*return true;/,
      'الزرّ يختفي بلا خادم رغم أن الأوامر الشائعة تعمل محلياً',
    );
  });

  test('الاسم المجهول يُنشأ ولا يُرفض', () => {
    assert.ok(
      HOOK.includes('await addContact({ full_name: action.contactName })'),
      'الحركة تُلغى عند غياب جهة الاتصال بدل إنشائها',
    );
    assert.ok(
      HOOK.includes("' (جهة اتصال جديدة)'"),
      'الإنشاء التلقائي لا يُذكر في بطاقة التأكيد',
    );
  });

  test('الفشل يُعرض بسببه لا برسالة عامّة', () => {
    assert.ok(
      !HOOK.includes("'تعذّر تنفيذ الإجراء.'"),
      'ما زالت هناك رسالة عامّة تبتلع سبب الفشل',
    );
    assert.match(HOOK, /setStatus\(id, 'failed', userMessage\(error\)\)/);
  });
});
