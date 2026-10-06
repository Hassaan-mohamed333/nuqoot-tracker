import AsyncStorage from '@react-native-async-storage/async-storage';

import { createRateLimiter } from '@/lib/rateLimit';

/**
 * حاجز المحاولات المستعمل في التطبيق.
 *
 * AsyncStorage لا localStorage: يعمل على المنصّات الثلاث، والويب عنده
 * غلافٌ فوق localStorage أصلاً. والحالة تبقى بعد إغلاق التطبيق عمداً —
 * حاجزٌ يُمسح بإعادة التشغيل ليس حاجزاً.
 */
export const authThrottle = createRateLimiter({
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
});
