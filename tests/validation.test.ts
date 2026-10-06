import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  LIMITS,
  checkAmount,
  checkCurrency,
  checkEmail,
  checkIsoDate,
  checkPassword,
  checkRowId,
  checkText,
  sanitizeLine,
  sanitizeMultiline,
  textLength,
} from '../src/lib/validation.ts';

describe('تعقيم النصوص', () => {
  test('يحذف محارف التوجيه ثنائي الاتجاه', () => {
    // U+202E يقلب عرض ما بعده: اسمٌ يحمله يظهر للعين غير ما هو مخزَّن.
    const spoofed = '\u202Eدائن 1000';
    const clean = sanitizeLine(spoofed);
    assert.equal(clean, 'دائن 1000');
    assert.ok(!clean.includes('\u202E'));
  });

  test('يحذف صفر العرض ومحارف التحكّم', () => {
    assert.equal(sanitizeLine('أحمد\u200B'), 'أحمد');
    assert.equal(sanitizeLine('a\u0000b'), 'ab');
  });

  test('يوحّد الفراغ ويقصّ الأطراف', () => {
    assert.equal(sanitizeLine('  سارة   فتحي  '), 'سارة فتحي');
  });

  test('يوحّد إلى NFC فيتساوى شكلا الحرف الواحد', () => {
    const composed = 'أ';
    const decomposed = 'ا' + String.fromCharCode(0x0654);
    assert.equal(sanitizeLine(decomposed), sanitizeLine(composed));
  });

  test('النص متعدّد الأسطر يحتفظ بالفقرات لا بالفراغ المفرط', () => {
    assert.equal(sanitizeMultiline('سطر\n\n\n\nآخر'), 'سطر\n\nآخر');
  });

  test('غير النصّ يعطي نصّاً فارغاً لا استثناءً', () => {
    assert.equal(sanitizeLine(null), '');
    assert.equal(sanitizeLine(42), '');
    assert.equal(sanitizeLine({}), '');
  });

  test('الطول يُقاس بالنقاط الرمزية', () => {
    assert.equal(textLength('👍🏽'), 2);
  });
});

describe('حدود الحقول', () => {
  test('يرفض ما تجاوز الحدّ بدل قصّه صامتاً', () => {
    const result = checkText('full_name', 'م'.repeat(LIMITS.name + 1), {
      label: 'الاسم',
      max: LIMITS.name,
      required: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues[0].code, 'too_long');
  });

  test('الحقل الاختياري الفارغ يصير null لا نصّاً فارغاً', () => {
    const result = checkText('phone', '   ', { label: 'الهاتف', max: 32 });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, null);
  });

  test('الحقل المطلوب الفارغ يُرفض', () => {
    const result = checkText('full_name', '', {
      label: 'الاسم',
      max: 10,
      required: true,
    });
    assert.equal(result.ok, false);
  });
});

describe('المبالغ', () => {
  test('يرفض الصيغ التي تقبلها Number ضمناً', () => {
    // هذه كانت تمرّ عبر Number() فتُخزَّن قيمةٌ غير التي كُتبت.
    for (const bad of ['0x10', '1e5', 'Infinity', '12.345', '-5', '']) {
      assert.equal(checkAmount(bad).ok, false, `يجب رفض ${JSON.stringify(bad)}`);
    }
  });

  test('يقبل الفاصلة العشرية والأرقام العربية', () => {
    const comma = checkAmount('1500,50');
    assert.equal(comma.ok, true);
    if (comma.ok) assert.equal(comma.value, 1500.5);

    const arabic = checkAmount('١٢٠٠');
    assert.equal(arabic.ok, true);
    if (arabic.ok) assert.equal(arabic.value, 1200);
  });

  test('يرفض ما يتجاوز مدى numeric(12,2)', () => {
    const result = checkAmount('99999999999');
    assert.equal(result.ok, false);
  });

  test('يرفض الصفر والسالب', () => {
    assert.equal(checkAmount('0').ok, false);
    assert.equal(checkAmount(-1).ok, false);
  });
});

describe('سياسة كلمة المرور', () => {
  test('يرفض الحدّ القديم ذا الستة محارف', () => {
    const result = checkPassword('123456');
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'too_short'));
  });

  test('يرفض الشائعة ولو كانت طويلة', () => {
    assert.equal(checkPassword('password123').ok, false);
  });

  test('يرفض المحرف الواحد المكرّر', () => {
    const result = checkPassword('aaaaaaaaaaaa');
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'repeated'));
  });

  test('يرفض ما اشتُقّ من البريد', () => {
    const result = checkPassword('sami2024!Xy', { email: 'sami@example.com' });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'contains_email'));
  });

  test('يقبل كلمة قوية ويعطيها درجة', () => {
    const result = checkPassword('Qamar!Layl2026', { email: 'user@example.com' });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.ok(result.score >= 2);
  });

  test('يرفض ما تجاوز الحدّ الأقصى', () => {
    assert.equal(checkPassword('Aa1!'.repeat(40)).ok, false);
  });
});

describe('الحقول المحصورة', () => {
  test('البريد', () => {
    assert.equal(checkEmail('Sami@Example.COM').ok, true);
    const normalized = checkEmail('  Sami@Example.COM  ');
    if (normalized.ok) assert.equal(normalized.value, 'sami@example.com');
    for (const bad of ['', 'sami', 'sami@', '@example.com', 'a b@c.com']) {
      assert.equal(checkEmail(bad).ok, false, `يجب رفض ${JSON.stringify(bad)}`);
    }
  });

  test('العملة ثلاثة حروف لاتينية', () => {
    assert.equal(checkCurrency('egp').ok, true);
    assert.equal(checkCurrency('EGPP').ok, false);
    assert.equal(checkCurrency('ج.م').ok, false);
  });

  test('المعرّف يقبل UUID والمعرّف المحلي ويرفض الحقن', () => {
    assert.equal(
      checkRowId('id', '3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'م').ok,
      true,
    );
    assert.equal(checkRowId('id', 'c_abc123', 'م').ok, true);
    // معرّفات البيانات التجريبية قصيرة؛ رفضُها يكسر الوضع المحلي.
    assert.equal(checkRowId('id', 'c1', 'م').ok, true);
    assert.equal(checkRowId('id', 't10', 'م').ok, true);
    for (const bad of ["1' or '1'='1", '', '../../etc/passwd', 'a b', 'x'.repeat(80)]) {
      assert.equal(checkRowId('id', bad, 'م').ok, false, `يجب رفض ${JSON.stringify(bad)}`);
    }
  });

  test('التاريخ يُرفض خارج النطاق المعقول', () => {
    assert.equal(checkIsoDate('d', '2026-09-18T10:00:00Z', 'ت').ok, true);
    assert.equal(checkIsoDate('d', 'ليس تاريخاً', 'ت').ok, false);
    assert.equal(checkIsoDate('d', '1200-01-01T00:00:00Z', 'ت').ok, false);
  });
});
