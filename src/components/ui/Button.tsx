import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { PressableScale } from '@/components/motion';
import { usePalette } from '@/store/ThemeProvider';

const button = tv({
  base: 'flex-row-reverse items-center justify-center rounded-2xl',
  variants: {
    variant: {
      primary: 'bg-primary',
      secondary: 'bg-secondary',
      success: 'bg-success',
      danger: 'bg-danger',
      outline: 'border border-line-strong bg-transparent',
      // لمسة زجاجية: تعبئة شبه شفّافة فوق السطح مع حدّ فاتح.
      glass: 'border border-glass-line/40 bg-glass/15',
      ghost: 'bg-transparent',
    },
    size: {
      sm: 'px-3 py-2',
      md: 'px-4 py-3',
      lg: 'px-5 py-4',
    },
    block: { true: 'w-full', false: 'self-start' },
    disabled: { true: 'opacity-45', false: '' },
  },
  defaultVariants: { variant: 'primary', size: 'md', block: true },
});

const label = tv({
  base: 'font-bold text-center',
  variants: {
    variant: {
      primary: 'text-primary-fg',
      secondary: 'text-secondary-fg',
      success: 'text-white',
      danger: 'text-white',
      outline: 'text-ink',
      glass: 'text-ink',
      ghost: 'text-primary',
    },
    size: { sm: 'text-xs', md: 'text-sm', lg: 'text-base' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'outline'
  | 'glass'
  | 'ghost';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** يملأ العرض. الافتراضي `true` لأن معظم أزرار التطبيق أزرار حفظ. */
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** أيقونة تظهر قبل النص (يمين النص في الواجهة العربية). */
  icon?: React.ReactNode;
  className?: string;
  accessibilityLabel?: string;
}

/** الزرّ الأساسي: نغمات الهوية، وانكماش ملموس عند الضغط. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  block = true,
  disabled = false,
  loading = false,
  icon,
  className,
  accessibilityLabel,
}: ButtonProps) {
  const palette = usePalette();
  const inactive = disabled || loading;

  // لون المؤشّر يتبع لون النص، وإلا اختفى فوق التعبئة الداكنة.
  const spinnerColor =
    variant === 'outline' || variant === 'glass'
      ? palette.text
      : variant === 'ghost'
        ? palette.primary
        : palette.onPrimary === '#FFFFFF' || variant !== 'primary'
          ? '#FFFFFF'
          : palette.onPrimary;

  return (
    <PressableScale
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? title}
      activeScale={size === 'lg' ? 0.975 : 0.955}
      className={button({ variant, size, block, disabled: inactive, className })}>
      {loading ? (
        <ActivityIndicator color={spinnerColor} size="small" />
      ) : (
        <>
          {icon ? <View className="ml-2">{icon}</View> : null}
          <Text className={label({ variant, size })}>{title}</Text>
        </>
      )}
    </PressableScale>
  );
}
