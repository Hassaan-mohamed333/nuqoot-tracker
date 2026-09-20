import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  createContact,
  createEvent,
  createSplitBill,
  createTransaction,
  deleteContact,
  deleteTransaction,
  fetchLedgerData,
  setContactArchived,
  setTransactionArchived,
  updateContact,
  updateTransaction,
} from '@/lib/repository';
import type {
  ContactPatch,
  TransactionPatch,
} from '@/lib/validateEntities';
import { useAuth } from '@/store/AuthProvider';
import type { SplitBillInput } from '@/lib/repository';
import type {
  Contact,
  ContactSection,
  ContactWithSummary,
  Event,
  LedgerSummary,
  NewContactInput,
  NewEventInput,
  NewTransactionInput,
  Transaction,
} from '@/types';
import {
  attachSummaries,
  buildContactSections,
  summarize,
} from '@/utils/ledger';

interface LedgerContextValue {
  contacts: Contact[];
  events: Event[];
  /**
   * الحركات النشطة وحدها.
   *
   * المؤرشفة مستبعدة هنا عمداً لا في كل مستدعٍ: القوائم والإجماليات
   * تقرأ هذه المصفوفة، فاستبعادُها مرّةً في المصدر يضمن ألّا تتسرّب
   * حركةٌ مؤرشفة إلى رصيدٍ لأن شاشةً نسيت أن ترشّح.
   */
  transactions: Transaction[];
  /** الحركات المؤرشفة، لشاشة الأرشيف. */
  archivedTransactions: Transaction[];
  /** جهات الاتصال النشطة مع ملخص كل واحدة (بدون المؤرشفة). */
  contactsWithSummary: ContactWithSummary[];
  /** جهات الاتصال المؤرشفة مع ملخصاتها. */
  archivedContacts: ContactWithSummary[];
  /** أقسام مرتبة أبجدياً لعرضها في SectionList (النشطة فقط). */
  sections: ContactSection[];
  /** الملخص الإجمالي لكل الحركات. */
  totals: LedgerSummary;
  loading: boolean;
  /** true عندما تكون البيانات محلية (Supabase غير مُعدّ أو غير متاح). */
  offline: boolean;
  refresh: () => Promise<void>;
  addContact: (input: NewContactInput) => Promise<Contact>;
  addEvent: (input: NewEventInput) => Promise<Event>;
  addTransaction: (input: NewTransactionInput) => Promise<Transaction>;
  /** يسجّل فاتورة مقسومة: حركة لكل مشارك. */
  addSplitBill: (input: SplitBillInput) => Promise<Transaction[]>;
  /** يعدّل حركة قائمة؛ الحقول الغائبة تبقى كما هي. */
  editTransaction: (
    transactionId: string,
    updates: TransactionPatch,
  ) => Promise<Transaction>;
  /** يحذف حركة نهائياً — من شاشة الأرشيف وحدها. */
  removeTransaction: (transactionId: string) => Promise<void>;
  /** ينقل حركة إلى الأرشيف أو يستعيدها منه. */
  setTransactionArchivedState: (
    transactionId: string,
    archived: boolean,
  ) => Promise<Transaction>;
  /** يعدّل بيانات جهة اتصال؛ الحقول الغائبة تبقى كما هي. */
  editContact: (contactId: string, updates: ContactPatch) => Promise<Contact>;
  /** يحذف جهة اتصال ومعها حركاتها. يعيد عدد الحركات المحذوفة. */
  removeContact: (contactId: string) => Promise<number>;
  /** يؤرشف جهة اتصال أو يستعيدها. */
  setArchived: (contactId: string, archived: boolean) => Promise<void>;
  getContactById: (contactId: string) => ContactWithSummary | undefined;
  getContactTransactions: (contactId: string) => Transaction[];
  getContactEvents: (contactId: string) => Event[];
  getEventById: (eventId: string) => Event | undefined;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allTransactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLedgerData();
      setContacts(data.contacts);
      setEvents(data.events);
      setTransactions(data.transactions);
      setOffline(data.offline);
    } finally {
      setLoading(false);
    }
    // userId ضمن الاعتماديات حتى تُعاد القراءة عند تبديل الحساب.
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addContact = useCallback(async (input: NewContactInput) => {
    const saved = await createContact(input);
    setContacts((current) => [saved, ...current]);
    return saved;
  }, []);

  const addEvent = useCallback(async (input: NewEventInput) => {
    const saved = await createEvent(input);
    setEvents((current) => [saved, ...current]);
    return saved;
  }, []);

  const addTransaction = useCallback(async (input: NewTransactionInput) => {
    const saved = await createTransaction(input);
    setTransactions((current) => [saved, ...current]);
    return saved;
  }, []);

  const addSplitBill = useCallback(async (input: SplitBillInput) => {
    const saved = await createSplitBill(input);
    setTransactions((current) => [...saved, ...current]);
    // الأسماء الجديدة أُنشئت جهاتِ اتصال داخل المستودع، فنعيد القراءة
    // لتظهر في القوائم — إعادةٌ واحدة أرخص من تتبّع ما أُنشئ منها.
    if (input.entries.some((entry) => entry.contactId === null)) {
      await refresh();
    }
    return saved;
  }, [refresh]);

  const editTransaction = useCallback(
    async (transactionId: string, updates: TransactionPatch) => {
      const saved = await updateTransaction(transactionId, updates);
      // استبدال الصف في المصفوفة يكفي: `allWithSummary` و`totals` مشتقّان
      // منها عبر useMemo، فالأرصدة تُحسب من جديد في نفس التصيير بلا تحديث
      // يدوي ولا إعادة جلب.
      setTransactions((current) =>
        current.map((row) => (row.id === transactionId ? saved : row)),
      );
      return saved;
    },
    [],
  );

  const removeTransaction = useCallback(async (transactionId: string) => {
    await deleteTransaction(transactionId);
    setTransactions((current) =>
      current.filter((row) => row.id !== transactionId),
    );
  }, []);

  const editContact = useCallback(
    async (contactId: string, updates: ContactPatch) => {
      const saved = await updateContact(contactId, updates);
      setContacts((current) =>
        current.map((contact) => (contact.id === contactId ? saved : contact)),
      );
      return saved;
    },
    [],
  );

  const removeContact = useCallback(async (contactId: string) => {
    const { removedTransactions } = await deleteContact(contactId);

    // نُسقط الحركات والمناسبات محلياً بنفس دلالة المفاتيح الأجنبية في
    // المخطّط: cascade على الحركات، set null على مضيف المناسبة. بدونها
    // تبقى في الذاكرة حركةٌ بلا صاحب حتى أول إعادة جلب.
    setContacts((current) =>
      current.filter((contact) => contact.id !== contactId),
    );
    setTransactions((current) =>
      current.filter((row) => row.contact_id !== contactId),
    );
    setEvents((current) =>
      current.map((event) =>
        event.host_contact_id === contactId
          ? { ...event, host_contact_id: null }
          : event,
      ),
    );

    return removedTransactions;
  }, []);

  const setTransactionArchivedState = useCallback(
    async (transactionId: string, archived: boolean) => {
      const saved = await setTransactionArchived(transactionId, archived);
      setTransactions((current) =>
        current.map((row) => (row.id === transactionId ? saved : row)),
      );
      return saved;
    },
    [],
  );

  const setArchived = useCallback(
    async (contactId: string, archived: boolean) => {
      const updated = await setContactArchived(contactId, archived);
      setContacts((current) =>
        current.map((contact) =>
          contact.id === contactId ? updated : contact,
        ),
      );
    },
    [],
  );

  /** الفصل مرّة واحدة، وكل ما بعده مشتقّ منه. */
  const transactions = useMemo(
    () => allTransactions.filter((row) => !row.is_archived),
    [allTransactions],
  );

  const archivedTransactions = useMemo(
    () => allTransactions.filter((row) => row.is_archived),
    [allTransactions],
  );

  const allWithSummary = useMemo(
    () => attachSummaries(contacts, transactions),
    [contacts, transactions],
  );

  const contactsWithSummary = useMemo(
    () => allWithSummary.filter((contact) => !contact.is_archived),
    [allWithSummary],
  );

  const archivedContacts = useMemo(
    () => allWithSummary.filter((contact) => contact.is_archived),
    [allWithSummary],
  );

  const sections = useMemo(
    () => buildContactSections(contactsWithSummary),
    [contactsWithSummary],
  );

  // الإجماليات تتجاهل المؤرشفين: حساباتهم مسوّاة ولا تؤثر على الوضع الحالي.
  const activeContactIds = useMemo(
    () => new Set(contactsWithSummary.map((contact) => contact.id)),
    [contactsWithSummary],
  );

  const totals = useMemo(
    () =>
      summarize(
        transactions.filter((transaction) =>
          activeContactIds.has(transaction.contact_id),
        ),
      ),
    [transactions, activeContactIds],
  );

  const value = useMemo<LedgerContextValue>(
    () => ({
      contacts,
      events,
      transactions,
      archivedTransactions,
      contactsWithSummary,
      archivedContacts,
      sections,
      totals,
      loading,
      offline,
      refresh,
      addContact,
      addEvent,
      addTransaction,
      addSplitBill,
      editTransaction,
      removeTransaction,
      setTransactionArchivedState,
      editContact,
      removeContact,
      setArchived,
      getContactById: (contactId) =>
        allWithSummary.find((contact) => contact.id === contactId),
      getContactTransactions: (contactId) =>
        transactions
          .filter((transaction) => transaction.contact_id === contactId)
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
      getContactEvents: (contactId) => {
        const eventIds = new Set(
          transactions
            .filter((t) => t.contact_id === contactId && t.event_id)
            .map((t) => t.event_id as string),
        );
        return events.filter(
          (event) =>
            event.host_contact_id === contactId || eventIds.has(event.id),
        );
      },
      getEventById: (eventId) => events.find((event) => event.id === eventId),
    }),
    [
      contacts,
      events,
      transactions,
      archivedTransactions,
      allWithSummary,
      contactsWithSummary,
      archivedContacts,
      sections,
      totals,
      loading,
      offline,
      refresh,
      addContact,
      addEvent,
      addTransaction,
      addSplitBill,
      editTransaction,
      removeTransaction,
      setTransactionArchivedState,
      editContact,
      removeContact,
      setArchived,
    ],
  );

  return (
    <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
  );
}

export function useLedger(): LedgerContextValue {
  const context = useContext(LedgerContext);
  if (!context) {
    throw new Error('useLedger يجب أن يُستخدم داخل LedgerProvider');
  }
  return context;
}
