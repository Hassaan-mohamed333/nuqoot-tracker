import { Check, CircleAlert, Send, Sparkles, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PressableScale } from '@/components/motion';
import { Button, Card, Sheet } from '@/components/ui';
import type { AppAssistant, AssistantMessage } from '@/hooks/useAppAssistant';
import { palette } from '@/lib/palette';

interface AssistantModalProps {
  visible: boolean;
  onClose: () => void;
  assistant: AppAssistant;
}

/**
 * نافذة محادثة المساعد.
 *
 * مبنية على `Sheet` لا على طبقة جديدة: الورقة السفلية موجودة في نظام
 * التصميم بحركتها وحدودها وظلّها، وبناء غلافٍ ثانٍ كان سيعني نافذتين
 * تتباعدان مع أول تعديل على الهوية.
 */
export function AssistantModal({
  visible,
  onClose,
  assistant,
}: AssistantModalProps) {
  const { messages, loading, pending, send, confirmPending, cancelPending } =
    assistant;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // كل رسالة جديدة تنزل بالقائمة إلى آخرها، وإلا بقي الردّ خارج الشاشة.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      80,
    );
    return () => clearTimeout(timer);
  }, [messages.length, pending, visible]);

  async function handleSend() {
    const text = draft;
    if (!text.trim() || loading) return;
    setDraft('');
    await send(text);
  }

  return (
    <Sheet visible={visible} onClose={onClose} dismissable={!loading}>
      <View className="flex-row-reverse items-center justify-between">
        <View className="flex-row-reverse items-center">
          <Sparkles size={18} color={palette.primary} />
          <Text className="mr-2 text-right text-title text-ink">المساعد</Text>
        </View>
        <PressableScale
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="إغلاق المساعد"
          activeScale={0.9}
          className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface">
          <X size={18} color={palette.muted} />
        </PressableScale>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          className="mt-3 max-h-96"
          contentContainerClassName="pb-2"
          keyboardShouldPersistTaps="handled">
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}

          {pending ? (
            <Card variant="accent" animate={false} className="mt-3">
              <Text className="text-right text-caption text-ink-muted">
                يحتاج موافقتك قبل التنفيذ
              </Text>
              <Text className="mt-1 text-right text-body font-bold text-ink">
                {pending.description}
              </Text>
              <View className="mt-3 flex-row-reverse">
                <Button
                  title="تأكيد"
                  size="sm"
                  block={false}
                  onPress={() => void confirmPending()}
                />
                <Button
                  title="إلغاء"
                  variant="ghost"
                  size="sm"
                  block={false}
                  className="mr-2"
                  onPress={cancelPending}
                />
              </View>
            </Card>
          ) : null}

          {loading ? (
            <View className="mt-3 flex-row-reverse items-center">
              <ActivityIndicator color={palette.primary} />
              <Text className="mr-2 text-right text-caption text-ink-muted">
                جارٍ التفكير…
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="mt-3 flex-row-reverse items-center rounded-full border border-line bg-surface px-4">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="اكتب طلبك…"
            placeholderTextColor={palette.subtle}
            editable={!loading}
            returnKeyType="send"
            onSubmitEditing={() => void handleSend()}
            accessibilityLabel="رسالة إلى المساعد"
            className="flex-1 py-3 text-right text-body text-ink"
          />
          <PressableScale
            onPress={() => void handleSend()}
            disabled={loading || draft.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="إرسال"
            accessibilityState={{ disabled: loading || draft.trim().length === 0 }}
            activeScale={0.9}
            className={`ml-1 h-9 w-9 items-center justify-center rounded-full bg-primary ${
              loading || draft.trim().length === 0 ? 'opacity-40' : ''
            }`}>
            <Send size={16} color={palette.onPrimary} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

/** فقاعة رسالة أو بطاقة إجراء، حسب الدور. */
function MessageRow({ message }: { message: AssistantMessage }) {
  if (message.role === 'action') return <ActionCard message={message} />;

  const isUser = message.role === 'user';
  return (
    <View
      // في التخطيط العربي تُعرض رسائل المستخدم على اليسار والواردة على
      // اليمين حيث تبدأ القراءة — عكس الإنجليزية. `self-end` في حاوية
      // RTL هو اليسار، فالاتجاه يتبع اللغة تلقائياً بلا شرط منفصل.
      className={`mt-2 max-w-[85%] rounded-2xl px-3 py-2 ${
        isUser ? 'self-end bg-primary' : 'self-start bg-surface-raised'
      }`}>
      <Text
        className={`text-right text-body ${
          isUser ? 'text-primary-fg' : 'text-ink'
        }`}>
        {message.text}
      </Text>
    </View>
  );
}

/** بطاقة تنفيذ: نغمتها تتبع الحالة، لا لوناً ثابتاً. */
function ActionCard({ message }: { message: AssistantMessage }) {
  const failed = message.status === 'failed';
  const cancelled = message.status === 'cancelled';
  const done = message.status === 'done';

  return (
    <Card
      variant={failed ? 'danger' : done ? 'success' : 'panel'}
      animate={false}
      padded={false}
      className="mt-2">
      <View className="flex-row-reverse items-center p-3">
        {message.status === 'running' ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : failed || cancelled ? (
          <CircleAlert size={16} color={failed ? palette.danger : palette.muted} />
        ) : (
          <Check size={16} color={palette.success} />
        )}
        <Text className="mr-2 flex-1 text-right text-caption text-ink">
          {message.text}
        </Text>
      </View>
    </Card>
  );
}
