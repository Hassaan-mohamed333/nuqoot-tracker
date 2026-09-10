import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarPlus, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/EventCard';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { Event } from '@/types';
import { usePalette } from '@/store/ThemeProvider';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'upcoming' | 'past';

/** قائمة المناسبات مقسّمة إلى قادمة وسابقة، مع إجمالي النقوط لكل مناسبة. */
export function EventsScreen() {
  const palette = usePalette();
  const navigation = useNavigation<Navigation>();
  const { events, transactions, contacts, loading, refresh } = useLedger();
  const [tab, setTab] = useState<Tab>('upcoming');

  const contactNames = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.full_name])),
    [contacts],
  );

  /** مجموع ما دُفع (OUT) لكل مناسبة. */
  const paidByEvent = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of transactions) {
      if (!transaction.event_id || transaction.direction !== 'OUT') continue;
      totals.set(
        transaction.event_id,
        (totals.get(transaction.event_id) ?? 0) + Math.abs(transaction.amount),
      );
    }
    return totals;
  }, [transactions]);

  const visibleEvents = useMemo(() => {
    const now = Date.now();
    const isUpcoming = (event: Event) =>
      new Date(event.event_date).getTime() >= now;

    return events
      .filter((event) => (tab === 'upcoming' ? isUpcoming(event) : !isUpcoming(event)))
      .sort((a, b) =>
        tab === 'upcoming'
          ? a.event_date.localeCompare(b.event_date)
          : b.event_date.localeCompare(a.event_date),
      );
  }, [events, tab]);

  return (
    <SafeAreaView className="flex-1 bg-base" edges={['top']}>
      <View className="px-4 pt-2">
        <View className="flex-row-reverse items-center justify-between">
          <Text className="text-right text-2xl font-bold text-ink">
            المناسبات
          </Text>
          <Pressable
            onPress={() => navigation.navigate('AddEvent')}
            accessibilityRole="button"
            accessibilityLabel="إضافة مناسبة"
            className="h-10 w-10 items-center justify-center rounded-full bg-primary">
            <Plus size={20} color={palette.onPrimary} />
          </Pressable>
        </View>

        <View className="mt-3 flex-row-reverse">
          {(
            [
              { key: 'upcoming', label: 'قادمة' },
              { key: 'past', label: 'سابقة' },
            ] as const
          ).map((item) => {
            const isActive = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                accessibilityRole="button"
                className={`ml-2 rounded-full px-4 py-1.5 ${
                  isActive ? 'bg-primary' : 'bg-surface border border-line'
                }`}>
                <Text
                  className={`text-xs font-semibold ${
                    isActive ? 'text-primary-fg' : 'text-ink-muted'
                  }`}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        className="mt-3 flex-1"
        contentContainerClassName="px-4 pb-32"
        data={visibleEvents}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={() => void refresh()}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            hostName={
              item.host_contact_id
                ? contactNames.get(item.host_contact_id)
                : null
            }
            totalPaid={paidByEvent.get(item.id) ?? 0}
            onPress={() =>
              navigation.navigate('EventLedger', { eventId: item.id })
            }
          />
        )}
        ListEmptyComponent={
          <View className="mt-10 items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/15">
              <CalendarPlus size={26} color={palette.primary} />
            </View>
            <Text className="mt-3 text-center text-sm font-semibold text-ink">
              {tab === 'upcoming'
                ? 'لا توجد مناسبات قادمة.'
                : 'لا توجد مناسبات سابقة.'}
            </Text>
            <Pressable
              onPress={() => navigation.navigate('AddEvent')}
              accessibilityRole="button"
              className="mt-4 rounded-full bg-primary px-5 py-2.5">
              <Text className="text-sm font-bold text-primary-fg">إضافة مناسبة</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}
