import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CalendarPlus,
  CloudOff,
  LogOut,
  Plus,
  ScanLine,
  Sparkles,
  UserPlus,
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

import { AppLogo } from '@/components/brand/AppLogo';
import { PressableScale } from '@/components/motion';
import { confirmAction, reportError } from '@/lib/alerts';
import { EventCard } from '@/components/EventCard';
import { LedgerSummaryBar } from '@/components/LedgerSummaryBar';
import { TransactionCard } from '@/components/TransactionCard';
import type { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/store/AuthProvider';
import { useLedger } from '@/store/LedgerProvider';
import { palette } from '@/lib/palette';
import { formatAmount } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** الشاشة الرئيسية: نظرة عامة على الواجبات، آخر الحركات، والمناسبات القادمة. */
export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const { authDisabled, user, signOut } = useAuth();
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

  async function confirmSignOut() {
    const approved = await confirmAction({
      title: 'تسجيل الخروج',
      message:
        'ستُحذف النسخة المحفوظة على هذا الجهاز، وتبقى بياناتك على الخادم.',
      confirmLabel: 'خروج',
      destructive: true,
    });
    if (!approved) return;

    try {
      await signOut();
    } catch (error) {
      reportError('تعذّر تسجيل الخروج', error);
    }
  }

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => new Date(event.event_date).getTime() >= Date.now())
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .slice(0, 3),
    [events],
  );

  return (
    <SafeAreaView className="flex-1 bg-base" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-56"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
        }>
        <View className="flex-row-reverse items-center justify-between">
          <View className="flex-1 flex-row-reverse items-center">
            <AppLogo size={44} variant="badge" />
            <View className="mr-3 flex-1">
              <Text className="text-right text-display text-ink">
                النقوط والواجبات
              </Text>
              <Text className="text-right text-caption text-ink-muted">
                {contacts.length} جهة اتصال · {transactions.length} حركة
              </Text>
              {user ? (
                <Text className="text-right text-caption text-ink-subtle">
                  {user.email ?? 'حساب ضيف'}
                </Text>
              ) : null}
            </View>
          </View>
          <View className="flex-row-reverse items-center">
            <PressableScale
              onPress={() => navigation.navigate('AddTransaction')}
              accessibilityRole="button"
              accessibilityLabel="إضافة حركة جديدة"
              activeScale={0.9}
              className="h-11 w-11 items-center justify-center rounded-full bg-primary">
              <Plus size={22} color={palette.onPrimary} />
            </PressableScale>

            {authDisabled ? null : (
              <PressableScale
                onPress={() => void confirmSignOut()}
                accessibilityRole="button"
                accessibilityLabel="تسجيل الخروج"
                activeScale={0.9}
                className="mr-2 h-11 w-11 items-center justify-center rounded-full border border-line bg-surface">
                <LogOut size={20} color={palette.muted} />
              </PressableScale>
            )}
          </View>
        </View>

        {offline ? (
          <View className="mt-3 flex-row-reverse items-center rounded-xl bg-warning-soft p-3">
            <CloudOff size={16} color={palette.warning} />
            <Text className="mr-2 flex-1 text-right text-xs text-ink-muted">
              {authDisabled
                ? 'وضع محلي: البيانات محفوظة على الجهاز. اضبط مفاتيح Supabase للمزامنة.'
                : 'تعذّر الوصول إلى الخادم. تُعرض آخر نسخة محفوظة على الجهاز.'}
            </Text>
          </View>
        ) : null}

        {!loading && contacts.length === 0 ? (
          <View className="mt-4 rounded-2xl border border-line bg-surface p-5">
            <Text className="text-right text-base font-bold text-ink">
              لنبدأ من الصفر
            </Text>
            <Text className="mt-1 text-right text-xs text-ink-muted">
              أضف جهات الاتصال والمناسبات، ثم سجّل النقوط والواجبات بينكم.
            </Text>

            <Pressable
              onPress={() => navigation.navigate('AddContact')}
              accessibilityRole="button"
              className="mt-4 flex-row-reverse items-center justify-center rounded-full bg-primary py-3">
              <UserPlus size={18} color={palette.onPrimary} />
              <Text className="mr-2 text-sm font-bold text-primary-fg">
                إضافة جهة اتصال
              </Text>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('AddEvent')}
              accessibilityRole="button"
              className="mt-2 flex-row-reverse items-center justify-center rounded-full border border-line bg-surface py-3">
              <CalendarPlus size={18} color={palette.primary} />
              <Text className="mr-2 text-sm font-bold text-primary">
                إضافة مناسبة
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mt-4 flex-row-reverse">
          <Pressable
            onPress={() => navigation.navigate('SmartInput')}
            accessibilityRole="button"
            className="flex-1 flex-row-reverse items-center justify-center rounded-full bg-primary py-3">
            <Sparkles size={18} color={palette.onPrimary} />
            <Text className="mr-2 text-sm font-bold text-primary-fg">إدخال ذكي</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('ScanReceipt')}
            accessibilityRole="button"
            className="mr-2 flex-1 flex-row-reverse items-center justify-center rounded-full border border-line bg-surface py-3">
            <ScanLine size={18} color={palette.primary} />
            <Text className="mr-2 text-sm font-bold text-primary">
              قراءة إيصال
            </Text>
          </Pressable>
        </View>

        <View className="mt-3 flex-row-reverse">
          <View className="flex-1 rounded-2xl border border-line bg-surface p-4">
            <Text className="text-right text-xs text-ink-muted">إجمالي ما دفعت</Text>
            <Text className="text-right text-lg font-bold text-primary">
              {formatAmount(totals.totalOut, totals.currency)}
            </Text>
          </View>
          <View className="w-3" />
          <View className="flex-1 rounded-2xl border border-line bg-surface p-4">
            <Text className="text-right text-xs text-ink-muted">إجمالي ما استلمت</Text>
            <Text className="text-right text-lg font-bold text-danger">
              {formatAmount(totals.totalIn, totals.currency)}
            </Text>
          </View>
        </View>

        <Text className="mb-2 mt-6 text-right text-base font-bold text-ink">
          مناسبات قادمة
        </Text>
        {upcomingEvents.length === 0 ? (
          <Text className="text-right text-sm text-ink-muted">
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

        <Text className="mb-2 mt-6 text-right text-base font-bold text-ink">
          آخر الحركات
        </Text>
        {loading && transactions.length === 0 ? (
          <ActivityIndicator color={palette.primary} />
        ) : recentTransactions.length === 0 ? (
          <Text className="text-right text-sm text-ink-muted">
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

      <LedgerSummaryBar summary={totals} aboveTabBar />
    </SafeAreaView>
  );
}
