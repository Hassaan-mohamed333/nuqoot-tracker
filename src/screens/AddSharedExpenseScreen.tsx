import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
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
import { createSharedExpense, fetchEventLedger } from '@/lib/repository';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { EventParticipant, SplitMode } from '@/types';
import { DEFAULT_CURRENCY, formatAmount } from '@/utils/ledger';
import {
  participantName,
  sharesMatchAmount,
  splitEqually,
} from '@/utils/split';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ExpenseRoute = RouteProp<RootStackParamList, 'AddSharedExpense'>;

/** تسجيل مصروف جماعي وتقسيمه بالتساوي أو بحصص مخصّصة. */
export function AddSharedExpenseScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<ExpenseRoute>();
  const { contacts } = useLedger();

  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  // قيم منقولة من نموذج الحركة عند التحويل إلى مصروف مشترك.
  const [description, setDescription] = useState(
    params.prefill?.description ?? '',
  );
  const [amount, setAmount] = useState(
    params.prefill?.amount !== undefined ? String(params.prefill.amount) : '',
  );
  const [payerId, setPayerId] = useState<string>('');
  const [mode, setMode] = useState<SplitMode>('equal');
  const [includedKeys, setIncludedKeys] = useState<Set<string>>(new Set());
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const contactNames = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.full_name])),
    [contacts],
  );

  const nameOf = (participant: EventParticipant) =>
    participantName(participant, contactNames);

  useEffect(() => {
    let active = true;
    void fetchEventLedger(params.eventId)
      .then((ledger) => {
        if (!active) return;
        setParticipants(ledger.participants);
        // الافتراضي: الجميع مشاركون في هذا المصروف.
        setIncludedKeys(new Set(ledger.participants.map((row) => row.id)));
        // الدافع الافتراضي: المستخدم نفسه إن كان ضمن الأعضاء.
        const self = ledger.participants.find(
          (row) => !row.contact_id && !row.display_name,
        );
        setPayerId(self?.id ?? ledger.participants[0]?.id ?? '');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.eventId]);

  const parsedAmount = Number(amount.replace(',', '.'));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const includedList = useMemo(
    () => participants.filter((row) => includedKeys.has(row.id)),
    [participants, includedKeys],
  );

  /** الحصص النهائية حسب الوضع المختار. */
  const shares = useMemo(() => {
    if (!amountValid || includedList.length === 0) return [];

    if (mode === 'equal') {
      const amounts = splitEqually(parsedAmount, includedList.length);
      return includedList.map((member, index) => ({
        participant_id: member.id,
        share_amount: amounts[index],
      }));
    }

    return includedList.map((member) => ({
      participant_id: member.id,
      share_amount: Number((customShares[member.id] ?? '').replace(',', '.')),
    }));
  }, [amountValid, includedList, mode, parsedAmount, customShares]);

  const sharesTotal = shares.reduce(
    (sum, share) => sum + (Number.isFinite(share.share_amount) ? share.share_amount : 0),
    0,
  );
  const sharesValid =
    shares.length > 0 &&
    shares.every((share) => Number.isFinite(share.share_amount) && share.share_amount >= 0) &&
    sharesMatchAmount(shares, parsedAmount);

  const isValid =
    description.trim().length > 0 && amountValid && sharesValid && payerId !== '';

  function toggleIncluded(key: string) {
    setIncludedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** يملأ الحصص المخصّصة بقيم التقسيم بالتساوي كنقطة بداية. */
  function seedCustomFromEqual() {
    if (!amountValid || includedList.length === 0) return;
    const amounts = splitEqually(parsedAmount, includedList.length);
    const seeded: Record<string, string> = {};
    includedList.forEach((member, index) => {
      seeded[member.id] = String(amounts[index]);
    });
    setCustomShares(seeded);
  }

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await createSharedExpense({
        event_id: params.eventId,
        payer_participant_id: payerId,
        description,
        amount: parsedAmount,
        currency: DEFAULT_CURRENCY,
        shares,
      });
      navigation.goBack();
    } catch (error) {
      reportError('تعذّر الحفظ', error);
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
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
        <Text className="mb-2 text-right text-sm font-bold text-gray-900">
          الوصف
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="مثال: عشاء المطعم"
          placeholderTextColor="#9ca3af"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-base text-gray-900"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          المبلغ الإجمالي
        </Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="#9ca3af"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-xl font-bold text-gray-900"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          من دفع؟
        </Text>
        <View className="rounded-2xl border border-gray-100 bg-white p-2">
          {participants.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => setPayerId(row.id)}
              accessibilityRole="button"
              className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
                payerId === row.id ? 'bg-green-50' : ''
              }`}>
              <Text className="text-right text-sm text-gray-800">
                {nameOf(row)}
              </Text>
              {payerId === row.id ? <Check size={16} color="#16a34a" /> : null}
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          طريقة القسمة
        </Text>
        <View className="flex-row-reverse">
          {(
            [
              { key: 'equal', label: 'بالتساوي' },
              { key: 'custom', label: 'حصص مخصّصة' },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                setMode(option.key);
                if (option.key === 'custom') seedCustomFromEqual();
              }}
              accessibilityRole="button"
              className={`ml-2 rounded-full px-4 py-1.5 ${
                mode === option.key
                  ? 'bg-green-600'
                  : 'border border-gray-200 bg-white'
              }`}>
              <Text
                className={`text-xs font-semibold ${
                  mode === option.key ? 'text-white' : 'text-gray-600'
                }`}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 mt-4 text-right text-sm font-bold text-gray-900">
          على من تُقسم؟
        </Text>
        <View className="rounded-2xl border border-gray-100 bg-white p-2">
          {participants.map((row) => {
            const key = row.id;
            const included = includedKeys.has(key);
            const equalShare =
              mode === 'equal' && amountValid && includedList.length > 0
                ? splitEqually(parsedAmount, includedList.length)[
                    includedList.findIndex((member) => member.id === key)
                  ]
                : null;

            return (
              <View
                key={key}
                className={`mb-1 flex-row-reverse items-center rounded-xl px-3 py-2 ${
                  included ? 'bg-green-50' : ''
                }`}>
                <Pressable
                  onPress={() => toggleIncluded(key)}
                  accessibilityRole="button"
                  className="flex-1 flex-row-reverse items-center">
                  {included ? <Check size={16} color="#16a34a" /> : null}
                  <Text className="mr-2 text-right text-sm text-gray-800">
                    {nameOf(row)}
                  </Text>
                </Pressable>

                {included && mode === 'custom' ? (
                  <TextInput
                    value={customShares[key] ?? ''}
                    onChangeText={(value) =>
                      setCustomShares((current) => ({ ...current, [key]: value }))
                    }
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 text-right text-sm text-gray-900"
                  />
                ) : included && equalShare !== null ? (
                  <Text className="text-sm font-semibold text-gray-700">
                    {formatAmount(equalShare, DEFAULT_CURRENCY)}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {amountValid && shares.length > 0 ? (
          <Text
            className={`mt-2 text-right text-xs ${
              sharesValid ? 'text-gray-500' : 'text-red-600'
            }`}>
            مجموع الحصص {formatAmount(sharesTotal, DEFAULT_CURRENCY)} من{' '}
            {formatAmount(parsedAmount, DEFAULT_CURRENCY)}
            {sharesValid ? '' : ' — يجب أن يتطابقا.'}
          </Text>
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
            <Text className="text-base font-bold text-white">حفظ المصروف</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
