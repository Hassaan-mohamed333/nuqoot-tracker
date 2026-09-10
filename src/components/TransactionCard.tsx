import { ArrowDownLeft, ArrowUpRight, CalendarDays } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import { usePalette } from '@/store/ThemeProvider';
import type { Transaction } from '@/types';
import { formatAmount, formatDate } from '@/utils/ledger';

interface TransactionCardProps {
  transaction: Transaction;
  /** اسم جهة الاتصال، يُعرض في الشاشات العامة فقط. */
  contactName?: string;
  /** عنوان المناسبة المرتبطة إن وُجدت. */
  eventTitle?: string | null;
}

/**
 * بطاقة حركة واحدة.
 * IN (نقوط استلمتها) بالأحمر لأنها تُنشئ واجباً عليّ،
 * OUT (نقوط دفعتها) بالأخضر لأنها تُنشئ حقاً لي.
 */
export function TransactionCard({
  transaction,
  contactName,
  eventTitle,
}: TransactionCardProps) {
  const palette = usePalette();
  const isIncoming = transaction.direction === 'IN';
  const Icon = isIncoming ? ArrowDownLeft : ArrowUpRight;
  const accent = isIncoming ? 'text-danger' : 'text-primary';
  const chipBg = isIncoming ? 'bg-danger-soft' : 'bg-primary/15';
  // دلالي لا جمالي: الوارد يزيد ما عليّ (أحمر)، والصادر يزيد ما لي (أخضر).
  const iconColor = isIncoming ? palette.danger : palette.success;

  return (
    <View className="mb-2 flex-row-reverse items-center rounded-2xl border border-line bg-surface p-3">
      <View className={`h-10 w-10 items-center justify-center rounded-full ${chipBg}`}>
        <Icon size={20} color={iconColor} />
      </View>

      <View className="mx-3 flex-1">
        <Text className="text-right text-base font-semibold text-ink">
          {contactName ?? (isIncoming ? 'نقوط واردة' : 'نقوط صادرة')}
        </Text>
        <Text className="text-right text-xs text-ink-muted">
          {formatDate(transaction.occurred_at)}
          {transaction.note ? ` · ${transaction.note}` : ''}
        </Text>
        {eventTitle ? (
          <View className="mt-1 flex-row-reverse items-center">
            <CalendarDays size={12} color={palette.muted} />
            <Text className="mr-1 text-right text-xs text-ink-muted">
              {eventTitle}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="items-start">
        <Text className={`text-base font-bold ${accent}`}>
          {isIncoming ? '−' : '+'}
          {formatAmount(transaction.amount, transaction.currency)}
        </Text>
        <Text className="text-[10px] text-ink-subtle">
          {isIncoming ? 'استلمت' : 'دفعت'}
        </Text>
      </View>
    </View>
  );
}
