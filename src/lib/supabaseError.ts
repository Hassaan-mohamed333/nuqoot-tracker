/**
 * وصف أخطاء Supabase، بوجهين: وجهٌ للمطوّر ووجهٌ للمستخدم.
 *
 * الفرق مقصود وأمنيّ. PostgrestError يحمل `details` و`hint`، وتوثيق
 * PostgREST نفسه ينصّ على أن `hint` قد يحمل جملة SQL جاهزة أو اسم عمود
 * أو قيداً — وهي بنيةُ قاعدة البيانات، لا شأن للمستخدم النهائي بها
 * ولا يجوز أن تُعرض له. لذلك:
 *
 *   - describeSupabaseError: كل الحقول، للسجل في التطوير فقط.
 *   - userMessage: رسالة عربية مفهومة، بلا أي تفصيل داخلي.
 */

import { logger } from '@/lib/logger';
import { ValidationError } from '@/lib/validation';

interface SupabaseErrorShape {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  error?: unknown;
  name?: unknown;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

/** سطر تشخيصي كامل. للمطوّر: لا يُعرض للمستخدم في الإنتاج. */
export function describeSupabaseError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.trim()
      ? error
      : 'حدث خطأ غير متوقع.';
  }

  const shape = error as SupabaseErrorShape;
  const parts: string[] = [];

  const message =
    asText(shape.message) ??
    asText(shape.error) ??
    (error instanceof Error ? error.message : null);
  parts.push(message ?? 'حدث خطأ غير متوقع.');

  const code = asText(shape.code) ?? asText(shape.statusCode);
  if (code) parts.push(`[${code}]`);

  const status = asText(shape.status);
  if (status && status !== code) parts.push(`(HTTP ${status})`);

  const details = asText(shape.details);
  if (details) parts.push(`— ${details}`);

  const hint = asText(shape.hint);
  if (hint) parts.push(`— ${hint}`);

  return parts.join(' ');
}

/**
 * ترجمة الأسباب المعروفة إلى رسائل صالحة للعرض.
 *
 * المفتاح رمز الخطأ لا نصّه: النصوص تتغيّر بين إصدارات Supabase، والرموز
 * مستقرّة وموثّقة.
 */
const BY_CODE: Record<string, string> = {
  invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  invalid_login_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  email_not_confirmed: 'فعّل بريدك من رسالة التأكيد قبل تسجيل الدخول.',
  user_already_exists: 'هذا البريد مسجَّل بالفعل. سجّل الدخول بدل إنشاء حساب.',
  email_exists: 'هذا البريد مسجَّل بالفعل. سجّل الدخول بدل إنشاء حساب.',
  weak_password: 'كلمة المرور ضعيفة. اخترها أطول وأكثر تنوّعاً.',
  over_request_rate_limit: 'محاولات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.',
  over_email_send_rate_limit: 'أُرسلت رسائل كثيرة إلى هذا البريد. انتظر قليلاً.',
  signup_disabled: 'إنشاء الحسابات معطّل في هذا المشروع حالياً.',
  anonymous_provider_disabled: 'الدخول كضيف غير مفعّل في إعدادات المشروع.',
  captcha_failed: 'فشل التحقّق من أنك لست روبوتاً. أعد المحاولة.',
  session_expired: 'انتهت جلستك. سجّل الدخول من جديد.',
  session_not_found: 'انتهت جلستك. سجّل الدخول من جديد.',
  // PostgREST / PostgreSQL
  '23505': 'هذا السجل موجود مسبقاً.',
  '23503': 'العنصر المرتبط غير موجود أو حُذف.',
  '23514': 'إحدى القيم غير مقبولة. راجع المبلغ والتاريخ.',
  '23502': 'حقل مطلوب ناقص.',
  '42501': 'لا تملك صلاحية لهذا الإجراء.',
  PGRST301: 'انتهت جلستك. سجّل الدخول من جديد.',
  PGRST116: 'لم يُعثر على السجل المطلوب.',
};

const GENERIC = 'تعذّر إتمام العملية. حاول مرّة أخرى.';
const NETWORK = 'تعذّر الاتصال بالخادم. تحقّق من الشبكة ثم أعد المحاولة.';

function looksLikeNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const shape = error as SupabaseErrorShape;
  const name = asText(shape.name) ?? '';
  const message = (asText(shape.message) ?? '').toLowerCase();
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    message.includes('network request failed') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch')
  );
}

/**
 * الرسالة الوحيدة التي يجوز عرضها للمستخدم.
 *
 * أخطاء التحقّق تمرّ كما هي: نحن كتبناها، وهي موجَّهة للمستخدم أصلاً
 * ولا تحمل شيئاً من بنية الخادم.
 */
export function userMessage(error: unknown): string {
  if (error instanceof ValidationError) return error.message;

  if (looksLikeNetworkFailure(error)) return NETWORK;

  if (error && typeof error === 'object') {
    const shape = error as SupabaseErrorShape;
    const code = asText(shape.code) ?? asText(shape.statusCode);
    if (code && BY_CODE[code]) return BY_CODE[code];

    const status = Number(asText(shape.status) ?? NaN);
    if (status === 401 || status === 403) {
      return 'انتهت صلاحية جلستك أو لا تملك صلاحية لهذا الإجراء.';
    }
    if (status === 429) return BY_CODE.over_request_rate_limit;
    if (status >= 500) return 'الخدمة غير متاحة مؤقتاً. أعد المحاولة بعد قليل.';
  }

  // في التطوير نُظهر التفصيل الكامل: تشخيصُه أسرع، والجهاز جهاز المطوّر.
  return logger.isDev() ? describeSupabaseError(error) : GENERIC;
}

/**
 * يسجّل فشل خطوة.
 *
 * الكائن الكامل يمرّ على تنقية `redact` ولا يُطبع إلا في التطوير؛ في
 * الإنتاج يبقى سطر واحد يقول ما الخطوة التي فشلت دون ما فشلت به.
 */
export function logStepFailure(step: string, error: unknown): void {
  logger.error('nuqoot', `فشلت الخطوة: ${step}`, error);
}
