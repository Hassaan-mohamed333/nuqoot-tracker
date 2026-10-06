import React from 'react';
import { Text, View } from 'react-native';

import type { LedgerSummary } from '@/types';
import { formatNet, getStatusTheme } from '@/utils/ledger';

interface NetBalanceBadgeProps {
  summary: LedgerSummary;
  /** يعرض التسمية (دائن / مدين / متعادل) بجانب المبلغ. */
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: { container: 'px-2 py-1', amount: 'text-sm', label: 'text-[10px]' },
  md: { container: 'px-3 py-1.5', amount: 'text-base', label: 'text-xs' },
  lg: { container: 'px-4 py-2', amount: 'text-2xl', label: 'text-sm' },
} as const;

/**
 * شارة الرصيد الصافي: أخضر للدائن، أحمر للمدين، رمادي للمتعادل.
 */
export function NetBalanceBadge({
  summary,
  showLabel = true,
  size = 'md',
}: NetBalanceBadgeProps) {
  const theme = getStatusTheme(summary.status);
  const sizes = SIZE_CLASSES[size];

  return (
    <View
      className={`items-center rounded-xl border ${theme.bgClass} ${theme.borderClass} ${sizes.container}`}>
      <Text className={`font-bold ${theme.textClass} ${sizes.amount}`}>
        {formatNet(summary.net, summary.currency)}
      </Text>
      {showLabel ? (
        <Text className={`${theme.textClass} ${sizes.label}`}>
          {theme.label}
        </Text>
      ) : null}
    </View>
  );
}
