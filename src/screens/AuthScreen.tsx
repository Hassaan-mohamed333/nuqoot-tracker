import {
  LogIn,
  Mail,
  TriangleAlert,
  UserRound,
} from 'lucide-react-native';
import React, { useState } from 'react';
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

import { notify, reportError } from '@/lib/alerts';
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
  } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // يُعرض داخل الصفحة: أوثق من حوار المتصفّح الذي قد يُحجب.
  const [formError, setFormError] = useState<string | null>(null);

  const isValid = email.trim().includes('@') && password.length >= 6;

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
      setFormError(
        error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
      );
      reportError('تعذّر تسجيل الدخول', error);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setBusy(true);
    try {
      setFormError(null);
      await signInWithGoogle();
    } catch (error) {
      // الإلغاء تصرّف طبيعي من المستخدم ولا يستحق تنبيهاً.
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('أُلغي')) {
        setFormError(message || 'تعذّر بدء تسجيل الدخول بحساب Google.');
        reportError('تعذّر تسجيل الدخول بحساب Google', error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAnonymous() {
    if (busy) return;
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
    <SafeAreaView className="flex-1 bg-gray-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center p-6">
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-2xl bg-green-600">
              <Text className="text-2xl font-bold text-white">ن</Text>
            </View>
            <Text className="mt-3 text-2xl font-bold text-gray-900">نقوط</Text>
            <Text className="mt-1 text-center text-xs text-gray-500">
              سجّل الدخول لحفظ نقوطك وواجباتك ومزامنتها بين أجهزتك.
            </Text>
          </View>

          {formError ? (
            <View className="mt-6 flex-row-reverse items-center rounded-xl bg-red-50 p-3">
              <TriangleAlert size={16} color="#b91c1c" />
              <Text className="mr-2 flex-1 text-right text-xs text-red-800">
                {formError}
              </Text>
            </View>
          ) : null}

          {initError ? (
            <View className="mt-6 flex-row-reverse items-center rounded-xl bg-amber-50 p-3">
              <TriangleAlert size={16} color="#b45309" />
              <Text className="mr-2 flex-1 text-right text-xs text-amber-800">
                تعذّر استعادة جلستك السابقة ({initError}) — سجّل الدخول مجدداً.
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
                    isActive ? 'bg-green-600' : 'border border-gray-200 bg-white'
                  }`}>
                  <Text
                    className={`text-xs font-semibold ${
                      isActive ? 'text-white' : 'text-gray-600'
                    }`}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
            البريد الإلكتروني
          </Text>
          <View className="flex-row-reverse items-center rounded-xl border border-gray-200 bg-white px-3">
            <Mail size={16} color="#9ca3af" />
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="name@example.com"
              placeholderTextColor="#9ca3af"
              className="mx-2 flex-1 py-3 text-right text-sm text-gray-900"
            />
          </View>

          <Text className="mb-2 mt-4 text-right text-sm font-bold text-gray-900">
            كلمة المرور
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="٦ أحرف على الأقل"
            placeholderTextColor="#9ca3af"
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-sm text-gray-900"
          />

          <Pressable
            onPress={() => void handleEmailSubmit()}
            disabled={!isValid || busy}
            accessibilityRole="button"
            className={`mt-6 flex-row-reverse items-center justify-center rounded-2xl py-3 ${
              isValid && !busy ? 'bg-green-600' : 'bg-gray-300'
            }`}>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <LogIn size={18} color="#ffffff" />
                <Text className="mr-2 text-base font-bold text-white">
                  {mode === 'signIn' ? 'تسجيل الدخول' : 'إنشاء الحساب'}
                </Text>
              </>
            )}
          </Pressable>

          <View className="my-5 flex-row items-center">
            <View className="h-px flex-1 bg-gray-200" />
            <Text className="mx-3 text-xs text-gray-400">أو</Text>
            <View className="h-px flex-1 bg-gray-200" />
          </View>

          <Pressable
            onPress={() => void handleGoogle()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="تسجيل الدخول بحساب Google"
            className="flex-row-reverse items-center justify-center rounded-2xl border border-gray-300 bg-white py-3">
            <GoogleMark />
            <Text className="mr-2 text-base font-bold text-gray-700">
              المتابعة بحساب Google
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void handleAnonymous()}
            disabled={busy}
            accessibilityRole="button"
            className="mt-2 flex-row-reverse items-center justify-center rounded-2xl border border-gray-200 bg-white py-3">
            <UserRound size={18} color="#16a34a" />
            <Text className="mr-2 text-base font-bold text-green-700">
              متابعة كضيف
            </Text>
          </Pressable>

          <Text className="mt-3 text-center text-[11px] text-gray-500">
            حساب الضيف يحفظ بياناتك على هذا الجهاز فقط. اربطه ببريد لاحقاً
            للمزامنة.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
