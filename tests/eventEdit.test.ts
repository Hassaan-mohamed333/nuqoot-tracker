import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ValidationError } from '../src/lib/validation.ts';
import { validateEventPatch } from '../src/lib/validateEntities.ts';
import { fromDateInputValue, toDateInputValue } from '../src/components/ui/dateValue.ts';

describe('تعديل المناسبة: التحقّق', () => {
  test('تاريخ جديد وحده يكفي، والباقي لا يُمسّ', () => {
    const patch = validateEventPatch({ event_date: '2026-12-31T10:00:00.000Z' });
    assert.deepEqual(Object.keys(patch), ['event_date']);
    assert.ok(patch.event_date?.startsWith('2026-12-31'));
  });

  test('تاريخ فاسد يُرفض برسالة عربية', () => {
    assert.throws(
      () => validateEventPatch({ event_date: 'ليس تاريخاً' }),
      (error: unknown) =>
        error instanceof ValidationError && /تاريخ/.test(error.message),
    );
  });

  test('العنوان لا يصير فارغاً ولا حرفاً واحداً', () => {
    for (const title of ['', ' ', 'أ']) {
      assert.throws(() => validateEventPatch({ title }), ValidationError);
    }
    assert.equal(validateEventPatch({ title: '  فرح   أحمد ' }).title, 'فرح أحمد');
  });

  test('نوع غير معروف يُرفض', () => {
    assert.throws(
      () => validateEventPatch({ event_type: 'party' as never }),
      ValidationError,
    );
    assert.equal(validateEventPatch({ event_type: 'wedding' }).event_type, 'wedding');
  });

  test('إزالة صاحب المناسبة (null) مسموحة، ومعرّف فاسد مرفوض', () => {
    assert.equal(validateEventPatch({ host_contact_id: null }).host_contact_id, null);
    assert.throws(
      () => validateEventPatch({ host_contact_id: "x'; drop table events;--" }),
      ValidationError,
    );
  });

  test('تعديل فارغ مرفوض بدل أن يمرّ بلا أثر', () => {
    assert.throws(() => validateEventPatch({}), ValidationError);
  });

  test('المكان يمكن مسحه', () => {
    const patch = validateEventPatch({ location: '' });
    assert.ok(patch.location === null || patch.location === '');
  });
});

describe('قيمة حقل التاريخ', () => {
  test('تذهب وتعود بنفس اليوم بلا إزاحة منطقة زمنية', () => {
    const date = fromDateInputValue('2026-03-01');
    assert.ok(date);
    assert.equal(toDateInputValue(date), '2026-03-01');
  });

  test('نصٌّ ليس بصيغة التاريخ يُرفض', () => {
    for (const bad of ['', '2026-3-1', '01/03/2026', 'غدا']) {
      assert.equal(fromDateInputValue(bad), null, bad);
    }
  });
});
