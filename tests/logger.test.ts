import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { redact, redactText } from '../src/lib/logger.ts';

/**
 * الاختبارات تعمل تحت node حيث `__DEV__` غير معرّف، أي في وضع الإنتاج —
 * وهو بالضبط الوضع الذي يهمّ التحقّق منه: ما الذي يظهر على جهاز مستخدم.
 */

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFub24ifQ' +
  '.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('تنقية النصوص', () => {
  test('يُخفي رمز JWT كاملاً', () => {
    const out = redactText(`token=${JWT} end`);
    assert.ok(!out.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    assert.ok(out.includes('[redacted:jwt]'));
  });

  test('يُخفي مفاتيح Supabase الحديثة', () => {
    const secret = 'sb_secret_' + 'AbCdEfGhIjKlMnOp';
    const publishable = 'sb_publishable_' + 'QrStUvWxYz012345';
    const out = redactText(`${secret} و ${publishable}`);
    assert.ok(!out.includes('AbCdEfGhIjKlMnOp'));
    assert.ok(!out.includes('QrStUvWxYz012345'));
  });

  test('يُخفي البريد والهاتف', () => {
    const out = redactText('راسل sami@example.com أو 01001234567');
    assert.ok(!out.includes('sami@example.com'));
    assert.ok(!out.includes('01001234567'));
  });

  test('يُخفي المعاملات الحسّاسة داخل عنوان ويُبقي بنيته', () => {
    const out = redactText('https://x.supabase.co/cb?code=abc123&state=zz');
    assert.ok(!out.includes('abc123'));
    assert.ok(out.includes('https://x.supabase.co/cb?code='));
  });

  test('لا يمسّ النصّ البريء', () => {
    assert.equal(redactText('فشل تحميل الدفتر'), 'فشل تحميل الدفتر');
  });
});

describe('تنقية الكائنات', () => {
  test('يستبدل قيم الحقول الحسّاسة مهما كانت صورة الاسم', () => {
    const out = redact({
      access_token: 'aaa',
      refreshToken: 'bbb',
      'API-KEY': 'ccc',
      Authorization: 'Bearer ddd',
      password: 'eee',
      note: 'حركة عادية',
    }) as Record<string, unknown>;

    for (const key of [
      'access_token',
      'refreshToken',
      'API-KEY',
      'Authorization',
      'password',
    ]) {
      assert.equal(out[key], '[redacted]', `الحقل ${key} لم يُستبدل`);
    }
    assert.equal(out.note, 'حركة عادية');
  });

  test('ينقّي الحقول المتداخلة', () => {
    const out = redact({
      response: { data: { session: { access_token: 'x' } } },
    }) as { response: { data: { session: unknown } } };
    assert.equal(out.response.data.session, '[redacted]');
  });

  test('يوقف العمق فلا يطبع كائناً لا نهائي التداخل', () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 12; i += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    const printed = JSON.stringify(redact(deep));
    assert.ok(printed.includes('[depth-limit]'));
  });

  test('يقصّ المصفوفات الطويلة', () => {
    const out = redact(Array.from({ length: 50 }, (_, i) => i)) as unknown[];
    assert.ok(out.length <= 21);
    assert.ok(String(out[out.length - 1]).includes('+30'));
  });

  test('الخطأ يفقد أثر النداء في الإنتاج', () => {
    const error = new Error(`فشل مع الرمز ${JWT}`);
    const out = redact(error) as Record<string, unknown>;
    assert.equal(out.name, 'Error');
    assert.ok(!String(out.message).includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
    // الأثر يكشف بنية الجهاز، فلا يخرج خارج التطوير.
    assert.equal(out.stack, undefined);
  });

  test('يقصّ النصوص الطويلة جداً', () => {
    const out = redact('ط'.repeat(2000)) as string;
    assert.ok(out.length < 600);
  });

  test('يتعامل مع القيم البدائية بلا استثناء', () => {
    assert.equal(redact(null), null);
    assert.equal(redact(undefined), undefined);
    assert.equal(redact(7), 7);
    assert.equal(redact(true), true);
    assert.equal(redact(() => undefined), '[function]');
  });
});
