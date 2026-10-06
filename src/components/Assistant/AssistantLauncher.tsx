import { Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { onOpenAssistant } from '@/components/Assistant/assistantBus';
import { AssistantModal } from '@/components/Assistant/AssistantModal';
import { PressableScale } from '@/components/motion';
import { useAppAssistant } from '@/hooks/useAppAssistant';
import { isAssistantAvailable } from '@/lib/gemini';
import { palette } from '@/lib/palette';

/**
 * نافذة المساعد وسجلّ محادثته.
 *
 * الزرّ العائم أُزيل: كان يحجب المحتوى في كل شاشة. صار المدخل تبويباً في
 * الشريط السفلي (`openAssistant`). والنافذة هنا لأن الخطّاف يجب أن يعيش
 * أعلى منها: لو رُكِّب داخلها لفقد سجلّ المحادثة مع كل إغلاق، ولو رُكِّب
 * في الجذر لأعاد رسم التطبيق كلّه مع كل حرف يُكتب.
 */
export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const assistant = useAppAssistant(close);

  useEffect(() => onOpenAssistant(() => setOpen(true)), []);

  if (!isAssistantAvailable()) return null;

  return <AssistantModal visible={open} onClose={close} assistant={assistant} />;
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
      <Sparkles size={14} color={palette.primaryStrong} />
      <Text className="mr-1.5 text-caption font-bold text-primary-strong">المساعد</Text>
    </PressableScale>
  );
}
