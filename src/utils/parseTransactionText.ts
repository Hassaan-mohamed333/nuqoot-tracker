import type { NewTransactionInput, TransactionDirection } from '@/types';

/**
 * محلّل محلي بسيط للجُمل الطبيعية.
 *
 * ليس بديلاً عن النموذج، بل شبكة أمان: يعمل بلا شبكة وبلا مفاتيح، ويغطي
 * الصياغات الشائعة. نتيجته تُعرض للمراجعة قبل الحفظ في كل الأحوال.
 */

/** نتيجة تحليل جملة، بحقول قد تكون ناقصة. */
export interface ParsedTransaction {
  contactName: string | null;
  amount: number | null;
  direction: TransactionDirection | null;
  note: string | null;
  currency: string | null;
  /** مدى الثقة: 'high' من النموذج، 'low' من التحليل المحلي. */
  confidence: 'high' | 'low';
}

/** يحوّل الأرقام العربية-الهندية إلى لاتينية ليقرأها Number. */
export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** كلمات تدل على أن المستخدم دفع (OUT). */
const OUT_HINTS = [
  'دفعت',
  'أعطيت',
  'اعطيت',
  'ادّيت',
  'اديت',
  'نقّطت',
  'نقطت',
  'صرفت',
  'سلّمت',
  'gave',
  'paid',
  'sent',
];

/** كلمات تدل على أن المستخدم استلم (IN). */
const IN_HINTS = [
  'أخذت',
  'اخذت',
  'استلمت',
  'قبضت',
  'وصلني',
  'جالي',
  'took',
  'received',
  'got',
  'collected',
];

const CURRENCY_HINTS: { pattern: RegExp; code: string }[] = [
  { pattern: /جنيه|egp|£/i, code: 'EGP' },
  { pattern: /ريال|sar/i, code: 'SAR' },
  { pattern: /درهم|aed/i, code: 'AED' },
  { pattern: /دولار|usd|\$/i, code: 'USD' },
];

function detectDirection(text: string): TransactionDirection | null {
  const lower = text.toLowerCase();
  const outHit = OUT_HINTS.some((hint) => lower.includes(hint));
  const inHit = IN_HINTS.some((hint) => lower.includes(hint));

  // عند اجتماع الإشارتين لا نخمّن؛ نترك الحقل للمستخدم.
  if (outHit && !inHit) return 'OUT';
  if (inHit && !outHit) return 'IN';
  return null;
}

function detectAmount(text: string): number | null {
  const match = normalizeDigits(text).match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function detectCurrency(text: string): string | null {
  return CURRENCY_HINTS.find((hint) => hint.pattern.test(text))?.code ?? null;
}

/**
 * يطابق اسماً معروفاً داخل الجملة.
 * نفضّل أطول تطابق حتى لا يبتلع اسمٌ قصير اسماً مركباً.
 */
function detectContact(text: string, knownNames: string[]): string | null {
  const lower = text.toLowerCase();

  const matches = knownNames.filter((name) => {
    const parts = name.toLowerCase().split(/\s+/).filter(Boolean);
    return lower.includes(name.toLowerCase()) || parts.some((part) => part.length > 2 && lower.includes(part));
  });

  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

/** يستخرج وصفاً مختصراً بعد أدوات التعليل الشائعة. */
function detectNote(text: string): string | null {
  const match = text.match(
    /(?:عشان|علشان|بسبب|مقابل|في|for)\s+(.{2,40})$/i,
  );
  return match ? match[1].trim() : null;
}

/** يحلّل جملة طبيعية محلياً بالاعتماد على أسماء جهات الاتصال المعروفة. */
export function parseTransactionText(
  text: string,
  knownNames: string[],
): ParsedTransaction {
  const trimmed = text.trim();

  return {
    contactName: detectContact(trimmed, knownNames),
    amount: detectAmount(trimmed),
    direction: detectDirection(trimmed),
    note: detectNote(trimmed),
    currency: detectCurrency(trimmed),
    confidence: 'low',
  };
}

/** هل النتيجة كافية لملء النموذج بشكل مفيد؟ */
export function isUsableParse(parsed: ParsedTransaction): boolean {
  return parsed.amount !== null || parsed.contactName !== null;
}

/** يحوّل نتيجة التحليل إلى مدخلات حركة، بعد ربط الاسم بمعرّف. */
export function toTransactionInput(
  parsed: ParsedTransaction,
  contactId: string,
): NewTransactionInput {
  return {
    contact_id: contactId,
    event_id: null,
    direction: parsed.direction ?? 'OUT',
    amount: parsed.amount ?? 0,
    currency: parsed.currency ?? undefined,
    note: parsed.note,
  };
}
