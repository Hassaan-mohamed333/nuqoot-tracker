import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Archive, Plus, Search, UserPlus, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlphabetIndex } from '@/components/AlphabetIndex';
import { ContactRow } from '@/components/ContactRow';
import { LedgerSummaryBar } from '@/components/LedgerSummaryBar';
import { PressableScale } from '@/components/motion';
import { Button, IconButton } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { usePalette } from '@/store/ThemeProvider';
import type { ContactWithSummary } from '@/types';
import { buildContactSections, INDEX_ALPHABET, summarize } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * مرشّح القائمة.
 *
 * `credit` و`debit` يقسمان النشطة حسب اتجاه الصافي، و`archived` عرض منفصل
 * تماماً لأن المؤرشفة ليست جزءاً من الدفتر الجاري.
 */
type ContactFilter = 'all' | 'credit' | 'debit' | 'archived';

/** قائمة جهات الاتصال: بحث، مرشّحات رصيد، فهرس أبجدي، وملخّص ثابت. */
export function ContactsListScreen() {
  const palette = usePalette();
  const navigation = useNavigation<Navigation>();
  const { contactsWithSummary, archivedContacts, transactions, loading, refresh } =
    useLedger();
  const [filter, setFilter] = useState<ContactFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const listRef = useRef<SectionList<ContactWithSummary>>(null);

  const showArchived = filter === 'archived';

  // الصافي موجب = دفعتُ أكثر مما استلمت، أي لي عندهم.
  const creditCount = useMemo(
    () => contactsWithSummary.filter((row) => row.summary.net > 0).length,
    [contactsWithSummary],
  );
  const debitCount = useMemo(
    () => contactsWithSummary.filter((row) => row.summary.net < 0).length,
    [contactsWithSummary],
  );

  const source = useMemo(() => {
    if (filter === 'archived') return archivedContacts;
    if (filter === 'credit')
      return contactsWithSummary.filter((row) => row.summary.net > 0);
    if (filter === 'debit')
      return contactsWithSummary.filter((row) => row.summary.net < 0);
    return contactsWithSummary;
  }, [filter, contactsWithSummary, archivedContacts]);

  const filtered = useMemo(() => {
    const term = query.trim();
    if (!term) return source;
    return source.filter(
      (contact) =>
        contact.full_name.includes(term) ||
        (contact.phone ?? '').includes(term) ||
        (contact.relation ?? '').includes(term),
    );
  }, [source, query]);

  const sections = useMemo(() => buildContactSections(filtered), [filtered]);

  const activeLetters = useMemo(
    () => sections.map((section) => section.letter),
    [sections],
  );

  /** ملخص القائمة المعروضة حالياً (يتأثر بالبحث وبالمرشّح). */
  const visibleSummary = useMemo(() => {
    const visibleIds = new Set(filtered.map((contact) => contact.id));
    return summarize(
      transactions.filter((transaction) => visibleIds.has(transaction.contact_id)),
    );
  }, [filtered, transactions]);

  const jumpToLetter = useCallback(
    (letter: string) => {
      const index = sections.findIndex((section) => section.letter === letter);
      if (index < 0) return;
      setSelectedLetter(letter);
      listRef.current?.scrollToLocation({
        sectionIndex: index,
        itemIndex: 0,
        viewPosition: 0,
        animated: true,
      });
    },
    [sections],
  );

  const chips: ReadonlyArray<{
    key: ContactFilter;
    label: string;
    count: number;
  }> = [
    { key: 'all', label: 'الكل', count: contactsWithSummary.length },
    { key: 'credit', label: 'لك عندهم', count: creditCount },
    { key: 'debit', label: 'عليك لهم', count: debitCount },
    { key: 'archived', label: 'المؤرشفة', count: archivedContacts.length },
  ];

  return (
    <SafeAreaView className="flex-1 bg-base" edges={['top']}>
      <View className="flex-row-reverse items-center justify-between px-4 pt-2">
        <Text className="text-right text-display text-ink">جهات الاتصال</Text>
        <IconButton
          onPress={() => navigation.navigate('AddContact')}
          accessibilityLabel="إضافة جهة اتصال"
          variant="primary">
          <Plus size={20} color={palette.onPrimary} />
        </IconButton>
      </View>

      <View className="mx-4 mt-3 flex-row-reverse items-center rounded-full border border-line bg-surface px-4">
        <Search size={16} color={palette.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالاسم أو الهاتف"
          placeholderTextColor={palette.muted}
          returnKeyType="search"
          className="mx-2 flex-1 py-2.5 text-right text-body text-ink"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="مسح البحث"
            hitSlop={10}>
            <X size={16} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* أفقي قابل للتمرير: أربع شرائح لا تتّسع لها الشاشات الضيّقة. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3 max-h-11 grow-0"
        contentContainerClassName="flex-row-reverse px-4">
        {chips.map((chip) => {
          const isActive = filter === chip.key;
          return (
            <PressableScale
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${chip.label}، ${chip.count}`}
              activeScale={0.94}
              className={`ml-2 h-9 flex-row-reverse items-center rounded-full px-4 ${
                isActive ? 'bg-primary' : 'border border-line bg-surface'
              }`}>
              <Text
                className={`text-xs font-bold ${
                  isActive ? 'text-primary-fg' : 'text-ink-muted'
                }`}>
                {chip.label}
              </Text>
              <Text
                className={`mr-1.5 text-[11px] font-bold ${
                  isActive ? 'text-primary-fg/70' : 'text-ink-subtle'
                }`}>
                {chip.count}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View className="mt-3 flex-1 flex-row">
        <AlphabetIndex
          letters={INDEX_ALPHABET}
          activeLetters={activeLetters}
          selectedLetter={selectedLetter}
          onSelectLetter={jumpToLetter}
        />

        <SectionList
          ref={listRef}
          className="flex-1"
          contentContainerClassName="px-4 pb-56"
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={() => void refresh()}
          stickySectionHeadersEnabled
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={() => undefined}
          renderSectionHeader={({ section }) => (
            // خلفية مصمتة: العناوين لاصقة، فبدونها يمرّ المحتوى تحتها ظاهراً.
            <View className="bg-base py-1.5">
              <Text className="text-right text-sm font-bold text-primary">
                {section.letter}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              onPress={() =>
                navigation.navigate('ContactProfile', { contactId: item.id })
              }
            />
          )}
          ListEmptyComponent={
            query.trim() ? (
              <Text className="mt-8 text-center text-body text-ink-muted">
                لا توجد نتائج مطابقة.
              </Text>
            ) : showArchived ? (
              <EmptyState
                icon={<Archive size={26} color={palette.muted} />}
                tone="muted"
                title="لا توجد جهات مؤرشفة"
                hint="تظهر هنا الحسابات التي سوّيتها وأرشفتها."
              />
            ) : filter === 'credit' ? (
              <EmptyState
                icon={<UserPlus size={26} color={palette.success} />}
                tone="success"
                title="لا أحد يدين لك حالياً"
                hint="كل من دفعتَ لهم ردّوا ما عليهم."
              />
            ) : filter === 'debit' ? (
              <EmptyState
                icon={<UserPlus size={26} color={palette.danger} />}
                tone="danger"
                title="لا شيء عليك لأحد"
                hint="لا توجد واجبات مستحقّة عليك الآن."
              />
            ) : (
              <EmptyState
                icon={<UserPlus size={26} color={palette.primary} />}
                tone="primary"
                title="ابدأ بإضافة أول جهة اتصال"
                hint="بعدها يمكنك تسجيل النقوط والواجبات الخاصة بها."
                action={
                  <Button
                    title="إضافة جهة اتصال"
                    size="sm"
                    block={false}
                    className="mt-4"
                    onPress={() => navigation.navigate('AddContact')}
                  />
                }
              />
            )
          }
        />
      </View>

      <LedgerSummaryBar summary={visibleSummary} aboveTabBar />
    </SafeAreaView>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  hint: string;
  tone: 'primary' | 'success' | 'danger' | 'muted';
  action?: React.ReactNode;
}

const TONE_RING: Record<EmptyStateProps['tone'], string> = {
  primary: 'bg-primary/15',
  success: 'bg-success/15',
  danger: 'bg-danger/15',
  muted: 'bg-line/60',
};

/** حالة فارغة موحّدة: نغمتها تتبع المرشّح المختار. */
function EmptyState({ icon, title, hint, tone, action }: EmptyStateProps) {
  return (
    <View className="mt-10 items-center">
      <View
        className={`h-14 w-14 items-center justify-center rounded-full ${TONE_RING[tone]}`}>
        {icon}
      </View>
      <Text className="mt-3 text-center text-body font-bold text-ink">
        {title}
      </Text>
      <Text className="mt-1 text-center text-caption text-ink-muted">
        {hint}
      </Text>
      {action}
    </View>
  );
}
