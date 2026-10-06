import { MapPin, Users } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { palette } from '@/lib/palette';
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
  graduation: 'bg-warning-soft',
  funeral: 'bg-slate-200',
  other: 'bg-line/40',
};

const EVENT_CHIP_TEXT: Record<EventType, string> = {
  wedding: 'text-rose-700',
  engagement: 'text-purple-700',
  newborn: 'text-sky-700',
  graduation: 'text-ink-muted',
  funeral: 'text-slate-700',
  other: 'text-ink',
};

/** اليوم والشهر لصندوق التاريخ. فارغان إن كان التاريخ غير صالح. */
function dateParts(isoDate: string): { day: string; month: string } {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return { day: '—', month: '' };
  return {
    day: new Intl.DateTimeFormat('ar-EG', { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat('ar-EG', { month: 'short' }).format(date),
  };
}

/**
 * بطاقة مناسبة: صندوق تاريخ كبير، العنوان بسطر واحد، ثم المكان والمضيف.
 *
 * الصندوق يجعل الفرز الزمني مقروءاً بنظرة، والعنوان والمكان مقطوعان
 * بسطر واحد حتى لا يمدّ نصٌّ طويل البطاقة.
 */
export function EventCard({
  event,
  hostName,
  totalPaid,
  currency = 'EGP',
  onPress,
}: EventCardProps) {
  const isUpcoming = new Date(event.event_date).getTime() > Date.now();
  const { day, month } = dateParts(event.event_date);
  const dateTone = isUpcoming ? 'bg-primary/15' : 'bg-surface-raised';
  const dateText = isUpcoming ? 'text-primary-strong' : 'text-ink-muted';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${event.title}، ${EVENT_LABELS[event.event_type]}، ${formatDate(event.event_date)}`}
      className="mb-2 flex-row-reverse items-center rounded-card border border-line bg-surface p-3">
      <View
        className={`h-[60px] w-[54px] items-center justify-center rounded-2xl ${dateTone}`}>
        <Text className={`text-xl font-bold ${dateText}`}>{day}</Text>
        <Text className={`text-[11px] ${dateText}`}>{month}</Text>
      </View>

      <View className="mx-3 min-w-0 flex-1">
        <View className="flex-row-reverse items-center">
          <Text
            numberOfLines={1}
            className="flex-shrink text-right text-base font-bold text-ink">
            {event.title}
          </Text>
          <View
            className={`mr-2 rounded-full px-2 py-0.5 ${EVENT_CHIP_BG[event.event_type]}`}>
            <Text
              className={`text-[11px] font-semibold ${EVENT_CHIP_TEXT[event.event_type]}`}>
              {EVENT_LABELS[event.event_type]}
            </Text>
          </View>
        </View>

        {event.location ? (
          <View className="mt-1 flex-row-reverse items-center">
            <MapPin size={13} color={palette.muted} />
            <Text
              numberOfLines={1}
              className="mr-1 flex-1 text-right text-xs text-ink-muted">
              {event.location}
            </Text>
          </View>
        ) : null}

        {hostName ? (
          <View className="mt-1 flex-row-reverse items-center">
            <Users size={13} color={palette.muted} />
            <Text
              numberOfLines={1}
              className="mr-1 flex-1 text-right text-xs text-ink-muted">
              {hostName}
            </Text>
          </View>
        ) : null}

        {typeof totalPaid === 'number' && totalPaid > 0 ? (
          <Text className="mt-1 text-right text-sm font-semibold text-primary-strong">
            إجمالي النقوط: {formatAmount(totalPaid, currency)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
