import { ArrowDownLeft, ArrowUpRight, CalendarDays } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

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
  const isIncoming = transaction.direction === 'IN';
  const Icon = isIncoming ? ArrowDownLeft : ArrowUpRight;
  const accent = isIncoming ? 'text-red-700' : 'text-green-700';
  const chipBg = isIncoming ? 'bg-red-100' : 'bg-green-100';
  const iconColor = isIncoming ? '#dc2626' : '#16a34a';

  return (
    <View className="mb-2 flex-row-reverse items-center rounded-2xl border border-gray-100 bg-white p-3">
      <View className={`h-10 w-10 items-center justify-center rounded-full ${chipBg}`}>
        <Icon size={20} color={iconColor} />
      </View>

      <View className="mx-3 flex-1">
        <Text className="text-right text-base font-semibold text-gray-900">
          {contactName ?? (isIncoming ? 'نقوط واردة' : 'نقوط صادرة')}
        </Text>
        <Text className="text-right text-xs text-gray-500">
          {formatDate(transaction.occurred_at)}
          {transaction.note ? ` · ${transaction.note}` : ''}
        </Text>
        {eventTitle ? (
          <View className="mt-1 flex-row-reverse items-center">
            <CalendarDays size={12} color="#6b7280" />
            <Text className="mr-1 text-right text-xs text-gray-500">
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
        <Text className="text-[10px] text-gray-400">
          {isIncoming ? 'استلمت' : 'دفعت'}
        </Text>
      </View>
    </View>
  );
}
