import React, { createContext, useContext } from 'react';

import { BiometricGate } from '@/components/BiometricGate';
import { useBiometricLock, type BiometricLock } from '@/hooks/useBiometricLock';

const LockContext = createContext<BiometricLock | null>(null);

/**
 * حالة القفل الحيوي، ومكان الحاجب.
 *
 * المزوّد يعلو التطبيق كلّه: الحاجب يجب أن يغطّي كل شاشة وكل ورقة
 * مفتوحة، وشاشة الإعدادات تحتاج الحالة نفسها لتعرض المفتاح — فمصدرٌ
 * واحد لا نسختان تتباعدان.
 */
export function LockProvider({ children }: { children: React.ReactNode }) {
  const lock = useBiometricLock();

  return (
    <LockContext.Provider value={lock}>
      {children}
      <BiometricGate lock={lock} />
    </LockContext.Provider>
  );
}

/** حالة القفل، أو `null` خارج المزوّد (فلا تُعرض بطاقة الإعداد). */
export function useLock(): BiometricLock | null {
  return useContext(LockContext);
}
