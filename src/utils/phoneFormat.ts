/**
 * يوحّد رقماً من دفتر الهاتف مع صيغة التطبيق (01xxxxxxxxx).
 *
 * يزيل المسافات والشرطات والأقواس. والمفتاح المصري `+20` أو `0020`
 * يصير `0`. أي مفتاح دولة آخر يبقى كما هو بعلامة `+`.
 */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+20')) return `0${cleaned.slice(3)}`;
  if (cleaned.startsWith('0020')) return `0${cleaned.slice(4)}`;
  return cleaned;
}
