import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Paperclip,
  Plus,
  UserPlus,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
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
import { uploadReceipt } from '@/lib/repository';
import { isSupabaseConfigured } from '@/lib/supabase';
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
  const [receiptUri, setReceiptUri] = useState<string | null>(
    params?.prefill?.receiptUri ?? null,
  );

  // العودة من شاشة الإنشاء تمرّ عبر تحديث المعاملات، لا عبر إعادة التركيب،
  // لذا نزامن الاختيار يدوياً. نتجاهل القيم الفارغة حتى لا يُمسح اختيار قائم.
  const paramContactId = params?.contactId;
  const paramEventId = params?.eventId;

  useEffect(() => {
    if (paramContactId) setContactId(paramContactId);
  }, [paramContactId]);

  useEffect(() => {
    if (paramEventId) setEventId(paramEventId);
  }, [paramEventId]);

  // قيم مقترحة من الإدخال الذكي أو قارئ الإيصالات: تُملأ للمراجعة فقط.
  const prefill = params?.prefill;
  useEffect(() => {
    if (!prefill) return;
    if (prefill.amount !== undefined) setAmount(String(prefill.amount));
    if (prefill.direction) setDirection(prefill.direction);
    if (prefill.note) setNote(prefill.note);
    if (prefill.receiptUri) setReceiptUri(prefill.receiptUri);
  }, [prefill]);

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
      // الرفع قبل الإدراج: حركة تشير إلى إيصال غير موجود أسوأ من حركة
      // بلا إيصال، لذا يفشل الحفظ كله إن فشل الرفع.
      let receiptPath: string | null = null;
      if (receiptUri && isSupabaseConfigured) {
        receiptPath = await uploadReceipt(receiptUri);
      }

      await addTransaction({
        contact_id: contactId,
        event_id: eventId,
        direction,
        amount: parsedAmount,
        currency: DEFAULT_CURRENCY,
        note: note.trim() || null,
        receipt_url: receiptPath,
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

        <View className="mb-2 mt-6 flex-row-reverse items-center justify-between">
          <Text className="text-right text-sm font-bold text-gray-900">
            جهة الاتصال
          </Text>
          <Pressable
            onPress={() =>
              navigation.navigate('AddContact', { returnTo: 'AddTransaction' })
            }
            accessibilityRole="button"
            className="flex-row-reverse items-center rounded-full border border-green-200 bg-green-50 px-3 py-1">
            <UserPlus size={14} color="#16a34a" />
            <Text className="mr-1 text-xs font-semibold text-green-700">
              جديدة
            </Text>
          </Pressable>
        </View>
        <View className="rounded-2xl border border-gray-100 bg-white p-2">
          {sortedContacts.length === 0 ? (
            <View className="items-center p-4">
              <Text className="text-center text-sm text-gray-600">
                لا توجد جهات اتصال بعد.
              </Text>
              <Text className="mt-1 text-center text-xs text-gray-500">
                أضف جهة اتصال أولاً لتتمكن من تسجيل حركة.
              </Text>
              <Pressable
                onPress={() =>
                  navigation.navigate('AddContact', {
                    returnTo: 'AddTransaction',
                  })
                }
                accessibilityRole="button"
                className="mt-3 rounded-2xl bg-green-600 px-5 py-2">
                <Text className="text-sm font-bold text-white">
                  إضافة جهة اتصال
                </Text>
              </Pressable>
            </View>
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

        <View className="mb-2 mt-6 flex-row-reverse items-center justify-between">
          <Text className="text-right text-sm font-bold text-gray-900">
            المناسبة (اختياري)
          </Text>
          <Pressable
            onPress={() =>
              navigation.navigate('AddEvent', {
                returnTo: 'AddTransaction',
                hostContactId: contactId ?? undefined,
              })
            }
            accessibilityRole="button"
            className="flex-row-reverse items-center rounded-full border border-green-200 bg-green-50 px-3 py-1">
            <Plus size={14} color="#16a34a" />
            <Text className="mr-1 text-xs font-semibold text-green-700">
              جديدة
            </Text>
          </Pressable>
        </View>
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

        {receiptUri ? (
          <View className="mt-6 flex-row-reverse items-center rounded-xl bg-green-50 p-3">
            <Paperclip size={16} color="#16a34a" />
            <Text className="mr-2 flex-1 text-right text-xs text-green-800">
              {isSupabaseConfigured
                ? 'إيصال مرفق — يُرفع عند الحفظ.'
                : 'إيصال مرفق — يحتاج Supabase ليُرفع.'}
            </Text>
            <Pressable
              onPress={() => setReceiptUri(null)}
              accessibilityRole="button"
              className="rounded-full bg-white px-3 py-1">
              <Text className="text-xs font-bold text-gray-600">إزالة</Text>
            </Pressable>
          </View>
        ) : null}

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
