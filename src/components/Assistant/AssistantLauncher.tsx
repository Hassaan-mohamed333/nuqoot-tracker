import { Sparkles } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AssistantModal } from '@/components/Assistant/AssistantModal';
import { PressableScale } from '@/components/motion';
import { useAppAssistant } from '@/hooks/useAppAssistant';
import { isAssistantAvailable } from '@/lib/gemini';
import { palette } from '@/lib/palette';

/**
 * مدخل المساعد: زرّ عائم فوق شريط التبويبات، ونافذته.
 *
 * الزرّ والنافذة في مكوّن واحد لأن الخطّاف يجب أن يعيش أعلى منهما: لو
 * رُكِّب داخل النافذة لفقد سجلّ المحادثة مع كل إغلاق، ولو رُكِّب في الجذر
 * لأعاد رسم التطبيق كلّه مع كل حرف يُكتب.
 *
 * `bottom-28` يرفعه فوق الشريط العائم (ارتفاعه 72 وهامشه 12) فلا يحجب
 * أيقونات التنقّل.
 */
export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const assistant = useAppAssistant(close);

  if (!isAssistantAvailable()) return null;

  return (
    <>
      <View
        className="absolute bottom-28 left-4"
        pointerEvents="box-none"
        accessibilityViewIsModal={false}>
        <PressableScale
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="فتح المساعد الذكي"
          activeScale={0.92}
          className="h-14 w-14 items-center justify-center rounded-full bg-primary shadow-float">
          <Sparkles size={22} color={palette.onPrimary} />
        </PressableScale>
      </View>

      <AssistantModal visible={open} onClose={close} assistant={assistant} />
    </>
  );
}

/** مدخل نصّي للاستعمال داخل رأس شاشة، بديلاً عن الزرّ العائم. */
export function AssistantHeaderButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="فتح المساعد الذكي"
      activeScale={0.94}
      className="flex-row-reverse items-center rounded-full border border-line bg-surface px-3 py-1.5">
      <Sparkles size={14} color={palette.primary} />
      <Text className="mr-1.5 text-caption font-bold text-primary">المساعد</Text>
    </PressableScale>
  );
}
