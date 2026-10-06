/**
 * تحديد معدّل المحاولات الحسّاسة.
 *
 * ما يفعله وما لا يفعله: هذا حاجزٌ على الجهاز، يوقف التخمين العابر
 * ويحمي المستخدم من قفل حسابه على الخادم بالخطأ. وهو **لا يحمي من
 * مهاجم يتحكّم بالعميل**: من يملك الجهاز يملك التخزين. الحاجز الحقيقي
 * هو حدود Supabase على الخادم وCAPTCHA، وهذه طبقةٌ فوقهما لا بديلٌ عنهما.
 *
 * وحدة نقيّة: المخزن والساعة يُحقنان، فتُختبر تحت node بلا AsyncStorage
 * وبلا انتظار زمن حقيقي.
 */

/** أصغر واجهة تخزين تكفي: AsyncStorage و localStorage يحقّقانها. */
export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface RateLimitPolicy {
  /** عدد المحاولات الفاشلة المسموح بها داخل النافذة. */
  maxAttempts: number;
  /** طول النافذة بالمللي ثانية. */
  windowMs: number;
  /** مدة المنع الأولى بعد تجاوز الحدّ. تتضاعف مع كل تجاوز لاحق. */
  baseCooldownMs: number;
  /** سقف مدة المنع مهما تكرّر التجاوز. */
  maxCooldownMs: number;
}

const MINUTE = 60_000;

/**
 * السياسات لكل إجراء.
 *
 * التسجيل أضيق من الدخول: الدخول الفاشل قد يكون نسياناً عادياً يتكرّر،
 * أمّا إنشاء الحسابات فلا سبب مشروع لتكراره بسرعة، وهو المسار الذي
 * يُستغلّ لإغراق قاعدة المستخدمين.
 */
export const POLICIES = {
  signIn: {
    maxAttempts: 5,
    windowMs: 15 * MINUTE,
    baseCooldownMs: MINUTE,
    maxCooldownMs: 30 * MINUTE,
  },
  signUp: {
    maxAttempts: 3,
    windowMs: 60 * MINUTE,
    baseCooldownMs: 5 * MINUTE,
    maxCooldownMs: 60 * MINUTE,
  },
  anonymous: {
    maxAttempts: 5,
    windowMs: 60 * MINUTE,
    baseCooldownMs: 5 * MINUTE,
    maxCooldownMs: 60 * MINUTE,
  },
  oauth: {
    maxAttempts: 10,
    windowMs: 15 * MINUTE,
    baseCooldownMs: MINUTE,
    maxCooldownMs: 15 * MINUTE,
  },
  passwordReset: {
    maxAttempts: 3,
    windowMs: 60 * MINUTE,
    baseCooldownMs: 10 * MINUTE,
    maxCooldownMs: 60 * MINUTE,
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitAction = keyof typeof POLICIES;

interface Bucket {
  /** أوقات المحاولات الفاشلة داخل النافذة. */
  failures: number[];
  /** عدد مرّات تجاوز الحدّ، لتصعيد المنع. */
  strikes: number;
  /** ممنوع حتى هذا الوقت. */
  until: number;
}

/**
 * سلّة فارغة جديدة في كل نداء.
 *
 * ثابتٌ واحد يُنسخ بـ `{...EMPTY}` كان خطأً صامتاً: النسخ سطحي، فتبقى
 * مصفوفة `failures` مشتركة بالمرجع بين كل السلال — فتتسرّب إخفاقات
 * مستخدمٍ إلى مستخدم آخر وإلى إجراء آخر، ويُقفل حسابٌ لم يُخطئ.
 */
function emptyBucket(): Bucket {
  return { failures: [], strikes: 0, until: 0 };
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** ما تبقّى من المنع بالمللي ثانية. */
  retryAfterMs: number;
  /** المحاولات المتبقّية قبل المنع. */
  remaining: number;
  /** رسالة عربية جاهزة للعرض عند المنع. */
  message: string | null;
}

/**
 * تجزئة غير تعمويّة لمفتاح الهوية.
 *
 * الغرض ليس السرّية بل ألّا يبقى بريد المستخدم نصّاً صريحاً في تخزين
 * الجهاز: نسخة احتياطية أو تطبيقٌ آخر على جهاز مكسور الحماية يقرأها.
 * المفتاح لا يُرسل ولا يُستعمل في أي قرار أمني، فتكفي دالّة سريعة.
 */
export function identityKey(identity: string): string {
  let hash = 0x811c9dc5;
  const normalized = identity.trim().toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function humanDelay(ms: number): string {
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes <= 1) return 'بعد دقيقة';
  if (minutes === 2) return 'بعد دقيقتين';
  if (minutes <= 10) return `بعد ${minutes} دقائق`;
  return `بعد ${minutes} دقيقة`;
}

export interface RateLimiter {
  /** يُسأل قبل المحاولة؛ لا يُسجّل شيئاً. */
  check(action: RateLimitAction, identity?: string): Promise<RateLimitVerdict>;
  /** يُستدعى بعد فشل المحاولة. يعيد الحكم الجديد. */
  recordFailure(
    action: RateLimitAction,
    identity?: string,
  ): Promise<RateLimitVerdict>;
  /** يُستدعى بعد النجاح: يمسح السجل لهذه الهوية. */
  recordSuccess(action: RateLimitAction, identity?: string): Promise<void>;
}

export function createRateLimiter(
  store: RateLimitStore,
  now: () => number = Date.now,
): RateLimiter {
  const keyFor = (action: RateLimitAction, identity?: string) =>
    `nuqoot:rl:${action}:${identity ? identityKey(identity) : 'anon'}`;

  async function read(key: string, policy: RateLimitPolicy): Promise<Bucket> {
    try {
      const raw = await store.get(key);
      if (!raw) return emptyBucket();
      const parsed = JSON.parse(raw) as Partial<Bucket>;
      const cutoff = now() - policy.windowMs;
      return {
        failures: Array.isArray(parsed.failures)
          ? parsed.failures.filter(
              (time): time is number =>
                typeof time === 'number' && time > cutoff,
            )
          : [],
        strikes: typeof parsed.strikes === 'number' ? parsed.strikes : 0,
        until: typeof parsed.until === 'number' ? parsed.until : 0,
      };
    } catch {
      // تخزين تالف أو غير متاح: نبدأ من الصفر. الحاجز الحقيقي على الخادم،
      // ومنعُ المستخدم من الدخول بسبب تخزينٍ معطوب خسارةٌ بلا مقابل.
      return emptyBucket();
    }
  }

  function verdict(bucket: Bucket, policy: RateLimitPolicy): RateLimitVerdict {
    const remainingBlock = bucket.until - now();
    if (remainingBlock > 0) {
      return {
        allowed: false,
        retryAfterMs: remainingBlock,
        remaining: 0,
        message: `محاولات كثيرة. حاول ${humanDelay(remainingBlock)}.`,
      };
    }
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, policy.maxAttempts - bucket.failures.length),
      message: null,
    };
  }

  return {
    async check(action, identity) {
      const policy = POLICIES[action];
      return verdict(await read(keyFor(action, identity), policy), policy);
    },

    async recordFailure(action, identity) {
      const policy = POLICIES[action];
      const key = keyFor(action, identity);
      const bucket = await read(key, policy);

      bucket.failures.push(now());

      if (bucket.failures.length >= policy.maxAttempts) {
        bucket.strikes += 1;
        // تصعيد أُسّي: كل تجاوز يضاعف المنع، بسقف. التخمين المتواصل
        // يصبح مكلفاً بسرعة بينما يبقى الخطأ العابر رخيصاً.
        const cooldown = Math.min(
          policy.maxCooldownMs,
          policy.baseCooldownMs * 2 ** (bucket.strikes - 1),
        );
        bucket.until = now() + cooldown;
        bucket.failures = [];
      }

      try {
        await store.set(key, JSON.stringify(bucket));
      } catch {
        // لا شيء نفعله: المنع من طرف الخادم يبقى قائماً.
      }

      return verdict(bucket, policy);
    },

    async recordSuccess(action, identity) {
      try {
        await store.remove(keyFor(action, identity));
      } catch {
        // تجاهل: النجاح لا يجوز أن يفشل بسبب التخزين.
      }
    },
  };
}
