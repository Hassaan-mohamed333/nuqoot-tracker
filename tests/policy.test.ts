import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  CONTACTS_CLAUSE,
  POLICY_SECTIONS,
  POLICY_STORAGE_KEY,
  acceptPolicy,
  canAcceptPolicy,
  hasAcceptedPolicy,
  isScrolledToEnd,
  type PolicyStore,
} from '../src/lib/policy.ts';

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: PolicyStore = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
  };
  return { store, data };
}

describe('موافقة سياسة الاستخدام', () => {
  test('بلا مفتاح: لم يوافق بعد فتظهر الشاشة', async () => {
    assert.equal(await hasAcceptedPolicy(memoryStore().store), false);
  });

  test('تُحفظ بالشكل المطلوب وبعدها لا تتكرر', async () => {
    const { store, data } = memoryStore();
    await acceptPolicy(store, new Date('2026-10-06T10:00:00.000Z'));
    assert.equal(POLICY_STORAGE_KEY, 'nuqoot:policy_accepted_v1');
    assert.deepEqual(JSON.parse(data.get(POLICY_STORAGE_KEY)!), {
      accepted: true,
      at: '2026-10-06T10:00:00.000Z',
    });
    assert.equal(await hasAcceptedPolicy(store), true);
  });

  test('قيمة تالفة أو accepted:false أو تخزين يرمي = لم يوافق', async () => {
    for (const raw of ['x{', '{"accepted":false}', 'null', '"yes"']) {
      assert.equal(
        await hasAcceptedPolicy(memoryStore({ [POLICY_STORAGE_KEY]: raw }).store),
        false,
      );
    }
    const broken: PolicyStore = {
      get: async () => {
        throw new Error('boom');
      },
      set: async () => {},
    };
    assert.equal(await hasAcceptedPolicy(broken), false);
  });

  test('الزرّ لا يُفعَّل بالدخول وحده', () => {
    assert.equal(canAcceptPolicy(false, false), false);
    assert.equal(canAcceptPolicy(true, false), true);
    assert.equal(canAcceptPolicy(false, true), true);
  });

  test('نهاية التمرير بهامش، ونصّ قصير يُعدّ مقروءاً', () => {
    const m = { viewportHeight: 500, contentHeight: 1500 };
    assert.equal(isScrolledToEnd({ ...m, contentOffsetY: 0 }), false);
    assert.equal(isScrolledToEnd({ ...m, contentOffsetY: 990 }), true);
    assert.equal(
      isScrolledToEnd({ viewportHeight: 500, contentHeight: 300, contentOffsetY: 0 }),
      true,
    );
    // قبل القياس لا نحكم.
    assert.equal(
      isScrolledToEnd({ viewportHeight: 0, contentHeight: 0, contentOffsetY: 0 }),
      false,
    );
  });

  test('البند الصريح عن جهات الاتصال موجود في النص', () => {
    assert.match(CONTACTS_CLAUSE, /ولن تتم مشاركة أي بيانات مع أطراف خارجية/);
    assert.ok(POLICY_SECTIONS.some((s) => s.body === CONTACTS_CLAUSE));
  });
});
