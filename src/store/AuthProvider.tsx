import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { authThrottle } from '@/lib/authThrottle';
import { captchaToken } from '@/lib/captcha';
import { logger } from '@/lib/logger';
import type { RateLimitAction } from '@/lib/rateLimit';
import { clearLocalData } from '@/lib/storage';
import {
  isSupabaseKeyError,
  isSupabaseUnconfigured,
  markSupabaseKeyRejected,
  OAUTH_URL_PARAMS,
  requireSupabase,
  supabase,
  supabaseConfigIssue,
  type SupabaseConfigIssue,
} from '@/lib/supabase';
import { logStepFailure, userMessage } from '@/lib/supabaseError';
import { checkEmail, checkPassword, ValidationError } from '@/lib/validation';

// يُغلق نافذة المصادقة المنبثقة على الويب عند العودة.
WebBrowser.maybeCompleteAuthSession();

/**
 * وجهة العودة بعد موافقة Google.
 *
 * على الويب: أصل الصفحة نفسه، ليقرأ supabase-js الرمز من العنوان.
 * على المنصات الأصلية: رابط عميق بمخطط التطبيق (nuqoot://) — أو exp://
 * داخل Expo Go، وهو ما تتكفّل به createURL تلقائياً.
 */
function oauthRedirectTo(): string {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return '';
    // الأصل وحده يُسقط المسار: تطبيق يُقدَّم تحت مسار فرعي يعود إلى جذر
    // النطاق فيضيع. ولا نمرّر البحث ولا الجزء: يضيف إليهما supabase-js
    // معاملاته (`sb_flow_id`) بنفسه.
    return `${window.location.origin}${window.location.pathname}`;
  }
  return Linking.createURL('auth/callback');
}

/**
 * يمسح معاملات OAuth من شريط العنوان بعد معالجتها.
 *
 * بدون هذا يبقى `code` في العنوان، وهو أحادي الاستعمال: أي إعادة تحميل
 * تعيد محاولة تبديله فترجع 401، فتبدو المصادقة معطّلة وهي ليست كذلك.
 */
function clearOAuthParamsFromUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let touched = false;
    for (const key of OAUTH_URL_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        touched = true;
      }
    }
    if (!touched) return;
    window.history.replaceState({}, '', url.toString());
  } catch (error) {
    logStepFailure('تنظيف معاملات العنوان', error);
  }
}

/** نتيجة محاولة إكمال OAuth: رسالة للعرض، وهل كان السبب المفتاح نفسه. */
interface OAuthFailure {
  message: string;
  /** true عندما رفض الخادم المفتاح العام لا بيانات المستخدم. */
  keyRejected: boolean;
}

/**
 * يُكمل عودة OAuth على الويب: يُبدّل `code` بجلسة مرّة واحدة.
 *
 * يُرجع سبب الفشل بدل ابتلاعه، لأن الصمت هنا يعني شاشة دخول بلا تفسير.
 * ومعرّف التدفّق (`sb_flow_id`) يقرأه supabase-js من العنوان نفسه، فيجب
 * ألا يُنظَّف العنوان قبل التبديل.
 */
async function completeWebOAuth(
  client: NonNullable<typeof supabase>,
): Promise<OAuthFailure | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const params = new URL(window.location.href).searchParams;
  const code = params.get('code');
  const providerError =
    params.get('error_description') ?? params.get('error') ?? null;

  if (!code && !providerError) return null;

  try {
    if (providerError) {
      logger.warn('auth', 'المزوّد أعاد خطأ أثناء العودة.');
      return { message: providerError, keyRejected: false };
    }
    if (!code) return null;

    logger.debug('auth', 'تبديل رمز OAuth بجلسة…');
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      logStepFailure('تبديل رمز OAuth بجلسة', error);
      return {
        message: userMessage(error),
        keyRejected: isSupabaseKeyError(error),
      };
    }

    logger.debug('auth', 'تمّ التبديل، الجلسة جاهزة.');
    return null;
  } catch (error) {
    logStepFailure('تبديل رمز OAuth بجلسة', error);
    return {
      message: userMessage(error),
      keyRejected: isSupabaseKeyError(error),
    };
  } finally {
    // ينظَّف في الحالتين: الرمز استُهلك على الخادم حتى لو فشلنا بعده.
    clearOAuthParamsFromUrl();
  }
}

/**
 * أقصى انتظار لاستعادة الجلسة عند الإقلاع.
 *
 * أقصر من مهلة الشبكة في العميل عمداً: حتى لو تعثّر الطلب نعرض شاشة
 * الدخول بدل إبقاء المستخدم أمام شاشة تحميل. إن عادت الجلسة بعد ذلك
 * يلتقطها onAuthStateChange فينتقل التطبيق إلى الداخل تلقائياً.
 */
const SESSION_RESTORE_TIMEOUT_MS = 8000;

/**
 * أقصى انتظار لتبديل رمز OAuth بجلسة.
 *
 * أقصر بكثير من مهلة الشبكة العامة (45 ثانية): تلك وُضعت لدوال الحافة
 * البطيئة، وتطبيقها هنا يعني شاشة إقلاع معلّقة قرابة الدقيقة أمام من عاد
 * للتوّ من Google.
 */
const OAUTH_EXCHANGE_TIMEOUT_MS = 15000;

/** هل ما زال العنوان يحمل رمز OAuth؟ (بعد نجاح التبديل يُنظَّف). */
function hasPendingOAuthCode(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.has('code');
}

/** يعيد null إذا تجاوز الوعد المهلة، بدل أن يبقى معلّقاً. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** معرّف المستخدم الحالي، وهو ما تعتمد عليه سياسات RLS. */
  userId: string | null;
  /** true أثناء استعادة الجلسة المحفوظة عند الإقلاع. */
  loading: boolean;
  /** رسالة تظهر عندما تفشل استعادة الجلسة أو تتجاوز المهلة. */
  initError: string | null;
  /** يتخطى انتظار الاستعادة يدوياً (زر «متابعة» في شاشة الإقلاع). */
  continueWithoutSession: () => void;
  /**
   * خلل في إعداد الاتصال، إن وُجد.
   *
   * غير `initError`: هذا عطب دائم في الإعداد لا تعثّر عابر، ولا يُصلحه
   * تكرار المحاولة. وجودُه يعني أن أزرار الدخول كلها ستفشل.
   */
  configIssue: SupabaseConfigIssue | null;
  /** ينتقل إلى الوضع المحلي التجريبي رغم عطب الإعداد. */
  continueInDemoMode: () => void;
  /**
   * true عندما يعمل التطبيق بلا Supabase (وضع محلي)، فلا حاجة لتسجيل الدخول.
   */
  authDisabled: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** يعيد true إذا لزم تأكيد البريد قبل إنشاء الجلسة. */
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  signInAnonymously: () => Promise<void>;
  /** دخول عبر Google. يرمي خطأً واضحاً عند الإلغاء أو الفشل. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * يدير جلسة Supabase: يستعيدها عند الإقلاع، ويتابع تغيّراتها، ويوفّر
 * دوال الدخول والخروج. الجلسة محفوظة في AsyncStorage عبر إعداد العميل.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // بلا عميل لا شيء يُستعاد: نبدأ جاهزين بدل وميض شاشة إقلاع.
  const [loading, setLoading] = useState(supabase !== null);
  const [initError, setInitError] = useState<string | null>(null);
  const [configIssue, setConfigIssue] = useState<SupabaseConfigIssue | null>(
    () => supabaseConfigIssue(),
  );
  const [demoMode, setDemoMode] = useState(false);

  const continueWithoutSession = useCallback(() => setLoading(false), []);
  const continueInDemoMode = useCallback(() => setDemoMode(true), []);

  /**
   * يُسقط الاتصال عندما يكون سبب الفشل المفتاحَ نفسه.
   *
   * يُعيد true ليعرف المستدعي أنه لا داعي لرسالة خطأ ثانية: لافتة
   * الإعداد تشرح العطب وتعرض المخرج.
   */
  const registerKeyRejection = useCallback((error: unknown): boolean => {
    if (!isSupabaseKeyError(error)) return false;
    markSupabaseKeyRejected();
    setConfigIssue('rejected-key');
    return true;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const client = supabase;
    let active = true;

    // الاشتراك أولاً: لو تأخّر getSession أو تجاوز المهلة، يصل حدث
    // INITIAL_SESSION لاحقاً فيستأنف التطبيق من تلقاء نفسه.
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setInitError(null);
        setLoading(false);
      },
    );

    async function restoreSession() {
      try {
        // قبل أي شيء: إن كنّا عائدين للتوّ من المزوّد فالجلسة تُبنى من
        // الرمز، وقراءةُ جلسة قديمة قبله بلا معنى.
        const oauthFailure = await withTimeout(
          completeWebOAuth(client),
          OAUTH_EXCHANGE_TIMEOUT_MS,
        );
        if (!active) return;
        if (oauthFailure === null && hasPendingOAuthCode()) {
          // null من withTimeout تعني تجاوز المهلة لا نجاحاً؛ نميّزها ببقاء
          // الرمز في العنوان، إذ ينظّفه completeWebOAuth عند انتهائه.
          setInitError('تأخّر إكمال تسجيل الدخول. حاول مرّة أخرى.');
        } else if (oauthFailure) {
          if (oauthFailure.keyRejected) {
            // المفتاح نفسه مرفوض: قراءة الجلسة بعده ستفشل كذلك، واللافتة
            // تشرح العطب وتعرض المخرج المحلي. لا داعي لرسالة ثانية.
            markSupabaseKeyRejected();
            setConfigIssue('rejected-key');
            return;
          }
          setInitError(`تعذّر إكمال تسجيل الدخول: ${oauthFailure.message}`);
        }

        const result = await withTimeout(
          client.auth.getSession(),
          SESSION_RESTORE_TIMEOUT_MS,
        );
        if (!active) return;

        if (result === null) {
          setInitError('تعذّر التحقق من الجلسة في الوقت المتاح.');
          return;
        }
        if (result.error) throw result.error;

        setSession(result.data.session);
      } catch (error) {
        if (!active) return;
        logStepFailure('استعادة الجلسة', error);
        if (!registerKeyRejection(error)) {
          setInitError(
            `تعذّر استعادة جلستك السابقة: ${userMessage(error)}`,
          );
        }
      } finally {
        // مهما حدث — نجاح أو خطأ أو مهلة — لا تبقى شاشة الإقلاع معلّقة.
        if (active) setLoading(false);
      }
    }

    void restoreSession();

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [registerKeyRejection]);

  /** يرمي الخطأ بعد تسجيل رفض المفتاح، إن كان هذا سببه. */
  const failAuth = useCallback(
    (error: unknown): never => {
      registerKeyRejection(error);
      throw error instanceof Error ? error : new Error(String(error));
    },
    [registerKeyRejection],
  );

  /**
   * يمرّر المحاولة على حاجز المعدّل.
   *
   * الفشل يُسجَّل والنجاح يمسح السجل، فلا يُعاقَب من أخطأ مرّة ثم دخل.
   * الرمي بـ ValidationError لأن رسالته موجَّهة للمستخدم أصلاً وتمرّ من
   * userMessage كما هي.
   */
  const guarded = useCallback(
    async <T,>(
      action: RateLimitAction,
      identity: string | undefined,
      run: () => Promise<T>,
    ): Promise<T> => {
      const verdict = await authThrottle.check(action, identity);
      if (!verdict.allowed) {
        throw new ValidationError([
          {
            field: 'rate_limit',
            code: 'too_many_attempts',
            message: verdict.message ?? 'محاولات كثيرة. انتظر قليلاً.',
          },
        ]);
      }

      try {
        const result = await run();
        await authThrottle.recordSuccess(action, identity);
        return result;
      } catch (error) {
        const next = await authThrottle.recordFailure(action, identity);
        if (!next.allowed) logger.warn('auth', `تجاوز حدّ المحاولات: ${action}`);
        throw error;
      }
    },
    [],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      // التحقّق قبل الشبكة: صيغة بريد خاطئة لا تستحق طلباً، ورسالتها
      // المحلية أوضح من ردّ الخادم العام.
      const address = checkEmail(email);
      if (!address.ok) throw new ValidationError(address.issues);

      await guarded('signIn', address.value, async () => {
        const { error } = await requireSupabase().auth.signInWithPassword({
          email: address.value,
          password,
          options: { captchaToken: await captchaToken() },
        });
        if (error) failAuth(error);
      });
    },
    [failAuth, guarded],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      const address = checkEmail(email);
      if (!address.ok) throw new ValidationError(address.issues);

      // سياسة كلمة المرور تُفرض هنا لا في الشاشة وحدها: الشاشة بابٌ واحد،
      // وهذا هو الممرّ الذي تمرّ منه كل الأبواب.
      const strength = checkPassword(password, { email: address.value });
      if (!strength.ok) throw new ValidationError(strength.issues);

      return guarded('signUp', address.value, async () => {
        const { data, error } = await requireSupabase().auth.signUp({
          email: address.value,
          password,
          options: { captchaToken: await captchaToken() },
        });
        if (error) failAuth(error);
        // بلا جلسة يعني أن المشروع يطلب تأكيد البريد أولاً.
        return data.session === null;
      });
    },
    [failAuth, guarded],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      // بلا إعداد Supabase لا يوجد مزوّد أصلاً؛ نُبلغ بدل الصمت.
      throw new Error('Supabase غير مُعدّ، فلا يمكن تسجيل الدخول بحساب Google.');
    }

    const gate = await authThrottle.check('oauth');
    if (!gate.allowed) {
      throw new ValidationError([
        {
          field: 'rate_limit',
          code: 'too_many_attempts',
          message: gate.message ?? 'محاولات كثيرة. انتظر قليلاً.',
        },
      ]);
    }

    const redirectTo = oauthRedirectTo();
    // وجهة العودة وحدها في السجل: هي أول ما يجب مطابقته مع قائمة
    // Redirect URLs، وهي عنوانٌ عامّ لا سرّ فيه.
    logger.debug('auth', `google sign-in, redirectTo = ${redirectTo}`);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        /*
         * الانتقال بأيدينا على المنصّات كلها.
         *
         * بترك التوجيه لـ supabase-js على الويب كان ينتقل هو، ثم ينتقل
         * هذا الملف مرّة ثانية إلى العنوان نفسه: انتقالان متتاليان قد
         * يُجهض أوّلهما. واحدةٌ صريحة أوضح وأضمن.
         */
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      logger.error('auth', 'signInWithOAuth رفض الطلب', error);
      await authThrottle.recordFailure('oauth');
      failAuth(error);
    }

    // الأصل وحده لا العنوان كاملاً: عنوان المزوّد يحمل تحدّي PKCE وحالة
    // الطلب، ولا داعي لبقائهما في سجلّ المتصفّح.
    logger.debug(
      'auth',
      `provider = ${data?.url ? new URL(data.url).origin : '(none)'}`,
    );

    if (Platform.OS === 'web') {
      if (!data?.url) {
        throw new Error('لم يُرجع Supabase رابط مصادقة Google.');
      }
      if (typeof window === 'undefined') {
        throw new Error('لا توجد نافذة متصفّح لبدء المصادقة.');
      }
      // المُحقّق كُتب في localStorage قبل هذا السطر (signInWithOAuth ينتظر
      // الكتابة)، فالانتقال الآن آمن.
      window.location.assign(data.url);
      return;
    }

    if (!data?.url) {
      throw new Error('لم يُرجع Supabase رابط مصادقة.');
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('أُلغي تسجيل الدخول.');
    }
    if (result.type !== 'success' || !result.url) {
      throw new Error('لم تكتمل المصادقة.');
    }

    // PKCE: العنوان العائد يحمل code نُبدّله بجلسة.
    const returnedUrl = new URL(result.url);
    const code = returnedUrl.searchParams.get('code');
    const oauthError =
      returnedUrl.searchParams.get('error_description') ??
      returnedUrl.searchParams.get('error');

    if (oauthError) throw new Error(oauthError);
    if (!code) {
      throw new Error('لم يصل رمز المصادقة من Google.');
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code,
    );
    if (exchangeError) {
      logStepFailure('تبديل رمز OAuth بجلسة', exchangeError);
      failAuth(exchangeError);
    }
    // onAuthStateChange يلتقط الجلسة الجديدة ويحدّث الحالة.
  }, [failAuth]);

  const signInAnonymously = useCallback(async () => {
    await guarded('anonymous', undefined, async () => {
      const { error } = await requireSupabase().auth.signInAnonymously({
        options: { captchaToken: await captchaToken() },
      });
      if (error) failAuth(error);
    });
  }, [failAuth, guarded]);

  const signOut = useCallback(async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
    } catch {
      // تعذّر إبطال الجلسة على الخادم (شبكة أو مهلة): نُخرج محلياً على
      // الأقل، فالبديل هو إبقاء المستخدم داخل حساب أراد الخروج منه.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }

    // النسخة المحلية تخصّ الحساب السابق، فلا يجوز أن يراها الحساب التالي.
    await clearLocalData();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      userId: session?.user.id ?? null,
      loading,
      initError,
      continueWithoutSession,
      configIssue,
      continueInDemoMode,
      // الإعداد الغائب تماماً وضعٌ محلي مقصود؛ أما المعطوب فيمرّ على شاشة
      // الدخول أولاً ليرى المستخدم سبب العطب قبل أن يختار الوضع التجريبي.
      authDisabled: isSupabaseUnconfigured || demoMode,
      signInWithEmail,
      signUpWithEmail,
      signInAnonymously,
      signInWithGoogle,
      signOut,
    }),
    [
      session,
      loading,
      initError,
      continueWithoutSession,
      configIssue,
      continueInDemoMode,
      demoMode,
      signInWithEmail,
      signUpWithEmail,
      signInAnonymously,
      signInWithGoogle,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider');
  }
  return context;
}
