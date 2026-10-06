import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Mic, Send, Sparkles, Square, TriangleAlert } from 'lucide-react-native';
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

import { notify, reportError } from '@/lib/alerts';
import { smartParse } from '@/lib/ai';
import { readLocalFile } from '@/lib/files';
import { Button, Field } from '@/components/ui';
import { palette } from '@/lib/palette';
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
      reportError('تعذّر التحليل', error);
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        notify('إذن مطلوب', 'فعّل إذن الميكروفون لاستخدام الإدخال الصوتي.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch (error) {
      reportError('تعذّر التسجيل', error);
    }
  }

  async function stopRecordingAndParse() {
    setRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('لم يُحفظ التسجيل.');

      // Gemini يقبل الصوت مباشرةً، فنرسله base64 بدل تفريغه على الجهاز.
      const { encode } = await import('base64-arraybuffer');
      const audioBase64 = encode((await readLocalFile(uri)).bytes);

      await runParse({
        audioBase64,
        audioMimeType: Platform.OS === 'ios' ? 'audio/mp4' : 'audio/m4a',
      });
    } catch (error) {
      reportError('تعذّر التسجيل', error);
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
      className="flex-1 bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-10">
        <View className="flex-row-reverse items-center">
          <Sparkles size={18} color={palette.primaryStrong} />
          <Text className="mr-2 text-right text-base font-bold text-ink">
            اكتب أو تكلّم
          </Text>
        </View>
        <Text className="mt-1 text-right text-xs text-ink-muted">
          مثال: {EXAMPLES[0]}
        </Text>

        <Field
          className="mt-3"
          value={text}
          onChangeText={setText}
          multiline
          placeholder="اكتب ما حدث بلغتك…"
          inputClassName="min-h-24 text-ink"
        />

        {/* أمثلة بنقرة واحدة: تملأ الحقل فتُظهر ما يفهمه التحليل. */}
        <View className="mt-3 flex-row-reverse flex-wrap">
          {EXAMPLES.slice(0, 3).map((example) => (
            <Pressable
              key={example}
              onPress={() => setText(example)}
              accessibilityRole="button"
              className="mb-2 ml-2 rounded-full border border-line-strong bg-surface px-3 py-2">
              <Text className="text-caption font-semibold text-ink-muted">
                {example}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-3 flex-row-reverse">
          <Button
            title="تحليل"
            onPress={() => void runParse({ text })}
            disabled={busy || recording || text.trim().length === 0}
            loading={busy}
            icon={<Send size={18} color={palette.onPrimary} />}
            block={false}
            size="lg"
            className="flex-1"
          />

          <Pressable
            onPress={() =>
              void (recording ? stopRecordingAndParse() : startRecording())
            }
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'إيقاف التسجيل' : 'تسجيل صوتي'}
            className={`mr-2 h-14 w-14 items-center justify-center rounded-full ${
              recording ? 'bg-danger' : 'border border-line-strong bg-surface'
            }`}>
            {recording ? (
              <Square size={18} color="#ffffff" />
            ) : (
              <Mic size={20} color={palette.primaryStrong} />
            )}
          </Pressable>
        </View>

        {recording ? (
          <Text className="mt-2 text-center text-xs text-danger">
            جارٍ التسجيل… اضغط المربع للإيقاف والتحليل.
          </Text>
        ) : null}

        {notice ? (
          <View className="mt-4 flex-row-reverse items-center rounded-xl bg-warning-soft p-3">
            <TriangleAlert size={16} color={palette.warning} />
            <Text className="mr-2 flex-1 text-right text-xs text-ink-muted">
              {notice}
            </Text>
          </View>
        ) : null}

        {result ? (
          <View className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <Text className="text-right text-sm font-bold text-ink">
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
              <Text className="mt-2 text-right text-caption text-ink-muted">
                لا توجد جهة اتصال بهذا الاسم — ستحتاج لاختيارها أو إضافتها.
              </Text>
            ) : null}

            <Pressable
              onPress={applyToForm}
              accessibilityRole="button"
              className="mt-4 items-center rounded-full bg-primary py-3">
              <Text className="text-base font-bold text-primary-fg">
                مراجعة في النموذج
              </Text>
            </Pressable>
            <Text className="mt-2 text-center text-caption text-ink-muted">
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
      <Text className="text-right text-xs text-ink-muted">{label}</Text>
      <Text className="text-right text-sm font-semibold text-ink">
        {value}
      </Text>
    </View>
  );
}
