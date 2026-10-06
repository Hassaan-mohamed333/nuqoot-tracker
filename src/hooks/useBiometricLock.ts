import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  enrollBiometrics,
  forgetBiometrics,
  inspectBiometrics,
  promptBiometrics,
  type BiometricCapability,
} from '@/lib/biometrics';
import { BIOMETRIC_LOCK_KEY, readSecureFlag, writeSecureFlag } from '@/lib/secureFlag';

export interface BiometricLock {
  /** null أثناء الفحص الأوّل. */
  capability: BiometricCapability | null;
  enabled: boolean;
  /** true حين يجب حجب المحتوى. */
  locked: boolean;
  /** true أثناء نداء منتقي النظام. */
  checking: boolean;
  lastError: string | null;
  /** يفعّل القفل أو يطفئه، بعد تحقّق ناجح عند التفعيل. */
  setEnabled: (next: boolean) => Promise<boolean>;
  /** يطلب التحقّق لفكّ القفل الحالي. */
  unlock: () => Promise<void>;
}

/** بعد هذه المدّة في الخلفية يعود القفل. */
const RELOCK_AFTER_MS = 30_000;

/**
 * قفل التطبيق الحيوي: التفضيل، والحالة، وإعادة القفل عند العودة.
 *
 * مهلة قبل إعادة القفل عمداً: تبديل التطبيق لنسخ رقم أو قراءة رسالة
 * فعلٌ متكرّر، وطلب البصمة بعد ثانيتين من الغياب يجعل الميزة عبئاً
 * يُطفئه المستخدم. نصف دقيقة تكفي لذلك ولا تكفي لمن التقط الهاتف.
 */
export function useBiometricLock(): BiometricLock {
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  /** لحظة دخول الخلفية، لقياس الغياب. */
  const leftAt = useRef<number | null>(null);
  /** يمنع نداءين متوازيين لمنتقي النظام. */
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [found, stored] = await Promise.all([
        inspectBiometrics(),
        readSecureFlag(BIOMETRIC_LOCK_KEY),
      ]);
      if (cancelled) return;

      setCapability(found);
      // تفضيلٌ مفعَّل على جهازٍ لم يعد يدعم القفل لا يُقفل التطبيق:
      // مسحُ البصمة من إعدادات النظام كان سيحبس صاحبه خارج دفتره.
      const active = stored && found.available;
      setEnabledState(active);
      setLocked(active);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const result = await promptBiometrics();
      if (result.ok) {
        setLocked(false);
        setLastError(null);
      } else {
        setLastError(result.message);
      }
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, []);

  const setEnabled = useCallback(async (next: boolean): Promise<boolean> => {
    if (busy.current) return false;

    if (!next) {
      setEnabledState(false);
      setLocked(false);
      setLastError(null);
      forgetBiometrics();
      await writeSecureFlag(BIOMETRIC_LOCK_KEY, false);
      return true;
    }

    busy.current = true;
    setChecking(true);
    try {
      // التفعيل يمرّ بتحقّق: من لا يستطيع فتح القفل الآن لن يستطيع
      // فتحه بعد إغلاق التطبيق، وتفعيلُه له حبسٌ مؤجَّل.
      const result = await enrollBiometrics();
      if (!result.ok) {
        setLastError(result.message);
        return false;
      }
      setEnabledState(true);
      setLocked(false);
      setLastError(null);
      await writeSecureFlag(BIOMETRIC_LOCK_KEY, true);
      return true;
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          const away = leftAt.current;
          leftAt.current = null;
          if (away !== null && Date.now() - away >= RELOCK_AFTER_MS) {
            setLocked(true);
          }
          return;
        }
        // `inactive` في iOS يقع عند سحب مركز التحكّم أيضاً، فنقيس من
        // أوّل خروج ولا نعيد ضبط العدّاد مع كل تغيّر.
        if (leftAt.current === null) leftAt.current = Date.now();
      },
    );

    return () => subscription.remove();
  }, [enabled]);

  return { capability, enabled, locked, checking, lastError, setEnabled, unlock };
}
