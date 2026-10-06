/**
 * دعم CAPTCHA في مسارات المصادقة.
 *
 * Supabase يفرض CAPTCHA على مستوى المشروع (Authentication ← Attack
 * Protection). حين يكون مفعَّلاً، كل نداء signUp/signInWithPassword/
 * signInAnonymously بلا `options.captchaToken` يُرَدّ بـ `captcha_failed`.
 *
 * هذا الملف يوصّل الأنبوب ولا يرسم الواجهة: عرض hCaptcha أو Turnstile
 * داخل React Native يحتاج مكوّن WebView، وإضافته اعتماديةٌ ثقيلة لا
 * تُفرض على مشروع قد لا يُفعّل الميزة أصلاً. متى فُعّلت، يُسجَّل المزوّد
 * عبر `setCaptchaProvider` فيبدأ سريانه في كل المسارات دفعة واحدة.
 */

/** المزوّد المضبوط من البيئة، إن وُجد. */
const SITE_KEY = (
  process.env.EXPO_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY ?? ''
).trim();

const PROVIDER = (
  process.env.EXPO_PUBLIC_SUPABASE_CAPTCHA_PROVIDER ?? 'hcaptcha'
).trim();

/** true عندما ضُبط مفتاح الموقع، أي أن المشروع يتوقّع رمز تحقّق. */
export function isCaptchaConfigured(): boolean {
  return SITE_KEY.length > 0;
}

export function captchaSiteKey(): string {
  return SITE_KEY;
}

export function captchaProvider(): string {
  return PROVIDER;
}

/** يُنتج رمز تحقّق واحد. تُسجّله طبقة الواجهة عند تركيب الودجة. */
export type CaptchaTokenProvider = () => Promise<string>;

let provider: CaptchaTokenProvider | null = null;

/** يسجّل مصدر الرموز (ودجة hCaptcha/Turnstile). */
export function setCaptchaProvider(next: CaptchaTokenProvider | null): void {
  provider = next;
}

/**
 * يعيد رمز التحقّق، أو `undefined` عندما لا يكون مطلوباً.
 *
 * يرمي عندما يكون مضبوطاً بلا مزوّد مركَّب: الصمت هنا يعني نداءً محكوماً
 * بالفشل برسالة `captcha_failed` غامضة، والخطأ الصريح يدلّ على الإصلاح.
 */
export async function captchaToken(): Promise<string | undefined> {
  if (!isCaptchaConfigured()) return undefined;
  if (!provider) {
    throw new Error(
      'التحقّق البشري مطلوب لكن لم تُركَّب ودجة CAPTCHA. استدعِ setCaptchaProvider عند الإقلاع.',
    );
  }
  const token = await provider();
  return token || undefined;
}
