import { Alert, Platform } from 'react-native';

import { logger } from '@/lib/logger';
import { userMessage } from '@/lib/supabaseError';

/**
 * تنبيهات تعمل على الويب أيضاً.
 *
 * Alert في react-native-web دالة فارغة (`static alert() {}`)، فكل نداء
 * عليها يختفي بلا أثر. النتيجة أن أخطاء تسجيل الدخول والحفظ وقراءة
 * الإيصالات كانت تُرمى وتُبتلع بصمت في معاينة الويب. هنا نستخدم حوارات
 * المتصفّح على الويب، و Alert الأصلي على الهاتف.
 */

const isWeb = Platform.OS === 'web';

/** رسالة معلوماتية. */
export function notify(title: string, message: string): void {
  if (isWeb && typeof window !== 'undefined' && window.alert) {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

/**
 * يعرض خطأً للمستخدم ويسجّله.
 *
 * ما يُعرض وما يُسجَّل ليسا الشيء نفسه: الحوار يأخذ رسالة `userMessage`
 * المفهومة الخالية من بنية الخادم، والسجل يأخذ الكائن بعد تنقيته — وفي
 * الإنتاج لا يأخذ إلا سطراً بلا حمولة. طباعة أثر النداء للمستخدم أُلغيت:
 * مساراتُه تكشف بنية الجهاز ولا تفيده في شيء.
 */
export function reportError(title: string, error: unknown): void {
  logger.error('alert', title, error);
  notify(title, userMessage(error));
}

interface ConfirmOptions {
  title: string;
  message: string;
  /** نص زر التأكيد. */
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** تأكيد إجراء. يعيد true إذا وافق المستخدم. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  const { title, message, confirmLabel, cancelLabel = 'إلغاء', destructive } =
    options;

  if (isWeb) {
    const approved =
      typeof window !== 'undefined' && window.confirm
        ? window.confirm(`${title}\n\n${message}`)
        : false;
    return Promise.resolve(approved);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
