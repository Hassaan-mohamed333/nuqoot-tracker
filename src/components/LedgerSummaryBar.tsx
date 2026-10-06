import { Scale, TrendingDown, TrendingUp } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import type { LedgerSummary } from '@/types';
import { describeNet, formatAmount, formatNet, getStatusTheme } from '@/utils/ledger';

interface LedgerSummaryBarProps {
  summary: LedgerSummary;
  /**
   * `hero`: بطاقة الرصيد الكبيرة في أول الرئيسية.
   * `compact`: سطر واحد داخل الشاشة (قائمة جهات الاتصال).
   *
   * كان الملخص شريطاً ثابتاً أسفل كل شاشة يأخذ نحو نصف ارتفاعها فوق
   * شريط التبويبات؛ صار جزءاً من المحتوى يمرّ مع التمرير.
   */
  variant?: 'hero' | 'compact';
}

function statusIcon(status: LedgerSummary['status']) {
  return status === 'credit' ? TrendingUp : status === 'debit' ? TrendingDown : Scale;
}

/** يعرض الصافي وحالته (دائن / مدين / متعادل) مع تفصيل ما دُفع وما استُلم. */
export function LedgerSummaryBar({
  summary,
  variant = 'hero',
}: LedgerSummaryBarProps) {
  const theme = getStatusTheme(summary.status);
  const StatusIcon = statusIcon(summary.status);

  if (variant === 'compact') {
    return (
      <View
        accessible
        accessibilityLabel={`${formatNet(summary.net, summary.currency)}، ${describeNet(summary)}`}
        className="flex-row-reverse items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
        <View className="flex-row-reverse items-center">
          <View
            className={`h-9 w-9 items-center justify-center rounded-full ${theme.bgClass}`}>
            <StatusIcon size={18} color={theme.color} />
          </View>
          <View className="mr-3">
            <Text className={`text-right text-base font-bold ${theme.textClass}`}>
              {formatNet(summary.net, summary.currency)}
            </Text>
            <Text className="text-right text-caption text-ink-muted">
              {describeNet(summary)}
            </Text>
          </View>
        </View>
        <View className={`rounded-full px-3 py-1 ${theme.bgClass}`}>
          <Text className={`text-xs font-bold ${theme.textClass}`}>{theme.label}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="overflow-hidden rounded-3xl bg-hero p-5 shadow-card">
      <Text className="text-right text-caption text-hero-fg/75">صافي رصيدك</Text>
      <Text
        className="mt-1 text-right text-[34px] font-bold leading-[44px] text-hero-accent"
        adjustsFontSizeToFit
        numberOfLines={1}>
        {formatNet(summary.net, summary.currency)}
      </Text>

      <View className="mt-2 flex-row-reverse items-center self-start">
        <View className="flex-row-reverse items-center rounded-full bg-hero-accent/20 px-3 py-1">
          <StatusIcon size={14} color="#FACC15" />
          <Text className="mr-1.5 text-xs font-bold text-hero-accent">
            {theme.label}
          </Text>
        </View>
        <Text className="mr-2 text-caption text-hero-fg/75">{describeNet(summary)}</Text>
      </View>

      <View className="mt-4 flex-row-reverse">
        <View className="flex-1 rounded-2xl bg-hero-fg/10 px-3 py-2.5">
          <Text className="text-right text-caption text-hero-fg/75">دفعت</Text>
          <Text className="text-right text-base font-bold text-hero-fg">
            {formatAmount(summary.totalOut, summary.currency)}
          </Text>
        </View>
        <View className="w-2.5" />
        <View className="flex-1 rounded-2xl bg-hero-fg/10 px-3 py-2.5">
          <Text className="text-right text-caption text-hero-fg/75">استلمت</Text>
          <Text className="text-right text-base font-bold text-hero-fg">
            {formatAmount(summary.totalIn, summary.currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}
