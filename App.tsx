import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { RootNavigator } from '@/navigation/RootNavigator';
import { LedgerProvider } from '@/store/LedgerProvider';

export default function App() {
  return (
    <SafeAreaProvider>
      <LedgerProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </LedgerProvider>
    </SafeAreaProvider>
  );
}
