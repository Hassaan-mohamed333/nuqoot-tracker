import DateTimePicker from '@react-native-community/datetimepicker';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarDays, Check } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { reportError } from '@/lib/alerts';
import { palette } from '@/lib/palette';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { EventType } from '@/types';
import { formatDate } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type AddEventRoute = RouteProp<RootStackParamList, 'AddEvent'>;

const EVENT_TYPES: { key: EventType; label: string }[] = [
  { key: 'wedding', label: 'فرح' },
  { key: 'engagement', label: 'خطوبة' },
  { key: 'newborn', label: 'مولود' },
  { key: 'graduation', label: 'تخرج' },
  { key: 'funeral', label: 'عزاء' },
  { key: 'other', label: 'أخرى' },
];

/** شاشة إضافة مناسبة جديدة. */
export function AddEventScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<AddEventRoute>();
  const { contacts, addEvent } = useLedger();

  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('wedding');
  const [hostContactId, setHostContactId] = useState<string | null>(
    params?.hostContactId ?? null,
  );
  const [eventDate, setEventDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
    [contacts],
  );

  const isValid = title.trim().length >= 2;

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const created = await addEvent({
        title,
        event_type: eventType,
        host_contact_id: hostContactId,
        event_date: eventDate.toISOString(),
        location,
        notes,
      });

      if (params?.returnTo === 'AddTransaction') {
        navigation.navigate('AddTransaction', { eventId: created.id });
      } else {
        navigation.goBack();
      }
    } catch (error) {
      reportError('تعذّر الحفظ', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
        <Text className="mb-2 text-right text-sm font-bold text-ink">
          عنوان المناسبة
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="مثال: فرح أحمد"
          placeholderTextColor={palette.muted}
          className="rounded-xl border border-line bg-surface px-4 py-3 text-right text-base text-ink"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
          النوع
        </Text>
        <View className="flex-row-reverse flex-wrap">
          {EVENT_TYPES.map((item) => {
            const isActive = eventType === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setEventType(item.key)}
                accessibilityRole="button"
                className={`mb-2 ml-2 rounded-full px-4 py-1.5 ${
                  isActive ? 'bg-primary' : 'border border-line bg-surface'
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

        <Text className="mb-2 mt-4 text-right text-sm font-bold text-ink">
          التاريخ
        </Text>
        <Pressable
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          className="flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <Text className="text-right text-base text-ink">
            {formatDate(eventDate.toISOString())}
          </Text>
          <CalendarDays size={18} color={palette.muted} />
        </Pressable>

        {showPicker ? (
          <DateTimePicker
            value={eventDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_event, selected) => {
              // أندرويد يغلق النافذة بنفسه بعد كل اختيار أو إلغاء.
              if (Platform.OS !== 'ios') setShowPicker(false);
              if (selected) setEventDate(selected);
            }}
          />
        ) : null}

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
          صاحب المناسبة (اختياري)
        </Text>
        <View className="rounded-2xl border border-line bg-surface p-2">
          <Pressable
            onPress={() => setHostContactId(null)}
            accessibilityRole="button"
            className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
              hostContactId === null ? 'bg-primary/10' : ''
            }`}>
            <Text className="text-right text-sm text-ink">بدون تحديد</Text>
            {hostContactId === null ? <Check size={16} color={palette.primary} /> : null}
          </Pressable>

          {sortedContacts.length === 0 ? (
            <Text className="px-3 py-2 text-right text-xs text-ink-muted">
              لا توجد جهات اتصال بعد.
            </Text>
          ) : (
            sortedContacts.map((contact) => (
              <Pressable
                key={contact.id}
                onPress={() => setHostContactId(contact.id)}
                accessibilityRole="button"
                className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
                  hostContactId === contact.id ? 'bg-primary/10' : ''
                }`}>
                <Text className="text-right text-sm text-ink">
                  {contact.full_name}
                </Text>
                {hostContactId === contact.id ? (
                  <Check size={16} color={palette.primary} />
                ) : null}
              </Pressable>
            ))
          )}
        </View>

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
          المكان (اختياري)
        </Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="مثال: قاعة النيل"
          placeholderTextColor={palette.muted}
          className="rounded-xl border border-line bg-surface px-4 py-3 text-right text-sm text-ink"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
          ملاحظات (اختياري)
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="أي تفاصيل تخص المناسبة"
          placeholderTextColor={palette.muted}
          className="rounded-xl border border-line bg-surface px-4 py-3 text-right text-sm text-ink"
        />

        <Pressable
          onPress={() => void handleSave()}
          disabled={!isValid || saving}
          accessibilityRole="button"
          className={`mt-8 items-center rounded-full py-3 ${
            isValid && !saving ? 'bg-primary' : 'bg-line-strong'
          }`}>
          {saving ? (
            <ActivityIndicator color={palette.onPrimary} />
          ) : (
            <Text className="text-base font-bold text-primary-fg">حفظ المناسبة</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
