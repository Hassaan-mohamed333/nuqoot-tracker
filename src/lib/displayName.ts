/**
 * اسم المستخدم كما يُعرض، من ثلاثة مصادر بترتيب ثقة.
 *
 * الترتيب مقصود: ما كتبه المستخدم في ملفه أولاً، ثم ما جاء من مزوّد
 * الدخول (Google يضع الاسم في `user_metadata`)، ثم كلمة محايدة.
 *
 * والبريد ليس بينها: الترويسة كانت تعرضه، وهو معرّف حساب لا اسم — يطول
 * فيُقصّ، ويُرى ممّن ينظر إلى الشاشة، ولا يقول «مرحباً» لأحد.
 */

import { sanitizeLine } from '@/lib/validation';

/** ما يُعرَض حين لا اسم: محايد ولا يبدو عطباً. */
export const FALLBACK_NAME = 'مستخدم';

interface NameSources {
  profileName?: string | null;
  metadataName?: unknown;
}

export function displayName({ profileName, metadataName }: NameSources): string {
  const fromProfile = sanitizeLine(profileName);
  if (fromProfile) return fromProfile;

  const fromMetadata = sanitizeLine(metadataName);
  if (fromMetadata) return fromMetadata;

  return FALLBACK_NAME;
}

/** تحية الترويسة. */
export function greeting(sources: NameSources): string {
  return `مرحباً ${displayName(sources)}`;
}

/**
 * الحرف الذي يظهر في الدائرة حين لا صورة.
 *
 * أوّل حرف أو رقم من الاسم، لا من البريد. واسمٌ من رموز محضة يعود إلى
 * حرف الكلمة المحايدة لا إلى «؟»: علامة الاستفهام تبدو عطباً، والحرف
 * يبدو حساباً بلا صورة — وهو ما هو.
 */
export function initialOf(sources: NameSources): string {
  const letterIn = (text: string): string | undefined =>
    [...text].find((char) => /\p{L}|\p{N}/u.test(char));

  return letterIn(displayName(sources)) ?? letterIn(FALLBACK_NAME) ?? '؟';
}
