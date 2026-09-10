import React from 'react';
import type { ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

import { FadeSlideIn, PressableScale } from '@/components/motion';
import { sv } from '@/lib/variants';

const card = sv({
  // بلا حشوة في الأساس: لو وضعناها هنا لاجتمع `p-4` مع `p-2` القادم من
  // المستدعي، ولا يفوز الأخير في السلسلة بل ترتيبُ قواعد Tailwind.
  base: 'rounded-card',
  variants: {
    variant: {
      /** السطح العادي: حدّ رفيع بدل ظلّ ثقيل. */
      surface: 'border border-line bg-surface',
      /** مرتفع: للبطاقات التي تحمل الرقم الأهم في الشاشة. */
      raised: 'border border-line bg-surface-raised shadow-card',
      /** زجاجي: فوق خلفية ملوّنة أو متدرّجة. */
      glass: 'border border-glass-line/30 bg-glass/12',
      outline: 'border border-line-strong bg-transparent',
      primary: 'border border-primary/25 bg-primary/10',
      secondary: 'border border-secondary/25 bg-secondary/10',
      success: 'border border-success/25 bg-success-soft',
      danger: 'border border-danger/25 bg-danger-soft',
      warning: 'border border-warning/30 bg-warning-soft',
    },
    padded: { true: 'p-4', false: '' },
  },
  defaultVariants: { variant: 'surface', padded: true },
});

export type CardVariant =
  | 'surface'
  | 'raised'
  | 'glass'
  | 'outline'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padded?: boolean;
  className?: string;
  style?: ViewStyle;
  onPress?: () => void;
  /** ترتيب البطاقة في القائمة، لدخول متتابع. */
  index?: number;
  /** يعطّل حركة الدخول للبطاقات الثابتة داخل نموذج. */
  animate?: boolean;
  accessibilityLabel?: string;
}

/** الحاوية الأساسية للمحتوى: حدّ رفيع، زوايا كبيرة، ودخول متتابع. */
export function Card({
  children,
  variant = 'surface',
  padded = true,
  className,
  style,
  onPress,
  index = 0,
  animate = true,
  accessibilityLabel,
}: CardProps) {
  const classes = card({ variant, padded, className });

  const inner = onPress ? (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeScale={0.985}
      className={classes}
      style={style}>
      {children}
    </PressableScale>
  ) : (
    <View className={classes} style={style}>
      {children}
    </View>
  );

  return animate ? <FadeSlideIn index={index}>{inner}</FadeSlideIn> : inner;
}

/** عنوان قسم فوق بطاقة أو مجموعة حقول. */
export function SectionTitle({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      className={`mb-2 flex-row-reverse items-center justify-between ${
        className ?? ''
      }`}>
      <Text className="text-right text-sm font-bold text-ink">{children}</Text>
      {action}
    </View>
  );
}
