import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

// يسجّل مكوّنات Reanimated لدى NativeWind قبل رسم أي شاشة، وإلا أُهمل
// `className` على أوّل عنصر متحرّك يُركَّب.
import '@/components/motion/animated';
import { AppGate } from '@/navigation/AppGate';
import { AuthProvider } from '@/store/AuthProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* أرضية فاتحة دائماً، فأيقونات الشريط داكنة دائماً. */}
        <StatusBar style="dark" />
        <AppGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
