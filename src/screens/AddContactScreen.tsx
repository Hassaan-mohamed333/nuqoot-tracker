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

import { BookUser } from 'lucide-react-native';
import { Button, Field } from '@/components/ui';
import { isContactPickerSupported, pickDeviceContact } from '@/lib/contactPicker';
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
  const [picking, setPicking] = useState(false);
  const [pickedFromPhone, setPickedFromPhone] = useState(false);

  const isValid = fullName.trim().length >= 2;

  /** يفتح دفتر هاتف المستخدم ويملأ الاسم والرقم من الجهة المختارة. */
  async function pickFromPhone() {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await pickDeviceContact();
      if (!picked) return;
      if (picked.name) setFullName(picked.name);
      setPhone(picked.phone);
      setPickedFromPhone(true);
    } catch (error) {
      reportError('تعذّر فتح جهات الاتصال', error);
    } finally {
      setPicking(false);
    }
  }

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
        {isContactPickerSupported() ? (
          <>
            <Button
              title="اختيار من جهات الهاتف"
              variant="outline"
              onPress={() => void pickFromPhone()}
              loading={picking}
              icon={<BookUser size={20} color={palette.text} />}
              className="mb-2"
            />
            <Text className="mb-6 text-center text-caption text-ink-muted">
              {pickedFromPhone
                ? 'تمّت تعبئة الاسم والرقم من هاتفك. راجعهما ثم احفظ.'
                : 'أو اكتب البيانات بنفسك بالأسفل.'}
            </Text>
          </>
        ) : null}

        <Field
          className=""
          label="الاسم"
          value={fullName}
          onChangeText={setFullName}
          placeholder="الاسم كاملاً"
        />
        <Field
          className="mt-6"
          label="رقم الهاتف (اختياري)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="01xxxxxxxxx"
        />
        <Field
          className="mt-6"
          label="صلة القرابة (اختياري)"
          value={relation}
          onChangeText={setRelation}
          placeholder="مثال: ابن العم"
        />
        <View className="mt-2 flex-row-reverse flex-wrap">
          {RELATION_SUGGESTIONS.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => setRelation(suggestion)}
              accessibilityRole="button"
              className={`mb-2 ml-2 h-10 items-center justify-center rounded-full px-4 ${
                relation === suggestion
                  ? 'bg-primary'
                  : 'border border-line bg-surface'
              }`}>
              <Text
                className={`text-sm font-semibold ${
                  relation === suggestion ? 'text-primary-fg' : 'text-ink-muted'
                }`}>
                {suggestion}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field
          className="mt-4"
          label="ملاحظات (اختياري)"
          value={notes}
          onChangeText={setNotes}
          placeholder="أي تفاصيل تساعدك على تذكّره"
        />

        <Button
          title="حفظ جهة الاتصال"
          onPress={() => void handleSave()}
          disabled={!isValid || saving}
          loading={saving}
          disabledReason={!isValid ? 'اكتب اسماً من حرفين على الأقل لإكمال الحفظ' : undefined}
          size="lg"
          className="mt-8"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
