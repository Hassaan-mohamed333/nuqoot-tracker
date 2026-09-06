import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CloudOff, Plus } from 'lucide-react-native';
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

import { EventCard } from '@/components/EventCard';
import { LedgerSummaryBar } from '@/components/LedgerSummaryBar';
import { TransactionCard } from '@/components/TransactionCard';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { formatAmount } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** الشاشة الرئيسية: نظرة عامة على الواجبات، آخر الحركات، والمناسبات القادمة. */
export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const {
    totals,
    transactions,
    events,
    contacts,
    loading,
    offline,
    refresh,
    getEventById,
  } = useLedger();

  const contactNames = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.full_name])),
    [contacts],
  );

  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
        .slice(0, 5),
    [transactions],
  );

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => new Date(event.event_date).getTime() >= Date.now())
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .slice(0, 3),
    [events],
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-56"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
        }>
        <View className="flex-row-reverse items-center justify-between">
          <View>
            <Text className="text-right text-2xl font-bold text-gray-900">
              النقوط والواجبات
            </Text>
            <Text className="text-right text-xs text-gray-500">
              {contacts.length} جهة اتصال · {transactions.length} حركة
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('AddTransaction')}
            accessibilityRole="button"
            accessibilityLabel="إضافة حركة جديدة"
            className="h-11 w-11 items-center justify-center rounded-full bg-green-600">
            <Plus size={22} color="#ffffff" />
          </Pressable>
        </View>

        {offline ? (
          <View className="mt-3 flex-row-reverse items-center rounded-xl bg-amber-50 p-3">
            <CloudOff size={16} color="#b45309" />
            <Text className="mr-2 flex-1 text-right text-xs text-amber-800">
              وضع محلي: البيانات محفوظة على الجهاز. اضبط مفاتيح Supabase للمزامنة.
            </Text>
          </View>
        ) : null}

        <View className="mt-4 flex-row-reverse">
          <View className="flex-1 rounded-2xl border border-gray-100 bg-white p-4">
            <Text className="text-right text-xs text-gray-500">إجمالي ما دفعت</Text>
            <Text className="text-right text-lg font-bold text-green-700">
              {formatAmount(totals.totalOut, totals.currency)}
            </Text>
          </View>
          <View className="w-3" />
          <View className="flex-1 rounded-2xl border border-gray-100 bg-white p-4">
            <Text className="text-right text-xs text-gray-500">إجمالي ما استلمت</Text>
            <Text className="text-right text-lg font-bold text-red-700">
              {formatAmount(totals.totalIn, totals.currency)}
            </Text>
          </View>
        </View>

        <Text className="mb-2 mt-6 text-right text-base font-bold text-gray-900">
          مناسبات قادمة
        </Text>
        {upcomingEvents.length === 0 ? (
          <Text className="text-right text-sm text-gray-500">
            لا توجد مناسبات قادمة.
          </Text>
        ) : (
          upcomingEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              hostName={
                event.host_contact_id
                  ? contactNames.get(event.host_contact_id)
                  : null
              }
            />
          ))
        )}

        <Text className="mb-2 mt-6 text-right text-base font-bold text-gray-900">
          آخر الحركات
        </Text>
        {loading && transactions.length === 0 ? (
          <ActivityIndicator color="#16a34a" />
        ) : recentTransactions.length === 0 ? (
          <Text className="text-right text-sm text-gray-500">
            لم تُسجَّل أي حركة بعد.
          </Text>
        ) : (
          recentTransactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              contactName={contactNames.get(transaction.contact_id)}
              eventTitle={
                transaction.event_id
                  ? (getEventById(transaction.event_id)?.title ?? null)
                  : null
              }
            />
          ))
        )}
      </ScrollView>

      <LedgerSummaryBar summary={totals} />
    </SafeAreaView>
  );
}
