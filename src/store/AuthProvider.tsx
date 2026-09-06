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

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** معرّف المستخدم الحالي، وهو ما تعتمد عليه سياسات RLS. */
  userId: string | null;
  /** true أثناء استعادة الجلسة المحفوظة عند الإقلاع. */
  loading: boolean;
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

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // النسخة المحلية تخصّ الحساب السابق، فلا يجوز أن يراها الحساب التالي.
    await clearLocalData();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      userId: session?.user.id ?? null,
      loading,
      authDisabled: !isSupabaseConfigured,
      signInWithEmail,
      signUpWithEmail,
      signInAnonymously,
      signOut,
    }),
    [
      session,
      loading,
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
