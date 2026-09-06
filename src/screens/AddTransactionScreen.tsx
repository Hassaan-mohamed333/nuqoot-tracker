import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { TransactionDirection } from '@/types';
import { DEFAULT_CURRENCY, formatDate, getNetTheme } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type AddRoute = RouteProp<RootStackParamList, 'AddTransaction'>;

/** شاشة إضافة حركة: تحديد الاتجاه، جهة الاتصال، المناسبة، والمبلغ. */
export function AddTransactionScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<AddRoute>();
  const { contacts, events, addTransaction } = useLedger();

  const [direction, setDirection] = useState<TransactionDirection>('OUT');
  const [contactId, setContactId] = useState<string | null>(
    params?.contactId ?? null,
  );
  const [eventId, setEventId] = useState<string | null>(params?.eventId ?? null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
    [contacts],
  );

  const parsedAmount = Number(amount.replace(',', '.'));
  const isValid =
    contactId !== null && Number.isFinite(parsedAmount) && parsedAmount > 0;

  /** معاينة أثر الحركة على الصافي: OUT يزيده، IN ينقصه. */
  const previewTheme = getNetTheme(
    direction === 'OUT' ? 1 : -1,
  );

  async function handleSave() {
    if (!isValid || !contactId) return;
    setSaving(true);
    try {
      await addTransaction({
        contact_id: contactId,
        event_id: eventId,
        direction,
        amount: parsedAmount,
        currency: DEFAULT_CURRENCY,
        note: note.trim() || null,
      });
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
        <Text className="mb-2 text-right text-sm font-bold text-gray-900">
          نوع الحركة
        </Text>
        <View className="flex-row-reverse">
          <DirectionOption
            active={direction === 'OUT'}
            label="دفعت نقوط"
            hint="واجب لي عند غيري"
            icon={
              <ArrowUpRight
                size={18}
                color={direction === 'OUT' ? '#ffffff' : '#16a34a'}
              />
            }
            activeClass="bg-green-600"
            onPress={() => setDirection('OUT')}
          />
          <View className="w-3" />
          <DirectionOption
            active={direction === 'IN'}
            label="استلمت نقوط"
            hint="واجب عليّ"
            icon={
              <ArrowDownLeft
                size={18}
                color={direction === 'IN' ? '#ffffff' : '#dc2626'}
              />
            }
            activeClass="bg-red-600"
            onPress={() => setDirection('IN')}
          />
        </View>

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          المبلغ
        </Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#9ca3af"
          className={`rounded-xl border bg-white px-4 py-3 text-right text-xl font-bold ${previewTheme.textClass} border-gray-200`}
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          جهة الاتصال
        </Text>
        <View className="rounded-2xl border border-gray-100 bg-white p-2">
          {sortedContacts.length === 0 ? (
            <Text className="p-2 text-right text-sm text-gray-500">
              لا توجد جهات اتصال بعد.
            </Text>
          ) : (
            sortedContacts.map((contact) => (
              <Pressable
                key={contact.id}
                onPress={() => setContactId(contact.id)}
                accessibilityRole="button"
                className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
                  contactId === contact.id ? 'bg-green-50' : ''
                }`}>
                <Text className="text-right text-sm text-gray-800">
                  {contact.full_name}
                </Text>
                {contactId === contact.id ? (
                  <Check size={16} color="#16a34a" />
                ) : null}
              </Pressable>
            ))
          )}
        </View>

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          المناسبة (اختياري)
        </Text>
        <View className="rounded-2xl border border-gray-100 bg-white p-2">
          <Pressable
            onPress={() => setEventId(null)}
            accessibilityRole="button"
            className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
              eventId === null ? 'bg-green-50' : ''
            }`}>
            <Text className="text-right text-sm text-gray-800">بدون مناسبة</Text>
            {eventId === null ? <Check size={16} color="#16a34a" /> : null}
          </Pressable>

          {events.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => setEventId(event.id)}
              accessibilityRole="button"
              className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
                eventId === event.id ? 'bg-green-50' : ''
              }`}>
              <View className="flex-1">
                <Text className="text-right text-sm text-gray-800">
                  {event.title}
                </Text>
                <Text className="text-right text-[11px] text-gray-500">
                  {formatDate(event.event_date)}
                </Text>
              </View>
              {eventId === event.id ? <Check size={16} color="#16a34a" /> : null}
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          ملاحظة (اختياري)
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="مثال: نقوط فرح أخيه"
          placeholderTextColor="#9ca3af"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-sm text-gray-900"
        />

        <Pressable
          onPress={() => void handleSave()}
          disabled={!isValid || saving}
          accessibilityRole="button"
          className={`mt-8 items-center rounded-2xl py-3 ${
            isValid && !saving ? 'bg-green-600' : 'bg-gray-300'
          }`}>
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-bold text-white">حفظ الحركة</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface DirectionOptionProps {
  active: boolean;
  label: string;
  hint: string;
  icon: React.ReactNode;
  activeClass: string;
  onPress: () => void;
}

function DirectionOption({
  active,
  label,
  hint,
  icon,
  activeClass,
  onPress,
}: DirectionOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-1 items-center rounded-2xl border p-3 ${
        active ? `${activeClass} border-transparent` : 'border-gray-200 bg-white'
      }`}>
      {icon}
      <Text
        className={`mt-1 text-sm font-bold ${
          active ? 'text-white' : 'text-gray-800'
        }`}>
        {label}
      </Text>
      <Text
        className={`text-[11px] ${active ? 'text-white/80' : 'text-gray-500'}`}>
        {hint}
      </Text>
    </Pressable>
  );
}
