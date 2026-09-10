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
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
        <Text className="mb-2 text-right text-sm font-bold text-gray-900">
          الاسم
        </Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="الاسم كاملاً"
          placeholderTextColor="#9ca3af"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-base text-gray-900"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          رقم الهاتف (اختياري)
        </Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="01xxxxxxxxx"
          placeholderTextColor="#9ca3af"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-base text-gray-900"
        />

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-gray-900">
          صلة القرابة (اختياري)
        </Text>
        <TextInput
          value={relation}
          onChangeText={setRelation}
          placeholder="مثال: ابن العم"
          placeholderTextColor="#9ca3af"
          className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-right text-base text-gray-900"
        />
        <View className="mt-2 flex-row-reverse flex-wrap">
          {RELATION_SUGGESTIONS.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => setRelation(suggestion)}
              accessibilityRole="button"
              className={`mb-2 ml-2 rounded-full px-3 py-1 ${
                relation === suggestion
                  ? 'bg-green-600'
                  : 'border border-gray-200 bg-white'
              }`}>
              <Text
                className={`text-xs font-semibold ${
                  relation === suggestion ? 'text-white' : 'text-gray-600'
                }`}>
                {suggestion}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 mt-4 text-right text-sm font-bold text-gray-900">
          ملاحظات (اختياري)
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="أي تفاصيل تساعدك على تذكّره"
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
            <Text className="text-base font-bold text-white">حفظ جهة الاتصال</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
