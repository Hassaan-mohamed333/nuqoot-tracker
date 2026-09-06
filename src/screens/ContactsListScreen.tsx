import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus, Search } from 'lucide-react-native';
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

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/** قائمة جهات الاتصال مرتبة أبجدياً مع فهرس جانبي وشريط ملخص ثابت. */
export function ContactsListScreen() {
  const navigation = useNavigation<Navigation>();
  const { contactsWithSummary, transactions, loading, refresh } = useLedger();
  const [query, setQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const listRef = useRef<SectionList<ContactWithSummary>>(null);

  const filtered = useMemo(() => {
    const term = query.trim();
    if (!term) return contactsWithSummary;
    return contactsWithSummary.filter(
      (contact) =>
        contact.full_name.includes(term) ||
        (contact.phone ?? '').includes(term) ||
        (contact.relation ?? '').includes(term),
    );
  }, [contactsWithSummary, query]);

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
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="flex-row-reverse items-center justify-between px-4 pt-2">
        <Text className="text-right text-2xl font-bold text-gray-900">
          جهات الاتصال
        </Text>
        <Pressable
          onPress={() => navigation.navigate('AddTransaction')}
          accessibilityRole="button"
          accessibilityLabel="إضافة حركة جديدة"
          className="h-10 w-10 items-center justify-center rounded-full bg-green-600">
          <Plus size={20} color="#ffffff" />
        </Pressable>
      </View>

      <View className="mx-4 mt-3 flex-row-reverse items-center rounded-xl border border-gray-200 bg-white px-3">
        <Search size={16} color="#9ca3af" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالاسم أو الهاتف"
          placeholderTextColor="#9ca3af"
          className="mx-2 flex-1 py-2 text-right text-sm text-gray-900"
        />
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
            <View className="bg-gray-50 py-1">
              <Text className="text-right text-sm font-bold text-green-700">
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
            <Text className="mt-8 text-center text-sm text-gray-500">
              لا توجد نتائج مطابقة.
            </Text>
          }
        />
      </View>

      <LedgerSummaryBar summary={visibleSummary} />
    </SafeAreaView>
  );
}
