import { CalendarDays, MapPin, Users } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import type { Event, EventType } from '@/types';
import { formatAmount, formatDate } from '@/utils/ledger';

interface EventCardProps {
  event: Event;
  hostName?: string | null;
  /** إجمالي ما دُفع في هذه المناسبة. */
  totalPaid?: number;
  currency?: string;
  onPress?: () => void;
}

const EVENT_LABELS: Record<EventType, string> = {
  wedding: 'فرح',
  engagement: 'خطوبة',
  newborn: 'مولود',
  graduation: 'تخرج',
  funeral: 'عزاء',
  other: 'مناسبة',
};

const EVENT_CHIP_BG: Record<EventType, string> = {
  wedding: 'bg-rose-100',
  engagement: 'bg-purple-100',
  newborn: 'bg-sky-100',
  graduation: 'bg-amber-100',
  funeral: 'bg-slate-200',
  other: 'bg-gray-100',
};

const EVENT_CHIP_TEXT: Record<EventType, string> = {
  wedding: 'text-rose-700',
  engagement: 'text-purple-700',
  newborn: 'text-sky-700',
  graduation: 'text-amber-700',
  funeral: 'text-slate-700',
  other: 'text-gray-700',
};

/** بطاقة مناسبة مع نوعها وتاريخها ومكانها وإجمالي النقوط المرتبطة بها. */
export function EventCard({
  event,
  hostName,
  totalPaid,
  currency = 'EGP',
  onPress,
}: EventCardProps) {
  const isUpcoming = new Date(event.event_date).getTime() > Date.now();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className="mb-2 rounded-2xl border border-gray-100 bg-white p-4">
      <View className="flex-row-reverse items-start justify-between">
        <Text className="flex-1 text-right text-base font-bold text-gray-900">
          {event.title}
        </Text>
        <View className={`rounded-full px-2 py-0.5 ${EVENT_CHIP_BG[event.event_type]}`}>
          <Text
            className={`text-[11px] font-semibold ${EVENT_CHIP_TEXT[event.event_type]}`}>
            {EVENT_LABELS[event.event_type]}
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row-reverse items-center">
        <CalendarDays size={14} color="#6b7280" />
        <Text className="mr-1 text-right text-xs text-gray-600">
          {formatDate(event.event_date)}
        </Text>
        {isUpcoming ? (
          <View className="mr-2 rounded-full bg-green-100 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-green-700">قادمة</Text>
          </View>
        ) : null}
      </View>

      {hostName ? (
        <View className="mt-1 flex-row-reverse items-center">
          <Users size={14} color="#6b7280" />
          <Text className="mr-1 text-right text-xs text-gray-600">{hostName}</Text>
        </View>
      ) : null}

      {event.location ? (
        <View className="mt-1 flex-row-reverse items-center">
          <MapPin size={14} color="#6b7280" />
          <Text className="mr-1 text-right text-xs text-gray-600">
            {event.location}
          </Text>
        </View>
      ) : null}

      {typeof totalPaid === 'number' && totalPaid > 0 ? (
        <Text className="mt-2 text-right text-sm font-semibold text-green-700">
          إجمالي النقوط: {formatAmount(totalPaid, currency)}
        </Text>
      ) : null}
    </Pressable>
  );
}
