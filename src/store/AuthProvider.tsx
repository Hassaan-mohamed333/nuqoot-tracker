import type { Session, User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { clearLocalData } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * أقصى انتظار لاستعادة الجلسة عند الإقلاع.
 *
 * أقصر من مهلة الشبكة في العميل عمداً: حتى لو تعثّر الطلب نعرض شاشة
 * الدخول بدل إبقاء المستخدم أمام شاشة تحميل. إن عادت الجلسة بعد ذلك
 * يلتقطها onAuthStateChange فينتقل التطبيق إلى الداخل تلقائياً.
 */
const SESSION_RESTORE_TIMEOUT_MS = 8000;

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
        setInitError(
          error instanceof Error
            ? error.message
            : 'تعذّر التحقق من الجلسة المحفوظة.',
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
