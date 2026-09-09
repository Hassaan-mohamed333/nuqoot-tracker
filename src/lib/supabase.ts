import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
 * العميل يكون null عندما لا تتوفر بيانات الاتصال، حتى لا ينهار التطبيق
 * أثناء التطوير قبل ربط قاعدة البيانات.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        /**
         * على الويب يعود مزوّد OAuth إلى صفحة التطبيق ومعه الرمز في
         * العنوان، ولا بد أن يقرأه supabase-js ويُبدّله بجلسة. على المنصات
         * الأصلية لا يوجد شريط عنوان، والتبديل يتم يدوياً بعد إغلاق
         * متصفّح المصادقة.
         */
        detectSessionInUrl: Platform.OS === 'web',
        /**
         * PKCE بدل implicit: لا تمرّ الرموز عبر جزء العنوان (fragment)،
         * وهو الأسلوب المطلوب لإعادة التوجيه إلى مخطط روابط التطبيق.
         */
        flowType: 'pkce',
      },
      global: { fetch: fetchWithTimeout },
    })
  : null;

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
