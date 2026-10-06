import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import {
  POLICIES,
  createRateLimiter,
  identityKey,
  type RateLimitStore,
} from '../src/lib/rateLimit.ts';

/** مخزن في الذاكرة، وساعة نحرّكها يدوياً: لا انتظار حقيقي في الاختبار. */
function harness() {
  const data = new Map<string, string>();
  let clock = 1_700_000_000_000;

  const store: RateLimitStore = {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };

  return {
    data,
    advance: (ms: number) => {
      clock += ms;
    },
    limiter: createRateLimiter(store, () => clock),
  };
}

describe('حاجز المحاولات', () => {
  let env: ReturnType<typeof harness>;

  beforeEach(() => {
    env = harness();
  });

  test('يسمح بالمحاولة الأولى', async () => {
    const verdict = await env.limiter.check('signIn', 'sami@example.com');
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.remaining, POLICIES.signIn.maxAttempts);
  });

  test('يمنع بعد استنفاد المحاولات', async () => {
    for (let i = 0; i < POLICIES.signIn.maxAttempts; i += 1) {
      await env.limiter.recordFailure('signIn', 'sami@example.com');
    }
    const verdict = await env.limiter.check('signIn', 'sami@example.com');
    assert.equal(verdict.allowed, false);
    assert.ok(verdict.retryAfterMs > 0);
    assert.ok(verdict.message && verdict.message.length > 0);
  });

  test('المنع ينتهي بمرور المدة', async () => {
    for (let i = 0; i < POLICIES.signIn.maxAttempts; i += 1) {
      await env.limiter.recordFailure('signIn', 'sami@example.com');
    }
    env.advance(POLICIES.signIn.baseCooldownMs + 1);
    const verdict = await env.limiter.check('signIn', 'sami@example.com');
    assert.equal(verdict.allowed, true);
  });

  test('التجاوز المتكرّر يضاعف المنع', async () => {
    const exhaust = async () => {
      for (let i = 0; i < POLICIES.signIn.maxAttempts; i += 1) {
        await env.limiter.recordFailure('signIn', 'sami@example.com');
      }
    };

    await exhaust();
    const first = (await env.limiter.check('signIn', 'sami@example.com'))
      .retryAfterMs;

    env.advance(first + 1);
    await exhaust();
    const second = (await env.limiter.check('signIn', 'sami@example.com'))
      .retryAfterMs;

    assert.ok(second > first, `${second} يجب أن يتجاوز ${first}`);
  });

  test('المنع لا يتجاوز السقف', async () => {
    for (let round = 0; round < 12; round += 1) {
      for (let i = 0; i < POLICIES.signIn.maxAttempts; i += 1) {
        await env.limiter.recordFailure('signIn', 'sami@example.com');
      }
      env.advance(POLICIES.signIn.maxCooldownMs + 1);
    }
    for (let i = 0; i < POLICIES.signIn.maxAttempts; i += 1) {
      await env.limiter.recordFailure('signIn', 'sami@example.com');
    }
    const verdict = await env.limiter.check('signIn', 'sami@example.com');
    assert.ok(verdict.retryAfterMs <= POLICIES.signIn.maxCooldownMs);
  });

  test('النجاح يمسح السجل فلا يُعاقَب من أخطأ ثم دخل', async () => {
    for (let i = 0; i < POLICIES.signIn.maxAttempts - 1; i += 1) {
      await env.limiter.recordFailure('signIn', 'sami@example.com');
    }
    await env.limiter.recordSuccess('signIn', 'sami@example.com');
    const verdict = await env.limiter.check('signIn', 'sami@example.com');
    assert.equal(verdict.remaining, POLICIES.signIn.maxAttempts);
  });

  test('المحاولات القديمة تسقط من النافذة', async () => {
    await env.limiter.recordFailure('signIn', 'sami@example.com');
    env.advance(POLICIES.signIn.windowMs + 1);
    const verdict = await env.limiter.check('signIn', 'sami@example.com');
    assert.equal(verdict.remaining, POLICIES.signIn.maxAttempts);
  });

  test('الهويّات منفصلة: فشل أحدهما لا يقفل الآخر', async () => {
    for (let i = 0; i < POLICIES.signIn.maxAttempts; i += 1) {
      await env.limiter.recordFailure('signIn', 'sami@example.com');
    }
    const other = await env.limiter.check('signIn', 'nour@example.com');
    assert.equal(other.allowed, true);
  });

  test('الإجراءات منفصلة: قفل الدخول لا يقفل التسجيل', async () => {
    for (let i = 0; i < POLICIES.signIn.maxAttempts; i += 1) {
      await env.limiter.recordFailure('signIn', 'sami@example.com');
    }
    const signUp = await env.limiter.check('signUp', 'sami@example.com');
    assert.equal(signUp.allowed, true);
  });

  test('البريد لا يُخزَّن نصّاً صريحاً', async () => {
    await env.limiter.recordFailure('signIn', 'sami@example.com');
    const dump = JSON.stringify([...env.data.entries()]);
    assert.ok(!dump.includes('sami@example.com'));
    assert.ok(!dump.includes('sami'));
  });

  test('الهوية تُطبَّع قبل التجزئة', () => {
    assert.equal(identityKey('  Sami@Example.COM '), identityKey('sami@example.com'));
  });

  test('تخزين تالف لا يقفل المستخدم', async () => {
    const broken: RateLimitStore = {
      get: async () => '}{ ليس JSON',
      set: async () => undefined,
      remove: async () => undefined,
    };
    const limiter = createRateLimiter(broken, () => 0);
    const verdict = await limiter.check('signIn', 'sami@example.com');
    assert.equal(verdict.allowed, true);
  });

  test('تخزين يرمي عند الكتابة لا يُسقط المحاولة', async () => {
    const throwing: RateLimitStore = {
      get: async () => null,
      set: async () => {
        throw new Error('التخزين ممتلئ');
      },
      remove: async () => {
        throw new Error('التخزين ممتلئ');
      },
    };
    const limiter = createRateLimiter(throwing, () => 0);
    await limiter.recordFailure('signIn', 'sami@example.com');
    await limiter.recordSuccess('signIn', 'sami@example.com');
  });
});
