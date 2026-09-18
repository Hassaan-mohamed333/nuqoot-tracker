import {
  LogIn,
  Mail,
  TriangleAlert,
  UserRound,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppLogo } from '@/components/brand/AppLogo';
import { notify, reportError } from '@/lib/alerts';
import { palette } from '@/lib/palette';
import { SUPABASE_CONFIG_MESSAGES } from '@/lib/supabase';
import { userMessage } from '@/lib/supabaseError';
import { checkPassword, LIMITS } from '@/lib/validation';
import { useAuth } from '@/store/AuthProvider';

type Mode = 'signIn' | 'signUp';

/** شعار Google بألوانه الرسمية، مرسوم بـ SVG بدل صورة خارجية. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

/**
 * شاشة الدخول. الحساب ضروري لأن سياسات RLS تربط كل صف بـ auth.uid()،
 * فلا تُقرأ أو تُكتب أي بيانات قبل وجود جلسة.
 */
export function AuthScreen() {
  const {
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signInWithGoogle,
    initError,
    configIssue,
    continueInDemoMode,
  } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // يُعرض داخل الصفحة: أوثق من حوار المتصفّح الذي قد يُحجب.
  const [formError, setFormError] = useState<string | null>(null);

  // إعدادٌ معطوب يعني أن كل زرّ هنا سيردّ بخطأ من الخادم؛ نعطّلها ونترك
  // مخرجاً واحداً صالحاً بدل أن نُغري بمحاولات محكومٍ عليها بالفشل.
  const blocked = configIssue !== null;

  /**
   * قوّة كلمة المرور تُقاس في وضع الحساب الجديد فقط.
   *
   * فرضُها على تسجيل الدخول أيضاً كان سيقفل الباب في وجه حسابات أُنشئت
   * قبل رفع السياسة: كلمةُ مرورها القديمة صحيحة على الخادم، ومنعُها هنا
   * يمنع صاحبها من الدخول ليغيّرها.
   */
  const strength = useMemo(
    () => checkPassword(password, { email }),
    [password, email],
  );

  const emailLooksValid = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email.trim());
  const isValid =
    !blocked &&
    emailLooksValid &&
    (mode === 'signUp' ? strength.ok : password.length > 0);

  async function handleEmailSubmit() {
    if (!isValid || busy) return;
    setBusy(true);
    try {
      setFormError(null);
      if (mode === 'signIn') {
        await signInWithEmail(email, password);
      } else {
        const needsConfirmation = await signUpWithEmail(email, password);
        if (needsConfirmation) {
          notify(
            'تأكيد البريد مطلوب',
            'أرسلنا رسالة تأكيد إلى بريدك. افتح الرابط ثم سجّل الدخول.',
          );
          setMode('signIn');
        }
      }
    } catch (error) {
      // `userMessage` لا `error.message`: الثانية تحمل نصّ الخادم كما هو
      // (إنجليزياً وأحياناً بتفصيل داخلي)، والأولى ترجمة مقصودة للعرض.
      setFormError(userMessage(error));
      reportError('تعذّر تسجيل الدخول', error);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (busy || blocked) return;
    setBusy(true);
    try {
      setFormError(null);
      await signInWithGoogle();
    } catch (error) {
      // الإلغاء تصرّف طبيعي من المستخدم ولا يستحق تنبيهاً.
      const raw = error instanceof Error ? error.message : '';
      if (!raw.includes('أُلغي')) {
        setFormError(userMessage(error));
        reportError('تعذّر تسجيل الدخول بحساب Google', error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAnonymous() {
    if (busy || blocked) return;
    setBusy(true);
    try {
      await signInAnonymously();
    } catch (error) {
      reportError('تعذّر تسجيل الدخول', error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-base">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center p-6">
          <View className="items-center">
            <AppLogo size={72} variant="badge" animated />
            <Text className="mt-3 text-display text-ink">نقوط</Text>
            <Text className="mt-1 text-center text-caption text-ink-muted">
              سجّل الدخول لحفظ نقوطك وواجباتك ومزامنتها بين أجهزتك.
            </Text>
          </View>

          {formError ? (
            <View className="mt-6 flex-row-reverse items-center rounded-xl bg-danger-soft p-3">
              <TriangleAlert size={16} color={palette.danger} />
              <Text className="mr-2 flex-1 text-right text-xs text-danger">
                {formError}
              </Text>
            </View>
          ) : null}

          {configIssue ? (
            <View className="mt-6 rounded-card border border-accent/40 bg-accent-soft p-4">
              <View className="flex-row-reverse items-center">
                <TriangleAlert size={18} color={palette.warning} />
                <Text className="mr-2 flex-1 text-right text-sm font-bold text-ink">
                  {SUPABASE_CONFIG_MESSAGES[configIssue].title}
                </Text>
              </View>
              <Text className="mt-2 text-right text-xs leading-5 text-ink-muted">
                {SUPABASE_CONFIG_MESSAGES[configIssue].detail}
              </Text>
              <Pressable
                onPress={continueInDemoMode}
                accessibilityRole="button"
                className="mt-3 flex-row-reverse items-center justify-center rounded-full bg-primary py-2.5">
                <Text className="text-sm font-bold text-primary-fg">
                  المتابعة في الوضع التجريبي
                </Text>
              </Pressable>
              <Text className="mt-2 text-center text-[11px] text-ink-subtle">
                الوضع التجريبي يحفظ كل شيء على هذا الجهاز فقط، بلا مزامنة.
              </Text>
            </View>
          ) : null}

          {initError ? (
            <View className="mt-6 flex-row-reverse items-center rounded-xl bg-warning-soft p-3">
              <TriangleAlert size={16} color={palette.warning} />
              <Text className="mr-2 flex-1 text-right text-xs text-ink-muted">
                {initError}
              </Text>
            </View>
          ) : null}

          <View className="mt-8 flex-row-reverse">
            {(
              [
                { key: 'signIn', label: 'دخول' },
                { key: 'signUp', label: 'حساب جديد' },
              ] as const
            ).map((item) => {
              const isActive = mode === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setMode(item.key)}
                  accessibilityRole="button"
                  className={`ml-2 rounded-full px-4 py-1.5 ${
                    isActive ? 'bg-primary' : 'border border-line bg-surface'
                  }`}>
                  <Text
                    className={`text-xs font-semibold ${
                      isActive ? 'text-primary-fg' : 'text-ink-muted'
                    }`}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
            البريد الإلكتروني
          </Text>
          <View className="flex-row-reverse items-center rounded-xl border border-line bg-surface px-3">
            <Mail size={16} color={palette.muted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="name@example.com"
              placeholderTextColor={palette.muted}
              className="mx-2 flex-1 py-3 text-right text-sm text-ink"
            />
          </View>

          <Text className="mb-2 mt-4 text-right text-sm font-bold text-ink">
            كلمة المرور
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            placeholder={
              mode === 'signUp'
                ? `${LIMITS.passwordMin} محارف على الأقل`
                : 'كلمة المرور'
            }
            placeholderTextColor={palette.muted}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-right text-sm text-ink"
          />

          {mode === 'signUp' ? (
            <View className="mt-2">
              <View className="flex-row-reverse" accessibilityRole="progressbar">
                {[0, 1, 2, 3].map((step) => (
                  <View
                    key={step}
                    className={`ml-1 h-1 flex-1 rounded-full ${
                      password.length === 0
                        ? 'bg-line'
                        : step < strength.score
                          ? 'bg-success'
                          : 'bg-line'
                    }`}
                  />
                ))}
              </View>
              <Text className="mt-1.5 text-right text-[11px] leading-4 text-ink-muted">
                {password.length === 0
                  ? `${LIMITS.passwordMin} محارف على الأقل، وثلاثة أنواع من: حروف صغيرة، كبيرة، أرقام، رموز.`
                  : strength.ok
                    ? 'كلمة مرور مقبولة.'
                    : strength.issues[0].message}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void handleEmailSubmit()}
            disabled={!isValid || busy}
            accessibilityRole="button"
            className={`mt-6 flex-row-reverse items-center justify-center rounded-full py-3 ${
              isValid && !busy ? 'bg-primary' : 'bg-line-strong'
            }`}>
            {busy ? (
              <ActivityIndicator color={palette.onPrimary} />
            ) : (
              <>
                <LogIn size={18} color={palette.onPrimary} />
                <Text className="mr-2 text-base font-bold text-primary-fg">
                  {mode === 'signIn' ? 'تسجيل الدخول' : 'إنشاء الحساب'}
                </Text>
              </>
            )}
          </Pressable>

          <View className="my-5 flex-row items-center">
            <View className="h-px flex-1 bg-line/60" />
            <Text className="mx-3 text-xs text-ink-subtle">أو</Text>
            <View className="h-px flex-1 bg-line/60" />
          </View>

          <Pressable
            onPress={() => void handleGoogle()}
            disabled={busy || blocked}
            accessibilityRole="button"
            accessibilityLabel="تسجيل الدخول بحساب Google"
            accessibilityState={{ disabled: blocked }}
            className={`flex-row-reverse items-center justify-center rounded-full border border-line-strong bg-surface py-3 ${
              blocked ? 'opacity-40' : ''
            }`}>
            <GoogleMark />
            <Text className="mr-2 text-base font-bold text-ink">
              المتابعة بحساب Google
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void handleAnonymous()}
            disabled={busy || blocked}
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            className={`mt-2 flex-row-reverse items-center justify-center rounded-full border border-line bg-surface py-3 ${
              blocked ? 'opacity-40' : ''
            }`}>
            <UserRound size={18} color={palette.primary} />
            <Text className="mr-2 text-base font-bold text-primary">
              متابعة كضيف
            </Text>
          </Pressable>

          <Text className="mt-3 text-center text-[11px] text-ink-muted">
            حساب الضيف يحفظ بياناتك على هذا الجهاز فقط. اربطه ببريد لاحقاً
            للمزامنة.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
