import { SEED_CONTACTS, SEED_EVENTS, SEED_TRANSACTIONS } from '@/data/seed';
import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage';
import { isSupabaseConfigured, requireSupabase, TABLES } from '@/lib/supabase';
import type {
  Contact,
  Event,
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

/**
 * يضيف حركة جديدة. يحاول الحفظ في Supabase أولاً، ثم يحدّث النسخة المحلية.
 * يعيد الحركة كما ستُعرض في الواجهة.
 */
export async function createTransaction(
  input: NewTransactionInput,
): Promise<Transaction> {
  const nowIso = new Date().toISOString();

  const draft: Transaction = {
    id: createId('t'),
    user_id: null,
    contact_id: input.contact_id,
    event_id: input.event_id,
    direction: input.direction,
    amount: Math.abs(input.amount),
    currency: input.currency ?? DEFAULT_CURRENCY,
    occurred_at: input.occurred_at ?? nowIso,
    note: input.note ?? null,
    created_at: nowIso,
  };

  let saved = draft;

  if (isSupabaseConfigured) {
    const client = requireSupabase();

    // نحذف id و created_at و user_id عمداً: القيم الافتراضية في قاعدة
    // البيانات هي التي تملأها، و user_id تحديداً يأخذ auth.uid() الذي
    // تعتمد عليه سياسات RLS. إرسال null صراحةً يتجاوز القيمة الافتراضية
    // ويكسر قيد NOT NULL.
    const payload: TransactionInsert = {
      contact_id: draft.contact_id,
      event_id: draft.event_id,
      direction: draft.direction,
      amount: draft.amount,
      currency: draft.currency,
      occurred_at: draft.occurred_at,
      note: draft.note,
    };

    // نترك الخطأ يصعد إلى الواجهة: فشل الحفظ على الخادم (انتهاء الجلسة أو
    // رفض RLS) يجب أن يظهر للمستخدم لا أن يُدفن في نسخة محلية.
    const { data, error } = await client
      .from(TABLES.transactions)
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    if (data) saved = data as Transaction;
  }

  const cached = await readJson<Transaction[]>(STORAGE_KEYS.transactions, []);
  await writeJson(STORAGE_KEYS.transactions, [saved, ...cached]);

  return saved;
}
