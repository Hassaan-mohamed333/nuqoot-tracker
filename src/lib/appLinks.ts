import { Platform } from 'react-native';

/** عنوان النسخة المنشورة على الويب: ما يفتحه المدعوّ ولو لم يثبّت التطبيق. */
export const PUBLIC_WEB_URL = 'https://hassaan-mohamed333.github.io/nuqoot-tracker/';

/**
 * القاعدة التي يُبنى عليها رابط الدعوة.
 *
 * على الويب نستعمل عنوان الصفحة الحالية، فيعمل الرابط على النطاق الذي يُخدَم
 * منه التطبيق فعلاً (محلياً أو منشوراً). وعلى الجوال لا عنوان ويب، فنأخذ
 * العنوان المنشور: رابط https يفتحه أي هاتف.
 */
export function inviteBaseUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return PUBLIC_WEB_URL;
}
