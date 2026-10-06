/**
 * تنظيف البيانات التجريبية القديمة، مرّةً واحدة لكل جهاز.
 *
 * ---------------------------------------------------------------------
 * كان التطبيق يزرع دفتراً تجريبياً عند أوّل فتح بلا حساب — ثمانُ جهات
 * اتصال وخمسُ مناسبات وعشرُ حركات. وقد زال الزرع، لكنّ ما زُرع سابقاً
 * باقٍ في تخزين كل من فتح التطبيق قبل ذلك. فهذا الملف يمسحه عنهم.
 *
 * **القاعدة: لا يُحذف إلا ما لم يُلمس.**
 *
 * الصفّ التجريبي الذي عدّله المستخدم صار صفَّه هو: من غيّر اسم «أحمد عبد
 * الرحمن» إلى اسم قريبه وسجّل عليه نقوطاً حقيقية لا يجوز أن يستيقظ على
 * دفترٍ ناقص. فلكل صفٍّ تجريبي بصمةُ حقوله الثابتة هنا، ولا يُحذف إلا
 * إن طابقها حرفاً بحرف.
 *
 * **والتواريخ خارج البصمة** عمداً: `created_at` و`occurred_at`
 * و`event_date` كانت تُحسب لحظة الزرع (`daysAgo(400)`)، فتختلف من جهاز
 * إلى آخر ومن يومٍ إلى يوم. إدخالها في البصمة كان سيجعل المطابقة تفشل
 * دائماً، فلا يُحذف شيء أصلاً.
 *
 * **ولا يُترك صفٌّ يتيماً**: جهة اتصال تجريبية تُشير إليها حركةٌ من صنع
 * المستخدم تبقى، وإلا صارت حركته بلا صاحب — تُحسب في الأرصدة ولا يظهر
 * لها اسم. وكذلك المناسبات.
 * ---------------------------------------------------------------------
 */

/** علامة «جرى التنظيف»، فلا يُقرأ التخزين في كل إقلاع بعدها. */
export const LEGACY_SEED_FLAG = 'nuqoot:has_cleaned_legacy_seed_v1';

interface SeedContactPrint {
  id: string;
  full_name: string;
  phone: string | null;
  relation: string | null;
  notes: string | null;
}

interface SeedEventPrint {
  id: string;
  title: string;
  event_type: string;
  host_contact_id: string | null;
  location: string | null;
  notes: string | null;
}

interface SeedTransactionPrint {
  id: string;
  contact_id: string | null;
  event_id: string | null;
  direction: string;
  amount: number;
  currency: string;
  note: string | null;
}

/**
 * بصمات الصفوف المزروعة، منقولةٌ حرفياً من `src/data/seed.ts` قبل حذفه
 * (الحالة عند 1dc60b6^). لا تُعدَّل: مطابقتُها هي ما يميّز صفّاً لم
 * يلمسه أحد عن صفٍّ صار للمستخدم.
 */
const SEED_CONTACTS: readonly SeedContactPrint[] = [
  { id: 'c1', full_name: 'أحمد عبد الرحمن', phone: '01001234567', relation: 'ابن العم', notes: null },
  { id: 'c2', full_name: 'إبراهيم سالم', phone: '01112223344', relation: 'صديق', notes: 'زميل العمل السابق' },
  { id: 'c3', full_name: 'بسمة محمود', phone: null, relation: 'قريبة', notes: null },
  { id: 'c4', full_name: 'حسن الشناوي', phone: '01223334455', relation: 'جار', notes: null },
  { id: 'c5', full_name: 'سارة فتحي', phone: '01555667788', relation: 'صديقة العائلة', notes: null },
  { id: 'c6', full_name: 'محمود عيد', phone: '01099887766', relation: 'خال', notes: null },
  { id: 'c7', full_name: 'نورهان جمال', phone: null, relation: 'زميلة', notes: null },
  { id: 'c8', full_name: 'Omar Khaled', phone: '01777889900', relation: 'صديق الدراسة', notes: 'مقيم بالخارج' },
];

const SEED_EVENTS: readonly SeedEventPrint[] = [
  { id: 'e1', title: 'فرح أحمد عبد الرحمن', event_type: 'wedding', host_contact_id: 'c1', location: 'قاعة النيل - المنصورة', notes: null },
  { id: 'e2', title: 'خطوبة بسمة محمود', event_type: 'engagement', host_contact_id: 'c3', location: 'منزل العائلة', notes: null },
  { id: 'e3', title: 'عزاء والد حسن الشناوي', event_type: 'funeral', host_contact_id: 'c4', location: 'مسجد الرحمة', notes: null },
  { id: 'e4', title: 'فرح نورهان جمال', event_type: 'wedding', host_contact_id: 'c7', location: 'قاعة الماسة', notes: 'يجب تجهيز النقوط قبل الموعد' },
  { id: 'e5', title: 'مولود سارة فتحي', event_type: 'newborn', host_contact_id: 'c5', location: null, notes: null },
];

const SEED_TRANSACTIONS: readonly SeedTransactionPrint[] = [
  { id: 't1', contact_id: 'c1', event_id: 'e1', direction: 'OUT', amount: 1500, currency: 'EGP', note: 'نقوط الفرح' },
  { id: 't2', contact_id: 'c1', event_id: null, direction: 'IN', amount: 1000, currency: 'EGP', note: 'نقوط فرحي' },
  { id: 't3', contact_id: 'c2', event_id: null, direction: 'IN', amount: 2000, currency: 'EGP', note: 'نقوط فرحي' },
  { id: 't4', contact_id: 'c3', event_id: 'e2', direction: 'OUT', amount: 800, currency: 'EGP', note: 'نقوط الخطوبة' },
  { id: 't5', contact_id: 'c3', event_id: null, direction: 'IN', amount: 800, currency: 'EGP', note: null },
  { id: 't6', contact_id: 'c4', event_id: 'e3', direction: 'OUT', amount: 500, currency: 'EGP', note: 'واجب عزاء' },
  { id: 't7', contact_id: 'c5', event_id: null, direction: 'IN', amount: 1200, currency: 'EGP', note: 'نقوط فرحي' },
  { id: 't8', contact_id: 'c6', event_id: null, direction: 'OUT', amount: 2500, currency: 'EGP', note: 'واجب فرح البنت' },
  { id: 't9', contact_id: 'c8', event_id: null, direction: 'OUT', amount: 1000, currency: 'EGP', note: null },
  { id: 't10', contact_id: 'c8', event_id: null, direction: 'IN', amount: 1000, currency: 'EGP', note: 'رد الواجب' },
];

type Row = Record<string, unknown>;

/** يقارن حقلاً واحداً، معتبراً `undefined` و`null` و`''` شيئاً واحداً. */
function sameField(actual: unknown, expected: string | number | null): boolean {
  if (expected === null) return actual == null || actual === '';
  if (typeof expected === 'number') return Number(actual) === expected;
  return actual === expected;
}

/** هل يطابق الصفّ بصمةً بعينها في كل حقولها؟ */
function matchesPrint(row: Row, print: Record<string, string | number | null>): boolean {
  return Object.entries(print).every(([key, value]) => sameField(row[key], value));
}

/** فهرسٌ بالمعرّف للبحث السريع. */
function byId<T extends { id: string }>(
  prints: readonly T[],
): Map<string, T> {
  return new Map(prints.map((print) => [print.id, print]));
}

const CONTACT_PRINTS = byId(SEED_CONTACTS);
const EVENT_PRINTS = byId(SEED_EVENTS);
const TRANSACTION_PRINTS = byId(SEED_TRANSACTIONS);

/**
 * هل هذا الصفّ نسخةٌ لم تُمسّ ممّا زرعناه؟
 *
 * المعرّف وحده لا يكفي: `c1` قد يكون اليوم اسم قريبٍ حقيقي. فيلزم أن
 * يطابق كل حقلٍ ثابتٍ ما زُرع.
 */
export function isPristineSeedRow(
  kind: 'contact' | 'event' | 'transaction',
  row: unknown,
): boolean {
  if (typeof row !== 'object' || row === null) return false;
  const candidate = row as Row;
  const id = candidate.id;
  if (typeof id !== 'string') return false;

  const prints =
    kind === 'contact'
      ? CONTACT_PRINTS
      : kind === 'event'
        ? EVENT_PRINTS
        : TRANSACTION_PRINTS;

  const print = prints.get(id);
  if (!print) return false;
  return matchesPrint(candidate, print as unknown as Record<string, string | number | null>);
}

export interface LedgerSnapshot {
  contacts: Row[];
  events: Row[];
  transactions: Row[];
}

export interface CleanupOutcome {
  next: LedgerSnapshot;
  /** ما حُذف فعلاً، لكل نوع. */
  removed: { contacts: string[]; events: string[]; transactions: string[] };
  /** هل تغيّر شيء يستحقّ الكتابة؟ */
  changed: boolean;
  /** صفوفٌ تجريبية بقيت لأن صفّاً من صنع المستخدم يشير إليها. */
  keptForReferences: string[];
}

/**
 * يحسب الدفتر بعد التنظيف، بلا لمس تخزينٍ ولا شبكة.
 *
 * دالةٌ نقيّة: كل قرارٍ فيها قابلٌ للفحص في اختبار، وهو ما يليق بشيفرة
 * تحذف بيانات الناس.
 */
export function planSeedCleanup(snapshot: LedgerSnapshot): CleanupOutcome {
  const keptForReferences: string[] = [];
  const idOf = (row: Row) => String(row.id);

  /*
   * الترتيب يتبع الاعتماد، لا العكس: الحركة تشير إلى جهة اتصال ومناسبة،
   * والمناسبة تشير إلى مضيفها. فنبدأ من الحركات، ثم نُبقي من المناسبات
   * ما تحتاجه الحركات الباقية، ثم من جهات الاتصال ما تحتاجه الحركات
   * **والمناسبات** الباقية معاً.
   *
   * العكس كان سيترك مناسبةً باقيةً بمضيفٍ محذوف — إشارةٌ معلّقة إلى
   * اسمٍ لا وجود له.
   */

  // ١) الحركات: تُحذف النسخ التي لم تُمسّ.
  const transactions = snapshot.transactions.filter(
    (row) => !isPristineSeedRow('transaction', row),
  );
  const survivingTxIds = new Set(transactions.map(idOf));
  const removedTransactions = snapshot.transactions
    .filter((row) => !survivingTxIds.has(idOf(row)))
    .map(idOf);

  const referencedContacts = new Set<string>();
  const referencedEvents = new Set<string>();
  for (const row of transactions) {
    if (typeof row.contact_id === 'string') referencedContacts.add(row.contact_id);
    if (typeof row.event_id === 'string') referencedEvents.add(row.event_id);
  }

  // ٢) المناسبات: تبقى إن أشارت إليها حركةٌ نجت (أي من صنع المستخدم).
  const events = snapshot.events.filter((row) => {
    if (!isPristineSeedRow('event', row)) return true;
    if (referencedEvents.has(idOf(row))) {
      keptForReferences.push(idOf(row));
      return true;
    }
    return false;
  });
  const survivingEventIds = new Set(events.map(idOf));
  const removedEvents = snapshot.events
    .filter((row) => !survivingEventIds.has(idOf(row)))
    .map(idOf);

  // مضيفو المناسبات الباقية لا يُحذفون، وإلا بقيت مناسبةٌ بمضيفٍ مفقود.
  const neededHosts = new Set<string>();
  for (const row of events) {
    if (typeof row.host_contact_id === 'string') neededHosts.add(row.host_contact_id);
  }

  // ٣) جهات الاتصال: تبقى إن احتاجتها حركةٌ نجت أو مناسبةٌ بقيت.
  const contacts = snapshot.contacts.filter((row) => {
    if (!isPristineSeedRow('contact', row)) return true;
    const id = idOf(row);
    if (referencedContacts.has(id) || neededHosts.has(id)) {
      keptForReferences.push(id);
      return true;
    }
    return false;
  });
  const survivingContactIds = new Set(contacts.map(idOf));
  const removedContacts = snapshot.contacts
    .filter((row) => !survivingContactIds.has(idOf(row)))
    .map(idOf);

  const removed = {
    contacts: removedContacts,
    events: removedEvents,
    transactions: removedTransactions,
  };

  return {
    next: { contacts, events, transactions },
    removed,
    changed:
      removed.contacts.length > 0 ||
      removed.events.length > 0 ||
      removed.transactions.length > 0,
    keptForReferences,
  };
}

/* ------------------------------------------------------------------ */
/* التشغيل على التخزين الفعلي.                                         */
/* ------------------------------------------------------------------ */

/** ما تحتاجه الهجرة من التخزين، محقونٌ ليُختبَر بلا AsyncStorage. */
export interface SeedCleanupStore {
  read: (key: string) => Promise<unknown>;
  write: (key: string, value: unknown) => Promise<void>;
  readFlag: (key: string) => Promise<string | null>;
  writeFlag: (key: string, value: string) => Promise<void>;
}

export interface CleanupReport {
  ran: boolean;
  removed: { contacts: number; events: number; transactions: number };
}

const KEYS = {
  contacts: 'nuqoot:contacts',
  events: 'nuqoot:events',
  transactions: 'nuqoot:transactions',
} as const;

/** يقرأ مصفوفة من التخزين؛ أي شكلٍ آخر يُعامَل فراغاً. */
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

/**
 * ينظّف ما بقي من البيانات التجريبية، مرّةً واحدة لكل جهاز.
 *
 * العلامة تُقرأ أوّلاً وتُفحص قبل أي شيء آخر: بعد أوّل تشغيل لا تُقرأ
 * قوائم الدفتر أصلاً، فلا يزيد زمن الإقلاع بشيء يُذكر.
 *
 * وتُكتب العلامة حتى حين لا يُحذف شيء — الدفتر النظيف لا يحتاج فحصاً
 * ثانياً. أمّا إن فشلت القراءة أو الكتابة فلا تُكتب، فتُعاد المحاولة في
 * الإقلاع التالي بدل أن تضيع الفرصة صامتة.
 */
export async function cleanupLegacySeedData(
  store: SeedCleanupStore,
): Promise<CleanupReport> {
  const empty: CleanupReport = {
    ran: false,
    removed: { contacts: 0, events: 0, transactions: 0 },
  };

  if (await store.readFlag(LEGACY_SEED_FLAG)) return empty;

  const [contacts, events, transactions] = await Promise.all([
    store.read(KEYS.contacts),
    store.read(KEYS.events),
    store.read(KEYS.transactions),
  ]);

  const outcome = planSeedCleanup({
    contacts: asRows(contacts),
    events: asRows(events),
    transactions: asRows(transactions),
  });

  if (outcome.changed) {
    // تُكتب القوائم الثلاث معاً: كتابةٌ جزئية تترك إشارات معلّقة.
    await Promise.all([
      store.write(KEYS.contacts, outcome.next.contacts),
      store.write(KEYS.events, outcome.next.events),
      store.write(KEYS.transactions, outcome.next.transactions),
    ]);
  }

  await store.writeFlag(LEGACY_SEED_FLAG, 'true');

  return {
    ran: true,
    removed: {
      contacts: outcome.removed.contacts.length,
      events: outcome.removed.events.length,
      transactions: outcome.removed.transactions.length,
    },
  };
}
