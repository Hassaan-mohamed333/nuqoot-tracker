import AsyncStorage from '@react-native-async-storage/async-storage';

/** مفاتيح التخزين المحلي. */
export const STORAGE_KEYS = {
  contacts: 'nuqoot:contacts',
  events: 'nuqoot:events',
  transactions: 'nuqoot:transactions',
  participants: 'nuqoot:event-participants',
  sharedExpenses: 'nuqoot:shared-expenses',
  expenseShares: 'nuqoot:expense-shares',
  profile: 'nuqoot:profile',
} as const;

/** يقرأ قيمة JSON من التخزين المحلي، ويعيد fallback عند الفشل. */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** يكتب قيمة JSON في التخزين المحلي. */
export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // التخزين المحلي ليس مصدر الحقيقة، لذا نتجاهل أخطاء الكتابة.
  }
}

/** يمسح كل بيانات التطبيق المحلية. */
export async function clearLocalData(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
}
