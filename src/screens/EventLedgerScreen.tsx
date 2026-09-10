import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeftRight,
  CloudOff,
  Plus,
  Receipt,
  TriangleAlert,
  Users,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BalanceBar, FadeSlideIn, staggerDelay } from '@/components/motion';
import { Button, Card, SectionTitle } from '@/components/ui';
import { useEventLedger } from '@/hooks/useEventLedger';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { usePalette } from '@/store/ThemeProvider';
import { formatAmount, formatDate } from '@/utils/ledger';
import {
  computeEventBalances,
  participantName,
  settleBalances,
  totalEventSpend,
} from '@/utils/split';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type LedgerRoute = RouteProp<RootStackParamList, 'EventLedger'>;

/** الدفتر الجماعي: مصاريف المناسبة، أرصدة المشاركين، ومن يدين لمن. */
export function EventLedgerScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<LedgerRoute>();
  const { contacts, getEventById } = useLedger();
  const { data, loading, error, refresh } = useEventLedger(params.eventId);
  const palette = usePalette();

  const event = data?.event ?? getEventById(params.eventId) ?? null;
  const participants = useMemo(() => data?.participants ?? [], [data]);
  const expenses = useMemo(() => data?.expenses ?? [], [data]);

  const balances = useMemo(
    () => computeEventBalances(participants, expenses, contacts),
    [participants, expenses, contacts],
  );

  const settlements = useMemo(() => settleBalances(balances), [balances]);
  const total = useMemo(() => totalEventSpend(expenses), [expenses]);
  const currency = expenses[0]?.currency ?? 'EGP';

  // مرجع تطبيع أشرطة الأرصدة: أكبر رصيد مطلق يملأ الشريط كاملاً.
  const maxAbsNet = useMemo(
    () => balances.reduce((max, row) => Math.max(max, Math.abs(row.net)), 0),
    [balances],
  );

  const contactNames = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.full_name])),
    [contacts],
  );

  const participantsById = useMemo(
    () => new Map(participants.map((row) => [row.id, row])),
    [participants],
  );

  function payerName(payerParticipantId: string | null): string {
    if (!payerParticipantId) return 'غير معروف';
    const member = participantsById.get(payerParticipantId);
    return member ? participantName(member, contactNames) : 'عضو محذوف';
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-base px-8">
        {loading ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <Text className="text-center text-body text-ink-muted">
            {error ?? 'المناسبة غير موجودة.'}
          </Text>
        )}
      </SafeAreaView>
    );
  }

  const noParticipants = participants.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-base" edges={['bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={palette.primary}
          />
        }>
        {error ? (
          <Card variant="danger" className="mb-3" padded={false}>
            <View className="flex-row-reverse items-center p-3">
              <TriangleAlert size={16} color={palette.danger} />
              <Text className="mr-2 flex-1 text-right text-caption text-danger">
                {error}
              </Text>
            </View>
          </Card>
        ) : data?.offline ? (
          <Card variant="warning" className="mb-3" padded={false}>
            <View className="flex-row-reverse items-center p-3">
              <CloudOff size={16} color={palette.warning} />
              <Text className="mr-2 flex-1 text-right text-caption text-ink-muted">
                تُعرض نسخة محفوظة على الجهاز.
              </Text>
            </View>
          </Card>
        ) : null}

        {/* بطاقة المناسبة: البنفسجي هوية المناسبات والمصاريف المشتركة. */}
        <Card variant="secondary" index={0}>
          <Text className="text-right text-display text-ink">{event.title}</Text>
          <Text className="mt-1 text-right text-caption text-ink-muted">
            {formatDate(event.event_date)}
            {event.location ? ` · ${event.location}` : ''}
          </Text>

          <View className="mt-4 flex-row-reverse items-end justify-between">
            <View>
              <Text className="text-right text-caption text-ink-muted">
                إجمالي المصروف
              </Text>
              <Text className="text-right text-display-lg text-ink">
                {formatAmount(total, currency)}
              </Text>
            </View>
            <View className="flex-row-reverse items-center rounded-full bg-secondary/15 px-3 py-1.5">
              <Users size={14} color={palette.secondary} />
              <Text className="mr-1.5 text-caption font-bold text-secondary">
                {participants.length} مشارك
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row-reverse">
            <Button
              title="مصروف جماعي"
              variant="secondary"
              size="sm"
              block={false}
              disabled={noParticipants}
              onPress={() =>
                navigation.navigate('AddSharedExpense', { eventId: event.id })
              }
              icon={<Plus size={16} color={palette.onSecondary} />}
              className="flex-1"
            />
            <Button
              title="المشاركون"
              variant="outline"
              size="sm"
              block={false}
              onPress={() =>
                navigation.navigate('EventParticipants', { eventId: event.id })
              }
              icon={<Users size={16} color={palette.text} />}
              className="mr-2 flex-1"
            />
          </View>
        </Card>

        {noParticipants ? (
          <Card variant="surface" className="mt-4 items-center" index={1}>
            <Text className="text-center text-body text-ink-muted">
              حدّد المشاركين أولاً لتتمكن من تقسيم المصاريف.
            </Text>
            <Button
              title="تحديد المشاركين"
              variant="primary"
              size="sm"
              block={false}
              className="mt-3"
              onPress={() =>
                navigation.navigate('EventParticipants', { eventId: event.id })
              }
            />
          </Card>
        ) : null}

        <SectionTitle className="mb-2 mt-6">التسوية — من يدفع لمن</SectionTitle>
        {settlements.length === 0 ? (
          <Card variant="surface" index={2}>
            <Text className="text-center text-body text-ink-muted">
              {expenses.length === 0
                ? 'لا توجد مصاريف بعد.'
                : 'الحسابات متعادلة — لا أحد يدين لأحد.'}
            </Text>
          </Card>
        ) : (
          settlements.map((settlement, index) => (
            <Card
              key={`${settlement.fromName}-${settlement.toName}-${index}`}
              variant="surface"
              className="mb-2"
              padded={false}
              index={index + 2}>
              <View className="flex-row-reverse items-center p-3">
                <ArrowLeftRight size={18} color={palette.primary} />
                <Text className="mx-3 flex-1 text-right text-body text-ink">
                  <Text className="font-bold">{settlement.fromName}</Text> يدفع لـ{' '}
                  <Text className="font-bold">{settlement.toName}</Text>
                </Text>
                <Text className="text-body font-bold text-primary">
                  {formatAmount(settlement.amount, currency)}
                </Text>
              </View>
            </Card>
          ))
        )}

        <SectionTitle className="mb-2 mt-6">أرصدة المشاركين</SectionTitle>
        {balances.map((balance, index) => {
          const positive = balance.net > 0;
          const settled = balance.net === 0;
          return (
            <Card
              key={balance.participantId}
              variant="surface"
              className="mb-2"
              index={index}>
              <View className="flex-row-reverse items-center">
                <View className="flex-1">
                  <Text className="text-right text-body font-bold text-ink">
                    {balance.name}
                  </Text>
                  <Text className="text-right text-caption text-ink-muted">
                    دفع {formatAmount(balance.paid, currency)} · عليه{' '}
                    {formatAmount(balance.owed, currency)}
                  </Text>
                </View>
                <Text
                  className={`text-body font-bold ${
                    settled ? 'text-ink-muted' : positive ? 'text-credit' : 'text-debit'
                  }`}>
                  {positive ? '+' : balance.net < 0 ? '−' : ''}
                  {formatAmount(Math.abs(balance.net), currency)}
                </Text>
              </View>

              {/* شريط الرصيد: يجعل حجم الفروق مقروءاً دون قراءة كل رقم. */}
              <View className="mt-2.5">
                <BalanceBar
                  ratio={maxAbsNet === 0 ? 0 : Math.abs(balance.net) / maxAbsNet}
                  color={settled ? palette.muted : positive ? palette.success : palette.danger}
                  trackColor={palette.border}
                  delay={staggerDelay(index)}
                />
              </View>
            </Card>
          );
        })}

        <SectionTitle className="mb-2 mt-6">المصاريف</SectionTitle>
        {loading && expenses.length === 0 ? (
          <ActivityIndicator color={palette.primary} />
        ) : expenses.length === 0 ? (
          <Card variant="outline" index={0}>
            <Text className="text-center text-body text-ink-muted">
              لم تُسجَّل مصاريف بعد.
            </Text>
          </Card>
        ) : (
          expenses.map((expense, index) => (
            <FadeSlideIn key={expense.id} index={index}>
              <Card variant="surface" className="mb-2" animate={false}>
                <View className="flex-row-reverse items-center justify-between">
                  <View className="flex-1 flex-row-reverse items-center">
                    <View className="h-9 w-9 items-center justify-center rounded-xl bg-secondary/15">
                      <Receipt size={16} color={palette.secondary} />
                    </View>
                    <Text className="mr-2.5 flex-1 text-right text-body font-bold text-ink">
                      {expense.description}
                    </Text>
                  </View>
                  <Text className="text-body font-bold text-ink">
                    {formatAmount(expense.amount, expense.currency)}
                  </Text>
                </View>
                <Text className="mt-1.5 text-right text-caption text-ink-muted">
                  دفعها {payerName(expense.payer_participant_id)} ·{' '}
                  {formatDate(expense.occurred_at)} · مقسومة على{' '}
                  {expense.shares.length}
                </Text>
              </Card>
            </FadeSlideIn>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
