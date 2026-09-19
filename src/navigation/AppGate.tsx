import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { palette } from '@/lib/palette';
import { RootNavigator } from '@/navigation/RootNavigator';
import { AuthScreen } from '@/screens/AuthScreen';
import { useAuth } from '@/store/AuthProvider';
import { LedgerProvider } from '@/store/LedgerProvider';
import { LockProvider } from '@/store/LockProvider';

/** بعد هذه المدة نعرض للمستخدم مخرجاً يدوياً بدل انتظار صامت. */
const SLOW_BOOT_HINT_MS = 4000;

/**
 * يقرر ما يُعرض حسب حالة الجلسة:
 * - أثناء استعادة الجلسة: شاشة انتظار (بمهلة ومخرج يدوي).
 * - Supabase مُعدّ وبلا جلسة: شاشة الدخول (لأن RLS تمنع أي قراءة أو كتابة).
 * - غير ذلك (جلسة قائمة أو وضع محلي): التطبيق كاملاً.
 */
export function AppGate() {
  const { loading, session, authDisabled, continueWithoutSession } = useAuth();

  if (loading) {
    return <BootScreen onSkip={continueWithoutSession} />;
  }

  if (!authDisabled && !session) {
    return <AuthScreen />;
  }

  return (
    <LockProvider>
      <LedgerProvider>
        <RootNavigator />
      </LedgerProvider>
    </LockProvider>
  );
}

/**
 * شاشة الإقلاع. AuthProvider يقطع الانتظار من تلقائه عند تجاوز المهلة،
 * وهذا الزر خط دفاع ثانٍ حتى لا يعلق المستخدم إن تأخر شيء غير متوقع.
 */
function BootScreen({ onSkip }: { onSkip: () => void }) {
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkip(true), SLOW_BOOT_HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-base px-8">
      <ActivityIndicator color={palette.primary} />
      <Text className="mt-3 text-xs text-ink-muted">جارٍ التحميل…</Text>

      {showSkip ? (
        <View className="mt-6 items-center">
          <Text className="text-center text-xs text-ink-muted">
            يبدو أن الاتصال بطيء.
          </Text>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            className="mt-3 rounded-2xl border border-line bg-surface px-5 py-2.5">
            <Text className="text-sm font-bold text-primary">
              متابعة إلى شاشة الدخول
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
