import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import React, { useLayoutEffect, useMemo, useState } from 'react';
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

import { Button, DateField, Field } from '@/components/ui';
import { reportError } from '@/lib/alerts';
import { palette } from '@/lib/palette';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { EventType } from '@/types';

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
  const { contacts, addEvent, editEvent, getEventById } = useLedger();

  /** وضع التعديل: المناسبة القائمة، أو undefined للإنشاء. */
  const editingId = params?.eventId;
  const existing = editingId ? getEventById(editingId) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [eventType, setEventType] = useState<EventType>(
    existing?.event_type ?? 'wedding',
  );
  const [hostContactId, setHostContactId] = useState<string | null>(
    existing ? existing.host_contact_id : (params?.hostContactId ?? null),
  );
  const [eventDate, setEventDate] = useState(
    existing ? new Date(existing.event_date) : new Date(),
  );
  const [location, setLocation] = useState(existing?.location ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
    [contacts],
  );

  const isValid = title.trim().length >= 2;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: editingId ? 'تعديل المناسبة' : 'مناسبة جديدة',
    });
  }, [editingId, navigation]);

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      if (editingId) {
        await editEvent(editingId, {
          title,
          event_type: eventType,
          host_contact_id: hostContactId,
          event_date: eventDate.toISOString(),
          location,
          notes,
        });
        navigation.goBack();
        return;
      }

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
        <Field
          label="عنوان المناسبة"
          value={title}
          onChangeText={setTitle}
          placeholder="مثال: فرح أحمد"
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
                className={`mb-2 ml-2 h-10 items-center justify-center rounded-full px-4 ${
                  isActive ? 'bg-primary' : 'border border-line bg-surface'
                }`}>
                <Text
                  className={`text-sm font-semibold ${
                    isActive ? 'text-primary-fg' : 'text-ink-muted'
                  }`}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <DateField
          label="التاريخ"
          value={eventDate}
          onChange={setEventDate}
          accessibilityLabel="اختيار تاريخ المناسبة"
          className="mt-4"
        />

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
            {hostContactId === null ? <Check size={16} color={palette.primaryStrong} /> : null}
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
                  <Check size={16} color={palette.primaryStrong} />
                ) : null}
              </Pressable>
            ))
          )}
        </View>

        <Field
          className="mt-6"
          label="المكان (اختياري)"
          value={location}
          onChangeText={setLocation}
          placeholder="مثال: قاعة النيل"
        />
        <Field
          className="mt-4"
          label="ملاحظات (اختياري)"
          value={notes}
          onChangeText={setNotes}
          placeholder="أي تفاصيل تخص المناسبة"
        />

        <Button
          title={editingId ? 'حفظ التعديلات' : 'حفظ المناسبة'}
          onPress={() => void handleSave()}
          disabled={!isValid || saving}
          loading={saving}
          disabledReason={!isValid ? 'اكتب عنوان المناسبة (حرفان على الأقل) لإكمال الحفظ' : undefined}
          size="lg"
          className="mt-8"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
