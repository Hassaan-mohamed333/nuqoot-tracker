/**
 * تفضيل صغير يُخزَّن في أأمن موضع تتيحه المنصّة.
 *
 * على الهاتف: `expo-secure-store` — Keychain في iOS وEncryptedSharedPreferences
 * في أندرويد. وعلى الويب: `localStorage`، لأن شيمة الويب في المكتبة
 * كائنٌ فارغ (`export default {}`) فكلّ نداء عليها يرمي.
 *
 * وما يُخزَّن هنا **تفضيلٌ لا سرّ**: «هل القفل مفعَّل؟». لو عُبث به
 * فأقصى أثره إطفاء قفلٍ محلي، لا كشف بيانات. والتخزين الآمن مع ذلك
 * أولى: لا سبب لترك ما يمكن تأمينه بلا تأمين.
 */

import { Platform } from 'react-native';

import { logger } from '@/lib/logger';

const TRUE = '1';

async function nativeStore() {
  return import('expo-secure-store');
}

export async function readSecureFlag(key: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return window.localStorage.getItem(key) === TRUE;
    }
    const SecureStore = await nativeStore();
    return (await SecureStore.getItemAsync(key)) === TRUE;
  } catch (error) {
    // نافذة خاصة، أو Keychain مقفل قبل أوّل فتح: الغياب يعني «مطفأ»،
    // وهو الافتراض الآمن — لا نقفل التطبيق على صاحبه بسبب تخزين متعذّر.
    logger.warn('secureFlag', `تعذّرت قراءة ${key}`, error);
    return false;
  }
}

export async function writeSecureFlag(
  key: string,
  value: boolean,
): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (value) window.localStorage.setItem(key, TRUE);
      else window.localStorage.removeItem(key);
    } catch (error) {
      logger.warn('secureFlag', `تعذّر حفظ ${key}`, error);
    }
    return;
  }

  const SecureStore = await nativeStore();
  if (value) await SecureStore.setItemAsync(key, TRUE);
  else await SecureStore.deleteItemAsync(key);
}

/** مفتاح تفضيل القفل الحيوي. */
export const BIOMETRIC_LOCK_KEY = 'nuqoot.biometricLock';
