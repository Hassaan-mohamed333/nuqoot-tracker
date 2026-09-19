import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArchiveRestore, Trash2, Undo2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { SectionTitle, Screen } from '@/components/ui';
import { confirmAction, reportError } from '@/lib/alerts';
import { palette } from '@/lib/palette';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { Contact, Transaction } from '@/types';
import { formatAmount, formatDate } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * الأرشيف: ما أُخرج من الدفتر ولم يُتلف.
 *
 * كل حذف في التطبيق ينتهي هنا لا في العدم. وهذه الشاشة هي الموضع
 * الوحيد الذي يقع فيه حذفٌ نهائي، بتأكيد صريح — فلا تُتلف حركةٌ بجملة
 * قيلت للمساعد ولا بضغطة في قائمة.
 */
export function ArchiveScreen() {
  const navigation = useNavigation<Navigation>();
  const {
    archivedTransactions,
    archivedContacts,
    contacts,
    loading,
    setTransactionArchivedState,
    removeTransaction,
    setArchived,
    removeContact,
    transactions,
  } = useLedger();

  const [busy, setBusy] = useState<string | null>(null);

  const contactNames = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.full_name])),
    [contacts],
  );

  const isEmpty =
    archivedTransactions.length === 0 && archivedContacts.length === 0;

  async function restoreTransaction(row: Transaction) {
    setBusy(row.id);
    try {
      await setTransactionArchivedState(row.id, false);
    } catch (error) {
      reportError('تعذّرت الاستعادة', error);
    } finally {
      setBusy(null);
    }
  }

  async function purgeTransaction(row: Transaction) {
    const approved = await confirmAction({
      title: 'حذف نهائي',
      message: `ستُحذف حركة بمبلغ ${formatAmount(
        row.amount,
        row.currency,
      )} نهائياً. لا يمكن التراجع بعدها.`,
      confirmLabel: 'حذف نهائي',
      destructive: true,
    });
    if (!approved) return;

    setBusy(row.id);
    try {
      await removeTransaction(row.id);
    } catch (error) {
      reportError('تعذّر الحذف', error);
    } finally {
      setBusy(null);
    }
  }

  async function restoreContact(contact: Contact) {
    setBusy(contact.id);
    try {
      await setArchived(contact.id, false);
    } catch (error) {
      reportError('تعذّرت الاستعادة', error);
    } finally {
      setBusy(null);
    }
  }

  async function purgeContact(contact: Contact) {
    // العدد في التحذير لا شرحٌ عام: «ستُحذف المعاملات المرتبطة» لا تقول
    // للمستخدم حجم ما يخسره، و«٧ حركات» تقوله. والعدّ يشمل المؤرشفة
    // منها، فهي تذهب مع صاحبها أيضاً.
    const count =
      transactions.filter((row) => row.contact_id === contact.id).length +
      archivedTransactions.filter((row) => row.contact_id === contact.id).length;

    const approved = await confirmAction({
      title: 'حذف نهائي',
      message:
        count > 0
          ? `سيُحذف ${contact.full_name} نهائياً، ومعه ${count} حركة مسجّلة في دفتره. لا يمكن التراجع بعدها.`
          : `سيُحذف ${contact.full_name} نهائياً. لا يمكن التراجع بعدها.`,
      confirmLabel: 'حذف نهائي',
      destructive: true,
    });
    if (!approved) return;

    setBusy(contact.id);
    try {
      await removeContact(contact.id);
    } catch (error) {
      reportError('تعذّر الحذف', error);
    } finally {
      setBusy(null);
    }
  }

  if (loading && isEmpty) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      </Screen>
    );
  }

  // زرّ العودة في كل حالة، لا في الحالة المملوءة وحدها: استعادةُ آخر
  // عنصر تُفرغ الشاشة، فلا يصحّ أن يختفي معه طريق الخروج.
  const backButton = (
    <PressableScale
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="العودة إلى الدفتر"
      activeScale={0.97}
      className="mt-6 items-center rounded-full border border-line bg-surface px-6 py-3">
      <Text className="text-sm font-bold text-ink">العودة إلى الدفتر</Text>
    </PressableScale>
  );

  if (isEmpty) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center px-6">
          <ArchiveRestore size={40} color={palette.subtle} />
          <Text className="mt-4 text-center text-base font-bold text-ink">
            الأرشيف فارغ
          </Text>
          <Text className="mt-2 text-center text-sm text-ink-muted">
            ما تحذفه من الدفتر يظهر هنا، ويمكنك استعادته في أي وقت.
          </Text>
          {backButton}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="mb-4 rounded-xl bg-warning-soft p-3">
        <Text className="text-right text-xs text-ink-muted">
          العناصر هنا خارج كل الأرصدة والإجماليات. استعدها لتعود، أو احذفها
          نهائياً — والحذف النهائي لا تراجع عنه.
        </Text>
      </View>

      {archivedContacts.length > 0 ? (
        <>
          <SectionTitle>{`الحسابات (${archivedContacts.length})`}</SectionTitle>
          {archivedContacts.map((contact) => (
            <ArchiveRow
              key={contact.id}
              title={contact.full_name}
              subtitle={
                contact.archived_at
                  ? `أُرشف في ${formatDate(contact.archived_at)}`
                  : 'مؤرشف'
              }
              busy={busy === contact.id}
              onRestore={() => void restoreContact(contact)}
              onPurge={() => void purgeContact(contact)}
            />
          ))}
        </>
      ) : null}

      {archivedTransactions.length > 0 ? (
        <>
          <SectionTitle
            className={archivedContacts.length > 0 ? 'mt-6' : undefined}>
            {`الحركات (${archivedTransactions.length})`}
          </SectionTitle>
          {archivedTransactions.map((row) => (
            <ArchiveRow
              key={row.id}
              title={`${row.direction === 'IN' ? 'استلمت' : 'دفعت'} ${formatAmount(
                row.amount,
                row.currency,
              )}`}
              subtitle={`${contactNames.get(row.contact_id) ?? 'بلا صاحب'} · ${formatDate(
                row.occurred_at,
              )}`}
              busy={busy === row.id}
              onRestore={() => void restoreTransaction(row)}
              onPurge={() => void purgeTransaction(row)}
            />
          ))}
        </>
      ) : null}

      {backButton}
    </Screen>
  );
}

/** صفّ واحد في الأرشيف: ما هو، ومتى أُرشف، وماذا يمكن فعله به. */
function ArchiveRow({
  title,
  subtitle,
  busy,
  onRestore,
  onPurge,
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <View className="mb-2 flex-row-reverse items-center rounded-2xl border border-line bg-surface p-3">
      <View className="flex-1">
        <Text className="text-right text-base font-semibold text-ink">
          {title}
        </Text>
        <Text className="text-right text-xs text-ink-muted">{subtitle}</Text>
      </View>

      {busy ? (
        <ActivityIndicator color={palette.primary} />
      ) : (
        <View className="flex-row-reverse items-center">
          <PressableScale
            onPress={onRestore}
            accessibilityRole="button"
            accessibilityLabel={`استعادة ${title}`}
            activeScale={0.9}
            className="flex-row-reverse items-center rounded-full bg-primary/15 px-3 py-1.5">
            <Undo2 size={14} color={palette.primary} />
            <Text className="mr-1 text-xs font-bold text-primary">استعادة</Text>
          </PressableScale>

          <PressableScale
            onPress={onPurge}
            accessibilityRole="button"
            accessibilityLabel={`حذف ${title} نهائياً`}
            activeScale={0.9}
            className="mr-2 flex-row-reverse items-center rounded-full bg-danger-soft px-3 py-1.5">
            <Trash2 size={14} color={palette.danger} />
            <Text className="mr-1 text-xs font-bold text-danger">حذف نهائي</Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}
