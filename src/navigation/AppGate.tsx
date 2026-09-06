import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { RootNavigator } from '@/navigation/RootNavigator';
import { AuthScreen } from '@/screens/AuthScreen';
import { useAuth } from '@/store/AuthProvider';
import { LedgerProvider } from '@/store/LedgerProvider';

/**
 * يقرر ما يُعرض حسب حالة الجلسة:
 * - أثناء استعادة الجلسة: شاشة انتظار.
 * - Supabase مُعدّ وبلا جلسة: شاشة الدخول (لأن RLS تمنع أي قراءة أو كتابة).
 * - غير ذلك (جلسة قائمة أو وضع محلي): التطبيق كاملاً.
 */
export function AppGate() {
  const { loading, session, authDisabled } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator color="#16a34a" />
        <Text className="mt-3 text-xs text-gray-500">جارٍ التحميل…</Text>
      </View>
    );
  }

  if (!authDisabled && !session) {
    return <AuthScreen />;
  }

  return (
    <LedgerProvider>
      <RootNavigator />
    </LedgerProvider>
  );
}
