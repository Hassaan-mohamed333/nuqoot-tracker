import { Platform } from 'react-native';

import { normalizePhone } from '@/utils/phoneFormat';

/** ما نأخذه من جهة اتصال الهاتف: الاسم ورقم واحد. */
export interface PickedContact {
  name: string;
  phone: string;
}

/**
 * Contact Picker API في المتصفّح (Chrome على أندرويد، عبر HTTPS فقط).
 * ليست في مكتبة الأنواع، فنصفها هنا بما نستعمله.
 */
interface WebContactsManager {
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<Array<{ name?: string[]; tel?: string[] }>>;
}

function webContacts(): WebContactsManager | null {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;
  const manager = (navigator as unknown as { contacts?: WebContactsManager })
    .contacts;
  return manager && typeof manager.select === 'function' ? manager : null;
}

/**
 * هل يمكن اختيار جهة من الهاتف هنا؟
 *
 * على الجوال الأصلي: دائماً. على الويب: فقط حيث يوجد Contact Picker
 * (Chrome أندرويد). سفاري iOS وسطح المكتب لا يدعمانه، فيُخفى الزرّ هناك
 * بدل أن يظهر زرٌّ لا يعمل.
 */
export function isContactPickerSupported(): boolean {
  return Platform.OS !== 'web' || webContacts() !== null;
}

/**
 * يفتح منتقي جهات الاتصال في الهاتف ويعيد ما اختاره المستخدم.
 *
 * `null` = أغلق المنتقي دون اختيار. أي خطأ آخر يُرمى للمستدعي.
 *
 * على الجوال المنتقي من النظام نفسه (`presentContactPickerAsync`)، فلا
 * نطلب إذن قراءة كل الدفتر: يرى التطبيق الجهة المختارة وحدها.
 */
export async function pickDeviceContact(): Promise<PickedContact | null> {
  const web = webContacts();
  if (web) {
    const picked = await web.select(['name', 'tel'], { multiple: false });
    const first = picked[0];
    if (!first) return null;
    return {
      name: (first.name?.[0] ?? '').trim(),
      phone: normalizePhone(first.tel?.[0] ?? ''),
    };
  }

  if (Platform.OS === 'web') {
    throw new Error('هذا المتصفّح لا يدعم اختيار جهة من الهاتف.');
  }

  // تحميل متأخّر: وحدة الجوال لا تُحمَّل على الويب أصلاً.
  const Contacts = await import('expo-contacts/legacy');
  const contact = await Contacts.presentContactPickerAsync();
  if (!contact) return null;

  const numbers = contact.phoneNumbers ?? [];
  const best = numbers.find((entry) => entry.isPrimary) ?? numbers[0];
  const fallbackName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(' ');
  return {
    name: (contact.name || fallbackName || '').trim(),
    phone: normalizePhone(best?.number ?? best?.digits ?? ''),
  };
}
