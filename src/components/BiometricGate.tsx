import { Fingerprint, LockKeyhole } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { AppLogo } from '@/components/brand/AppLogo';
import type { BiometricLock } from '@/hooks/useBiometricLock';
import { APP_NAME } from '@/lib/brand';
import { palette } from '@/lib/palette';

/**
 * حاجب المحتوى حتى يتحقّق صاحب الجهاز.
 *
 * `Modal` لا طبقة داخل الشجرة: الشجرة تبقى مركّبة تحته بحالتها، فلا
 * يُعاد بناء التطبيق مع كل قفل، ولا يظهر المحتوى للحظة قبل الحجب. وهو
 * يعلو كل شيء بما فيه الأوراق السفلية المفتوحة.
 */
export function BiometricGate({ lock }: { lock: BiometricLock }) {
  return (
    <Modal
      visible={lock.locked}
      animationType="fade"
      statusBarTranslucent
      // لا إغلاق بزرّ الرجوع في أندرويد: الحاجب لا يُتجاوَز.
      onRequestClose={() => undefined}>
      <View className="flex-1 items-center justify-center bg-base px-8">
        <AppLogo size={64} variant="badge" />

        <View className="mt-6 flex-row-reverse items-center">
          <LockKeyhole size={18} color={palette.muted} />
          <Text className="mr-2 text-title text-ink">{APP_NAME} مقفل</Text>
        </View>

        <Text className="mt-2 text-center text-sm text-ink-muted">
          افتح بالبصمة أو الوجه لعرض دفترك.
        </Text>

        {lock.lastError ? (
          <Text className="mt-3 text-center text-caption text-danger">
            {lock.lastError}
          </Text>
        ) : null}

        <PressableScale
          onPress={() => void lock.unlock()}
          disabled={lock.checking}
          accessibilityRole="button"
          accessibilityLabel="فتح القفل بالبصمة"
          accessibilityState={{ disabled: lock.checking, busy: lock.checking }}
          activeScale={0.95}
          className={`mt-8 flex-row-reverse items-center rounded-full bg-primary px-6 py-3 ${
            lock.checking ? 'opacity-50' : ''
          }`}>
          {lock.checking ? (
            <ActivityIndicator color={palette.onPrimary} size="small" />
          ) : (
            <Fingerprint size={18} color={palette.onPrimary} />
          )}
          <Text className="mr-2 text-sm font-bold text-primary-fg">
            {lock.checking ? 'جارٍ التحقّق…' : 'فتح'}
          </Text>
        </PressableScale>
      </View>
    </Modal>
  );
}
