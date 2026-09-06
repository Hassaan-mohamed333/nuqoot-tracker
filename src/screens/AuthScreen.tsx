import { LogIn, Mail, UserRound } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/store/AuthProvider';

type Mode = 'signIn' | 'signUp';

/**
 * شاشة الدخول. الحساب ضروري لأن سياسات RLS تربط كل صف بـ auth.uid()،
 * فلا تُقرأ أو تُكتب أي بيانات قبل وجود جلسة.
 */
export function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInAnonymously } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const isValid = email.trim().includes('@') && password.length >= 6;

  function reportError(error: unknown) {
    Alert.alert(
      'تعذّر تسجيل الدخول',
      error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
    );
  }

  async function handleEmailSubmit() {
    if (!isValid || busy) return;
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmail(email, password);
      } else {
        const needsConfirmation = await signUpWithEmail(email, password);
        if (needsConfirmation) {
          Alert.alert(
            'تأكيد البريد مطلوب',
            'أرسلنا رسالة تأكيد إلى بريدك. افتح الرابط ثم سجّل الدخول.',
          );
          setMode('signIn');
        }
      }
    } catch (error) {
      reportError(error);
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
      reportError(error);
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
            onPress={() => void handleAnonymous()}
            disabled={busy}
            accessibilityRole="button"
            className="flex-row-reverse items-center justify-center rounded-2xl border border-gray-200 bg-white py-3">
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
