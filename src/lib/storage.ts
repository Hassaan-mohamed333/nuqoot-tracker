import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  cleanupLegacySeedData,
  type SeedCleanupStore,
} from '@/lib/legacySeed';
import { logger } from '@/lib/logger';

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

/* ------------------------------------------------------------------ */
/* هجرة تنظيف البيانات التجريبية القديمة.                              */
/* ------------------------------------------------------------------ */

/** جسرٌ بين الهجرة النقيّة و AsyncStorage. */
const seedCleanupStore: SeedCleanupStore = {
  read: (key) => readJson<unknown>(key, null),
  write: (key, value) => writeJson(key, value),
  readFlag: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      // تخزينٌ لا يُقرأ: نتصرّف كأن الهجرة لم تجرِ بعد، فتُعاد المحاولة.
      return null;
    }
  },
  writeFlag: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // العلامة لم تُكتب: تُعاد الهجرة في الإقلاع التالي، وهي عديمة
      // الأثر على دفترٍ نُظّف سلفاً.
    }
  },
};

/**
 * يُشغّل التنظيف مرّةً واحدة في عمر العملية.
 *
 * الوعد محفوظ لا مُستأنف: `refresh` يُستدعى عند كل تبديل حساب وعند كل
 * سحبٍ للتحديث، ولولا الحفظ لقرأنا العلامة في كل مرّة. وبعد أوّل تشغيل
 * لا يبقى إلا انتظارُ وعدٍ محسوم — بلا لمس تخزين.
 */
let cleanupPromise: Promise<void> | null = null;

export function runLegacySeedCleanup(): Promise<void> {
  cleanupPromise ??= cleanupLegacySeedData(seedCleanupStore)
    .then((report) => {
      const { contacts, events, transactions } = report.removed;
      if (contacts + events + transactions > 0) {
        logger.info(
          'storage',
          `نُظّفت بيانات تجريبية قديمة: ${contacts} جهة اتصال، ${events} مناسبة، ${transactions} حركة.`,
        );
      }
    })
    .catch((error) => {
      // الفشل لا يمنع الإقلاع: الدفتر يُقرأ كما هو، وتُعاد المحاولة لاحقاً.
      logger.warn('storage', 'تعذّر تنظيف البيانات التجريبية القديمة', error);
      cleanupPromise = null;
    });

  return cleanupPromise;
}
