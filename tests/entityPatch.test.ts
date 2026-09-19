import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { ValidationError } from '../src/lib/validation.ts';
import {
  validateContactPatch,
  validateTransactionPatch,
} from '../src/lib/validateEntities.ts';

const ROOT = path.join(import.meta.dirname, '..');

/**
 * التعديل الجزئي يختلف عن الإنشاء في قاعدة واحدة تُنسى بسهولة: الحقل
 * الغائب هنا يعني «لا تمسّه» لا «ناقص». هذه الاختبارات تثبّت الفرق، لأن
 * خلطه يعني إمّا رفض كل تعديل جزئي، أو مسح حقول لم يطلب أحد مسحها.
 */

describe('تعديل الحركة جزئياً', () => {
  test('الحقل الغائب لا يظهر في الحمولة', () => {
    const clean = validateTransactionPatch({ amount: 250 });
    assert.deepEqual(Object.keys(clean), ['amount']);
    assert.equal(clean.amount, 250);
  });

  test('يرفض الحمولة الفارغة بدل إرسال update بلا حقول', () => {
    // update بلا حقول يمسّ الصف بلا سبب ويعيده كأن شيئاً تغيّر.
    assert.throws(() => validateTransactionPatch({}), ValidationError);
  });

  test('يرفض المبالغ التي تقبلها Number ضمناً', () => {
    for (const amount of ['0x10', '1e5', -5, 0, 'خمسمئة']) {
      assert.throws(
        () => validateTransactionPatch({ amount: amount as number }),
        ValidationError,
        `يجب رفض ${JSON.stringify(amount)}`,
      );
    }
  });

  test('يرفض اتجاهاً خارج IN/OUT', () => {
    assert.throws(
      () => validateTransactionPatch({ direction: 'TRANSFER' as 'IN' }),
      ValidationError,
    );
  });

  test('يرفض تاريخاً غير صالح ويقبل ISO سليماً', () => {
    assert.throws(
      () => validateTransactionPatch({ occurred_at: 'غداً' }),
      ValidationError,
    );
    const iso = new Date('2024-05-01T10:00:00.000Z').toISOString();
    assert.equal(validateTransactionPatch({ occurred_at: iso }).occurred_at, iso);
  });

  test('null في event_id فكّ ارتباط لا خطأ', () => {
    const clean = validateTransactionPatch({ event_id: null });
    assert.equal(clean.event_id, null);
    assert.ok('event_id' in clean);
  });

  test('الملاحظة تُعقَّم قبل الحفظ', () => {
    // U+202E يقلب عرض ما بعده: ملاحظة تحمله تُقرأ غير ما هي مخزَّنة.
    const clean = validateTransactionPatch({ note: '  ‮دفعت   نقداً  ' });
    assert.equal(clean.note, 'دفعت نقداً');
  });
});

describe('تعديل جهة الاتصال جزئياً', () => {
  test('تعديل الاسم وحده لا يمسّ بقية الحقول', () => {
    const clean = validateContactPatch({ full_name: '  سامي   عبدالله ' });
    assert.deepEqual(Object.keys(clean), ['full_name']);
    assert.equal(clean.full_name, 'سامي عبدالله');
  });

  test('يرفض اسماً أقصر من حرفين', () => {
    assert.throws(
      () => validateContactPatch({ full_name: 'ا' }),
      ValidationError,
    );
    assert.throws(() => validateContactPatch({ full_name: '' }), ValidationError);
  });

  test('null يمسح الحقل الاختياري عن قصد', () => {
    const clean = validateContactPatch({ phone: null, relation: null });
    assert.equal(clean.phone, null);
    assert.equal(clean.relation, null);
  });

  test('يرفض الحمولة الفارغة', () => {
    assert.throws(() => validateContactPatch({}), ValidationError);
  });
});

describe('حذف جهة الاتصال يطابق المفاتيح الأجنبية', () => {
  const SCHEMA = readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const REPO = readFileSync(path.join(ROOT, 'src', 'lib', 'repository.ts'), 'utf8');

  /** ما يتفرّع من deleteContact وحدها، بلا بقيّة الملف. */
  const CASCADE = REPO.slice(REPO.indexOf('export async function deleteContact'));

  test('كل جدول يشير إلى contacts يُعالَج في النسخة المحلية', () => {
    // التخزين المحلي لا يعرف مفاتيح أجنبية: ما لا يُحذف هنا يدوياً يبقى
    // صفاً يتيماً يُحسب في الإجماليات بلا صاحب.
    const referencing = [
      ...SCHEMA.matchAll(
        /^\s+([a-z_]*contact_id) uuid[^\n]*references public\.contacts \(id\) on delete (cascade|set null)/gm,
      ),
    ];
    assert.ok(referencing.length >= 5, 'لم تُقرأ مفاتيح contacts من المخطط');

    for (const key of new Set(referencing.map((match) => match[1]))) {
      assert.ok(
        CASCADE.includes(key),
        `العمود ${key} يشير إلى contacts ولا يعالجه deleteContact محلياً`,
      );
    }
  });

  test('يعالج الجداول الستّة كلها', () => {
    for (const key of [
      'STORAGE_KEYS.contacts',
      'STORAGE_KEYS.transactions',
      'STORAGE_KEYS.events',
      'STORAGE_KEYS.participants',
      'STORAGE_KEYS.sharedExpenses',
      'STORAGE_KEYS.expenseShares',
    ]) {
      assert.ok(CASCADE.includes(key), `${key} غير مشمول في الحذف المحلي`);
    }
  });
});
