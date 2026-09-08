import { SEED_CONTACTS, SEED_EVENTS, SEED_TRANSACTIONS } from '@/data/seed';
import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage';
import { isSupabaseConfigured, requireSupabase, TABLES } from '@/lib/supabase';
import type {
  Contact,
  ContactInsert,
  Event,
  EventInsert,
  NewContactInput,
  NewEventInput,
  NewTransactionInput,
  Transaction,
  TransactionInsert,
} from '@/types';
import { DEFAULT_CURRENCY } from '@/utils/ledger';

export interface LedgerData {
  contacts: Contact[];
  events: Event[];
  transactions: Transaction[];
  /** true عندما تكون البيانات من التخزين المحلي وليس من Supabase. */
  offline: boolean;
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
  if (!isSupabaseConfigured) {
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
  } catch {
    // تعذّر الوصول للخادم: نعرض آخر نسخة محفوظة لهذا الحساب بلا زرع بيانات.
    return loadLocal(false);
  }
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
  if (!isSupabaseConfigured) {
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
  } catch {
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

  if (isSupabaseConfigured) {
    const client = requireSupabase();
    const { data, error } = await client
      .from(table)
      .insert(payload as Record<string, unknown>)
      .select()
      .single();

    if (error) throw error;
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

  const payload: ContactInsert = {
    full_name: input.full_name.trim(),
    phone: input.phone?.trim() || null,
    relation: input.relation?.trim() || null,
    notes: input.notes?.trim() || null,
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

  if (isSupabaseConfigured) {
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

  const payload: EventInsert = {
    title: input.title.trim(),
    event_type: input.event_type,
    host_contact_id: input.host_contact_id ?? null,
    event_date: input.event_date,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
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

  const payload: TransactionInsert = {
    contact_id: input.contact_id,
    event_id: input.event_id,
    direction: input.direction,
    // المبلغ موجب دائماً؛ الاتجاه وحده يحدد الإشارة.
    amount: Math.abs(input.amount),
    currency: input.currency ?? DEFAULT_CURRENCY,
    occurred_at: input.occurred_at ?? nowIso,
    note: input.note ?? null,
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
