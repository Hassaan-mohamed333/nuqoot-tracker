import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Archive, Plus, Search, UserPlus } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlphabetIndex } from '@/components/AlphabetIndex';
import { ContactRow } from '@/components/ContactRow';
import { LedgerSummaryBar } from '@/components/LedgerSummaryBar';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { ContactWithSummary } from '@/types';
import { buildContactSections, INDEX_ALPHABET, summarize } from '@/utils/ledger';
import { usePalette } from '@/store/ThemeProvider';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** قائمة جهات الاتصال مرتبة أبجدياً مع فهرس جانبي وشريط ملخص ثابت. */
export function ContactsListScreen() {
  const palette = usePalette();
  const navigation = useNavigation<Navigation>();
  const { contactsWithSummary, archivedContacts, transactions, loading, refresh } =
    useLedger();
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const listRef = useRef<SectionList<ContactWithSummary>>(null);

  const source = showArchived ? archivedContacts : contactsWithSummary;

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

  /** ملخص القائمة المعروضة حالياً (يتأثر بالبحث). */
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

  return (
    <SafeAreaView className="flex-1 bg-base" edges={['top']}>
      <View className="flex-row-reverse items-center justify-between px-4 pt-2">
        <Text className="text-right text-2xl font-bold text-ink">
          جهات الاتصال
        </Text>
        <Pressable
          onPress={() => navigation.navigate('AddContact')}
          accessibilityRole="button"
          accessibilityLabel="إضافة جهة اتصال"
          className="h-10 w-10 items-center justify-center rounded-full bg-primary">
          <Plus size={20} color={palette.onPrimary} />
        </Pressable>
      </View>

      <View className="mx-4 mt-3 flex-row-reverse items-center rounded-xl border border-line bg-surface px-3">
        <Search size={16} color={palette.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالاسم أو الهاتف"
          placeholderTextColor={palette.muted}
          className="mx-2 flex-1 py-2 text-right text-sm text-ink"
        />
      </View>

      <View className="mx-4 mt-3 flex-row-reverse">
        {(
          [
            { key: false, label: `النشطة (${contactsWithSummary.length})` },
            { key: true, label: `المؤرشفة (${archivedContacts.length})` },
          ] as const
        ).map((tab) => {
          const isActive = showArchived === tab.key;
          return (
            <Pressable
              key={String(tab.key)}
              onPress={() => setShowArchived(tab.key)}
              accessibilityRole="button"
              className={`ml-2 rounded-full px-4 py-1.5 ${
                isActive ? 'bg-primary' : 'border border-line bg-surface'
              }`}>
              <Text
                className={`text-xs font-semibold ${
                  isActive ? 'text-primary-fg' : 'text-ink-muted'
                }`}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
          onScrollToIndexFailed={() => undefined}
          renderSectionHeader={({ section }) => (
            <View className="bg-base py-1">
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
              <Text className="mt-8 text-center text-sm text-ink-muted">
                لا توجد نتائج مطابقة.
              </Text>
            ) : showArchived ? (
              <View className="mt-10 items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-line/60">
                  <Archive size={26} color={palette.muted} />
                </View>
                <Text className="mt-3 text-center text-sm font-semibold text-ink">
                  لا توجد جهات مؤرشفة
                </Text>
                <Text className="mt-1 text-center text-xs text-ink-muted">
                  تظهر هنا الحسابات التي سوّيتها وأرشفتها.
                </Text>
              </View>
            ) : (
              <View className="mt-10 items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-primary/15">
                  <UserPlus size={26} color={palette.primary} />
                </View>
                <Text className="mt-3 text-center text-sm font-semibold text-ink">
                  ابدأ بإضافة أول جهة اتصال
                </Text>
                <Text className="mt-1 text-center text-xs text-ink-muted">
                  بعدها يمكنك تسجيل النقوط والواجبات الخاصة بها.
                </Text>
                <Pressable
                  onPress={() => navigation.navigate('AddContact')}
                  accessibilityRole="button"
                  className="mt-4 rounded-full bg-primary px-5 py-2.5">
                  <Text className="text-sm font-bold text-primary-fg">
                    إضافة جهة اتصال
                  </Text>
                </Pressable>
              </View>
            )
          }
        />
      </View>

      <LedgerSummaryBar summary={visibleSummary} />
    </SafeAreaView>
  );
}
