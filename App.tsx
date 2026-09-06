import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { AppGate } from '@/navigation/AppGate';
import { AuthProvider } from '@/store/AuthProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <AppGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
