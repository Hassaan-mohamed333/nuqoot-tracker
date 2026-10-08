import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

// يسجّل مكوّنات Reanimated لدى NativeWind قبل رسم أي شاشة، وإلا أُهمل
// `className` على أوّل عنصر متحرّك يُركَّب.
import '@/components/motion/animated';
import { PolicyGate } from '@/components/PolicyConsent';
import { startInviteCapture } from '@/lib/pendingInvite';
import { AppGate } from '@/navigation/AppGate';
import { AuthProvider } from '@/store/AuthProvider';

export default function App() {
  // رابط الدعوة يُلتقط عند الإقلاع قبل شاشة الدخول: إعادة التحميل بعد Google تمحو الذاكرة.
  useEffect(() => startInviteCapture(), []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* أرضية فاتحة دائماً، فأيقونات الشريط داكنة دائماً. */}
        <StatusBar style="dark" />
        {/* على الويب الواسع يُحصر التطبيق في عمود بعرض هاتف كبير؛ بدونه
            تتمدّد البطاقة والإجراءات على عرض الشاشة كلّه (1280px). */}
        <View
          className="flex-1 bg-base"
          style={
            Platform.OS === 'web'
              ? { width: '100%', maxWidth: 560, alignSelf: 'center' }
              : undefined
          }>
          <PolicyGate>
            <AppGate />
          </PolicyGate>
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
