import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { installWebCryptoShim } from '@/lib/webCryptoShim';

// قبل إنشاء العميل: تدفّق PKCE يحتاج SHA-256 عند أول تسجيل دخول.
installWebCryptoShim();

/**
 * إعداد عميل Supabase.
 *
 * المتغيرات تُقرأ من ملف .env (انظر .env.example):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * في حال عدم ضبطها يعمل التطبيق بالبيانات المحلية (AsyncStorage) بدون اتصال.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** هل الاتصال بالخادم مضبوط بالكامل؟ */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

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

const fetchWithTimeout: typeof fetch = async (input, init) => {
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
 * العميل يكون null عندما لا تتوفر بيانات الاتصال، حتى لا ينهار التطبيق
 * أثناء التطوير قبل ربط قاعدة البيانات.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
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
} as const;
