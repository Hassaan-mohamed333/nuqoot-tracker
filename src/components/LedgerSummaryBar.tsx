import { Scale, TrendingDown, TrendingUp } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import type { LedgerSummary } from '@/types';
import { describeNet, formatAmount, formatNet, getStatusTheme } from '@/utils/ledger';

interface LedgerSummaryBarProps {
  summary: LedgerSummary;
  /** يُستخدم كشريط ثابت أسفل الشاشة. */
  floating?: boolean;
}

/**
 * الشريط الثابت أسفل الشاشة: يعرض الصافي وحالته (دائن / مدين / متعادل)
 * مع تفصيل ما دُفع وما استُلم.
 */
export function LedgerSummaryBar({
  summary,
  floating = true,
}: LedgerSummaryBarProps) {
  const theme = getStatusTheme(summary.status);
  const StatusIcon =
    summary.status === 'credit'
      ? TrendingUp
      : summary.status === 'debit'
        ? TrendingDown
        : Scale;

  return (
    <View
      className={`border-t border-line bg-surface px-4 pb-6 pt-3 ${
        floating ? 'absolute inset-x-0 bottom-0' : ''
      }`}>
      <View className="flex-row-reverse items-center justify-between">
        <View className="flex-row-reverse items-center">
          <View
            className={`h-9 w-9 items-center justify-center rounded-full ${theme.bgClass}`}>
            <StatusIcon size={18} color={theme.color} />
          </View>
          <View className="mr-2">
            <Text className={`text-right text-lg font-bold ${theme.textClass}`}>
              {formatNet(summary.net, summary.currency)}
            </Text>
            <Text className="text-right text-[11px] text-ink-muted">
              {describeNet(summary)}
            </Text>
          </View>
        </View>

        <View className={`rounded-full px-3 py-1 ${theme.bgClass}`}>
          <Text className={`text-xs font-bold ${theme.textClass}`}>
            {theme.label}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row-reverse justify-between">
        <View className="flex-1 items-center rounded-xl bg-primary/10 py-2">
          <Text className="text-[11px] text-ink-muted">إجمالي دائن (دفعت)</Text>
          <Text className="text-sm font-bold text-primary">
            {formatAmount(summary.totalOut, summary.currency)}
          </Text>
        </View>
        <View className="mx-2 w-2" />
        <View className="flex-1 items-center rounded-xl bg-danger-soft py-2">
          <Text className="text-[11px] text-ink-muted">إجمالي مدين (استلمت)</Text>
          <Text className="text-sm font-bold text-danger">
            {formatAmount(summary.totalIn, summary.currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}
