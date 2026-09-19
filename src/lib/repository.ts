import { SEED_CONTACTS, SEED_EVENTS, SEED_TRANSACTIONS } from '@/data/seed';
import { extensionForMime, readLocalFile } from '@/lib/files';
import { logStepFailure } from '@/lib/supabaseError';
import {
  validateContactInput,
  validateContactPatch,
  validateEventInput,
  validateEventMembers,
  validateProfilePatch,
  validateSharedExpenseInput,
  validateTransactionInput,
  validateTransactionPatch,
  type ContactPatch,
  type TransactionPatch,
} from '@/lib/validateEntities';
import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage';
import {
  isSupabaseKeyError,
  isSupabaseReady,
  markSupabaseKeyRejected,
  requireSupabase,
  TABLES,
} from '@/lib/supabase';
import type {
  Contact,
  ContactInsert,
  EventParticipant,
  ExpenseShare,
  NewEventMember,
  NewSharedExpenseInput,
  SharedExpense,
  SharedExpenseInsert,
  SharedExpenseWithShares,
  Event,
  EventInsert,
  NewContactInput,
  NewEventInput,
  NewTransactionInput,
  Transaction,
  TransactionInsert,
  UserProfile,
  UserProfileInput,
} from '@/types';
import { DEFAULT_CURRENCY } from '@/utils/ledger';

export interface LedgerData {
  contacts: Contact[];
  events: Event[];
  transactions: Transaction[];
  /** true عندما تكون البيانات من التخزين المحلي وليس من Supabase. */
  offline: boolean;
}

/**
 * يسجّل فشل طلب خادم، ويُسقط الاتصال إن كان سببه رفض المفتاح.
 *
 * بدون الإسقاط يعيد كل استدعاء لاحق المحاولة نفسها فيردّ 401 نفسه؛
 * وبتسجيله مرّة تتحوّل بقية الجلسة إلى الوضع المحلي من تلقائها.
 */
function noteServerFailure(step: string, error: unknown): void {
  logStepFailure(step, error);
  if (isSupabaseKeyError(error)) markSupabaseKeyRejected();
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * يحمّل النسخة المحلية.
 *
 * البيانات التجريبية تُزرع فقط في الوضع المحلي (بلا Supabase). عند وجود
 * حساب حقيقي لا يجوز أن يرى المستخدم بيانات وهمية إذا فشل الطلب، لذا
 * نعيد ما هو مخزَّن فعلاً أو قوائم فارغة.
 */
async function loadLocal(seedWhenEmpty: boolean): Promise<LedgerData> {
  const [contacts, events, transactions] = await Promise.all([
    readJson<Contact[] | null>(STORAGE_KEYS.contacts, null),
    readJson<Event[] | null>(STORAGE_KEYS.events, null),
    readJson<Transaction[] | null>(STORAGE_KEYS.transactions, null),
  ]);

  if (contacts && events && transactions) {
    return { contacts, events, transactions, offline: true };
  }

  if (!seedWhenEmpty) {
    return {
      contacts: contacts ?? [],
      events: events ?? [],
      transactions: transactions ?? [],
      offline: true,
    };
  }

  await Promise.all([
    writeJson(STORAGE_KEYS.contacts, SEED_CONTACTS),
    writeJson(STORAGE_KEYS.events, SEED_EVENTS),
    writeJson(STORAGE_KEYS.transactions, SEED_TRANSACTIONS),
  ]);

  return {
    contacts: SEED_CONTACTS,
    events: SEED_EVENTS,
    transactions: SEED_TRANSACTIONS,
    offline: true,
  };
}

/**
 * يجلب كل البيانات: من Supabase عند توفر الإعداد، ومن التخزين المحلي
 * في غير ذلك (أو عند فشل الطلب) حتى يظل التطبيق قابلاً للاستخدام.
 */
export async function fetchLedgerData(): Promise<LedgerData> {
  if (!isSupabaseReady()) {
    return loadLocal(true);
  }

  try {
    const client = requireSupabase();
    const [contacts, events, transactions] = await Promise.all([
      client.from(TABLES.contacts).select('*').order('full_name'),
      client.from(TABLES.events).select('*').order('event_date', { ascending: false }),
      client
        .from(TABLES.transactions)
        .select('*')
        .order('occurred_at', { ascending: false }),
    ]);

    const error = contacts.error ?? events.error ?? transactions.error;
    if (error) throw error;

    const data: LedgerData = {
      contacts: (contacts.data ?? []) as Contact[],
      events: (events.data ?? []) as Event[],
      transactions: (transactions.data ?? []) as Transaction[],
      offline: false,
    };

    // نسخة محلية للعمل بدون شبكة لاحقاً.
    await Promise.all([
      writeJson(STORAGE_KEYS.contacts, data.contacts),
      writeJson(STORAGE_KEYS.events, data.events),
      writeJson(STORAGE_KEYS.transactions, data.transactions),
    ]);

    return data;
  } catch (error) {
    // تعذّر الوصول للخادم: نعرض آخر نسخة محفوظة لهذا الحساب بلا زرع بيانات.
    // نسجّل السبب أولاً، وإلا صار الرجوع الصامت يخفي أخطاء حقيقية.
    noteServerFailure('تحميل الدفتر', error);
    return loadLocal(false);
  }
}

/** اسم دلو التخزين الذي تُرفع إليه صور الإيصالات. */
export const RECEIPTS_BUCKET = 'receipts';

/**
 * يرفع صورة إيصال ويعيد مسارها داخل الدلو.
 *
 * الدلو خاص، فنخزّن المسار لا رابطاً عاماً، ونولّد رابطاً موقّعاً عند
 * العرض. رابط عام يعني أن أي شخص يخمّن المسار يقرأ إيصالات غيره.
 */
export async function uploadReceipt(localUri: string): Promise<string> {
  const client = requireSupabase();

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) {
    logStepFailure('قراءة المستخدم الحالي', userError);
    throw userError;
  }
  const user = userData?.user;
  if (!user) throw new Error('يلزم تسجيل الدخول لرفع الإيصالات.');

  let file;
  try {
    file = await readLocalFile(localUri);
  } catch (error) {
    logStepFailure('قراءة ملف الإيصال', error);
    throw error;
  }

  /**
   * الامتداد من نوع المحتوى لا من العنوان: على الويب يكون العنوان
   * "blob:http://localhost:8081/..." فينتج عن اشتقاقه من العنوان مفتاحٌ
   * يحوي ':' و'/' ترفضه خدمة التخزين.
   */
  const extension = extensionForMime(file.mimeType);
  const path = `${user.id}/${Date.now()}.${extension}`;

  const { error } = await client.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file.bytes, {
      contentType: file.mimeType,
      upsert: false,
    });

  if (error) {
    logStepFailure(`رفع الإيصال إلى ${RECEIPTS_BUCKET}/${path}`, error);
    throw error;
  }

  return path;
}

/** يولّد رابطاً موقّعاً مؤقتاً لعرض إيصال مخزَّن. */
export async function getReceiptUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!isSupabaseReady()) return null;
  const client = requireSupabase();
  const { data, error } = await client.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** كل ما تحتاجه صفحة الدفتر الجماعي لمناسبة واحدة. */
export interface EventLedger {
  event: Event | null;
  participants: EventParticipant[];
  expenses: SharedExpenseWithShares[];
  offline: boolean;
}

/** يدمج المصاريف مع حصصها في بنية واحدة. */
function attachShares(
  expenses: SharedExpense[],
  shares: ExpenseShare[],
): SharedExpenseWithShares[] {
  const byExpense = new Map<string, ExpenseShare[]>();
  for (const share of shares) {
    const list = byExpense.get(share.expense_id) ?? [];
    list.push(share);
    byExpense.set(share.expense_id, list);
  }
  return expenses.map((expense) => ({
    ...expense,
    shares: byExpense.get(expense.id) ?? [],
  }));
}

/** النسخة المحلية من دفتر المناسبة. */
async function loadLocalEventLedger(eventId: string): Promise<EventLedger> {
  const [events, participants, expenses, shares] = await Promise.all([
    readJson<Event[]>(STORAGE_KEYS.events, []),
    readJson<EventParticipant[]>(STORAGE_KEYS.participants, []),
    readJson<SharedExpense[]>(STORAGE_KEYS.sharedExpenses, []),
    readJson<ExpenseShare[]>(STORAGE_KEYS.expenseShares, []),
  ]);

  const eventExpenses = expenses
    .filter((expense) => expense.event_id === eventId)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const expenseIds = new Set(eventExpenses.map((expense) => expense.id));

  return {
    event: events.find((event) => event.id === eventId) ?? null,
    participants: participants.filter((row) => row.event_id === eventId),
    expenses: attachShares(
      eventExpenses,
      shares.filter((share) => expenseIds.has(share.expense_id)),
    ),
    offline: true,
  };
}

/** يجلب دفتر المناسبة من Supabase، مع رجوع إلى النسخة المحلية عند التعذّر. */
export async function fetchEventLedger(eventId: string): Promise<EventLedger> {
  if (!isSupabaseReady()) return loadLocalEventLedger(eventId);

  try {
    const client = requireSupabase();

    const [eventResult, participantsResult, expensesResult] = await Promise.all([
      client.from(TABLES.events).select('*').eq('id', eventId).maybeSingle(),
      client
        .from(TABLES.eventParticipants)
        .select('*')
        .eq('event_id', eventId),
      client
        .from(TABLES.sharedExpenses)
        .select('*')
        .eq('event_id', eventId)
        .order('occurred_at', { ascending: false }),
    ]);

    if (eventResult.error) throw eventResult.error;
    if (participantsResult.error) throw participantsResult.error;
    if (expensesResult.error) throw expensesResult.error;

    const expenses = (expensesResult.data ?? []) as SharedExpense[];
    const expenseIds = expenses.map((expense) => expense.id);

    const sharesResult =
      expenseIds.length > 0
        ? await client
            .from(TABLES.expenseShares)
            .select('*')
            .in('expense_id', expenseIds)
        : { data: [] as ExpenseShare[], error: null };

    if (sharesResult.error) throw sharesResult.error;

    return {
      event: (eventResult.data as Event | null) ?? null,
      participants: (participantsResult.data ?? []) as EventParticipant[],
      expenses: attachShares(expenses, (sharesResult.data ?? []) as ExpenseShare[]),
      offline: false,
    };
  } catch (error) {
    noteServerFailure('تحميل دفتر المناسبة', error);
    return loadLocalEventLedger(eventId);
  }
}

/**
 * يضبط قائمة المشاركين في المناسبة (استبدال كامل).
 * contactIds لا تتضمن المستخدم؛ includeMe يضيف صف contact_id = null.
 */
export async function setEventParticipants(
  eventId: string,
  members: NewEventMember[],
): Promise<EventParticipant[]> {
  const nowIso = new Date().toISOString();

  /** يحوّل الاختيار إلى شكل الصف في قاعدة البيانات. */
  const toRow = (member: NewEventMember) => ({
    event_id: eventId,
    contact_id: member.kind === 'contact' ? member.contactId : null,
    display_name: member.kind === 'guest' ? member.displayName.trim() : null,
  });

  const rows = validateEventMembers(members).map(toRow);

  if (isSupabaseReady()) {
    const client = requireSupabase();

    // استبدال كامل: أبسط من مقارنة الفروق، والمناسبات صغيرة.
    const { error: deleteError } = await client
      .from(TABLES.eventParticipants)
      .delete()
      .eq('event_id', eventId);
    if (deleteError) {
      logStepFailure('حذف مشاركي المناسبة', deleteError);
      throw deleteError;
    }

    if (rows.length === 0) {
      await replaceLocalParticipants(eventId, []);
      return [];
    }

    const { data, error } = await client
      .from(TABLES.eventParticipants)
      .insert(rows)
      .select();
    if (error) {
      logStepFailure('إضافة مشاركي المناسبة', error);
      throw error;
    }

    const saved = (data ?? []) as EventParticipant[];
    await replaceLocalParticipants(eventId, saved);
    return saved;
  }

  const local: EventParticipant[] = rows.map((row) => ({
    ...row,
    id: createId('p'),
    created_at: nowIso,
  }));
  await replaceLocalParticipants(eventId, local);
  return local;
}

async function replaceLocalParticipants(
  eventId: string,
  rows: EventParticipant[],
): Promise<void> {
  const cached = await readJson<EventParticipant[]>(STORAGE_KEYS.participants, []);
  await writeJson(STORAGE_KEYS.participants, [
    ...cached.filter((row) => row.event_id !== eventId),
    ...rows,
  ]);
}

/** يضيف مصروفاً جماعياً مع حصصه. */
export async function createSharedExpense(
  input: NewSharedExpenseInput,
): Promise<SharedExpenseWithShares> {
  const nowIso = new Date().toISOString();

  const clean = validateSharedExpenseInput(input);
  const payload: SharedExpenseInsert = {
    event_id: clean.event_id,
    payer_participant_id: clean.payer_participant_id,
    // العمود القديم يبقى فارغاً؛ الهوية صارت معرّف العضو.
    payer_contact_id: null,
    description: clean.description,
    amount: clean.amount,
    currency: clean.currency ?? DEFAULT_CURRENCY,
    occurred_at: clean.occurred_at ?? nowIso,
    receipt_url: clean.receipt_url ?? null,
  };

  let expense: SharedExpense = {
    ...payload,
    id: createId('x'),
    user_id: null,
    created_at: nowIso,
  };

  let shares: ExpenseShare[] = clean.shares.map((share) => ({
    id: createId('s'),
    expense_id: expense.id,
    participant_id: share.participant_id,
    contact_id: null,
    share_amount: share.share_amount,
  }));

  if (isSupabaseReady()) {
    const client = requireSupabase();

    const { data, error } = await client
      .from(TABLES.sharedExpenses)
      .insert(payload)
      .select()
      .single();
    if (error) {
      logStepFailure(`الإدراج في ${TABLES.sharedExpenses}`, error);
      throw error;
    }
    expense = data as SharedExpense;

    const { data: shareData, error: shareError } = await client
      .from(TABLES.expenseShares)
      .insert(
        clean.shares.map((share) => ({
          expense_id: expense.id,
          participant_id: share.participant_id,
          share_amount: share.share_amount,
        })),
      )
      .select();

    if (shareError) {
      logStepFailure(`الإدراج في ${TABLES.expenseShares}`, shareError);
      // الحصص هي ما يجعل المصروف قابلاً للقسمة؛ مصروف بلا حصص يفسد
      // الحساب، فنتراجع عن الإدراج بدل ترك صف نصف مكتمل.
      await client.from(TABLES.sharedExpenses).delete().eq('id', expense.id);
      throw shareError;
    }
    shares = (shareData ?? []) as ExpenseShare[];
  }

  const [cachedExpenses, cachedShares] = await Promise.all([
    readJson<SharedExpense[]>(STORAGE_KEYS.sharedExpenses, []),
    readJson<ExpenseShare[]>(STORAGE_KEYS.expenseShares, []),
  ]);
  await Promise.all([
    writeJson(STORAGE_KEYS.sharedExpenses, [expense, ...cachedExpenses]),
    writeJson(STORAGE_KEYS.expenseShares, [...shares, ...cachedShares]),
  ]);

  return { ...expense, shares };
}

/** بيانات صفحة شخص واحد: الشخص وحركاته ومناسباته. */
export interface ContactLedger {
  contact: Contact | null;
  transactions: Transaction[];
  events: Event[];
  /** true عندما تكون البيانات من النسخة المحلية لا من الخادم. */
  offline: boolean;
}

/** يبني سجل الشخص من النسخة المحلية (وضع بلا Supabase أو عند فشل الطلب). */
async function loadLocalContactLedger(
  contactId: string,
): Promise<ContactLedger> {
  const [contacts, events, transactions] = await Promise.all([
    readJson<Contact[]>(STORAGE_KEYS.contacts, []),
    readJson<Event[]>(STORAGE_KEYS.events, []),
    readJson<Transaction[]>(STORAGE_KEYS.transactions, []),
  ]);

  const contactTransactions = transactions
    .filter((transaction) => transaction.contact_id === contactId)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const linkedEventIds = new Set(
    contactTransactions
      .map((transaction) => transaction.event_id)
      .filter((eventId): eventId is string => eventId !== null),
  );

  return {
    contact: contacts.find((contact) => contact.id === contactId) ?? null,
    transactions: contactTransactions,
    events: events.filter(
      (event) =>
        event.host_contact_id === contactId || linkedEventIds.has(event.id),
    ),
    offline: true,
  };
}

/**
 * يجلب سجل شخص واحد من Supabase مباشرةً، مُرشَّحاً على مستوى الخادم
 * (contact_id = ...) بدل ترشيح نسخة عامة في الذاكرة. سياسات RLS تضمن
 * أن الصفوف العائدة تخص المستخدم الحالي وحده.
 *
 * عند غياب الإعداد أو فشل الطلب نرجع إلى النسخة المحلية حتى تظل الصفحة
 * قابلة للعرض بلا شبكة.
 */
export async function fetchContactLedger(
  contactId: string,
): Promise<ContactLedger> {
  if (!isSupabaseReady()) {
    return loadLocalContactLedger(contactId);
  }

  try {
    const client = requireSupabase();

    const [contactResult, transactionsResult] = await Promise.all([
      client.from(TABLES.contacts).select('*').eq('id', contactId).maybeSingle(),
      client
        .from(TABLES.transactions)
        .select('*')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false }),
    ]);

    if (contactResult.error) throw contactResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    const transactions = (transactionsResult.data ?? []) as Transaction[];
    const linkedEventIds = [
      ...new Set(
        transactions
          .map((transaction) => transaction.event_id)
          .filter((eventId): eventId is string => eventId !== null),
      ),
    ];

    // المناسبات المرتبطة: ما يستضيفه الشخص، وما أشارت إليه حركاته.
    const [hostedResult, linkedResult] = await Promise.all([
      client.from(TABLES.events).select('*').eq('host_contact_id', contactId),
      linkedEventIds.length > 0
        ? client.from(TABLES.events).select('*').in('id', linkedEventIds)
        : Promise.resolve({ data: [] as Event[], error: null }),
    ]);

    if (hostedResult.error) throw hostedResult.error;
    if (linkedResult.error) throw linkedResult.error;

    const eventsById = new Map<string, Event>();
    for (const event of [
      ...((hostedResult.data ?? []) as Event[]),
      ...((linkedResult.data ?? []) as Event[]),
    ]) {
      eventsById.set(event.id, event);
    }

    return {
      contact: (contactResult.data as Contact | null) ?? null,
      transactions,
      events: [...eventsById.values()].sort((a, b) =>
        b.event_date.localeCompare(a.event_date),
      ),
      offline: false,
    };
  } catch (error) {
    noteServerFailure('تحميل دفتر جهة الاتصال', error);
    return loadLocalContactLedger(contactId);
  }
}

/**
 * يحفظ صفاً جديداً: في Supabase عند توفره، ثم يضيفه إلى النسخة المحلية.
 *
 * الحمولة لا تحمل id أو created_at أو user_id إطلاقاً؛ تملؤها قاعدة
 * البيانات، و user_id تحديداً من `default auth.uid()` الذي تقوم عليه RLS.
 * أخطاء الخادم تصعد إلى الواجهة بدل أن تُدفن في نسخة محلية.
 */
async function persist<TRow extends { id: string }, TInsert>(
  table: string,
  storageKey: string,
  draft: TRow,
  payload: TInsert,
): Promise<TRow> {
  let saved = draft;

  if (isSupabaseReady()) {
    const client = requireSupabase();
    const { data, error } = await client
      .from(table)
      .insert(payload as Record<string, unknown>)
      .select()
      .single();

    if (error) {
      logStepFailure(`الإدراج في جدول ${table}`, error);
      throw error;
    }
    if (data) saved = data as TRow;
  }

  const cached = await readJson<TRow[]>(storageKey, []);
  await writeJson(storageKey, [saved, ...cached]);

  return saved;
}

/** يضيف جهة اتصال جديدة. */
export async function createContact(
  input: NewContactInput,
): Promise<Contact> {
  const nowIso = new Date().toISOString();

  const clean = validateContactInput(input);
  const payload: ContactInsert = {
    full_name: clean.full_name,
    phone: clean.phone ?? null,
    relation: clean.relation ?? null,
    notes: clean.notes ?? null,
  };

  const draft: Contact = {
    ...payload,
    id: createId('c'),
    user_id: null,
    is_archived: false,
    archived_at: null,
    created_at: nowIso,
  };

  return persist<Contact, ContactInsert>(
    TABLES.contacts,
    STORAGE_KEYS.contacts,
    draft,
    payload,
  );
}

/**
 * يؤرشف جهة اتصال أو يعيدها إلى القائمة النشطة.
 *
 * الأرشفة إخفاء لا حذف: الحركات تبقى كما هي، ويمكن الاستعادة في أي وقت.
 */
export async function setContactArchived(
  contactId: string,
  archived: boolean,
): Promise<Contact> {
  const patch = {
    is_archived: archived,
    archived_at: archived ? new Date().toISOString() : null,
  };

  let updated: Contact | null = null;

  if (isSupabaseReady()) {
    const client = requireSupabase();
    const { data, error } = await client
      .from(TABLES.contacts)
      .update(patch)
      .eq('id', contactId)
      .select()
      .single();

    if (error) throw error;
    updated = data as Contact;
  }

  const cached = await readJson<Contact[]>(STORAGE_KEYS.contacts, []);
  const next = cached.map((contact) =>
    contact.id === contactId ? { ...contact, ...patch } : contact,
  );
  await writeJson(STORAGE_KEYS.contacts, next);

  const local = next.find((contact) => contact.id === contactId);
  const result = updated ?? local;
  if (!result) throw new Error('جهة الاتصال غير موجودة.');
  return result;
}

/** يضيف مناسبة جديدة. */
export async function createEvent(input: NewEventInput): Promise<Event> {
  const nowIso = new Date().toISOString();

  const clean = validateEventInput(input);
  const payload: EventInsert = {
    title: clean.title,
    event_type: clean.event_type,
    host_contact_id: clean.host_contact_id ?? null,
    event_date: clean.event_date,
    location: clean.location ?? null,
    notes: clean.notes ?? null,
  };

  const draft: Event = {
    ...payload,
    id: createId('e'),
    user_id: null,
    created_at: nowIso,
  };

  return persist<Event, EventInsert>(
    TABLES.events,
    STORAGE_KEYS.events,
    draft,
    payload,
  );
}

/** يضيف حركة جديدة (نقوط واردة أو صادرة). */
export async function createTransaction(
  input: NewTransactionInput,
): Promise<Transaction> {
  const nowIso = new Date().toISOString();

  const clean = validateTransactionInput(input);
  const payload: TransactionInsert = {
    contact_id: clean.contact_id,
    event_id: clean.event_id,
    direction: clean.direction,
    // المبلغ موجب دائماً؛ الاتجاه وحده يحدد الإشارة. checkAmount ضمِن
    // أنه رقم صالح ضمن مدى numeric(12,2) قبل الوصول إلى هنا.
    amount: clean.amount,
    currency: clean.currency ?? DEFAULT_CURRENCY,
    occurred_at: clean.occurred_at ?? nowIso,
    note: clean.note ?? null,
    receipt_url: clean.receipt_url ?? null,
  };

  const draft: Transaction = {
    ...payload,
    id: createId('t'),
    user_id: null,
    created_at: nowIso,
  };

  return persist<Transaction, TransactionInsert>(
    TABLES.transactions,
    STORAGE_KEYS.transactions,
    draft,
    payload,
  );
}

/**
 * يعدّل حركة قائمة.
 *
 * التحقّق يمرّ على `validateTransactionPatch` لا على مُتحقّق الإنشاء:
 * الحقل الغائب هنا يعني «لا تمسّه» لا «ناقص»، والخلط بينهما كان سيجبر
 * الواجهة على إرسال الصف كاملاً في كل تعديل.
 */
export async function updateTransaction(
  transactionId: string,
  updates: TransactionPatch,
): Promise<Transaction> {
  const patch = validateTransactionPatch(updates);

  let updated: Transaction | null = null;

  if (isSupabaseReady()) {
    try {
      const client = requireSupabase();
      const { data, error } = await client
        .from(TABLES.transactions)
        .update(patch)
        .eq('id', transactionId)
        .select()
        .single();

      if (error) throw error;
      updated = data as Transaction;
    } catch (error) {
      noteServerFailure('تعديل الحركة', error);
      throw error;
    }
  }

  const cached = await readJson<Transaction[]>(STORAGE_KEYS.transactions, []);
  const next = cached.map((row) =>
    row.id === transactionId ? { ...row, ...patch } : row,
  );
  await writeJson(STORAGE_KEYS.transactions, next);

  const result = updated ?? next.find((row) => row.id === transactionId);
  if (!result) throw new Error('الحركة غير موجودة.');
  return result;
}

/** يحذف حركة واحدة من الخادم ومن النسخة المحلية. */
export async function deleteTransaction(transactionId: string): Promise<void> {
  if (isSupabaseReady()) {
    try {
      const client = requireSupabase();
      const { error } = await client
        .from(TABLES.transactions)
        .delete()
        .eq('id', transactionId);

      if (error) throw error;
    } catch (error) {
      noteServerFailure('حذف الحركة', error);
      throw error;
    }
  }

  const cached = await readJson<Transaction[]>(STORAGE_KEYS.transactions, []);
  await writeJson(
    STORAGE_KEYS.transactions,
    cached.filter((row) => row.id !== transactionId),
  );
}

/** يعدّل بيانات جهة اتصال (الاسم، الهاتف، الصلة، الملاحظات). */
export async function updateContact(
  contactId: string,
  updates: ContactPatch,
): Promise<Contact> {
  const patch = validateContactPatch(updates);

  let updated: Contact | null = null;

  if (isSupabaseReady()) {
    try {
      const client = requireSupabase();
      const { data, error } = await client
        .from(TABLES.contacts)
        .update(patch)
        .eq('id', contactId)
        .select()
        .single();

      if (error) throw error;
      updated = data as Contact;
    } catch (error) {
      noteServerFailure('تعديل جهة الاتصال', error);
      throw error;
    }
  }

  const cached = await readJson<Contact[]>(STORAGE_KEYS.contacts, []);
  const next = cached.map((contact) =>
    contact.id === contactId ? { ...contact, ...patch } : contact,
  );
  await writeJson(STORAGE_KEYS.contacts, next);

  const result = updated ?? next.find((contact) => contact.id === contactId);
  if (!result) throw new Error('جهة الاتصال غير موجودة.');
  return result;
}

/** ما أزاله حذف جهة الاتصال، ليصف للمستخدم أثر ما فعله. */
export interface ContactDeletionResult {
  /** عدد الحركات التي رحلت مع جهة الاتصال. */
  removedTransactions: number;
}

/**
 * يحذف جهة اتصال ومعها كل ما يتفرّع عنها.
 *
 * على الخادم يكفي حذف الصف: المخطّط يعلن `on delete cascade` على
 * `transactions.contact_id` و`event_participants.contact_id`
 * و`expense_shares.contact_id`، و`on delete set null` على
 * `events.host_contact_id` و`shared_expenses.payer_contact_id`.
 *
 * أمّا التخزين المحلي فلا يعرف مفاتيح أجنبية، فنكرّر الدلالة نفسها هنا
 * يدوياً. لولا ذلك لبقيت في الوضع المحلي حركاتٌ تشير إلى جهة اتصال
 * محذوفة: تُحسب في الإجماليات ولا يظهر لها صاحب.
 */
export async function deleteContact(
  contactId: string,
): Promise<ContactDeletionResult> {
  if (isSupabaseReady()) {
    try {
      const client = requireSupabase();
      const { error } = await client
        .from(TABLES.contacts)
        .delete()
        .eq('id', contactId);

      if (error) throw error;
    } catch (error) {
      noteServerFailure('حذف جهة الاتصال', error);
      throw error;
    }
  }

  const [contacts, transactions, events, participants, expenses, shares] =
    await Promise.all([
      readJson<Contact[]>(STORAGE_KEYS.contacts, []),
      readJson<Transaction[]>(STORAGE_KEYS.transactions, []),
      readJson<Event[]>(STORAGE_KEYS.events, []),
      readJson<EventParticipant[]>(STORAGE_KEYS.participants, []),
      readJson<SharedExpense[]>(STORAGE_KEYS.sharedExpenses, []),
      readJson<ExpenseShare[]>(STORAGE_KEYS.expenseShares, []),
    ]);

  const keptTransactions = transactions.filter(
    (row) => row.contact_id !== contactId,
  );
  const removedTransactions = transactions.length - keptTransactions.length;

  // الحصص تتبع عضويّة المناسبة أيضاً: العضو يُحذف، فحصصه تُحذف معه حتى
  // لو كان الصف يحمل participant_id لا contact_id.
  const droppedParticipants = new Set(
    participants
      .filter((row) => row.contact_id === contactId)
      .map((row) => row.id),
  );

  await Promise.all([
    writeJson(
      STORAGE_KEYS.contacts,
      contacts.filter((contact) => contact.id !== contactId),
    ),
    writeJson(STORAGE_KEYS.transactions, keptTransactions),
    writeJson(
      STORAGE_KEYS.events,
      events.map((event) =>
        event.host_contact_id === contactId
          ? { ...event, host_contact_id: null }
          : event,
      ),
    ),
    writeJson(
      STORAGE_KEYS.participants,
      participants.filter((row) => row.contact_id !== contactId),
    ),
    writeJson(
      STORAGE_KEYS.sharedExpenses,
      expenses.map((expense) => {
        const byContact = expense.payer_contact_id === contactId;
        const byParticipant =
          expense.payer_participant_id !== null &&
          droppedParticipants.has(expense.payer_participant_id);
        if (!byContact && !byParticipant) return expense;
        return {
          ...expense,
          payer_contact_id: byContact ? null : expense.payer_contact_id,
          payer_participant_id: byParticipant
            ? null
            : expense.payer_participant_id,
        };
      }),
    ),
    writeJson(
      STORAGE_KEYS.expenseShares,
      shares.filter(
        (share) =>
          share.contact_id !== contactId &&
          !(share.participant_id && droppedParticipants.has(share.participant_id)),
      ),
    ),
  ]);

  return { removedTransactions };
}

/** اسم دلو التخزين الذي تُرفع إليه الصور الرمزية. */
export const AVATARS_BUCKET = 'avatars';

/**
 * يرفع صورة رمزية ويعيد رابطها العام.
 *
 * بخلاف الإيصالات نعيد رابطاً عامّاً لا مساراً: الصورة تُعرض في كل
 * تصيير للشاشة، والرابط الموقّت ينتهي فيتحوّل إلى مربّع مكسور بعد ساعة.
 * والمقايضة مقبولة هنا وحدها — من يعرف الرابط يرى صورةً وضعها صاحبها
 * ليراها الناس، لا إيصالاً يكشف ما اشترى ومتى.
 *
 * اسم الملف يحمل طابعاً زمنياً لا اسماً ثابتاً: الكتابة فوق مسارٍ واحد
 * تُبقي الصورة القديمة في ذاكرة المتصفّح والـ CDN، فيرى المستخدم صورته
 * السابقة بعد تغييرها ويظنّ أن الحفظ فشل.
 */
export async function uploadAvatar(localUri: string): Promise<string> {
  const client = requireSupabase();

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) {
    logStepFailure('قراءة المستخدم الحالي', userError);
    throw userError;
  }
  const user = userData?.user;
  if (!user) throw new Error('يلزم تسجيل الدخول لرفع الصورة.');

  let file;
  try {
    file = await readLocalFile(localUri);
  } catch (error) {
    logStepFailure('قراءة ملف الصورة', error);
    throw error;
  }

  // الامتداد من نوع المحتوى لا من العنوان: على الويب يكون العنوان
  // "blob:http://..." فينتج عن اشتقاقه مفتاحٌ يحوي ':' و'/' ترفضه الخدمة.
  const extension = extensionForMime(file.mimeType);
  const path = `${user.id}/${Date.now()}.${extension}`;

  const { error } = await client.storage
    .from(AVATARS_BUCKET)
    .upload(path, file.bytes, { contentType: file.mimeType, upsert: false });

  if (error) {
    logStepFailure(`رفع الصورة إلى ${AVATARS_BUCKET}/${path}`, error);
    throw error;
  }

  const { data } = client.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('تعذّر الحصول على رابط الصورة بعد الرفع.');
  }
  return data.publicUrl;
}

/**
 * هوية الملف الشخصي في الوضع المحلي.
 *
 * التطبيق كلّه يعمل بلا خادم — جهات الاتصال والحركات والمناسبات — وكان
 * الملف الشخصي وحده يطلب تسجيل دخول لا وجود له أصلاً في ذلك الوضع.
 * فهوية ثابتة على الجهاز تجعل الشاشة تعمل كبقيّتها.
 */
export const LOCAL_PROFILE_ID = 'local';

/**
 * أيّ ملفّ نقرأ ونكتب؟
 *
 * `null` تعني «لا شيء بعد»: خادمٌ مُعدّ وجلسة لم تبدأ، وهي الحالة
 * الوحيدة التي يصحّ فيها طلب تسجيل الدخول.
 */
export function resolveProfileId(
  userId: string | null,
  authDisabled: boolean,
): string | null {
  if (userId) return userId;
  return authDisabled ? LOCAL_PROFILE_ID : null;
}

/** ملفّ فارغ، لمستخدم لم يفتح الشاشة بعد. */
function emptyProfile(userId: string): UserProfile {
  const nowIso = new Date().toISOString();
  return {
    id: userId,
    full_name: null,
    date_of_birth: null,
    avatar_url: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/**
 * يقرأ الملف الشخصي.
 *
 * لا يرمي عند غياب الصفّ: المستخدم الجديد لا صفَّ له حتى أوّل حفظ،
 * وهي الحالة الطبيعية لا خطأ. `maybeSingle` تميّز «غير موجود» عن «فشل».
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  if (isSupabaseReady()) {
    try {
      const client = requireSupabase();
      const { data, error } = await client
        .from(TABLES.profiles)
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const profile = data as UserProfile;
        await writeJson(STORAGE_KEYS.profile, profile);
        return profile;
      }
      return emptyProfile(userId);
    } catch (error) {
      noteServerFailure('تحميل الملف الشخصي', error);
      // نسقط إلى النسخة المحلية بدل شاشة فارغة.
    }
  }

  const cached = await readJson<UserProfile | null>(STORAGE_KEYS.profile, null);
  return cached?.id === userId ? cached : emptyProfile(userId);
}

/**
 * يحفظ تعديلات الملف الشخصي.
 *
 * `upsert` لا `update`: الصفّ لا يوجد قبل أوّل حفظ، و`update` على صفّ
 * غير موجود تنجح بصمت وتعيد لا شيء — فيرى المستخدم «تم الحفظ» ولا يُحفظ
 * شيء. ومفتاح الصفّ هو معرّف المستخدم نفسه، و RLS تمنع كتابته لغيره.
 */
export async function updateUserProfile(
  userId: string,
  data: UserProfileInput,
): Promise<UserProfile> {
  const patch = validateProfilePatch(data);

  let saved: UserProfile | null = null;

  if (isSupabaseReady()) {
    try {
      const client = requireSupabase();
      const { data: row, error } = await client
        .from(TABLES.profiles)
        .upsert({ id: userId, ...patch }, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;
      saved = row as UserProfile;
    } catch (error) {
      noteServerFailure('حفظ الملف الشخصي', error);
      throw error;
    }
  }

  const cached = await readJson<UserProfile | null>(STORAGE_KEYS.profile, null);
  const base = cached?.id === userId ? cached : emptyProfile(userId);
  const next: UserProfile =
    saved ?? { ...base, ...patch, updated_at: new Date().toISOString() };

  await writeJson(STORAGE_KEYS.profile, next);
  return next;
}
