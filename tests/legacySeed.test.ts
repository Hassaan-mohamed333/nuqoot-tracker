import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  LEGACY_SEED_FLAG,
  cleanupLegacySeedData,
  isPristineSeedRow,
  planSeedCleanup,
  type SeedCleanupStore,
} from '../src/lib/legacySeed.ts';

const ROOT = path.join(import.meta.dirname, '..');

/* ------------------------------------------------------------------ */
/* صفوف الاختبار.                                                      */
/* ------------------------------------------------------------------ */

/** نسخةٌ من صفّ تجريبي كما زُرع، بتاريخٍ اعتباطي كما يختلف بين الأجهزة. */
const seedContact = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  user_id: null,
  full_name: 'أحمد عبد الرحمن',
  phone: '01001234567',
  relation: 'ابن العم',
  notes: null,
  is_archived: false,
  archived_at: null,
  created_at: '2024-03-04T10:00:00.000Z',
  ...over,
});

const seedEvent = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  user_id: null,
  title: 'فرح أحمد عبد الرحمن',
  event_type: 'wedding',
  host_contact_id: 'c1',
  event_date: '2025-05-23T00:00:00.000Z',
  location: 'قاعة النيل - المنصورة',
  notes: null,
  created_at: '2024-03-04T10:00:00.000Z',
  ...over,
});

const seedTx = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  user_id: null,
  contact_id: 'c1',
  event_id: 'e1',
  direction: 'OUT',
  amount: 1500,
  currency: 'EGP',
  occurred_at: '2025-05-23T00:00:00.000Z',
  note: 'نقوط الفرح',
  receipt_url: null,
  split_group_id: null,
  is_archived: false,
  archived_at: null,
  created_at: '2024-03-04T10:00:00.000Z',
  ...over,
});

/** البذرة t2: حركةٌ بلا مناسبة — `t1` لها `event_id: 'e1'`. */
const seedTx2 = (over: Record<string, unknown> = {}) =>
  seedTx({
    id: 't2',
    event_id: null,
    direction: 'IN',
    amount: 1000,
    note: 'نقوط فرحي',
    ...over,
  });

/** صفٌّ من صنع المستخدم: معرّف محلي مولَّد، واسم ليس من البذور. */
const mine = (over: Record<string, unknown> = {}) => ({
  id: 't_mucgnx4p_wje7yd',
  contact_id: 'c_mine_1',
  event_id: null,
  direction: 'OUT',
  amount: 250,
  currency: 'EGP',
  note: null,
  ...over,
});

/**
 * تنظيف البيانات التجريبية القديمة.
 *
 * شيفرةٌ تحذف بيانات الناس: الخطأ فيها لا يُرى إلا بعد الضياع. فالقاعدة
 * المختبَرة هنا واحدة — **لا يُحذف إلا ما لم يُلمس** — ومعها ألّا يبقى
 * صفٌّ يتيماً بعد الحذف.
 */
describe('تمييز الصفّ التجريبي من صفّ المستخدم', () => {
  test('النسخة التي لم تُمسّ تُعرَف', () => {
    assert.equal(isPristineSeedRow('contact', seedContact()), true);
    assert.equal(isPristineSeedRow('event', seedEvent()), true);
    assert.equal(isPristineSeedRow('transaction', seedTx()), true);
  });

  test('التواريخ خارج البصمة — وهي تختلف بين الأجهزة', () => {
    // `daysAgo(400)` كانت تُحسب لحظة الزرع، فلا تصلح للمطابقة.
    assert.equal(
      isPristineSeedRow('contact', seedContact({ created_at: '2019-01-01T00:00:00.000Z' })),
      true,
    );
    assert.equal(
      isPristineSeedRow('transaction', seedTx({ occurred_at: '2001-09-11T00:00:00.000Z' })),
      true,
    );
    assert.equal(
      isPristineSeedRow('event', seedEvent({ event_date: '2030-01-01T00:00:00.000Z' })),
      true,
    );
  });

  test('تعديلُ أي حقلٍ ثابت يجعل الصفّ للمستخدم', () => {
    const edited: Array<[string, unknown]> = [
      ['full_name', 'خالد إبراهيم'],
      ['phone', '01099999999'],
      ['relation', 'أخ'],
      ['notes', 'ملاحظتي'],
    ];
    for (const [field, value] of edited) {
      assert.equal(
        isPristineSeedRow('contact', seedContact({ [field]: value })),
        false,
        `تعديل ${field} لم يحمِ الصفّ`,
      );
    }

    for (const [field, value] of [
      ['amount', 1501],
      ['direction', 'IN'],
      ['note', 'ملاحظتي'],
      ['currency', 'SAR'],
      ['contact_id', 'c_mine_1'],
    ] as Array<[string, unknown]>) {
      assert.equal(
        isPristineSeedRow('transaction', seedTx({ [field]: value })),
        false,
        `تعديل ${field} لم يحمِ الحركة`,
      );
    }
  });

  test('المعرّف وحده لا يكفي', () => {
    // `c1` قد يكون اليوم اسم قريبٍ حقيقي بعد إعادة التسمية.
    assert.equal(
      isPristineSeedRow('contact', { id: 'c1', full_name: 'خالد إبراهيم' }),
      false,
    );
  });

  test('صفُّ المستخدم لا يُمسّ مهما كان شكله', () => {
    assert.equal(isPristineSeedRow('transaction', mine()), false);
    assert.equal(isPristineSeedRow('contact', { id: 'c_mine_1', full_name: 'خالد إبراهيم' }), false);
    for (const junk of [null, undefined, 42, 'c1', [], { id: 7 }]) {
      assert.equal(isPristineSeedRow('contact', junk), false);
    }
  });

  test('الحالة المؤرشفة لا تحمي ولا تمنع', () => {
    // الأرشفة محاولةٌ للتخلّص منه، فحذفه بعدها موافقٌ للقصد.
    assert.equal(
      isPristineSeedRow('transaction', seedTx({ is_archived: true, archived_at: 'x' })),
      true,
    );
  });
});

describe('خطّة التنظيف', () => {
  test('دفترٌ تجريبي خالص يُمسح كاملاً', () => {
    const plan = planSeedCleanup({
      contacts: [seedContact(), seedContact({ id: 'c3', full_name: 'بسمة محمود', phone: null, relation: 'قريبة' })],
      events: [seedEvent()],
      transactions: [seedTx(), seedTx({ id: 't9', contact_id: 'c8', event_id: null, amount: 1000, note: null })],
    });
    assert.equal(plan.changed, true);
    assert.deepEqual(plan.next, { contacts: [], events: [], transactions: [] });
    assert.deepEqual(plan.removed.transactions.sort(), ['t1', 't9']);
  });

  test('دفترٌ نظيف لا يتغيّر', () => {
    const snapshot = {
      contacts: [{ id: 'c_mine_1', full_name: 'خالد إبراهيم' }],
      events: [],
      transactions: [mine()],
    };
    const plan = planSeedCleanup(snapshot);
    assert.equal(plan.changed, false);
    assert.deepEqual(plan.next, snapshot);
  });

  test('صفوف المستخدم تبقى بجوار التجريبية المحذوفة', () => {
    const plan = planSeedCleanup({
      contacts: [seedContact(), { id: 'c_mine_1', full_name: 'خالد إبراهيم' }],
      events: [],
      transactions: [seedTx2(), mine()],
    });
    assert.deepEqual(plan.next.contacts.map((c) => c.id), ['c_mine_1']);
    assert.deepEqual(plan.next.transactions.map((t) => t.id), ['t_mucgnx4p_wje7yd']);
  });
});

/**
 * لا يُترك صفٌّ يتيماً: الحذف يتبع الاعتماد.
 */
describe('حماية الإشارات', () => {
  test('جهة اتصال تجريبية تحمل حركةً للمستخدم تبقى', () => {
    // من سمّى `c1` باسم قريبه؟ لا — من سجّل على `c1` نقوطاً حقيقية.
    const plan = planSeedCleanup({
      contacts: [seedContact()],
      events: [],
      transactions: [seedTx2(), mine({ contact_id: 'c1' })],
    });
    assert.deepEqual(plan.next.contacts.map((c) => c.id), ['c1']);
    assert.deepEqual(plan.next.transactions.map((t) => t.id), ['t_mucgnx4p_wje7yd']);
    assert.ok(plan.keptForReferences.includes('c1'));
  });

  test('مناسبة تجريبية تحمل حركةً للمستخدم تبقى — ومضيفها معها', () => {
    const plan = planSeedCleanup({
      contacts: [seedContact()],
      events: [seedEvent()],
      transactions: [seedTx(), mine({ contact_id: 'c_mine_1', event_id: 'e1' })],
    });
    assert.deepEqual(plan.next.events.map((e) => e.id), ['e1']);
    // مضيف المناسبة الباقية لا يُحذف، وإلا بقيت مناسبةٌ باسمٍ مفقود.
    assert.deepEqual(plan.next.contacts.map((c) => c.id), ['c1']);
  });

  test('لا إشارة معلّقة في أي ناتج', () => {
    /*
     * الثابت الذي يجب أن يصمد مهما كان المدخل: كل `contact_id` و
     * `event_id` و`host_contact_id` في الناتج يجد صاحبه فيه.
     */
    const cases = [
      { contacts: [seedContact()], events: [seedEvent()], transactions: [seedTx()] },
      { contacts: [seedContact()], events: [seedEvent()], transactions: [mine({ contact_id: 'c1', event_id: 'e1' })] },
      {
        contacts: [seedContact(), { id: 'c_mine_1', full_name: 'خالد' }],
        events: [seedEvent()],
        transactions: [mine({ event_id: 'e1' }), seedTx()],
      },
      { contacts: [seedContact(), { id: 'c_mine_1', full_name: 'خالد' }], events: [seedEvent()], transactions: [mine({ contact_id: 'c1' })] },
    ];

    for (const [index, snapshot] of cases.entries()) {
      const plan = planSeedCleanup(snapshot);
      const contactIds = new Set(plan.next.contacts.map((c) => String(c.id)));
      const eventIds = new Set(plan.next.events.map((e) => String(e.id)));

      for (const tx of plan.next.transactions) {
        if (typeof tx.contact_id === 'string') {
          assert.ok(contactIds.has(tx.contact_id), `حالة ${index}: حركة بلا صاحب ${tx.contact_id}`);
        }
        if (typeof tx.event_id === 'string') {
          assert.ok(eventIds.has(tx.event_id), `حالة ${index}: حركة بمناسبة مفقودة ${tx.event_id}`);
        }
      }
      for (const event of plan.next.events) {
        if (typeof event.host_contact_id === 'string') {
          assert.ok(
            contactIds.has(event.host_contact_id),
            `حالة ${index}: مناسبة بمضيف مفقود ${event.host_contact_id}`,
          );
        }
      }
    }
  });

  test('التنظيف لا يزيد صفّاً ولا يعيد ترتيباً', () => {
    const snapshot = {
      contacts: [{ id: 'a', full_name: 'أ' }, seedContact(), { id: 'b', full_name: 'ب' }],
      events: [],
      transactions: [],
    };
    const plan = planSeedCleanup(snapshot);
    assert.deepEqual(plan.next.contacts.map((c) => c.id), ['a', 'b']);
    assert.ok(plan.next.contacts.length <= snapshot.contacts.length);
  });
});

/* ------------------------------------------------------------------ */
/* التشغيل على التخزين: الحارس، والكتابة، والفشل.                      */
/* ------------------------------------------------------------------ */

function fakeStore(initial: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...initial };
  const flags: Record<string, string> = {};
  const reads: string[] = [];
  const writes: string[] = [];
  const store: SeedCleanupStore = {
    read: async (key) => { reads.push(key); return data[key] ?? null; },
    write: async (key, value) => { writes.push(key); data[key] = value; },
    readFlag: async (key) => flags[key] ?? null,
    writeFlag: async (key, value) => { flags[key] = value; },
  };
  return { store, data, flags, reads, writes };
}

describe('الحارس والتشغيل', () => {
  const dirty = {
    'nuqoot:contacts': [seedContact()],
    'nuqoot:events': [],
    'nuqoot:transactions': [seedTx2()],
  };

  test('يعمل مرّةً ويكتب العلامة', async () => {
    const box = fakeStore(dirty);
    const report = await cleanupLegacySeedData(box.store);

    assert.equal(report.ran, true);
    assert.deepEqual(report.removed, { contacts: 1, events: 0, transactions: 1 });
    assert.equal(box.flags[LEGACY_SEED_FLAG], 'true');
    assert.deepEqual(box.data['nuqoot:contacts'], []);
    assert.deepEqual(box.data['nuqoot:transactions'], []);
  });

  test('لا يقرأ الدفتر بعد أوّل تشغيل', async () => {
    const box = fakeStore(dirty);
    await cleanupLegacySeedData(box.store);
    box.reads.length = 0;

    const second = await cleanupLegacySeedData(box.store);
    assert.equal(second.ran, false);
    // الحارس يسبق القراءة: صفر قراءات للدفتر في الإقلاع الثاني.
    assert.deepEqual(box.reads, []);
  });

  test('الدفتر النظيف لا يُكتب، والعلامة تُكتب', async () => {
    const box = fakeStore({
      'nuqoot:contacts': [{ id: 'c_mine_1', full_name: 'خالد إبراهيم' }],
      'nuqoot:events': [],
      'nuqoot:transactions': [mine()],
    });
    const report = await cleanupLegacySeedData(box.store);

    assert.equal(report.ran, true);
    assert.deepEqual(box.writes, [], 'كُتب التخزين بلا داعٍ');
    assert.equal(box.flags[LEGACY_SEED_FLAG], 'true');
  });

  test('تخزينٌ فارغ أو معطوب لا يُسقط الهجرة', async () => {
    for (const value of [null, undefined, 'نصّ', 42, {}]) {
      const box = fakeStore({
        'nuqoot:contacts': value,
        'nuqoot:events': value,
        'nuqoot:transactions': value,
      });
      const report = await cleanupLegacySeedData(box.store);
      assert.equal(report.ran, true);
      assert.deepEqual(box.writes, []);
    }
  });

  test('القوائم الثلاث تُكتب معاً', async () => {
    // كتابةٌ جزئية تترك حركةً تشير إلى جهة اتصال حُذفت.
    const box = fakeStore({
      'nuqoot:contacts': [seedContact()],
      'nuqoot:events': [seedEvent()],
      'nuqoot:transactions': [seedTx()],
    });
    await cleanupLegacySeedData(box.store);
    assert.deepEqual(
      box.writes.sort(),
      ['nuqoot:contacts', 'nuqoot:events', 'nuqoot:transactions'],
    );
  });

  test('اسم العلامة مُصرَّح به ومُصدَّر', () => {
    assert.equal(LEGACY_SEED_FLAG, 'nuqoot:has_cleaned_legacy_seed_v1');
  });
});

describe('الربط بالتطبيق', () => {
  const STORAGE = readFileSync(path.join(ROOT, 'src/lib/storage.ts'), 'utf8');
  const PROVIDER = readFileSync(path.join(ROOT, 'src/store/LedgerProvider.tsx'), 'utf8');

  test('تُشغَّل مرّةً واحدة في عمر العملية', () => {
    assert.match(STORAGE, /let cleanupPromise: Promise<void> \| null = null;/);
    assert.match(STORAGE, /cleanupPromise \?\?= cleanupLegacySeedData\(seedCleanupStore\)/);
  });

  test('الفشل يُعيد المحاولة ولا يُسقط الإقلاع', () => {
    assert.match(STORAGE, /\.catch\(\(error\) => \{[\s\S]{0,300}cleanupPromise = null;/);
  });

  test('تسبق أوّل قراءة للدفتر', () => {
    const start = PROVIDER.indexOf('const refresh = useCallback');
    const body = PROVIDER.slice(start, start + 900);
    const cleanup = body.indexOf('await runLegacySeedCleanup()');
    const fetch = body.indexOf('await fetchLedgerData()');
    assert.ok(cleanup > 0, 'التنظيف غير مستدعى في القراءة');
    assert.ok(cleanup < fetch, 'التنظيف بعد القراءة — سيُعرض الدفتر ثم ينقص');
  });
});
