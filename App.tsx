import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

// يسجّل مكوّنات Reanimated لدى NativeWind قبل رسم أي شاشة، وإلا أُهمل
// `className` على أوّل عنصر متحرّك يُركَّب.
import '@/components/motion/animated';
import { AppGate } from '@/navigation/AppGate';
import { AuthProvider } from '@/store/AuthProvider';
import { ThemeProvider, useTheme } from '@/store/ThemeProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <AppGate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** شريط الحالة يتبع الوضع: أيقونات فاتحة فوق الخلفية الداكنة. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}
