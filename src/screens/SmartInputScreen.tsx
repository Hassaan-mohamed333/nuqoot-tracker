import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Mic, Send, Sparkles, Square, TriangleAlert } from 'lucide-react-native';
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

import { smartParse } from '@/lib/ai';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { formatAmount } from '@/utils/ledger';
import { isUsableParse, type ParsedTransaction } from '@/utils/parseTransactionText';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

const EXAMPLES = [
  'دفعت ٧٥٠ جنيه لأحمد نقوط الفرح',
  'استلمت 1200 من سارة',
];

/**
 * إدخال ذكي: يكتب المستخدم أو يتكلم، ونحوّل الجملة إلى حقول حركة مقترحة
 * تُراجَع في نموذج الإضافة قبل الحفظ. لا يُحفظ شيء من هنا مباشرة.
 */
export function SmartInputScreen() {
  const navigation = useNavigation<Navigation>();
  const { contacts } = useLedger();

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<ParsedTransaction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const activeContacts = useMemo(
    () => contacts.filter((contact) => !contact.is_archived),
    [contacts],
  );
  const knownNames = useMemo(
    () => activeContacts.map((contact) => contact.full_name),
    [activeContacts],
  );

  /** يطابق الاسم المستخرَج بجهة اتصال قائمة (تطابق تام ثم جزئي). */
  const matchedContact = useMemo(() => {
    const name = result?.contactName?.trim().toLowerCase();
    if (!name) return null;
    return (
      activeContacts.find(
        (contact) => contact.full_name.toLowerCase() === name,
      ) ??
      activeContacts.find(
        (contact) =>
          contact.full_name.toLowerCase().includes(name) ||
          name.includes(contact.full_name.toLowerCase()),
      ) ??
      null
    );
  }, [result, activeContacts]);

  async function runParse(input: {
    text?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await smartParse(input, knownNames);
      setResult(outcome.parsed);

      if (!isUsableParse(outcome.parsed)) {
        setNotice('لم نتعرّف على مبلغ أو اسم. جرّب صياغة أوضح.');
      } else if (!outcome.usedAi && outcome.fallbackReason) {
        setNotice(outcome.fallbackReason);
      }
    } catch (error) {
      Alert.alert(
        'تعذّر التحليل',
        error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('إذن مطلوب', 'فعّل إذن الميكروفون لاستخدام الإدخال الصوتي.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      Alert.alert(
        'تعذّر التسجيل',
        error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
      );
    }
  }

  async function stopRecordingAndParse() {
    setRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('لم يُحفظ التسجيل.');

      // Gemini يقبل الصوت مباشرةً، فنرسله base64 بدل تفريغه على الجهاز.
      // readAsStringAsync أُزيل في SDK 57، فنقرأ عبر صنف File ثم نرمّز.
      const { encode } = await import('base64-arraybuffer');
      const audioBase64 = encode(await new File(uri).arrayBuffer());

      await runParse({
        audioBase64,
        audioMimeType: Platform.OS === 'ios' ? 'audio/mp4' : 'audio/m4a',
      });
    } catch (error) {
      Alert.alert(
        'تعذّر التسجيل',
        error instanceof Error ? error.message : 'حدث خطأ غير متوقع.',
      );
    }
  }

  function applyToForm() {
    if (!result) return;
    navigation.navigate('AddTransaction', {
      contactId: matchedContact?.id,
      prefill: {
        amount: result.amount ?? undefined,
        direction: result.direction ?? undefined,
        note: result.note ?? undefined,
      },
    });
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
        <View className="flex-row-reverse items-center">
          <Sparkles size={18} color="#16a34a" />
          <Text className="mr-2 text-right text-base font-bold text-gray-900">
            اكتب أو تكلّم
          </Text>
        </View>
        <Text className="mt-1 text-right text-xs text-gray-500">
          مثال: {EXAMPLES[0]}
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="اكتب ما حدث بلغتك…"
          placeholderTextColor="#9ca3af"
          className="mt-3 min-h-24 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-right text-base text-gray-900"
        />

        <View className="mt-3 flex-row-reverse">
          <Pressable
            onPress={() => void runParse({ text })}
            disabled={busy || recording || text.trim().length === 0}
            accessibilityRole="button"
            className={`flex-1 flex-row-reverse items-center justify-center rounded-2xl py-3 ${
              busy || recording || text.trim().length === 0
                ? 'bg-gray-300'
                : 'bg-green-600'
            }`}>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Send size={18} color="#ffffff" />
                <Text className="mr-2 text-base font-bold text-white">تحليل</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() =>
              void (recording ? stopRecordingAndParse() : startRecording())
            }
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'إيقاف التسجيل' : 'تسجيل صوتي'}
            className={`mr-2 h-12 w-12 items-center justify-center rounded-2xl ${
              recording ? 'bg-red-600' : 'border border-gray-200 bg-white'
            }`}>
            {recording ? (
              <Square size={18} color="#ffffff" />
            ) : (
              <Mic size={20} color="#16a34a" />
            )}
          </Pressable>
        </View>

        {recording ? (
          <Text className="mt-2 text-center text-xs text-red-600">
            جارٍ التسجيل… اضغط المربع للإيقاف والتحليل.
          </Text>
        ) : null}

        {notice ? (
          <View className="mt-4 flex-row-reverse items-center rounded-xl bg-amber-50 p-3">
            <TriangleAlert size={16} color="#b45309" />
            <Text className="mr-2 flex-1 text-right text-xs text-amber-800">
              {notice}
            </Text>
          </View>
        ) : null}

        {result ? (
          <View className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
            <Text className="text-right text-sm font-bold text-gray-900">
              ما فهمناه
            </Text>

            <Row
              label="الشخص"
              value={
                matchedContact?.full_name ??
                (result.contactName
                  ? `${result.contactName} (غير مسجّل)`
                  : '—')
              }
            />
            <Row
              label="المبلغ"
              value={
                result.amount === null
                  ? '—'
                  : formatAmount(result.amount, result.currency ?? 'EGP')
              }
            />
            <Row
              label="النوع"
              value={
                result.direction === 'OUT'
                  ? 'دفعت (دائن)'
                  : result.direction === 'IN'
                    ? 'استلمت (مدين)'
                    : '—'
              }
            />
            <Row label="الملاحظة" value={result.note ?? '—'} />

            {result.contactName && !matchedContact ? (
              <Text className="mt-2 text-right text-[11px] text-amber-700">
                لا توجد جهة اتصال بهذا الاسم — ستحتاج لاختيارها أو إضافتها.
              </Text>
            ) : null}

            <Pressable
              onPress={applyToForm}
              accessibilityRole="button"
              className="mt-4 items-center rounded-2xl bg-green-600 py-3">
              <Text className="text-base font-bold text-white">
                مراجعة في النموذج
              </Text>
            </Pressable>
            <Text className="mt-2 text-center text-[11px] text-gray-500">
              لا يُحفظ شيء قبل مراجعتك.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-2 flex-row-reverse items-center justify-between">
      <Text className="text-right text-xs text-gray-500">{label}</Text>
      <Text className="text-right text-sm font-semibold text-gray-900">
        {value}
      </Text>
    </View>
  );
}
