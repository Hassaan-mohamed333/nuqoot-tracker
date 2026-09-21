import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Archive,
  CalendarPlus,
  CloudOff,
  Plus,
  ScanLine,
  Sparkles,
  UserPlus,
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

import { AppLogo } from '@/components/brand/AppLogo';
import { Avatar } from '@/components/ui';
import { PressableScale } from '@/components/motion';
import { confirmAction, reportError } from '@/lib/alerts';
import { EventCard } from '@/components/EventCard';
import { LedgerSummaryBar } from '@/components/LedgerSummaryBar';
import { TransactionCard } from '@/components/TransactionCard';
import { TransactionEditSheet } from '@/components/TransactionEditSheet';
import { greeting } from '@/lib/displayName';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/store/AuthProvider';
import { useLedger } from '@/store/LedgerProvider';
import { palette } from '@/lib/palette';
import type { Transaction } from '@/types';
import { formatAmount } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** الشاشة الرئيسية: نظرة عامة على الواجبات، آخر الحركات، والمناسبات القادمة. */
export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  // لا `signOut` هنا: الخروج انتقل إلى الملف الشخصي، فالترويسة للعرض
  // لا للإجراءات الحسّاسة — زرُّ خروجٍ بجانب زرّ إضافةٍ يُضغط بالخطأ.
  const { authDisabled, user } = useAuth();
  const {
    totals,
    transactions,
    events,
    contacts,
    contactsWithSummary,
    loading,
    offline,
    refresh,
    getEventById,
    editTransaction,
    setTransactionArchivedState,
    archivedTransactions,
    archivedContacts,
  } = useLedger();

  const [editing, setEditing] = useState<Transaction | null>(null);
  const { profile } = useUserProfile();

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

  /**
   * الحذف هنا نقلٌ إلى الأرشيف لا إتلاف.
   *
   * الحركة تخرج من القوائم والإجماليات وتبقى قابلة للاستعادة. والحذف
   * النهائي فعلٌ واحد في التطبيق، موضعه شاشة الأرشيف وحدها.
   */
  async function confirmArchiveTransaction(transaction: Transaction) {
    const approved = await confirmAction({
      title: 'نقل إلى الأرشيف',
      message: `ستُنقل حركة بمبلغ ${formatAmount(
        transaction.amount,
        transaction.currency,
      )} إلى الأرشيف، وتخرج من أرصدتك. يمكنك استعادتها في أي وقت.`,
      confirmLabel: 'نقل إلى الأرشيف',
    });
    if (!approved) return;

    try {
      await setTransactionArchivedState(transaction.id, true);
    } catch (error) {
      reportError('تعذّرت الأرشفة', error);
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
              {/* التحية بالاسم لا بالبريد: البريد معرّف حساب لا اسم —
                  يطول فيُقصّ، ويُرى ممّن ينظر إلى الشاشة. */}
              <Text className="text-right text-display text-ink">
                {greeting({
                  profileName: profile?.full_name,
                  metadataName: user?.user_metadata?.full_name,
                })}
              </Text>
              <Text className="text-right text-caption text-ink-muted">
                {/* النشط في العدّادين معاً: `transactions` صار يستبعد
                    المؤرشف، فعدّ جهات الاتصال كلَّها بجانبه كان يعطي
                    رقمين بمعنيين مختلفين في سطر واحد. */}
                {contactsWithSummary.length} جهة اتصال ·{' '}
                {transactions.length} حركة
              </Text>
            </View>
          </View>
          <View className="flex-row-reverse items-center">
            {archivedTransactions.length + archivedContacts.length > 0 ? (
              <PressableScale
                onPress={() => navigation.navigate('Archive')}
                accessibilityRole="button"
                accessibilityLabel={`الأرشيف (${
                  archivedTransactions.length + archivedContacts.length
                } عنصر)`}
                activeScale={0.9}
                className="ml-2 h-11 w-11 items-center justify-center rounded-full border border-line bg-surface">
                <Archive size={20} color={palette.muted} />
                <View className="absolute -right-1 -top-1 min-w-[18px] items-center rounded-full bg-primary px-1">
                  <Text className="text-[10px] font-bold text-primary-fg">
                    {archivedTransactions.length + archivedContacts.length}
                  </Text>
                </View>
              </PressableScale>
            ) : null}

            <PressableScale
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="الملف الشخصي"
              activeScale={0.9}
              className="ml-2 h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-line bg-primary/15">
              {/* الحرف الأوّل بدل أيقونة عامّة حين لا صورة — أو حين
                  يفشل تحميلها: يميّز الحساب بلحظة نظر، ولا يبدو مكاناً
                  فارغاً ينتظر صورة. */}
              <Avatar
                url={profile?.avatar_url}
                size={44}
                profileName={profile?.full_name}
                metadataName={user?.user_metadata?.full_name}
                accessibilityLabel="صورتك الشخصية"
              />
            </PressableScale>

            <PressableScale
              onPress={() => navigation.navigate('AddTransaction')}
              accessibilityRole="button"
              accessibilityLabel="إضافة حركة جديدة"
              activeScale={0.9}
              className="h-11 w-11 items-center justify-center rounded-full bg-primary">
              <Plus size={22} color={palette.onPrimary} />
            </PressableScale>

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
              onEdit={() => setEditing(transaction)}
              onDelete={() => void confirmArchiveTransaction(transaction)}
            />
          ))
        )}
      </ScrollView>

      <LedgerSummaryBar summary={totals} aboveTabBar />

      <TransactionEditSheet
        transaction={editing}
        onClose={() => setEditing(null)}
        onSave={editTransaction}
      />
    </SafeAreaView>
  );
}
