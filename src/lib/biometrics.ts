/**
 * قفل حيويّ للتطبيق: بصمة أو وجه.
 *
 * ---------------------------------------------------------------------
 * **خلفيّتان، لا واحدة.** `expo-local-authentication` لا ينفّذ شيئاً على
 * الويب: شيمة الويب فيه تعيد `hasHardwareAsync() === false` دائماً.
 * وبناء الويب هو ما يُنشر على GitHub Pages — فاقتصارٌ عليه كان سيعني
 * ميزةً لا تعمل في المكان الذي يستعمله المستخدم فعلاً.
 *
 * فعلى الهاتف: المنتقي الأصلي. وعلى الويب: WebAuthn، وهي واجهة
 * المتصفّح التي تفتح Touch ID وWindows Hello وبصمة أندرويد.
 *
 * **وما هذا القفل وما ليس هو.** هو قفلُ جهاز: يمنع من يفتح التطبيق على
 * جهازك من رؤية دفترك. وليس مصادقةً على الخادم: لا توقيع يُتحقَّق منه في
 * الخلف، ومن يملك الجهاز ويمسح تخزين التطبيق يتجاوزه. وهذا حال القفل
 * الحيوي في كل تطبيق محليّ، والوعد بغيره وعدٌ كاذب.
 * ---------------------------------------------------------------------
 */

import { Platform } from 'react-native';

import { logger } from '@/lib/logger';

/** الآلية المتاحة على هذا الجهاز. */
export type BiometricKind = 'native' | 'webauthn' | 'none';

export interface BiometricCapability {
  kind: BiometricKind;
  /** هل توجد عتاد وتسجيل بصمة/وجه؟ */
  available: boolean;
  /** سبب التعذّر بالعربية، للعرض تحت المفتاح. */
  reason: string | null;
}

export type BiometricOutcome =
  | { ok: true }
  | { ok: false; cancelled: boolean; message: string };

const UNAVAILABLE = 'لا يدعم هذا الجهاز القفل الحيوي، أو لا بصمة مسجّلة عليه.';

/* ------------------------------------------------------------------ */
/* الويب: WebAuthn                                                      */
/* ------------------------------------------------------------------ */

/** مفتاح بيانات الاعتماد المحفوظة على هذا المتصفّح. */
const WEB_CREDENTIAL_KEY = 'nuqoot:biometric-credential';

function webAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator !== 'undefined' &&
    navigator.credentials !== undefined
  );
}

/**
 * تحدٍّ عشوائي جديد لكل نداء.
 *
 * النوع `Uint8Array<ArrayBuffer>` صراحةً: `BufferSource` في تعريفات
 * WebAuthn لا تقبل `ArrayBufferLike` العامّ لأنه يشمل `SharedArrayBuffer`.
 */
function randomChallenge(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(32));
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function readWebCredential(): string | null {
  try {
    return window.localStorage.getItem(WEB_CREDENTIAL_KEY);
  } catch {
    // نافذة خاصة أو تخزين محجوب: نتعامل معها كأن لا اعتماد مسجّلاً.
    return null;
  }
}

async function inspectWeb(): Promise<BiometricCapability> {
  if (!webAuthnSupported()) {
    return { kind: 'none', available: false, reason: UNAVAILABLE };
  }

  /*
   * WebAuthn لا تعمل إلا في سياق آمن، واسم المضيف لا بدّ أن يكون نطاقاً
   * — عنوان IP يُرفض بـ «invalid domain» عند أوّل تسجيل لا عند الفحص.
   * فبلا هذا الشرط يبدو المفتاح متاحاً ثم يفشل عند الضغط بلا سبب مفهوم.
   */
  const host = window.location?.hostname ?? '';
  const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (!window.isSecureContext || isIpAddress) {
    return {
      kind: 'none',
      available: false,
      reason: 'القفل الحيوي يحتاج فتح الموقع عبر https أو localhost.',
    };
  }
  try {
    const available =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return {
      kind: available ? 'webauthn' : 'none',
      available,
      reason: available ? null : UNAVAILABLE,
    };
  } catch {
    return { kind: 'none', available: false, reason: UNAVAILABLE };
  }
}

/**
 * يسجّل اعتماداً على هذا المتصفّح عند تفعيل القفل.
 *
 * `userVerification: 'required'` هو ما يجعل المتصفّح يطلب البصمة لا
 * مجرّد حضور المفتاح، و`platform` تقصره على العتاد المدمج في الجهاز
 * فلا يُقبل مفتاح USB بدل الإصبع.
 */
async function enrollWeb(): Promise<BiometricOutcome> {
  try {
    const userId = randomChallenge();
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: 'نقوط' },
        user: { id: userId, name: 'nuqoot', displayName: 'نقوط' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { ok: false, cancelled: true, message: 'أُلغي التسجيل.' };
    }

    window.localStorage.setItem(
      WEB_CREDENTIAL_KEY,
      toBase64Url(credential.rawId),
    );
    return { ok: true };
  } catch (error) {
    return webFailure(error);
  }
}

async function promptWeb(): Promise<BiometricOutcome> {
  const stored = readWebCredential();
  if (!stored) {
    // لا اعتماد على هذا المتصفّح: التفعيل تمّ على جهاز آخر، أو مُسح
    // التخزين. نطلب التسجيل بدل أن نقفل الباب على صاحبه.
    return enrollWeb();
  }

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: fromBase64Url(stored), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return assertion
      ? { ok: true }
      : { ok: false, cancelled: true, message: 'أُلغي التحقّق.' };
  } catch (error) {
    return webFailure(error);
  }
}

function webFailure(error: unknown): BiometricOutcome {
  const name = (error as { name?: string } | null)?.name ?? '';
  // NotAllowedError تعني الإلغاء أو انتهاء المهلة — وهي ليست عطباً.
  const cancelled = name === 'NotAllowedError' || name === 'AbortError';
  if (!cancelled) logger.error('biometrics', 'فشل WebAuthn', error);
  return {
    ok: false,
    cancelled,
    message: cancelled ? 'أُلغي التحقّق.' : 'تعذّر التحقّق على هذا المتصفّح.',
  };
}

/* ------------------------------------------------------------------ */
/* الهاتف: expo-local-authentication                                    */
/* ------------------------------------------------------------------ */

async function inspectNative(): Promise<BiometricCapability> {
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return {
        kind: 'none',
        available: false,
        reason: 'لا يحمل هذا الجهاز مستشعر بصمة أو وجه.',
      };
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return {
        kind: 'none',
        available: false,
        reason: 'سجّل بصمتك أو وجهك في إعدادات الجهاز أولاً.',
      };
    }

    return { kind: 'native', available: true, reason: null };
  } catch (error) {
    logger.error('biometrics', 'تعذّر فحص العتاد', error);
    return { kind: 'none', available: false, reason: UNAVAILABLE };
  }
}

async function promptNative(reason: string): Promise<BiometricOutcome> {
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'إلغاء',
      // لا رجوع إلى رمز الجهاز: القفل هنا حيويّ بالاسم، والرجوع الصامت
      // إلى رمز المرور يجعل «فعّلتُ البصمة» وعداً غير دقيق.
      disableDeviceFallback: false,
    });

    if (result.success) return { ok: true };

    const cancelled =
      result.error === 'user_cancel' ||
      result.error === 'app_cancel' ||
      result.error === 'system_cancel';

    return {
      ok: false,
      cancelled,
      message: cancelled ? 'أُلغي التحقّق.' : 'لم يُتعرَّف على بصمتك.',
    };
  } catch (error) {
    logger.error('biometrics', 'فشل طلب التحقّق', error);
    return { ok: false, cancelled: false, message: UNAVAILABLE };
  }
}

/* ------------------------------------------------------------------ */
/* الواجهة الموحّدة                                                      */
/* ------------------------------------------------------------------ */

/** هل يمكن تفعيل القفل على هذا الجهاز، وإن لا فلماذا؟ */
export function inspectBiometrics(): Promise<BiometricCapability> {
  return Platform.OS === 'web' ? inspectWeb() : inspectNative();
}

/** يطلب التحقّق. يُستدعى عند التفعيل وعند كل فتح للتطبيق. */
export function promptBiometrics(
  reason = 'افتح نقوط ببصمتك',
): Promise<BiometricOutcome> {
  return Platform.OS === 'web' ? promptWeb() : promptNative(reason);
}

/** يسجّل الاعتماد لأوّل مرّة (الويب) أو يتحقّق (الهاتف). */
export function enrollBiometrics(): Promise<BiometricOutcome> {
  return Platform.OS === 'web'
    ? enrollWeb()
    : promptNative('فعّل قفل نقوط ببصمتك');
}

/** ينسى اعتماد هذا المتصفّح عند إطفاء القفل. */
export function forgetBiometrics(): void {
  if (Platform.OS !== 'web') return;
  try {
    window.localStorage.removeItem(WEB_CREDENTIAL_KEY);
  } catch {
    // لا شيء نفعله: التفضيل نفسه أُطفئ على أي حال.
  }
}
