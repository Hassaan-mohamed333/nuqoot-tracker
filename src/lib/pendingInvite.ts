import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { logger } from '@/lib/logger';
import { INVITE_PARAM, parseInviteCode } from '@/utils/eventInvite';

/**
 * الدعوة التي وصلت قبل أن يسجّل المستخدم دخوله.
 *
 * رابط الدعوة يُفتح عادةً والمستخدم خارج التطبيق أو بلا جلسة، وتسجيل الدخول
 * بـ Google يعيد تحميل الصفحة كاملةً على الويب فيضيع كل حالة في الذاكرة. لذلك
 * يُحفظ الكود في التخزين المحلي فور وصوله، ويستهلكه المتنقّل بعد الدخول.
 *
 * الكود وحده يُحفظ (بعد فحص شكله)، لا الرابط الخام.
 */

const KEY = 'nuqoot:pending-invite';

type Listener = () => void;
const listeners = new Set<Listener>();

/** يُنادى عند وصول دعوة جديدة والتطبيق مفتوح. */
export function onPendingInvite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function store(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, code);
  } catch (error) {
    logger.warn('invite', 'تعذّر حفظ الدعوة المعلّقة', error);
  }
  listeners.forEach((listener) => listener());
}

/** يقرأ الدعوة المعلّقة ويمسحها: تُستهلك مرة واحدة. */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    return parseInviteCode(raw);
  } catch {
    return null;
  }
}

/** يزيل معامل الدعوة من شريط العنوان بعد التقاطه، فلا يُعاد استعماله بإعادة التحميل. */
function stripInviteFromUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(INVITE_PARAM)) return;
    url.searchParams.delete(INVITE_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // شريط العنوان تحسينٌ لا شرط.
  }
}

async function captureFromUrl(url: string | null): Promise<void> {
  if (!url) return;
  const code = parseInviteCode(url);
  // رابط OAuth (…?code=…) يحمل معاملاً اسمه code لا join: parseInviteCode لا يقبله
  // إلا إذا كان join أو مقطعاً أخيراً بشكل الكود، فلا يلتبس بكود المصادقة.
  if (!code || !/[?&]join=|\/join\//i.test(url)) return;
  await store(code);
  stripInviteFromUrl();
}

/**
 * يلتقط الدعوة من رابط الفتح، ويراقب الروابط التي تصل لاحقاً.
 * يُنادى مرة واحدة عند إقلاع التطبيق، قبل أي انتقال لتسجيل الدخول.
 */
export function startInviteCapture(): () => void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') void captureFromUrl(window.location.href);
    return () => undefined;
  }

  void Linking.getInitialURL().then(captureFromUrl);
  const subscription = Linking.addEventListener('url', (event) => {
    void captureFromUrl(event.url);
  });
  return () => subscription.remove();
}
