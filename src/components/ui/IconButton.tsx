import React from 'react';

import { PressableScale } from '@/components/motion';
import { sv } from '@/lib/variants';

const iconButton = sv({
  base: 'items-center justify-center rounded-full',
  variants: {
    variant: {
      /** دائرة بيضاء: أكثر أزرار المرجع شيوعاً (رجوع، تالٍ، قائمة). */
      surface: 'bg-surface shadow-card',
      /** دائرة داكنة للإجراء الرئيسي. */
      primary: 'bg-primary',
      /** لوح غائر، للأزرار داخل بطاقة فاتحة. */
      panel: 'bg-surface-raised',
      secondary: 'bg-secondary',
      ghost: 'bg-transparent',
    },
    size: {
      sm: 'h-9 w-9',
      md: 'h-11 w-11',
      lg: 'h-14 w-14',
    },
  },
  defaultVariants: { variant: 'surface', size: 'md' },
});

interface IconButtonProps {
  /** الأيقونة ملوّنة من المستدعي، لأن اللون يتبع النغمة والسمة معاً. */
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  variant?: 'surface' | 'primary' | 'panel' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

/**
 * زرّ أيقونة دائري.
 *
 * شكل متكرّر في المرجع: دائرة مصمتة تحمل أيقونة وحدها، فوق صورة أو داخل
 * شريط. جُمّع هنا حتى لا يُعاد بناء نفس الدائرة في كل شاشة بقياس مختلف.
 */
export function IconButton({
  children,
  onPress,
  accessibilityLabel,
  variant = 'surface',
  size = 'md',
  disabled = false,
  className,
}: IconButtonProps) {
  return (
    <PressableScale
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      activeScale={0.9}
      className={iconButton({
        variant,
        size,
        className: disabled ? `opacity-45 ${className ?? ''}` : className,
      })}>
      {children}
    </PressableScale>
  );
}
