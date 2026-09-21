import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { palette } from '@/lib/palette';
import type { Transaction } from '@/types';
import { formatAmount, formatDate } from '@/utils/ledger';

interface TransactionCardProps {
  transaction: Transaction;
  /** اسم جهة الاتصال، يُعرض في الشاشات العامة فقط. */
  contactName?: string;
  /** عنوان المناسبة المرتبطة إن وُجدت. */
  eventTitle?: string | null;
  /** يُظهر زرّ التعديل. غيابه يعني بطاقة للعرض فقط. */
  onEdit?: () => void;
  /** يُظهر زرّ الحذف. التأكيد مسؤولية المستدعي لا البطاقة. */
  onDelete?: () => void;
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
  onEdit,
  onDelete,
}: TransactionCardProps) {
  const isIncoming = transaction.direction === 'IN';
  const Icon = isIncoming ? ArrowDownLeft : ArrowUpRight;
  const accent = isIncoming ? 'text-danger' : 'text-primary-strong';
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

      {onEdit || onDelete ? (
        <View className="mr-2 flex-row-reverse items-center">
          {onEdit ? (
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel="تعديل الحركة"
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-full bg-surface-raised">
              <Pencil size={15} color={palette.muted} />
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel="حذف الحركة"
              hitSlop={8}
              className="mr-1 h-8 w-8 items-center justify-center rounded-full bg-danger-soft">
              <Trash2 size={15} color={palette.danger} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
