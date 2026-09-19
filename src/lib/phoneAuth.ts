/**
 * ربط رقم الهاتف بالحساب عبر رمز SMS.
 *
 * الجزء النقيّ منه — التطبيع والتحقّق وآلة حالة الرمز — منفصل عن نداء
 * الشبكة عمداً: هو ما يُخطئ فعلاً (صيغة الرقم، صفر البداية، رمز ناقص)،
 * وهو ما يُختبر وحده تحت node.
 */

import { normalizeDigits, sanitizeLine } from '@/lib/validation';

/** دولة في منتقي مفتاح الاتصال. */
export interface CountryCode {
  /** رمز ISO، مفتاحاً للقائمة. */
  iso: string;
  /** مفتاح الاتصال بصيغة `+20`. */
  dial: string;
  label: string;
  /** أقصى عدد أرقام بعد المفتاح، بلا صفر البداية. */
  nationalDigits: number;
}

/**
 * الدول المتاحة.
 *
 * قائمة قصيرة لا كل دول العالم: التطبيق عربيّ الاستعمال، ومنتقٍ من
 * مئتي صفّ يخفي الخيار الصحيح بدل أن يقدّمه. تُزاد دولة بسطر واحد.
 */
export const COUNTRY_CODES: readonly CountryCode[] = [
  { iso: 'EG', dial: '+20', label: 'مصر', nationalDigits: 10 },
  { iso: 'SA', dial: '+966', label: 'السعودية', nationalDigits: 9 },
  { iso: 'AE', dial: '+971', label: 'الإمارات', nationalDigits: 9 },
  { iso: 'KW', dial: '+965', label: 'الكويت', nationalDigits: 8 },
  { iso: 'QA', dial: '+974', label: 'قطر', nationalDigits: 8 },
  { iso: 'JO', dial: '+962', label: 'الأردن', nationalDigits: 9 },
];

/** مصر افتراضاً، كما هو غالب استعمال التطبيق. */
export const DEFAULT_COUNTRY = COUNTRY_CODES[0];

export function findCountry(iso: string): CountryCode {
  return COUNTRY_CODES.find((country) => country.iso === iso) ?? DEFAULT_COUNTRY;
}

export type PhoneResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

/**
 * يبني رقماً بصيغة E.164 من مفتاح الدولة والرقم المحلي.
 *
 * صفر البداية يُحذف: المستخدم المصري يكتب `01012345678` كما يكتبه في
 * هاتفه، وE.164 لا يقبله — `+20 1012345678` هو الرقم نفسه. وحذفُه هنا
 * أولى من رفض ما كتبه وتعليمه صيغةً لا يستعملها.
 */
export function toE164(countryIso: string, raw: string): PhoneResult {
  const country = findCountry(countryIso);
  let digits = normalizeDigits(sanitizeLine(raw)).replace(/\D/g, '');

  if (!digits) return { ok: false, message: 'أدخل رقم الهاتف.' };

  /*
   * ثلاث صيغ للرقم نفسه، وكلّها شائعة: `01012345678` كما في الهاتف،
   * و`+201012345678` كما يُنسخ من واتساب، و`00201012345678` كما يُكتب
   * للاتصال الدولي في مصر والخليج. الأخيرة كانت تُرفض — والبادئة `00`
   * ليست جزءاً من الرقم بل بديلٌ عن `+`.
   */
  if (digits.startsWith('00')) digits = digits.slice(2);

  const dialDigits = country.dial.slice(1);
  if (digits.startsWith(dialDigits)) digits = digits.slice(dialDigits.length);

  // صفر البداية المحلي، بعد إزالة المفتاح لا قبله.
  digits = digits.replace(/^0+/, '');

  if (digits.length !== country.nationalDigits) {
    return {
      ok: false,
      message: `رقم ${country.label} يتكوّن من ${country.nationalDigits} أرقام بعد المفتاح.`,
    };
  }

  return { ok: true, value: `${country.dial}${digits}` };
}

/** يعرض الرقم مقسّماً، فيقرأ بالعين لا بالعدّ. */
export function formatPhone(e164: string): string {
  const country = COUNTRY_CODES.find((item) => e164.startsWith(item.dial));
  if (!country) return e164;
  const rest = e164.slice(country.dial.length);
  return `${country.dial} ${rest.replace(/(\d{3})(?=\d)/g, '$1 ')}`.trim();
}

/** طول رمز التحقّق الذي يرسله Supabase. */
export const OTP_LENGTH = 6;

export function checkOtp(raw: string): PhoneResult {
  const digits = normalizeDigits(sanitizeLine(raw)).replace(/\D/g, '');
  if (digits.length !== OTP_LENGTH) {
    return { ok: false, message: `الرمز ${OTP_LENGTH} أرقام.` };
  }
  return { ok: true, value: digits };
}

/** مراحل ربط الرقم، كما تراها الواجهة. */
export type LinkStage = 'idle' | 'sending' | 'awaiting-code' | 'verifying' | 'linked';

export interface LinkState {
  stage: LinkStage;
  /** الرقم الذي أُرسل إليه الرمز، بصيغة E.164. */
  pendingPhone: string | null;
  error: string | null;
}

export const INITIAL_LINK_STATE: LinkState = {
  stage: 'idle',
  pendingPhone: null,
  error: null,
};

export type LinkEvent =
  | { type: 'send'; phone: string }
  | { type: 'sent' }
  | { type: 'submit' }
  | { type: 'verified' }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

/**
 * آلة حالة الربط.
 *
 * منفصلة عن المكوّن ونقيّة: الانتقالات هي ما يُخطئ — رمزٌ يُرسَل مرّتين،
 * أو زرّ تحقّق يُضغط وهو يعمل، أو خطأ يُترك معروضاً بعد نجاح المحاولة
 * التالية. فحصُها بالاختبار أرخص من مطاردتها في الواجهة.
 */
export function linkReducer(state: LinkState, event: LinkEvent): LinkState {
  switch (event.type) {
    case 'send':
      // من حالة انتظار الرمز يجوز إعادة الإرسال؛ من حالة جارية لا.
      if (state.stage === 'sending' || state.stage === 'verifying') return state;
      return { stage: 'sending', pendingPhone: event.phone, error: null };

    case 'sent':
      if (state.stage !== 'sending') return state;
      return { ...state, stage: 'awaiting-code', error: null };

    case 'submit':
      if (state.stage !== 'awaiting-code') return state;
      return { ...state, stage: 'verifying', error: null };

    case 'verified':
      return { stage: 'linked', pendingPhone: state.pendingPhone, error: null };

    case 'failed':
      // الرجوع إلى الحالة التي تسمح بإعادة المحاولة، لا إلى البداية:
      // من أخطأ في الرمز لا يُعاد إليه إدخال الرقم من جديد.
      return {
        ...state,
        stage: state.pendingPhone ? 'awaiting-code' : 'idle',
        error: event.message,
      };

    case 'reset':
      return INITIAL_LINK_STATE;
  }
}

/**
 * يرسل رمز تحقّق إلى الرقم ويربطه بالحساب الحالي.
 *
 * `updateUser({ phone })` لا `signInWithOtp`: الثاني يُنشئ حساباً أو
 * يبدّل الجلسة، والمطلوب هنا إضافة رقمٍ إلى حسابٍ قائم. Supabase يرسل
 * الرمز ولا يثبّت الرقم حتى يُتحقَّق منه.
 */
export async function requestPhoneLink(e164: string): Promise<void> {
  const { supabase, usesServerData } = await import('@/lib/supabase');
  if (!usesServerData() || !supabase) {
    throw new Error('ربط الهاتف يحتاج جلسة على الخادم.');
  }

  const { error } = await supabase.auth.updateUser({ phone: e164 });
  if (error) {
    const { logSupabaseFailure } = await import('@/lib/supabaseError');
    logSupabaseFailure('إرسال رمز ربط الهاتف', error);
    throw error;
  }
}

/** يؤكّد الرمز فيصير الرقم موثَّقاً على الحساب. */
export async function confirmPhoneLink(
  e164: string,
  token: string,
): Promise<void> {
  const { supabase, usesServerData } = await import('@/lib/supabase');
  if (!usesServerData() || !supabase) {
    throw new Error('ربط الهاتف يحتاج جلسة على الخادم.');
  }

  // النوع `phone_change` لا `sms`: هذا تأكيد تغيير رقم على حساب قائم،
  // و`sms` نوع تسجيل الدخول — يردّ الخادم عليه بخطأ غامض.
  const { error } = await supabase.auth.verifyOtp({
    phone: e164,
    token,
    type: 'phone_change',
  });

  if (error) {
    const { logSupabaseFailure } = await import('@/lib/supabaseError');
    logSupabaseFailure('تأكيد رمز ربط الهاتف', error);
    throw error;
  }
}
