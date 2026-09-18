import React from 'react';
import type { TextInputProps } from 'react-native';
import { Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MOTION } from '@/components/motion';
// يسجّل مكوّنات Reanimated لدى NativeWind (أثر جانبي مقصود).
import '@/components/motion/animated';
import { palette } from '@/lib/palette';

interface FieldProps extends Omit<TextInputProps, 'className' | 'style'> {
  label?: string;
  /** نص مساعد أسفل الحقل، يُستبدل برسالة الخطأ عند وجودها. */
  hint?: string;
  error?: string | null;
  /** أيقونة داخل الحقل، على يمين النص. */
  icon?: React.ReactNode;
  /** حقل المبلغ: خط أعرض وأثقل. */
  emphasis?: boolean;
  /** أصناف الحاوية الخارجية (تباعد، عرض). */
  className?: string;
  /**
   * أصناف حقل الإدخال نفسه، للون النص خاصة.
   *
   * لون النص لا يرث من الحاوية في React Native، فوضع `text-credit` على
   * `className` لا يلوّن المكتوب.
   */
  inputClassName?: string;
}

/**
 * حقل نصّي معنون، بحلقة تركيز متحرّكة وحالة خطأ.
 *
 * لون الحدّ يُحرَّك بـ Reanimated لا بتبديل الأصناف، حتى يبقى الانتقال
 * سلساً بدل قفزة لونية عند كل ضغطة.
 */
export function Field({
  label,
  hint,
  error,
  icon,
  emphasis = false,
  className,
  inputClassName,
  onFocus,
  onBlur,
  ...rest
}: FieldProps) {
  const focus = useSharedValue(0);

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(
      error
        ? palette.danger
        : focus.value > 0.5
          ? palette.primary
          : palette.border,
      { duration: 160, easing: MOTION.easing },
    ),
    // هالة خفيفة حول الحقل النشط بدل تغيير سماكة الحدّ (تغيّر السماكة
    // يعيد حساب التخطيط ويجعل المحتوى يقفز).
    shadowOpacity: withTiming(focus.value * 0.18, { duration: 160 }),
  }));

  return (
    <View className={className}>
      {label ? (
        <Text className="mb-2 text-right text-sm font-bold text-ink">
          {label}
        </Text>
      ) : null}

      <Animated.View
        style={[
          {
            borderWidth: 1,
            shadowColor: error ? palette.danger : palette.primary,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
          },
          ringStyle,
        ]}
        className="flex-row-reverse items-center rounded-tile bg-surface px-4">
        {icon ? <View className="ml-2">{icon}</View> : null}
        <TextInput
          {...rest}
          onFocus={(event) => {
            focus.value = 1;
            onFocus?.(event);
          }}
          onBlur={(event) => {
            focus.value = 0;
            onBlur?.(event);
          }}
          placeholderTextColor={palette.subtle}
          className={`flex-1 py-3 text-right ${
            emphasis ? 'text-xl font-bold' : 'text-base'
          } ${inputClassName ?? 'text-ink'}`}
        />
      </Animated.View>

      {error ? (
        <Text className="mt-1.5 text-right text-caption text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="mt-1.5 text-right text-caption text-ink-muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
