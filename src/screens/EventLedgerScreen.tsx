import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeftRight,
  CloudOff,
  Plus,
  TriangleAlert,
  Users,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEventLedger } from '@/hooks/useEventLedger';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { formatAmount, formatDate } from '@/utils/ledger';
import {
  computeEventBalances,
  ME_LABEL,
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

  const names = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.full_name])),
    [contacts],
  );

  function payerName(payerContactId: string | null): string {
    return payerContactId === null
      ? ME_LABEL
      : (names.get(payerContactId) ?? 'غير معروف');
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50 px-8">
        {loading ? (
          <ActivityIndicator color="#16a34a" />
        ) : (
          <Text className="text-center text-sm text-gray-500">
            {error ?? 'المناسبة غير موجودة.'}
          </Text>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-10"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
        }>
        {error ? (
          <View className="mb-3 flex-row-reverse items-center rounded-xl bg-red-50 p-3">
            <TriangleAlert size={16} color="#b91c1c" />
            <Text className="mr-2 flex-1 text-right text-xs text-red-800">
              {error}
            </Text>
          </View>
        ) : data?.offline ? (
          <View className="mb-3 flex-row-reverse items-center rounded-xl bg-amber-50 p-3">
            <CloudOff size={16} color="#b45309" />
            <Text className="mr-2 flex-1 text-right text-xs text-amber-800">
              تُعرض نسخة محفوظة على الجهاز.
            </Text>
          </View>
        ) : null}

        <View className="rounded-2xl border border-gray-100 bg-white p-4">
          <Text className="text-right text-lg font-bold text-gray-900">
            {event.title}
          </Text>
          <Text className="mt-1 text-right text-xs text-gray-500">
            {formatDate(event.event_date)}
            {event.location ? ` · ${event.location}` : ''}
          </Text>

          <View className="mt-3 flex-row-reverse items-center justify-between">
            <View>
              <Text className="text-right text-[11px] text-gray-500">
                إجمالي المصروف
              </Text>
              <Text className="text-right text-xl font-bold text-gray-900">
                {formatAmount(total, currency)}
              </Text>
            </View>
            <View className="flex-row-reverse items-center rounded-full bg-gray-100 px-3 py-1">
              <Users size={14} color="#6b7280" />
              <Text className="mr-1 text-xs font-semibold text-gray-600">
                {participants.length} مشارك
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row-reverse">
            <Pressable
              onPress={() =>
                navigation.navigate('AddSharedExpense', { eventId: event.id })
              }
              accessibilityRole="button"
              disabled={participants.length === 0}
              className={`flex-row-reverse items-center rounded-xl px-4 py-2 ${
                participants.length === 0 ? 'bg-gray-300' : 'bg-green-600'
              }`}>
              <Plus size={16} color="#ffffff" />
              <Text className="mr-1 text-sm font-semibold text-white">
                مصروف جماعي
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                navigation.navigate('EventParticipants', { eventId: event.id })
              }
              accessibilityRole="button"
              className="mr-2 flex-row-reverse items-center rounded-xl border border-gray-300 bg-white px-4 py-2">
              <Users size={16} color="#374151" />
              <Text className="mr-1 text-sm font-semibold text-gray-700">
                المشاركون
              </Text>
            </Pressable>
          </View>
        </View>

        {participants.length === 0 ? (
          <View className="mt-4 items-center rounded-2xl border border-gray-100 bg-white p-6">
            <Text className="text-center text-sm text-gray-600">
              حدّد المشاركين أولاً لتتمكن من تقسيم المصاريف.
            </Text>
            <Pressable
              onPress={() =>
                navigation.navigate('EventParticipants', { eventId: event.id })
              }
              accessibilityRole="button"
              className="mt-3 rounded-2xl bg-green-600 px-5 py-2">
              <Text className="text-sm font-bold text-white">
                تحديد المشاركين
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text className="mb-2 mt-6 text-right text-base font-bold text-gray-900">
          التسوية — من يدفع لمن
        </Text>
        {settlements.length === 0 ? (
          <View className="rounded-2xl border border-gray-100 bg-white p-4">
            <Text className="text-center text-sm text-gray-500">
              {expenses.length === 0
                ? 'لا توجد مصاريف بعد.'
                : 'الحسابات متعادلة — لا أحد يدين لأحد.'}
            </Text>
          </View>
        ) : (
          settlements.map((settlement, index) => (
            <View
              key={`${settlement.fromName}-${settlement.toName}-${index}`}
              className="mb-2 flex-row-reverse items-center rounded-2xl border border-gray-100 bg-white p-3">
              <ArrowLeftRight size={18} color="#16a34a" />
              <Text className="mx-3 flex-1 text-right text-sm text-gray-800">
                <Text className="font-bold">{settlement.fromName}</Text> يدفع لـ{' '}
                <Text className="font-bold">{settlement.toName}</Text>
              </Text>
              <Text className="text-sm font-bold text-green-700">
                {formatAmount(settlement.amount, currency)}
              </Text>
            </View>
          ))
        )}

        <Text className="mb-2 mt-6 text-right text-base font-bold text-gray-900">
          أرصدة المشاركين
        </Text>
        {balances.map((balance) => (
          <View
            key={balance.contactId ?? '__me__'}
            className="mb-2 flex-row-reverse items-center rounded-2xl border border-gray-100 bg-white p-3">
            <View className="flex-1">
              <Text className="text-right text-sm font-semibold text-gray-900">
                {balance.name}
              </Text>
              <Text className="text-right text-[11px] text-gray-500">
                دفع {formatAmount(balance.paid, currency)} · عليه{' '}
                {formatAmount(balance.owed, currency)}
              </Text>
            </View>
            <Text
              className={`text-sm font-bold ${
                balance.net > 0
                  ? 'text-green-700'
                  : balance.net < 0
                    ? 'text-red-700'
                    : 'text-gray-500'
              }`}>
              {balance.net > 0 ? '+' : balance.net < 0 ? '−' : ''}
              {formatAmount(balance.net, currency)}
            </Text>
          </View>
        ))}

        <Text className="mb-2 mt-6 text-right text-base font-bold text-gray-900">
          المصاريف
        </Text>
        {loading && expenses.length === 0 ? (
          <ActivityIndicator color="#16a34a" />
        ) : expenses.length === 0 ? (
          <Text className="text-right text-sm text-gray-500">
            لم تُسجَّل مصاريف بعد.
          </Text>
        ) : (
          expenses.map((expense) => (
            <View
              key={expense.id}
              className="mb-2 rounded-2xl border border-gray-100 bg-white p-3">
              <View className="flex-row-reverse items-center justify-between">
                <Text className="flex-1 text-right text-sm font-semibold text-gray-900">
                  {expense.description}
                </Text>
                <Text className="text-sm font-bold text-gray-900">
                  {formatAmount(expense.amount, expense.currency)}
                </Text>
              </View>
              <Text className="mt-1 text-right text-[11px] text-gray-500">
                دفعها {payerName(expense.payer_contact_id)} ·{' '}
                {formatDate(expense.occurred_at)} · مقسومة على{' '}
                {expense.shares.length}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
