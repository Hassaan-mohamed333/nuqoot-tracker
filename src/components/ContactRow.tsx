import { ChevronLeft, Phone } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { NetBalanceBadge } from '@/components/NetBalanceBadge';
import { palette } from '@/lib/palette';
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

      <View className="mx-3 flex-1">
        <Text
          numberOfLines={1}
          className="text-right text-body font-bold text-ink">
          {contact.full_name}
        </Text>

        <View className="mt-0.5 flex-row-reverse items-center">
          {contact.phone ? (
            <>
              <Phone size={11} color={palette.muted} />
              {/* الأرقام تُقرأ يساراً حتى داخل سطر عربي. */}
              <Text
                numberOfLines={1}
                className="mr-1 text-caption text-ink-muted">
                {contact.phone}
              </Text>
            </>
          ) : (
            <Text className="text-caption text-ink-subtle">
              {contact.relation ?? 'بدون رقم'}
            </Text>
          )}
          <Text className="mr-1.5 text-caption text-ink-subtle">
            · {count} حركة
          </Text>
        </View>
      </View>

      <NetBalanceBadge summary={contact.summary} size="sm" />
      <ChevronLeft size={18} color={palette.muted} />
    </PressableScale>
  );
}
