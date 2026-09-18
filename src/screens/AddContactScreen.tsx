import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
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

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type AddContactRoute = RouteProp<RootStackParamList, 'AddContact'>;

/** اقتراحات سريعة لصلة القرابة، والحقل يظل حراً. */
const RELATION_SUGGESTIONS = [
  'قريب',
  'صديق',
  'جار',
  'زميل',
  'صديق العائلة',
];

/** شاشة إضافة جهة اتصال جديدة. */
export function AddContactScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<AddContactRoute>();
  const { addContact } = useLedger();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isValid = fullName.trim().length >= 2;

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const created = await addContact({
        full_name: fullName,
        phone,
        relation,
        notes,
      });

      // عند القدوم من شاشة الحركة نعود إليها ونختار الجهة الجديدة مباشرة.
      if (params?.returnTo === 'AddTransaction') {
        navigation.navigate('AddTransaction', { contactId: created.id });
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
          الاسم
        </Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="الاسم كاملاً"
          placeholderTextColor={palette.muted}
          className="rounded-xl border border-line bg-surface px-4 py-3 text-right text-base text-ink"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
          رقم الهاتف (اختياري)
        </Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="01xxxxxxxxx"
          placeholderTextColor={palette.muted}
          className="rounded-xl border border-line bg-surface px-4 py-3 text-right text-base text-ink"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
          صلة القرابة (اختياري)
        </Text>
        <TextInput
          value={relation}
          onChangeText={setRelation}
          placeholder="مثال: ابن العم"
          placeholderTextColor={palette.muted}
          className="rounded-xl border border-line bg-surface px-4 py-3 text-right text-base text-ink"
        />
        <View className="mt-2 flex-row-reverse flex-wrap">
          {RELATION_SUGGESTIONS.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => setRelation(suggestion)}
              accessibilityRole="button"
              className={`mb-2 ml-2 rounded-full px-3 py-1 ${
                relation === suggestion
                  ? 'bg-primary'
                  : 'border border-line bg-surface'
              }`}>
              <Text
                className={`text-xs font-semibold ${
                  relation === suggestion ? 'text-primary-fg' : 'text-ink-muted'
                }`}>
                {suggestion}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 mt-4 text-right text-sm font-bold text-ink">
          ملاحظات (اختياري)
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="أي تفاصيل تساعدك على تذكّره"
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
            <Text className="text-base font-bold text-primary-fg">حفظ جهة الاتصال</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
