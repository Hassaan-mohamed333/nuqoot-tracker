import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { fetchEventLedger, setEventParticipants } from '@/lib/repository';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { ME_LABEL } from '@/utils/split';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ParticipantsRoute = RouteProp<RootStackParamList, 'EventParticipants'>;

/** اختيار من يشارك في المناسبة (بمن فيهم المستخدم نفسه). */
export function EventParticipantsScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<ParticipantsRoute>();
  const { contacts } = useLedger();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeMe, setIncludeMe] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sortedContacts = useMemo(
    () =>
      [...contacts]
        .filter((contact) => !contact.is_archived)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
    [contacts],
  );

  // نبدأ من المشاركين المحفوظين حتى يكون الحفظ تعديلاً لا استبدالاً أعمى.
  useEffect(() => {
    let active = true;
    void fetchEventLedger(params.eventId)
      .then((ledger) => {
        if (!active) return;
        setSelected(
          new Set(
            ledger.participants
              .map((row) => row.contact_id)
              .filter((id): id is string => id !== null),
          ),
        );
        setIncludeMe(
          ledger.participants.length === 0 ||
            ledger.participants.some((row) => row.contact_id === null),
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.eventId]);

  function toggle(contactId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await setEventParticipants(params.eventId, [...selected], includeMe);
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'تعذّر الحفظ',
        error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator color="#16a34a" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-28">
        <Text className="mb-2 text-right text-sm font-bold text-gray-900">
          من يشارك في هذه المناسبة؟
        </Text>

        <View className="rounded-2xl border border-gray-100 bg-white p-2">
          <Pressable
            onPress={() => setIncludeMe((current) => !current)}
            accessibilityRole="button"
            className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
              includeMe ? 'bg-green-50' : ''
            }`}>
            <Text className="text-right text-sm font-semibold text-gray-900">
              {ME_LABEL}
            </Text>
            {includeMe ? <Check size={16} color="#16a34a" /> : null}
          </Pressable>

          {sortedContacts.length === 0 ? (
            <Text className="p-3 text-right text-xs text-gray-500">
              لا توجد جهات اتصال نشطة.
            </Text>
          ) : (
            sortedContacts.map((contact) => (
              <Pressable
                key={contact.id}
                onPress={() => toggle(contact.id)}
                accessibilityRole="button"
                className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
                  selected.has(contact.id) ? 'bg-green-50' : ''
                }`}>
                <Text className="text-right text-sm text-gray-800">
                  {contact.full_name}
                </Text>
                {selected.has(contact.id) ? (
                  <Check size={16} color="#16a34a" />
                ) : null}
              </Pressable>
            ))
          )}
        </View>

        <Text className="mt-3 text-right text-[11px] text-gray-500">
          المجموع: {selected.size + (includeMe ? 1 : 0)} مشارك.
        </Text>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-gray-200 bg-white p-4 pb-6">
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving}
          accessibilityRole="button"
          className={`items-center rounded-2xl py-3 ${
            saving ? 'bg-gray-300' : 'bg-green-600'
          }`}>
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-bold text-white">حفظ المشاركين</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
