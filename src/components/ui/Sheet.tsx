import { X } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MOTION } from '@/components/motion';
import '@/components/motion/animated';
import { usePalette } from '@/store/ThemeProvider';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** يمنع الإغلاق باللمس خارج الورقة أثناء عملية جارية. */
  dismissable?: boolean;
}

/**
 * ورقة سفلية: خلفية معتمة تتلاشى، ومحتوى ينزلق من الأسفل بنابض.
 *
 * مبنية على `Modal` الأصلي لا على طبقة داخل الشجرة، فتظهر فوق كل شيء
 * وتلتقط زر الرجوع في أندرويد تلقائياً.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  dismissable = true,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}>
      <View className="flex-1 justify-end">
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(160)}
          className="absolute inset-0 bg-overlay/55">
          <Pressable
            onPress={dismissable ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            className="flex-1"
          />
        </Animated.View>

        <Animated.View
          entering={SlideInDown.springify().damping(20).stiffness(180)}
          exiting={SlideOutDown.duration(MOTION.duration)}
          style={{ paddingBottom: insets.bottom + 16 }}
          className="rounded-t-sheet bg-surface px-4 pt-3 shadow-raised">
          {/* مقبض السحب: إشارة بصرية أن الورقة تُغلق بالسحب للأسفل. */}
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-line-strong" />

          {title ? (
            <View className="mb-3 flex-row-reverse items-center justify-between">
              <Text className="text-right text-title text-ink">{title}</Text>
              {dismissable ? (
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="إغلاق"
                  hitSlop={10}>
                  <X size={20} color={palette.muted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

interface DialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  children?: React.ReactNode;
}

/** حوار مركزي للتأكيدات القصيرة. */
export function Dialog({
  visible,
  onClose,
  title,
  message,
  children,
}: DialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-6">
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(160)}
          className="absolute inset-0 bg-overlay/60">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            className="flex-1"
          />
        </Animated.View>

        <Animated.View
          entering={FadeIn.duration(200).delay(40)}
          exiting={FadeOut.duration(140)}
          className="w-full rounded-card bg-surface p-5 shadow-raised">
          <Text className="text-right text-title text-ink">{title}</Text>
          {message ? (
            <Text className="mt-2 text-right text-body text-ink-muted">
              {message}
            </Text>
          ) : null}
          {children ? <View className="mt-4">{children}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}
