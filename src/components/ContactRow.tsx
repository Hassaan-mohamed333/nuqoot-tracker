import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { NetBalanceBadge } from '@/components/NetBalanceBadge';
import type { ContactWithSummary } from '@/types';

interface ContactRowProps {
  contact: ContactWithSummary;
  onPress: () => void;
}

/** صف جهة اتصال داخل القائمة الأبجدية. */
export function ContactRow({ contact, onPress }: ContactRowProps) {
  const initial = contact.full_name.trim().charAt(0) || '؟';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="mb-2 flex-row-reverse items-center rounded-2xl border border-gray-100 bg-white p-3">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-green-100">
        <Text className="text-base font-bold text-green-700">{initial}</Text>
      </View>

      <View className="mx-3 flex-1">
        <Text className="text-right text-base font-semibold text-gray-900">
          {contact.full_name}
        </Text>
        <Text className="text-right text-xs text-gray-500">
          {contact.relation ?? 'بدون تصنيف'} ·{' '}
          {contact.summary.transactionCount} حركة
        </Text>
      </View>

      <NetBalanceBadge summary={contact.summary} size="sm" />
      <ChevronLeft size={18} color="#9ca3af" />
    </Pressable>
  );
}
