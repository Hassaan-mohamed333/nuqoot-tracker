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
  createTransaction,
  fetchLedgerData,
  setContactArchived,
} from '@/lib/repository';
import { useAuth } from '@/store/AuthProvider';
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
  transactions: Transaction[];
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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
