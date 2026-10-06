import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { palette, type Palette } from '@/lib/palette';
import { sv } from '@/lib/variants';

const button = sv({
  // حبّة كاملة الاستدارة: كل أزرار المرجع كذلك، بلا استثناء.
  base: 'flex-row-reverse items-center justify-center rounded-full',
  variants: {
    variant: {
      /*
       * حدٌّ كهرماني داكن حول التعبئة الساطعة.
       *
       * #F59E0B فوق الأبيض تباينه ‎2.15:1‎ — دون ‎3:1‎ التي يطلبها
       * WCAG 1.4.11 لحدود عناصر الواجهة. فالزرّ الأصفر على بطاقة بيضاء
       * لا حافّةَ له تُرى، وشكلُه هو الزرّ. والحدّ يردّ الحافّة بلا أن
       * يُعتم اللون الذي اختير للهوية.
       */
      primary: 'border border-primary-strong/70 bg-primary',
      secondary: 'bg-secondary',
      success: 'bg-success',
      danger: 'bg-danger',
      outline: 'border border-line-strong bg-transparent',
      /** حبّة فاتحة فوق صورة أو سطح ملوّن، كأزرار المرجع الدائرية. */
      contrast: 'bg-surface',
      // لمسة زجاجية: تعبئة شبه شفّافة فوق السطح مع حدّ فاتح.
      glass: 'border border-glass-line/40 bg-glass/15',
      ghost: 'bg-transparent',
    },
    size: {
      // المرجع سخيّ في الحشوة الأفقية، فتبدو الحبّة ممتلئة لا ضيّقة.
      sm: 'px-4 py-2.5',
      md: 'px-5 py-3.5',
      lg: 'px-6 py-4',
    },
    block: { true: 'w-full', false: 'self-start' },
    disabled: { true: 'opacity-45', false: '' },
  },
  defaultVariants: { variant: 'primary', size: 'md', block: true },
});

const label = sv({
  base: 'text-center font-bold',
  variants: {
    variant: {
      primary: 'text-primary-fg',
      secondary: 'text-secondary-fg',
      success: 'text-white',
      danger: 'text-white',
      outline: 'text-ink',
      contrast: 'text-ink',
      glass: 'text-ink',
      ghost: 'text-primary-strong',
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
  | 'contrast'
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
  const inactive = disabled || loading;

  // لون المؤشّر يتبع لون النص، وإلا اختفى فوق التعبئة.
  const spinnerColor = SPINNER_TONE[variant](palette);

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

/** لون مؤشّر التحميل لكل نغمة، مطابقاً للون النص في `label` أعلاه. */
const SPINNER_TONE: Record<ButtonVariant, (palette: Palette) => string> = {
  primary: (palette) => palette.onPrimary,
  secondary: (palette) => palette.onSecondary,
  success: () => '#FFFFFF',
  danger: () => '#FFFFFF',
  outline: (palette) => palette.text,
  contrast: (palette) => palette.text,
  glass: (palette) => palette.text,
  ghost: (palette) => palette.primaryStrong,
};
