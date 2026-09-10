import type {
  Contact,
  ContactSection,
  ContactWithSummary,
  LedgerStatus,
  LedgerSummary,
  Transaction,
} from '@/types';

export const DEFAULT_CURRENCY = 'EGP';

/**
 * قاعدة الألوان المطلوبة:
 *   net > 0  -> أخضر (دائن)
 *   net < 0  -> أحمر (مدين)
 *   net = 0  -> رمادي (متعادل)
 */
export function getLedgerStatus(net: number): LedgerStatus {
  if (net > 0) return 'credit';
  if (net < 0) return 'debit';
  return 'settled';
}

interface StatusTheme {
  /** التسمية العربية المعروضة للمستخدم. */
  label: string;
  /** لون سداسي للاستخدام مع الأيقونات ومكوّنات لا تقبل className. */
  color: string;
  /** أصناف NativeWind للنص. */
  textClass: string;
  /** أصناف NativeWind للخلفية الفاتحة. */
  bgClass: string;
  /** أصناف NativeWind للحدود. */
  borderClass: string;
  /**
   * مفتاح اللون في لوحة الوضع الحالي.
   *
   * `color` أعلاه ثابت للوضع الفاتح، ولا يصلح للأيقونات في الوضع الليلي.
   * من يملك `usePalette()` يقرأ اللون الصحيح عبر هذا المفتاح.
   */
  colorKey: 'success' | 'danger' | 'muted';
}

const STATUS_THEME: Record<LedgerStatus, StatusTheme> = {
  credit: {
    label: 'دائن',
    color: '#10B981',
    colorKey: 'success',
    textClass: 'text-credit',
    bgClass: 'bg-success-soft',
    borderClass: 'border-success/25',
  },
  debit: {
    label: 'مدين',
    color: '#FF453A',
    colorKey: 'danger',
    textClass: 'text-debit',
    bgClass: 'bg-danger-soft',
    borderClass: 'border-danger/25',
  },
  settled: {
    label: 'متعادل',
    color: '#64748B',
    colorKey: 'muted',
    textClass: 'text-ink-muted',
    bgClass: 'bg-line/40',
    borderClass: 'border-line',
  },
};

export function getStatusTheme(status: LedgerStatus): StatusTheme {
  return STATUS_THEME[status];
}

/** اختصار: نظرية اللون مباشرة من الصافي. */
export function getNetTheme(net: number): StatusTheme {
  return getStatusTheme(getLedgerStatus(net));
}

/** ملخص فارغ يُستخدم كقيمة ابتدائية. */
export function emptySummary(currency: string = DEFAULT_CURRENCY): LedgerSummary {
  return {
    totalIn: 0,
    totalOut: 0,
    net: 0,
    status: 'settled',
    transactionCount: 0,
    currency,
  };
}

/**
 * يحسب الملخص المحاسبي لمجموعة حركات.
 * الصافي = ما دفعته (OUT) - ما استلمته (IN).
 */
export function summarize(
  transactions: Transaction[],
  currency: string = DEFAULT_CURRENCY,
): LedgerSummary {
  let totalIn = 0;
  let totalOut = 0;

  for (const transaction of transactions) {
    const amount = Math.abs(transaction.amount);
    if (transaction.direction === 'IN') {
      totalIn += amount;
    } else {
      totalOut += amount;
    }
  }

  const net = totalOut - totalIn;

  return {
    totalIn,
    totalOut,
    net,
    status: getLedgerStatus(net),
    transactionCount: transactions.length,
    currency: transactions[0]?.currency ?? currency,
  };
}

/** يجمّع الحركات حسب جهة الاتصال. */
export function groupTransactionsByContact(
  transactions: Transaction[],
): Record<string, Transaction[]> {
  return transactions.reduce<Record<string, Transaction[]>>((acc, transaction) => {
    (acc[transaction.contact_id] ??= []).push(transaction);
    return acc;
  }, {});
}

/** يربط كل جهة اتصال بملخصها المالي. */
export function attachSummaries(
  contacts: Contact[],
  transactions: Transaction[],
  currency: string = DEFAULT_CURRENCY,
): ContactWithSummary[] {
  const grouped = groupTransactionsByContact(transactions);
  return contacts.map((contact) => ({
    ...contact,
    summary: summarize(grouped[contact.id] ?? [], currency),
  }));
}

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
const LATIN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** الأبجدية الكاملة المدعومة في الفهرس الجانبي (عربي ثم A-Z ثم #). */
export const INDEX_ALPHABET: string[] = [...ARABIC_LETTERS, ...LATIN_LETTERS, '#'];

/** يوحّد أشكال الهمزة والألف والتاء المربوطة حتى لا تتفرق الأسماء في الفهرس. */
function normalizeArabicLetter(letter: string): string {
  if ('أإآا'.includes(letter)) return 'ا';
  if (letter === 'ة') return 'ه';
  if ('ىي'.includes(letter)) return 'ي';
  if (letter === 'ؤ') return 'و';
  if (letter === 'ئ') return 'ي';
  return letter;
}

/** يستخرج حرف الفهرسة لاسم ما (عربي أو لاتيني)، و«#» لأي شيء آخر. */
export function getIndexLetter(name: string): string {
  const first = name.trim().charAt(0);
  if (!first) return '#';

  const normalized = normalizeArabicLetter(first);
  if (ARABIC_LETTERS.includes(normalized)) return normalized;

  const upper = first.toUpperCase();
  if (LATIN_LETTERS.includes(upper)) return upper;

  return '#';
}

/** ترتيب أبجدي يحترم الترتيب العربي ثم اللاتيني. */
export function compareContacts(a: Contact, b: Contact): number {
  const letterA = getIndexLetter(a.full_name);
  const letterB = getIndexLetter(b.full_name);
  const rankA = INDEX_ALPHABET.indexOf(letterA);
  const rankB = INDEX_ALPHABET.indexOf(letterB);

  if (rankA !== rankB) return rankA - rankB;
  return a.full_name.localeCompare(b.full_name, 'ar');
}

/**
 * يبني أقسام قائمة جهات الاتصال مرتبة أبجدياً (A-Z / ا-ي).
 * تُعاد الأقسام غير الفارغة فقط، بنفس ترتيب INDEX_ALPHABET.
 */
export function buildContactSections(
  contacts: ContactWithSummary[],
): ContactSection[] {
  const sorted = [...contacts].sort(compareContacts);
  const sections: ContactSection[] = [];

  for (const contact of sorted) {
    const letter = getIndexLetter(contact.full_name);
    const last = sections[sections.length - 1];
    if (last && last.letter === letter) {
      last.data.push(contact);
    } else {
      sections.push({ letter, data: [contact] });
    }
  }

  return sections;
}

/** تنسيق المبلغ بالأرقام العربية مع رمز العملة. */
export function formatAmount(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const formatted = new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${formatted} ${currency}`;
}

/** تنسيق الصافي مع إشارة صريحة (+/-) لتوضيح الاتجاه. */
export function formatNet(
  net: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  return `${sign}${formatAmount(net, currency)}`;
}

/** جملة توضح معنى الصافي للمستخدم. */
export function describeNet(summary: LedgerSummary): string {
  switch (summary.status) {
    case 'credit':
      return `لك عند الآخرين ${formatAmount(summary.net, summary.currency)}`;
    case 'debit':
      return `عليك واجبات بقيمة ${formatAmount(summary.net, summary.currency)}`;
    default:
      return 'لا توجد واجبات معلّقة';
  }
}

/** تنسيق التاريخ بصيغة عربية قصيرة. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
