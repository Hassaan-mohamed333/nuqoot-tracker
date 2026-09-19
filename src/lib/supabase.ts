import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import {
  inspectSupabaseEnv,
  type SupabaseConfigIssue,
} from '@/lib/supabaseConfig';
import { installWebCryptoShim } from '@/lib/webCryptoShim';

// يُعاد تصديرها من هنا: بقية التطبيق تعرف وحدةً واحدة للاتصال.
export {
  isSupabaseKeyError,
  SUPABASE_CONFIG_MESSAGES,
} from '@/lib/supabaseConfig';
export type { SupabaseConfigIssue } from '@/lib/supabaseConfig';

// قبل إنشاء العميل: تدفّق PKCE يحتاج SHA-256 عند أول تسجيل دخول.
installWebCryptoShim();

/**
 * إعداد عميل Supabase.
 *
 * المتغيرات تُقرأ من ملف .env (انظر .env.example):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * ثلاث حالات لا اثنتان:
 *   - المتغيران غائبان تماماً: وضع محلي مقصود، بلا تنبيه (حالة التطوير).
 *   - أحدهما موجود لكنه معطوب: إعداد ناقص، نُسمّيه للمستخدم بدل أن ندعه
 *     يصطدم بـ 401 من الخادم.
 *   - كلاهما سليم: عميل حقيقي.
 */
const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const rawAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

/**
 * true عندما لا يوجد إعداد أصلاً: التطبيق يعمل محلياً عمداً، وهذه ليست
 * حالة خطأ فلا تنبيه فيها.
 */
export const isSupabaseUnconfigured =
  rawUrl.length === 0 && rawAnonKey.length === 0;

/** خلل ثابت يُعرف قبل أي طلب شبكة. */
const staticIssue: SupabaseConfigIssue | null = isSupabaseUnconfigured
  ? null
  : inspectSupabaseEnv({ url: rawUrl, anonKey: rawAnonKey });

/**
 * خلل انكشف أثناء التشغيل: مفتاح سليم الشكل رفضه الخادم.
 *
 * في الذاكرة فقط ولهذه الجلسة: تصحيح المفتاح يحتاج إعادة تشغيل الحزم
 * على أي حال، لأن Metro يُدمج قيم `.env` داخل الحزمة.
 */
let runtimeIssue: SupabaseConfigIssue | null = null;

/** يسجّل رفض الخادم للمفتاح، فينتقل التطبيق إلى الوضع المحلي. */
export function markSupabaseKeyRejected(): void {
  runtimeIssue = 'rejected-key';
}

/** الخلل الحالي إن وُجد: الثابت أولاً، ثم ما انكشف أثناء التشغيل. */
export function supabaseConfigIssue(): SupabaseConfigIssue | null {
  return staticIssue ?? runtimeIssue;
}

/**
 * مهلة أي طلب شبكة يخرج من العميل.
 *
 * fetch في React Native بلا مهلة افتراضية: شبكة بطيئة أو محجوبة تُبقي
 * الوعد معلّقاً إلى الأبد. هذا ما كان يجمّد شاشة الإقلاع، لأن
 * getSession() يجدّد الرمز المنتهي عبر الشبكة قبل أن يعود.
 *
 * القيمة أوسع من زمن أي استعلام عادي عمداً: دوال الحافة تعيد المحاولة على
 * طراز احتياطي عند ازدحام Gemini، وقطعُها من طرف العميل قبل أن تنتهي كان
 * سيُظهر انقطاعاً غامضاً بدل رسالة "الخدمة مزدحمة". هذه مهلة أمان ضد
 * التعليق لا هدف زمني، وشاشة الإقلاع محميّة على حدة بمهلة أقصر في
 * AuthProvider.
 */
export const REQUEST_TIMEOUT_MS = 45000;

/**
 * يمنع أي طلب يخرج بغير HTTPS.
 *
 * حزامٌ ثانٍ فوق فحص الإعداد: العنوان يُفحص مرّة عند الإقلاع، لكن
 * supabase-js يبني عناوينه بنفسه ويتبع إعادات التوجيه، وطلبٌ واحد يهبط
 * إلى http يحمل رمز الجلسة نصّاً صريحاً على الشبكة. الاستثناء الوحيد
 * حلقة الاسترجاع المحلية، حيث لا تغادر البيانات الجهاز أصلاً.
 */
function assertSecureRequest(input: RequestInfo | URL): void {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // عنوان نسبي: لا يغادر أصل الصفحة، فلا شيء نتحقق منه.
    return;
  }

  if (parsed.protocol === 'https:') return;

  const isLoopback =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]';
  if (isLoopback && parsed.protocol === 'http:') return;

  throw new Error(
    `طلب غير مشفَّر إلى ${parsed.protocol}//${parsed.host} — أُلغي. استخدم HTTPS.`,
  );
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  assertSecureRequest(input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * مخزن الجلسة ومُحقّق PKCE.
 *
 * على الويب `window.localStorage` مباشرة لا AsyncStorage: نسخة AsyncStorage
 * للويب غلاف وعود حول localStorage نفسه، فلا تضيف شيئاً وتُقحم طبقة غير
 * متزامنة في مسار يجري أثناء إقلاع العميل وقبل إعادة التوجيه. والمخزن
 * المتزامن هو ما يتوقّعه supabase-js افتراضياً على المتصفّح.
 *
 * `undefined` تعني «استعمل الافتراضي»، وهي الحالة الصحيحة في بيئة بلا
 * نافذة (تصيير على الخادم) حيث لا وجود لـ localStorage أصلاً.
 */
const authStorage: SupportedStorage | undefined =
  Platform.OS === 'web'
    ? typeof window !== 'undefined'
      ? window.localStorage
      : undefined
    : AsyncStorage;

/**
 * العميل يكون null عندما لا تتوفر بيانات اتصال صالحة، حتى لا ينهار
 * التطبيق أثناء التطوير قبل ربط قاعدة البيانات — ولا يرسل طلبات محكوماً
 * عليها بالرفض عندما يكون الإعداد معطوباً.
 */
export const supabase: SupabaseClient | null =
  !isSupabaseUnconfigured && staticIssue === null
    ? createClient(rawUrl, rawAnonKey, {
        auth: {
          storage: authStorage,
          autoRefreshToken: true,
          persistSession: true,
          /**
           * التبديل يدوي على المنصّات كلها، بما فيها الويب.
           *
           * حين يتكفّل supabase-js بالتقاط `?code=` تلقائياً يجري التبديل
           * داخله: فشلُه لا يصل إلينا، فتعود الشاشة إلى الدخول بلا سبب
           * ظاهر. والأسوأ أن العنوان يبقى حاملاً الرمز، والرمز أحادي
           * الاستعمال، فكل إعادة تحميل تعيد محاولته وترجع 401.
           *
           * التبديل الصريح في AuthProvider يجري مرّة واحدة، ويُسجّل سببه
           * عند الفشل، وينظّف العنوان بعده نجح أو فشل.
           */
          detectSessionInUrl: false,
          /**
           * PKCE بدل implicit: لا تمرّ الرموز عبر جزء العنوان (fragment)،
           * وهو الأسلوب المطلوب لإعادة التوجيه إلى مخطط روابط التطبيق.
           */
          flowType: 'pkce',
        },
        global: { fetch: fetchWithTimeout },
      })
    : null;

/**
 * هل يجوز مخاطبة الخادم الآن؟
 *
 * دالّة لا ثابت: الرفض أثناء التشغيل يغيّر الجواب بعد الإقلاع، وقارئو
 * الثابت كانوا سيظلّون يرسلون طلبات مرفوضة.
 */
export function isSupabaseReady(): boolean {
  return supabase !== null && runtimeIssue === null;
}

/**
 * معاملات العنوان التي يتركها مزوّد OAuth خلفه.
 *
 * تُمسح بعد المعالجة: `code` أحادي الاستعمال، و`sb_flow_id` يدلّ على
 * مُحقّق استُهلك معه، فبقاؤهما يجعل كل إعادة تحميل محاولةَ تبديل فاشلة.
 */
export const OAUTH_URL_PARAMS = [
  'code',
  'sb_flow_id',
  'state',
  'error',
  'error_code',
  'error_description',
] as const;

/** يعيد العميل أو يرمي خطأ واضحاً عند استخدامه بدون إعداد. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase غير مُعدّ. أضف EXPO_PUBLIC_SUPABASE_URL و EXPO_PUBLIC_SUPABASE_ANON_KEY إلى ملف .env',
    );
  }
  return supabase;
}

/** أسماء الجداول في قاعدة البيانات (انظر supabase/schema.sql). */
export const TABLES = {
  contacts: 'contacts',
  events: 'events',
  transactions: 'transactions',
  eventParticipants: 'event_participants',
  sharedExpenses: 'shared_expenses',
  expenseShares: 'expense_shares',
  profiles: 'profiles',
} as const;
