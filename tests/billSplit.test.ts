import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  SPLIT_MODES,
  billableShares,
  computeSplit,
  ownShare,
  seedInputs,
  type SplitInputs,
  type SplitParticipant,
} from '../src/lib/billSplit.ts';

const ROOT = path.join(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

const ME: SplitParticipant = {
  key: 'self',
  contactId: null,
  name: 'أنا',
  isSelf: true,
};

function person(key: string, name = key): SplitParticipant {
  return { key, contactId: key, name, isSelf: false };
}

function guest(key: string, name: string): SplitParticipant {
  return { key, contactId: null, name, isSelf: false };
}

function inputs(pairs: Record<string, number | string>): SplitInputs {
  return Object.fromEntries(
    Object.entries(pairs).map(([key, value]) => [key, String(value)]),
  );
}

function sum(values: number[]): number {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}

/**
 * تقسيم الفاتورة.
 *
 * ثلاث طرق للإدخال ونتيجة واحدة بالعملة. وما يهم في الاختبار شيئان:
 * ألّا يضيع قرش في القسمة، وألّا تمرّ قسمةٌ لا تجمع الفاتورة.
 */
describe('حساب الحصص', () => {
  test('الطرق الثلاث معروضة بالعربية', () => {
    assert.deepEqual(
      SPLIT_MODES.map((mode) => mode.value),
      ['equal', 'percent', 'custom'],
    );
    for (const mode of SPLIT_MODES) {
      assert.ok(mode.label.length > 0, `طريقة بلا اسم: ${mode.value}`);
    }
  });

  test('بالتساوي: ٣٠٠ بين ثلاثة تعطي ١٠٠ لكلٍّ', () => {
    const result = computeSplit(300, [ME, person('a'), person('b')], 'equal', {});
    assert.equal(result.valid, true);
    assert.deepEqual(
      result.shares.map((share) => share.amount),
      [100, 100, 100],
    );
    assert.equal(result.total, 300);
    assert.equal(result.difference, 0);
  });

  test('بالتساوي: الباقي يُوزَّع فلا يضيع قرش', () => {
    // ١٠٠ ÷ ٣ لا تقبل القسمة: 33.34 + 33.33 + 33.33 = 100 تماماً.
    const result = computeSplit(100, [ME, person('a'), person('b')], 'equal', {});
    assert.equal(result.valid, true);
    assert.equal(sum(result.shares.map((share) => share.amount)), 100);
    assert.deepEqual(
      result.shares.map((share) => share.amount),
      [33.34, 33.33, 33.33],
    );
  });

  test('بالنسبة: مجموع ١٠٠٪ يمرّ ويُترجَم إلى عملة', () => {
    const result = computeSplit(
      200,
      [ME, person('a')],
      'percent',
      inputs({ self: 25, a: 75 }),
    );
    assert.equal(result.valid, true);
    assert.equal(result.error, null);
    assert.deepEqual(
      result.shares.map((share) => share.amount),
      [50, 150],
    );
  });

  test('بالنسبة: فارق التقريب يُحمَّل على أكبر حصّة فيكتمل المبلغ', () => {
    // 33.34٪ و33.33٪ من 100 تعطي 33.34 + 33.33 + 33.33 = 100 تماماً،
    // ومن 10 تعطي 3.33 + 3.33 + 3.33 = 9.99 فيلزم قرشٌ للأكبر.
    const participants = [ME, person('a'), person('b')];
    const seeded = seedInputs(10, participants, 'percent');
    const result = computeSplit(10, participants, 'percent', seeded);
    assert.equal(result.valid, true);
    assert.equal(result.total, 10);
    assert.equal(result.difference, 0);
    assert.deepEqual(
      result.shares.map((share) => share.amount),
      [3.34, 3.33, 3.33],
    );
  });

  test('بالنسبة: الفارق لا يُصلَح لقسمة مرفوضة', () => {
    const result = computeSplit(
      300,
      [ME, person('a')],
      'percent',
      inputs({ self: 40, a: 40 }),
    );
    assert.equal(result.valid, false);
    // 240 لا تُرفع إلى 300 بحجّة التقريب: الخطأ في النسب لا في القروش.
    assert.equal(result.total, 240);
  });

  test('بالنسبة: مجموع غير ١٠٠٪ يُرفض ويُقال كم هو', () => {
    const result = computeSplit(
      200,
      [ME, person('a')],
      'percent',
      inputs({ self: 30, a: 60 }),
    );
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /90/);
    assert.match(result.error ?? '', /100/);
  });

  test('بالنسبة: حقل فارغ أو غير رقمي يُرفض بلا انهيار', () => {
    for (const bad of ['', 'خمسون', '-10', '1.2.3']) {
      const result = computeSplit(
        200,
        [ME, person('a')],
        'percent',
        inputs({ self: 50, a: bad }),
      );
      assert.equal(result.valid, false, `مرّ إدخال فاسد: "${bad}"`);
      assert.ok(result.error);
    }
  });

  test('بمبلغ محدّد: المجموع يجب أن يساوي الفاتورة', () => {
    const exact = computeSplit(
      300,
      [ME, person('a')],
      'custom',
      inputs({ self: 120, a: 180 }),
    );
    assert.equal(exact.valid, true);
    assert.equal(exact.total, 300);

    const over = computeSplit(
      300,
      [ME, person('a')],
      'custom',
      inputs({ self: 200, a: 180 }),
    );
    assert.equal(over.valid, false);
    assert.match(over.error ?? '', /يزيد/);
    assert.equal(over.difference, 80);

    const under = computeSplit(
      300,
      [ME, person('a')],
      'custom',
      inputs({ self: 100, a: 150 }),
    );
    assert.equal(under.valid, false);
    assert.match(under.error ?? '', /ينقص/);
    assert.equal(under.difference, -50);
  });

  test('بلا مبلغ أو بلا مشاركين: رسالة تقول ما ينقص', () => {
    assert.match(
      computeSplit(0, [ME], 'equal', {}).error ?? '',
      /مبلغ الفاتورة/,
    );
    assert.match(computeSplit(100, [], 'equal', {}).error ?? '', /اختر/);
  });
});

describe('ما يصل إلى الدفتر', () => {
  test('حصّة المستخدم تُحسب ولا تُسجَّل حركة', () => {
    const result = computeSplit(300, [ME, person('a'), person('b')], 'equal', {});
    assert.equal(ownShare(result), 100);

    const billable = billableShares(result);
    assert.equal(billable.length, 2);
    assert.ok(
      billable.every((share) => !share.participant.isSelf),
      'حصّة المستخدم دخلت الحركات',
    );
    assert.equal(sum(billable.map((share) => share.amount)), 200);
  });

  test('قسمة بلا المستخدم تسجّل الفاتورة كاملة على الآخرين', () => {
    const result = computeSplit(300, [person('a'), person('b')], 'equal', {});
    assert.equal(ownShare(result), 0);
    assert.equal(sum(billableShares(result).map((share) => share.amount)), 300);
  });

  test('الحصص الصفرية لا تُنشئ حركات فارغة', () => {
    const result = computeSplit(
      100,
      [ME, person('a'), person('b')],
      'custom',
      inputs({ self: 0, a: 100, b: 0 }),
    );
    assert.equal(result.valid, true);
    assert.deepEqual(
      billableShares(result).map((share) => share.participant.key),
      ['a'],
    );
  });

  test('الاسم غير المسجّل يصل بلا معرّف جهة اتصال', () => {
    const result = computeSplit(200, [person('a'), guest('g', 'سامي')], 'equal', {});
    const entries = billableShares(result).map((share) => ({
      contactId: share.participant.contactId,
      name: share.participant.name,
    }));
    assert.deepEqual(entries, [
      { contactId: 'a', name: 'a' },
      { contactId: null, name: 'سامي' },
    ]);
  });
});

describe('تعبئة الحقول عند تبديل الطريقة', () => {
  test('النسب تبدأ متساوية ومجموعها ١٠٠٪ تماماً', () => {
    const participants = [ME, person('a'), person('b')];
    const seeded = seedInputs(300, participants, 'percent');
    // 33.33 ثلاثاً تعطي 99.99٪، فتُفتح الطريقة على خطأ. القروش تصحّحها.
    assert.deepEqual(Object.values(seeded), ['33.34', '33.33', '33.33']);
    assert.equal(
      Object.values(seeded).reduce((sum, value) => sum + Number(value), 0),
      100,
    );

    const result = computeSplit(300, participants, 'percent', seeded);
    assert.equal(result.valid, true, 'التعبئة المبدئية تفتح على خطأ');
    assert.equal(result.error, null);
    assert.equal(result.total, 300);
  });

  test('المبالغ تبدأ من قسمة دقيقة تجمع الفاتورة', () => {
    const participants = [ME, person('a'), person('b')];
    const seeded = seedInputs(100, participants, 'custom');
    const result = computeSplit(100, participants, 'custom', seeded);
    assert.equal(result.valid, true, 'التعبئة المبدئية لا تجمع الفاتورة');
    assert.equal(result.total, 100);
  });

  test('طريقة التساوي لا تحتاج تعبئة', () => {
    assert.deepEqual(seedInputs(100, [ME, person('a')], 'equal'), {});
  });
});

/**
 * ربط القسمة بالمستودع: حركةٌ لكل مشارك يجمعها معرّف قسمة واحد، وأسماء
 * جديدة تصير جهاتِ اتصال قبل حركاتها وإلا لم تدخل رصيد أحد.
 */
describe('عقد المستودع', () => {
  const repository = read('src/lib/repository.ts');

  test('createSplitBill يعطي كل المشاركين معرّف قسمة واحداً', () => {
    const body = repository.slice(repository.indexOf('export async function createSplitBill'));
    assert.match(body, /const groupId = Crypto\.randomUUID\(\)/);
    assert.match(body, /split_group_id: groupId/);
    // المعرّف يُولَّد مرة واحدة خارج الحلقة.
    assert.ok(
      body.indexOf('const groupId') < body.indexOf('for (const entry'),
      'معرّف القسمة يُولَّد داخل الحلقة فيختلف لكل حركة',
    );
  });

  test('الاسم بلا جهة اتصال تُنشأ له واحدة قبل حركته', () => {
    const body = repository.slice(repository.indexOf('export async function createSplitBill'));
    assert.match(body, /entry\.contactId \?\?\s*\(await createContact\(/);
  });

  test('المخطّط يضيف عمود القسمة إلى جدول قائم', () => {
    const schema = read('supabase/schema.sql');
    assert.match(
      schema,
      /alter table public\.transactions\s+add column if not exists split_group_id uuid;/,
    );
  });

  test('الموفّر يعرض addSplitBill ويحدّث القائمة', () => {
    const provider = read('src/store/LedgerProvider.tsx');
    assert.match(provider, /addSplitBill: \(input: SplitBillInput\) => Promise<Transaction\[\]>/);
    assert.match(provider, /setTransactions\(\(current\) => \[\.\.\.saved, \.\.\.current\]\)/);
    // أسماء جديدة أنشأت جهات اتصال، فلا بدّ من إعادة القراءة.
    assert.match(provider, /entry\.contactId === null[\s\S]{0,40}refresh\(\)/);
  });
});

/**
 * الواجهة: الزرّ في شاشة الحركة وفي تأكيد الإيصال، والحفظ يسلك مسار
 * القسمة حين تكون سارية.
 */
describe('ربط الواجهة', () => {
  const screen = read('src/screens/AddTransactionScreen.tsx');

  test('زرّ القسمة معروض في شاشة الحركة', () => {
    assert.match(screen, /تقسيم الفاتورة مع أفراد/);
    assert.match(screen, /<BillSplitSheet/);
    assert.match(screen, /onConfirm=\{\(entries\) => setSplit\(/);
  });

  test('الحفظ يستدعي addSplitBill حين تكون القسمة سارية', () => {
    assert.match(screen, /if \(activeSplit\) \{[\s\S]{0,400}await addSplitBill\(\{/);
    assert.match(screen, /entries: activeSplit\.entries/);
  });

  test('القسمة تُبطَل إن تغيّر المبلغ بعد تأكيدها', () => {
    assert.match(screen, /Math\.abs\(split\.amount - parsedAmount\) < 0\.005/);
  });

  test('القسمة تغني عن اختيار جهة اتصال واحدة', () => {
    assert.match(
      screen,
      /const isValid = amountValid && \(activeSplit !== null \|\| contactId !== null\)/,
    );
  });

  test('تأكيد الإيصال يفتح ورقة القسمة على الإجمالي المقروء', () => {
    const scan = read('src/screens/ScanReceiptScreen.tsx');
    assert.match(scan, /continueToForm\(true\)/);
    assert.match(scan, /تقسيم الفاتورة مع أفراد/);
    assert.match(screen, /prefill\.split && prefill\.amount !== undefined/);
    assert.match(screen, /setSplitOpen\(true\)/);
  });

  test('ورقة القسمة عربية الاتجاه في صفوفها', () => {
    const sheet = read('src/components/BillSplitSheet.tsx');
    assert.match(sheet, /flex-row-reverse/);
    assert.match(sheet, /text-right/);
    assert.match(sheet, /accessibilityLabel=\{`حصّة \$\{participant\.name\}`\}/);
  });
});
