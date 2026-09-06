import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createTransaction, fetchLedgerData } from '@/lib/repository';
import type {
  Contact,
  ContactSection,
  ContactWithSummary,
  Event,
  LedgerSummary,
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
  /** جهات الاتصال مع ملخص كل واحدة. */
  contactsWithSummary: ContactWithSummary[];
  /** أقسام مرتبة أبجدياً لعرضها في SectionList. */
  sections: ContactSection[];
  /** الملخص الإجمالي لكل الحركات. */
  totals: LedgerSummary;
  loading: boolean;
  /** true عندما تكون البيانات محلية (Supabase غير مُعدّ أو غير متاح). */
  offline: boolean;
  refresh: () => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<Transaction>;
  getContactById: (contactId: string) => ContactWithSummary | undefined;
  getContactTransactions: (contactId: string) => Transaction[];
  getContactEvents: (contactId: string) => Event[];
  getEventById: (eventId: string) => Event | undefined;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addTransaction = useCallback(async (input: NewTransactionInput) => {
    const saved = await createTransaction(input);
    setTransactions((current) => [saved, ...current]);
    return saved;
  }, []);

  const contactsWithSummary = useMemo(
    () => attachSummaries(contacts, transactions),
    [contacts, transactions],
  );

  const sections = useMemo(
    () => buildContactSections(contactsWithSummary),
    [contactsWithSummary],
  );

  const totals = useMemo(() => summarize(transactions), [transactions]);

  const value = useMemo<LedgerContextValue>(
    () => ({
      contacts,
      events,
      transactions,
      contactsWithSummary,
      sections,
      totals,
      loading,
      offline,
      refresh,
      addTransaction,
      getContactById: (contactId) =>
        contactsWithSummary.find((contact) => contact.id === contactId),
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
      contactsWithSummary,
      sections,
      totals,
      loading,
      offline,
      refresh,
      addTransaction,
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
