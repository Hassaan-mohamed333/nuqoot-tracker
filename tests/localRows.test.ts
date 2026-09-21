import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { SEED_CONTACTS, SEED_EVENTS, SEED_TRANSACTIONS } from '../src/data/seed.ts';
import { isRowId, isServerRowId } from '../src/lib/validation.ts';

const ROOT = path.join(import.meta.dirname, '..');
const REPO = readFileSync(path.join(ROOT, 'src', 'lib', 'repository.ts'), 'utf8');

/**
 * صفوفٌ لا توجد على الخادم.
 *
 * العطب: «تعذرت الأرشفة — invalid input syntax for type uuid: "t9"».
 *
 * أعمدة المعرّفات كلها `uuid`. فحين يُرسَل معرّفٌ تجريبي مثل `t9` إلى
 * `.eq('id', …)` لا يردّ PostgreSQL «غير موجود» — بل يرفض الاستعلام قبل
 * تنفيذه بـ 22P02، وهو خطأ صيغةٍ في لغة الاستعلام. ونصُّه يصعد كما هو
 * إلى تنبيهٍ عربيٍّ في وجه المستخدم.
 *
 * ومتى يقع؟ حين يُجرَّب التطبيق بلا حساب فتُزرع البيانات التجريبية، ثم
 * يسجّل المستخدم دخوله ويفشل طلب الخادم مرّةً — فتُعرض النسخة المحلية
 * وفيها `t1..t10`، معروضةً قابلةً للضغط.
 */
describe('تمييز الصفوف المحلية من صفوف الخادم', () => {
  test('UUID وحده معرّفُ خادم', () => {
    for (const id of [
      '0f7a4c1e-9b2d-4a3f-8c11-2d5e6f7a8b9c',
      '0F7A4C1E-9B2D-4A3F-8C11-2D5E6F7A8B9C',
    ]) {
      assert.equal(isServerRowId(id), true, `رُفض UUID صالح: ${id}`);
    }
  });

  test('المعرّفات التجريبية والمحلية ليست معرّفات خادم', () => {
    for (const id of [
      't9',
      't1',
      'c3',
      'e1',
      't_m1abc_x9k2',
      'local',
      '',
      '0f7a4c1e-9b2d-4a3f-8c11-2d5e6f7a8b9', // ناقص خانة
      'not-a-uuid',
    ]) {
      assert.equal(isServerRowId(id), false, `مرّ معرّفٌ ليس UUID: ${id}`);
    }
  });

  test('ما ليس نصّاً ليس معرّفاً', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.equal(isServerRowId(bad), false);
    }
  });

  test('المعرّف المحلي يبقى معرّفاً صالحاً للتخزين', () => {
    // التمييز غرضه توجيه الطلب، لا ردّ الصفّ: `t9` صفٌّ سليم محليّاً.
    for (const id of ['t9', 'c3', 't_m1abc_x9k2']) {
      assert.equal(isRowId(id), true, `رُفض معرّف محلي صالح: ${id}`);
      assert.equal(isServerRowId(id), false);
    }
  });

  test('كل صفّ تجريبي يُصنَّف محليّاً — وهو مصدر العطب', () => {
    const rows = [...SEED_CONTACTS, ...SEED_EVENTS, ...SEED_TRANSACTIONS];
    assert.ok(rows.length > 0, 'لا بيانات تجريبية لتُفحص');
    for (const row of rows) {
      assert.equal(
        isServerRowId(row.id),
        false,
        `صفّ تجريبي معرّفه يشبه UUID: ${row.id}`,
      );
      assert.equal(isRowId(row.id), true, `معرّف تجريبي غير صالح: ${row.id}`);
    }
    // `t9` بعينه هو ما ظهر في التنبيه.
    assert.ok(SEED_TRANSACTIONS.some((row) => row.id === 't9'));
  });
});

/**
 * البوّابة: شرطان لا واحد.
 *
 * كان `usesServerData()` وحده يقرّر إرسال الطلب، وهو يعرف أن هناك جلسة
 * ولا يعرف شيئاً عن الصفّ. فالشرط الثاني — أن يكون المعرّف ممّا يصدره
 * الخادم — هو ما كان ناقصاً.
 */
describe('بوّابة الخادم', () => {
  test('البوّابة تجمع الشرطين', () => {
    const gate = REPO.slice(
      REPO.indexOf('function rowLivesOnServer'),
      REPO.indexOf('function rowLivesOnServer') + 200,
    );
    assert.match(gate, /usesServerData\(\) && isServerRowId\(rowId\)/);
  });

  test('كل استعلام مفتاحُه معرّفُ صفّ يمرّ بالبوّابة', () => {
    /*
     * الحارس الحقيقي لهذا العطب: لا يكفي إصلاح الأرشفة، فالتعديل والحذف
     * والقراءة تُرسل المعرّف نفسه إلى العمود نفسه. أيّ موضع يعود إلى
     * `usesServerData()` وحده يعيد 22P02 من بابٍ آخر.
     */
    for (const [label, anchor] of [
      ['الأرشفة', 'let updated: T | null = null;'],
      ['تعديل الحركة', 'const updated = rowLivesOnServer(transactionId)'],
      ['تعديل جهة الاتصال', 'const updated = rowLivesOnServer(contactId)'],
      ['حذف الحركة', 'export async function deleteTransaction'],
      ['حذف جهة الاتصال', 'export async function deleteContact'],
      ['دفتر المناسبة', 'export async function fetchEventLedger'],
      ['دفتر جهة الاتصال', 'export async function fetchContactLedger'],
    ] as const) {
      const start = REPO.indexOf(anchor);
      assert.ok(start > 0, `لم يُعثر على موضع: ${label}`);
      const body = REPO.slice(start, start + 700);
      assert.ok(
        body.includes('rowLivesOnServer('),
        `${label}: يرسل المعرّف بلا بوّابة — سيعيد 22P02`,
      );
    }
  });

  test('الإدراج ينظر إلى ما يشير إليه الصفّ', () => {
    /*
     * الصفّ الجديد لا معرّف له بعد، لكنه يشير إلى غيره: حركةٌ لها
     * `contact_id`. وإشارةٌ إلى جهة اتصال تجريبية `c3` تُسقط الإدراج
     * بـ 22P02 على عمود المفتاح الأجنبي، لا على المفتاح الأوّلي.
     */
    assert.match(REPO, /function refsLiveOnServer\(/);
    assert.match(
      REPO,
      /refs\.every\(\(ref\) => ref == null \|\| isServerRowId\(ref\)\)/,
    );
    assert.match(REPO, /\[clean\.contact_id, clean\.event_id\],/);
    assert.match(REPO, /\[clean\.host_contact_id\],/);
    assert.match(
      REPO,
      /refsLiveOnServer\(\[clean\.event_id, clean\.payer_participant_id\]\)/,
    );
  });

  test('المرجع الفارغ لا يمنع الإدراج', () => {
    // حركةٌ بلا مناسبة `event_id: null` صالحة تماماً على الخادم.
    const gate = REPO.slice(REPO.indexOf('function refsLiveOnServer'));
    assert.match(gate.slice(0, 300), /ref == null \|\| /);
  });

  test('الأرشفة تكتب محليّاً في كل الأحوال', () => {
    // الصفّ المحلي يُؤرشَف ولا يُرمى: البوّابة توجّه الطلب ولا تُلغي العمل.
    const helper = REPO.slice(
      REPO.indexOf('async function archiveRow'),
      REPO.indexOf('/** يضيف جهة اتصال جديدة. */'),
    );
    const localWrite = helper.indexOf('writeJson(storageKey');
    const gate = helper.indexOf('rowLivesOnServer(rowId)');
    assert.ok(gate > 0 && localWrite > gate, 'الكتابة المحلية ليست بعد البوّابة');
    assert.ok(
      !helper.slice(gate, localWrite).includes('return'),
      'خروجٌ مبكّر قبل الكتابة المحلية يُسقط أرشفة الصفّ المحلي',
    );
  });
});

/**
 * محاكاة البوّابة على القيم نفسها: التوجيه يتبع المعرّف لا الجلسة وحدها.
 */
describe('سلوك البوّابة عند كل حالة', () => {
  const gate = (hasSession: boolean, rowId: string) =>
    hasSession && isServerRowId(rowId);

  const UUID = '0f7a4c1e-9b2d-4a3f-8c11-2d5e6f7a8b9c';

  test('بجلسة وصفٍّ من الخادم: يُرسَل', () => {
    assert.equal(gate(true, UUID), true);
  });

  test('بجلسة وصفٍّ تجريبي: لا يُرسَل — وهذه حالة العطب', () => {
    assert.equal(gate(true, 't9'), false);
  });

  test('بلا جلسة: لا يُرسَل شيء', () => {
    assert.equal(gate(false, UUID), false);
    assert.equal(gate(false, 't9'), false);
  });
});
