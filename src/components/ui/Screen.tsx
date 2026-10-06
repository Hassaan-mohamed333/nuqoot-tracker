import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  /** يلفّ المحتوى في ScrollView. أوقفه للشاشات ذات القوائم الافتراضية. */
  scroll?: boolean;
  /** شريط ثابت أسفل الشاشة (زرّ حفظ أو ملخّص رصيد). */
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * حاوية الشاشة: خلفية الهوية، مساحة آمنة، وتفادي لوحة المفاتيح.
 *
 * تجمع الترتيب المتكرّر في كل شاشة حتى لا تتفرّق الحشوة والخلفية بين
 * الشاشات مع الوقت.
 */
export function Screen({
  children,
  scroll = true,
  footer,
  className,
  contentClassName,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const body = scroll ? (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName={`p-4 ${footer ? 'pb-32' : 'pb-10'} ${
        contentClassName ?? ''
      }`}>
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 p-4 ${contentClassName ?? ''}`}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      className={`flex-1 bg-base ${className ?? ''}`}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}

      {footer ? (
        <View
          style={{ paddingBottom: insets.bottom + 12 }}
          className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-4 pt-3">
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
