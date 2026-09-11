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

import { clearLocalData } from '@/lib/storage';
import {
  isSupabaseConfigured,
  OAUTH_URL_PARAMS,
  supabase,
} from '@/lib/supabase';
import { describeSupabaseError, logStepFailure } from '@/lib/supabaseError';

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

/**
 * يُكمل عودة OAuth على الويب: يُبدّل `code` بجلسة مرّة واحدة.
 *
 * يُرجع رسالة الخطأ عند الفشل بدل ابتلاعه، لأن الصمت هنا يعني شاشة دخول
 * بلا تفسير. ومعرّف التدفّق (`sb_flow_id`) يقرأه supabase-js من العنوان
 * نفسه، فيجب ألا يُنظَّف العنوان قبل التبديل.
 */
async function completeWebOAuth(
  client: NonNullable<typeof supabase>,
): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const params = new URL(window.location.href).searchParams;
  const code = params.get('code');
  const providerError =
    params.get('error_description') ?? params.get('error') ?? null;

  if (!code && !providerError) return null;

  try {
    if (providerError) {
      console.error('[auth] المزوّد أعاد خطأ:', providerError);
      return providerError;
    }
    if (!code) return null;

    console.log('[auth] تبديل رمز OAuth بجلسة…');
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      logStepFailure('تبديل رمز OAuth بجلسة', error);
      return describeSupabaseError(error);
    }

    console.log('[auth] تمّ التبديل، الجلسة جاهزة.');
    return null;
  } catch (error) {
    logStepFailure('تبديل رمز OAuth بجلسة', error);
    return describeSupabaseError(error);
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
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [initError, setInitError] = useState<string | null>(null);

  const continueWithoutSession = useCallback(() => setLoading(false), []);

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
        const oauthError = await withTimeout(
          completeWebOAuth(client),
          OAUTH_EXCHANGE_TIMEOUT_MS,
        );
        if (!active) return;
        if (oauthError === null && hasPendingOAuthCode()) {
          // null من withTimeout تعني تجاوز المهلة لا نجاحاً؛ نميّزها ببقاء
          // الرمز في العنوان، إذ ينظّفه completeWebOAuth عند انتهائه.
          setInitError('تأخّر إكمال تسجيل الدخول. حاول مرّة أخرى.');
        } else if (oauthError) {
          setInitError(`تعذّر إكمال تسجيل الدخول: ${oauthError}`);
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
        setInitError(
          `تعذّر استعادة جلستك السابقة: ${describeSupabaseError(error)}`,
        );
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
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return false;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // بلا جلسة يعني أن المشروع يطلب تأكيد البريد أولاً.
      return data.session === null;
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      // بلا إعداد Supabase لا يوجد مزوّد أصلاً؛ نُبلغ بدل الصمت.
      throw new Error('Supabase غير مُعدّ، فلا يمكن تسجيل الدخول بحساب Google.');
    }

    const redirectTo = oauthRedirectTo();
    // يظهر في سجل المتصفّح: أول ما يجب مطابقته مع قائمة Redirect URLs.
    console.log('[auth] google sign-in, redirectTo =', redirectTo);

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
      console.error('[auth] signInWithOAuth رفض الطلب:', error);
      throw error;
    }

    console.log('[auth] provider url =', data?.url ?? '(none)');

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
      throw exchangeError;
    }
    // onAuthStateChange يلتقط الجلسة الجديدة ويحدّث الحالة.
  }, []);

  const signInAnonymously = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }, []);

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
      authDisabled: !isSupabaseConfigured,
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
