import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Phone, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/EventCard';
import { LedgerSummaryBar } from '@/components/LedgerSummaryBar';
import { NetBalanceBadge } from '@/components/NetBalanceBadge';
import { TransactionCard } from '@/components/TransactionCard';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { TransactionDirection } from '@/types';
import { formatAmount } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ProfileRoute = RouteProp<RootStackParamList, 'ContactProfile'>;

type Filter = 'ALL' | TransactionDirection;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'الكل' },
  { key: 'OUT', label: 'دفعت' },
  { key: 'IN', label: 'استلمت' },
];

/** ملف جهة الاتصال: الرصيد، سجل الحركات (وارد/صادر)، والمناسبات المرتبطة. */
export function ContactProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<ProfileRoute>();
  const {
    getContactById,
    getContactTransactions,
    getContactEvents,
    getEventById,
  } = useLedger();
  const [filter, setFilter] = useState<Filter>('ALL');

  const contact = getContactById(params.contactId);
  const transactions = useMemo(
    () => getContactTransactions(params.contactId),
    [getContactTransactions, params.contactId],
  );
  const events = useMemo(
    () => getContactEvents(params.contactId),
    [getContactEvents, params.contactId],
  );

  const visibleTransactions = useMemo(
    () =>
      filter === 'ALL'
        ? transactions
        : transactions.filter((transaction) => transaction.direction === filter),
    [filter, transactions],
  );

  if (!contact) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-sm text-gray-500">جهة الاتصال غير موجودة.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-56">
        <View className="items-center rounded-2xl border border-gray-100 bg-white p-5">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Text className="text-2xl font-bold text-green-700">
              {contact.full_name.trim().charAt(0)}
            </Text>
          </View>
          <Text className="mt-3 text-lg font-bold text-gray-900">
            {contact.full_name}
          </Text>
          <Text className="text-xs text-gray-500">
            {contact.relation ?? 'بدون تصنيف'}
          </Text>

          {contact.phone ? (
            <View className="mt-1 flex-row-reverse items-center">
              <Phone size={13} color="#6b7280" />
              <Text className="mr-1 text-xs text-gray-600">{contact.phone}</Text>
            </View>
          ) : null}

          <View className="mt-3">
            <NetBalanceBadge summary={contact.summary} size="lg" />
          </View>

          <Pressable
            onPress={() =>
              navigation.navigate('AddTransaction', { contactId: contact.id })
            }
            accessibilityRole="button"
            className="mt-4 flex-row-reverse items-center rounded-xl bg-green-600 px-4 py-2">
            <Plus size={16} color="#ffffff" />
            <Text className="mr-1 text-sm font-semibold text-white">
              إضافة حركة
            </Text>
          </Pressable>
        </View>

        <View className="mt-4 flex-row-reverse">
          <View className="flex-1 rounded-2xl border border-gray-100 bg-white p-3">
            <Text className="text-right text-[11px] text-gray-500">دفعت له</Text>
            <Text className="text-right text-base font-bold text-green-700">
              {formatAmount(contact.summary.totalOut, contact.summary.currency)}
            </Text>
          </View>
          <View className="w-3" />
          <View className="flex-1 rounded-2xl border border-gray-100 bg-white p-3">
            <Text className="text-right text-[11px] text-gray-500">استلمت منه</Text>
            <Text className="text-right text-base font-bold text-red-700">
              {formatAmount(contact.summary.totalIn, contact.summary.currency)}
            </Text>
          </View>
        </View>

        {contact.notes ? (
          <Text className="mt-3 text-right text-xs text-gray-600">
            ملاحظات: {contact.notes}
          </Text>
        ) : null}

        <Text className="mb-2 mt-6 text-right text-base font-bold text-gray-900">
          سجل الحركات
        </Text>

        <View className="mb-3 flex-row-reverse">
          {FILTERS.map((item) => {
            const isActive = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                className={`ml-2 rounded-full px-3 py-1 ${
                  isActive ? 'bg-green-600' : 'bg-white border border-gray-200'
                }`}>
                <Text
                  className={`text-xs font-semibold ${
                    isActive ? 'text-white' : 'text-gray-600'
                  }`}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {visibleTransactions.length === 0 ? (
          <Text className="text-right text-sm text-gray-500">
            لا توجد حركات في هذا التصنيف.
          </Text>
        ) : (
          visibleTransactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              eventTitle={
                transaction.event_id
                  ? (getEventById(transaction.event_id)?.title ?? null)
                  : null
              }
            />
          ))
        )}

        <Text className="mb-2 mt-6 text-right text-base font-bold text-gray-900">
          المناسبات المرتبطة
        </Text>
        {events.length === 0 ? (
          <Text className="text-right text-sm text-gray-500">
            لا توجد مناسبات مسجّلة.
          </Text>
        ) : (
          events.map((event) => (
            <EventCard key={event.id} event={event} hostName={contact.full_name} />
          ))
        )}
      </ScrollView>

      <LedgerSummaryBar summary={contact.summary} />
    </SafeAreaView>
  );
}
