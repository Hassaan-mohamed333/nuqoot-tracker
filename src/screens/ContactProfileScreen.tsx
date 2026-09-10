import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Archive,
  ArchiveRestore,
  CloudOff,
  Phone,
  Plus,
  TriangleAlert,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmAction, reportError } from '@/lib/alerts';
import { EventCard } from '@/components/EventCard';
import { LedgerSummaryBar } from '@/components/LedgerSummaryBar';
import { NetBalanceBadge } from '@/components/NetBalanceBadge';
import { TransactionCard } from '@/components/TransactionCard';
import { useContactLedger } from '@/hooks/useContactLedger';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { TransactionDirection } from '@/types';
import { formatAmount, summarize } from '@/utils/ledger';

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
  const [filter, setFilter] = useState<Filter>('ALL');

  // استعلام مباشر مُرشَّح على الخادم بـ contact_id.
  const { data, loading, error, refresh } = useContactLedger(params.contactId);

  // النسخة المحمّلة مسبقاً في المزوّد تُستخدم كعنوان مؤقت ريثما يصل الطلب،
  // فلا تظهر الشاشة فارغة عند الدخول إليها.
  const { getContactById, setArchived } = useLedger();
  const cachedContact = getContactById(params.contactId);

  const contact = data?.contact ?? cachedContact ?? null;
  const transactions = useMemo(() => data?.transactions ?? [], [data]);
  const events = useMemo(() => data?.events ?? [], [data]);

  const summary = useMemo(() => summarize(transactions), [transactions]);

  const eventTitles = useMemo(
    () => new Map(events.map((event) => [event.id, event.title])),
    [events],
  );

  const visibleTransactions = useMemo(
    () =>
      filter === 'ALL'
        ? transactions
        : transactions.filter((transaction) => transaction.direction === filter),
    [filter, transactions],
  );

  const isArchived = contact?.is_archived ?? false;
  // التسوية متاحة فقط عند صافي صفر: لا حقوق معلّقة في الاتجاهين.
  const canSettle =
    !isArchived && summary.net === 0 && summary.transactionCount > 0;

  async function confirmArchive() {
    if (!contact) return;
    const approved = await confirmAction({
      title: 'تسوية وأرشفة',
      message: `سيتم إخفاء ${contact.full_name} من القائمة النشطة. الحركات تبقى محفوظة ويمكن الاستعادة في أي وقت.`,
      confirmLabel: 'تسوية وأرشفة',
    });
    if (!approved) return;

    try {
      await setArchived(contact.id, true);
      navigation.goBack();
    } catch (error) {
      reportError('تعذّر الأرشفة', error);
    }
  }

  async function restore() {
    if (!contact) return;
    try {
      await setArchived(contact.id, false);
    } catch (error) {
      reportError('تعذّرت الاستعادة', error);
    }
  }

  if (!contact) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50 px-8">
        {loading ? (
          <ActivityIndicator color="#16a34a" />
        ) : (
          <Text className="text-center text-sm text-gray-500">
            {error ?? 'جهة الاتصال غير موجودة.'}
          </Text>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-56"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
        }>
        {error ? (
          <View className="mb-3 flex-row-reverse items-center rounded-xl bg-red-50 p-3">
            <TriangleAlert size={16} color="#b91c1c" />
            <Text className="mr-2 flex-1 text-right text-xs text-red-800">
              {error}
            </Text>
            <Pressable
              onPress={() => void refresh()}
              accessibilityRole="button"
              className="rounded-full bg-white px-3 py-1">
              <Text className="text-xs font-bold text-red-700">إعادة</Text>
            </Pressable>
          </View>
        ) : data?.offline ? (
          <View className="mb-3 flex-row-reverse items-center rounded-xl bg-amber-50 p-3">
            <CloudOff size={16} color="#b45309" />
            <Text className="mr-2 flex-1 text-right text-xs text-amber-800">
              تُعرض نسخة محفوظة على الجهاز.
            </Text>
          </View>
        ) : null}

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
            <NetBalanceBadge summary={summary} size="lg" />
          </View>

          <View className="mt-4 flex-row-reverse items-center">
            <Pressable
              onPress={() =>
                navigation.navigate('AddTransaction', { contactId: contact.id })
              }
              accessibilityRole="button"
              className="flex-row-reverse items-center rounded-xl bg-green-600 px-4 py-2">
              <Plus size={16} color="#ffffff" />
              <Text className="mr-1 text-sm font-semibold text-white">
                إضافة حركة
              </Text>
            </Pressable>

            {canSettle ? (
              <Pressable
                onPress={() => void confirmArchive()}
                accessibilityRole="button"
                className="mr-2 flex-row-reverse items-center rounded-xl border border-gray-300 bg-white px-4 py-2">
                <Archive size={16} color="#374151" />
                <Text className="mr-1 text-sm font-semibold text-gray-700">
                  تسوية وأرشفة
                </Text>
              </Pressable>
            ) : null}

            {isArchived ? (
              <Pressable
                onPress={() => void restore()}
                accessibilityRole="button"
                className="mr-2 flex-row-reverse items-center rounded-xl border border-gray-300 bg-white px-4 py-2">
                <ArchiveRestore size={16} color="#374151" />
                <Text className="mr-1 text-sm font-semibold text-gray-700">
                  استعادة
                </Text>
              </Pressable>
            ) : null}
          </View>

          {isArchived ? (
            <View className="mt-3 rounded-full bg-gray-200 px-3 py-1">
              <Text className="text-[11px] font-semibold text-gray-600">
                مؤرشف — الحساب مسوّى
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-4 flex-row-reverse">
          <View className="flex-1 rounded-2xl border border-gray-100 bg-white p-3">
            <Text className="text-right text-[11px] text-gray-500">
              إجمالي دائن
            </Text>
            <Text className="text-right text-base font-bold text-green-700">
              {formatAmount(summary.totalOut, summary.currency)}
            </Text>
          </View>
          <View className="w-3" />
          <View className="flex-1 rounded-2xl border border-gray-100 bg-white p-3">
            <Text className="text-right text-[11px] text-gray-500">
              إجمالي مدين
            </Text>
            <Text className="text-right text-base font-bold text-red-700">
              {formatAmount(summary.totalIn, summary.currency)}
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

        {loading && transactions.length === 0 ? (
          <ActivityIndicator color="#16a34a" />
        ) : visibleTransactions.length === 0 ? (
          <View className="items-center rounded-2xl border border-gray-100 bg-white p-6">
            <Text className="text-center text-sm text-gray-600">
              {transactions.length === 0
                ? 'لا توجد حركات مسجّلة مع هذا الشخص بعد.'
                : 'لا توجد حركات في هذا التصنيف.'}
            </Text>
            {transactions.length === 0 ? (
              <Pressable
                onPress={() =>
                  navigation.navigate('AddTransaction', {
                    contactId: contact.id,
                  })
                }
                accessibilityRole="button"
                className="mt-3 rounded-2xl bg-green-600 px-5 py-2">
                <Text className="text-sm font-bold text-white">
                  تسجيل أول حركة
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          visibleTransactions.map((transaction) => (
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              eventTitle={
                transaction.event_id
                  ? (eventTitles.get(transaction.event_id) ?? null)
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

      <LedgerSummaryBar summary={summary} />
    </SafeAreaView>
  );
}
