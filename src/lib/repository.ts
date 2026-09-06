import { SEED_CONTACTS, SEED_EVENTS, SEED_TRANSACTIONS } from '@/data/seed';
import { readJson, STORAGE_KEYS, writeJson } from '@/lib/storage';
import { isSupabaseConfigured, requireSupabase, TABLES } from '@/lib/supabase';
import type {
  Contact,
  Event,
  NewTransactionInput,
  Transaction,
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

/** يحمّل البيانات المحلية، ويزرع البيانات التجريبية عند أول تشغيل. */
async function loadLocal(): Promise<LedgerData> {
  const [contacts, events, transactions] = await Promise.all([
    readJson<Contact[] | null>(STORAGE_KEYS.contacts, null),
    readJson<Event[] | null>(STORAGE_KEYS.events, null),
    readJson<Transaction[] | null>(STORAGE_KEYS.transactions, null),
  ]);

  if (contacts && events && transactions) {
    return { contacts, events, transactions, offline: true };
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
    return loadLocal();
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
    return loadLocal();
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
    try {
      const client = requireSupabase();
      const { id: _localId, created_at: _localCreatedAt, ...payload } = draft;
      const { data, error } = await client
        .from(TABLES.transactions)
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      if (data) saved = data as Transaction;
    } catch {
      // نُبقي المسودة المحلية حتى لا تضيع مدخلات المستخدم.
    }
  }

  const cached = await readJson<Transaction[]>(STORAGE_KEYS.transactions, []);
  await writeJson(STORAGE_KEYS.transactions, [saved, ...cached]);

  return saved;
}
