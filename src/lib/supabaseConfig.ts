/**
 * فحص إعداد الاتصال، معزولاً عن العميل نفسه.
 *
 * بلا استيراد من react-native ولا من supabase-js: دوالّ نقيّة تُقرأ
 * وتُختبر وحدها، ولا يجرّ استيرادُها أثر جانبياً.
 */

/** أنواع الخلل في إعداد الاتصال، لكلٍّ منها إصلاح مختلف. */
export type SupabaseConfigIssue =
  | 'missing-url'
  | 'invalid-url'
  | 'missing-key'
  | 'invalid-key'
  | 'secret-key'
  | 'expired-key'
  | 'rejected-key';

/**
 * فكّ ترميز base64url إلى نصّ.
 *
 * يكفي حمولة JWT: حقولها (`role` و`exp`) ASCII كلها، فلا حاجة لفكّ UTF-8.
 * وأي بايت غير متوقّع يجعل JSON.parse يفشل، وهي حالة نتسامح معها أدناه.
 */
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(segment: string): string | null {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  let accumulator = 0;
  let bits = 0;
  let out = '';

  for (const char of normalized) {
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) return null;
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((accumulator >> bits) & 0xff);
    }
  }

  return out;
}

/**
 * يفحص شكل المفتاح العام قبل إرساله.
 *
 * الهدف رصد الخطأ *الواضح* فقط: قيمة `.env.example` كما هي، مفتاح مقصوص،
 * أو مفتاح سرّي وُضع في متغيّر عام. ما لا نستطيع إثبات فساده نمرّره،
 * فرفضُ مفتاح سليم أسوأ من قبول مفتاح معطوب — الخادم يردّ على الثاني.
 */
export function inspectAnonKey(key: string): SupabaseConfigIssue | null {
  if (!key) return 'missing-key';

  // المفاتيح الحديثة: sb_publishable_… عامة، وsb_secret_… لا يجوز تحزيمها.
  if (key.startsWith('sb_secret_')) return 'secret-key';
  if (key.startsWith('sb_publishable_')) {
    return key.length > 24 ? null : 'invalid-key';
  }

  // المفاتيح القديمة JWT: ترويسة base64 تبدأ دائماً بـ eyJ.
  if (!key.startsWith('eyJ')) return 'invalid-key';

  const segments = key.split('.');
  if (segments.length !== 3 || segments.some((part) => part.length === 0)) {
    return 'invalid-key';
  }

  // حرف خارج أبجدية base64url: فسادٌ مؤكّد، لا اجتهاد فيه.
  const payloadText = decodeBase64Url(segments[1]);
  if (payloadText === null) return 'invalid-key';

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    // فكّ الترميز هنا ASCII فقط، فحمولة فيها حروف غير لاتينية قد تتشوّه.
    // لا نحمّل المستخدم ثمن قصورٍ عندنا: نمرّرها وندع الخادم يحكم.
    return null;
  }

  const role = typeof claims.role === 'string' ? claims.role : null;
  if (role === 'service_role') return 'secret-key';
  if (role !== null && role !== 'anon') return 'invalid-key';

  const exp = typeof claims.exp === 'number' ? claims.exp : null;
  if (exp !== null && exp * 1000 <= Date.now()) return 'expired-key';

  return null;
}

/**
 * يفحص عنوان المشروع.
 *
 * العنوان جذرٌ عارٍ: supabase-js يركّب `/auth/v1` و`/rest/v1` بنفسه، فلصق
 * عنوان REST كاملاً يعطي مسارات مضاعفة تردّ 404 ثم تبدو خطأ مصادقة.
 */
export function inspectUrl(raw: string): SupabaseConfigIssue | null {
  if (!raw) return 'missing-url';

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'invalid-url';
  }

  const isLoopback =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const protocolOk =
    parsed.protocol === 'https:' || (isLoopback && parsed.protocol === 'http:');
  if (!protocolOk) return 'invalid-url';

  // القيم النموذجية في الأمثلة والقوالب (your-project-ref، your-supabase-id…)
  // تُنسخ كما هي أكثر ممّا يُظنّ. ومعرّف مشروع حقيقي حروف وأرقام بلا
  // شرطات، فلا يبدأ اسمه بـ your- أبداً.
  if (parsed.hostname.startsWith('your-')) return 'invalid-url';

  if (parsed.pathname !== '/' && parsed.pathname !== '') return 'invalid-url';
  if (parsed.search.length > 0 || parsed.hash.length > 0) return 'invalid-url';

  return null;
}

/**
 * هل هذا الخطأ رفضٌ للمفتاح لا فشلٌ في بيانات المستخدم؟
 *
 * لا نعتمد على 401 وحده: تجديدُ رمزٍ منتهٍ يردّ 401 أيضاً، وإسقاطُ
 * الاتصال عنده يعني تعطيل حسابٍ سليم.
 */
export function isSupabaseKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const shape = error as { message?: unknown; hint?: unknown; code?: unknown };

  if (typeof shape.code === 'string' && shape.code.toLowerCase() === 'invalid_api_key') {
    return true;
  }

  const text = [shape.message, shape.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();

  return text.includes('invalid api key') || text.includes('no api key found');
}

/** نصّ التنبيه لكل خلل: ما الذي انكسر، وما الذي يصلحه. */
export const SUPABASE_CONFIG_MESSAGES: Record<
  SupabaseConfigIssue,
  { title: string; detail: string }
> = {
  'missing-url': {
    title: 'عنوان مشروع Supabase مفقود',
    detail:
      'أضف EXPO_PUBLIC_SUPABASE_URL إلى ملف البيئة، كما في النموذج env.example، ثم أعد تشغيل خادم التطوير.',
  },
  'invalid-url': {
    title: 'عنوان مشروع Supabase غير صالح',
    detail:
      'قيمة EXPO_PUBLIC_SUPABASE_URL يجب أن تكون جذر المشروع وحده، مثل https://xxxx.supabase.co بلا مسار ولا معاملات.',
  },
  'missing-key': {
    title: 'مفتاح Supabase العام مفقود',
    detail:
      'أضف EXPO_PUBLIC_SUPABASE_ANON_KEY إلى ملف البيئة، وقيمته المفتاح العام من صفحة API في إعدادات مشروعك، ثم أعد تشغيل خادم التطوير.',
  },
  'invalid-key': {
    title: 'مفتاح Supabase العام غير صالح',
    detail:
      'قيمة EXPO_PUBLIC_SUPABASE_ANON_KEY ليست مفتاحاً كاملاً. انسخ المفتاح العام كاملاً من صفحة API في إعدادات مشروعك.',
  },
  'secret-key': {
    title: 'المفتاح الموضوع سرّي لا عام',
    detail:
      'كل متغيّر EXPO_PUBLIC_* يُحزَم داخل التطبيق ويمكن استخراجه، فلا يوضع فيه مفتاح service_role. أبطل هذا المفتاح فوراً من لوحة التحكم وضع مفتاح anon العام مكانه.',
  },
  'expired-key': {
    title: 'انتهت صلاحية مفتاح Supabase',
    detail:
      'المفتاح في EXPO_PUBLIC_SUPABASE_ANON_KEY منتهي الصلاحية. أنشئ مفتاحاً جديداً من صفحة API في إعدادات مشروعك.',
  },
  'rejected-key': {
    title: 'رفض الخادم مفتاح Supabase',
    detail:
      'أعاد الخادم «Invalid API key». تأكّد أن EXPO_PUBLIC_SUPABASE_ANON_KEY يخصّ المشروع نفسه المذكور في EXPO_PUBLIC_SUPABASE_URL، ثم أعد تشغيل خادم التطوير.',
  },
};
