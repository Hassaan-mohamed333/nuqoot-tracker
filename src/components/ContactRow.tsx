import React from 'react';
import { Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { NetBalanceBadge } from '@/components/NetBalanceBadge';
import type { ContactWithSummary } from '@/types';

interface ContactRowProps {
  contact: ContactWithSummary;
  onPress: () => void;
}

/** صف جهة اتصال داخل القائمة الأبجدية. */
export function ContactRow({ contact, onPress }: ContactRowProps) {
  const initial = contact.full_name.trim().charAt(0) || '؟';
  const count = contact.summary.transactionCount;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${contact.full_name}، ${
        contact.phone ?? 'بلا رقم'
      }، ${count} حركة`}
      activeScale={0.985}
      className="mb-2 flex-row-reverse items-center rounded-card border border-line bg-surface p-3">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/15">
        <Text className="text-base font-bold text-primary-strong">{initial}</Text>
      </View>

      <View className="mx-3 min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className="text-right text-body font-bold text-ink">
          {contact.full_name}
        </Text>

        {/* نصّ واحد بقطع: الهاتف وعدد الحركات في سطرين منفصلين كان يلفّ
            «1 حركة» على سطرين حين يضيق الصفّ بجوار الفهرس. */}
        <Text
          numberOfLines={1}
          className="mt-0.5 text-right text-caption text-ink-muted">
          {contact.phone ?? contact.relation ?? 'بدون رقم'} · {count} حركة
        </Text>
      </View>

      <NetBalanceBadge summary={contact.summary} size="sm" />
    </PressableScale>
  );
}
