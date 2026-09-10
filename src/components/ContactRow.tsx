import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { NetBalanceBadge } from '@/components/NetBalanceBadge';
import type { ContactWithSummary } from '@/types';
import { usePalette } from '@/store/ThemeProvider';

interface ContactRowProps {
  contact: ContactWithSummary;
  onPress: () => void;
}

/** صف جهة اتصال داخل القائمة الأبجدية. */
export function ContactRow({ contact, onPress }: ContactRowProps) {
  const palette = usePalette();
  const initial = contact.full_name.trim().charAt(0) || '؟';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="mb-2 flex-row-reverse items-center rounded-2xl border border-line bg-surface p-3">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/15">
        <Text className="text-base font-bold text-primary">{initial}</Text>
      </View>

      <View className="mx-3 flex-1">
        <Text className="text-right text-base font-semibold text-ink">
          {contact.full_name}
        </Text>
        <Text className="text-right text-xs text-ink-muted">
          {contact.relation ?? 'بدون تصنيف'} ·{' '}
          {contact.summary.transactionCount} حركة
        </Text>
      </View>

      <NetBalanceBadge summary={contact.summary} size="sm" />
      <ChevronLeft size={18} color={palette.muted} />
    </Pressable>
  );
}
