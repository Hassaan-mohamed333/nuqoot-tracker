import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { fetchContactLedger, type ContactLedger } from '@/lib/repository';
import type { Contact, Transaction } from '@/types';

interface UseContactLedgerResult {
  data: ContactLedger | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** يستبدل حركة في النسخة المعروضة بعد نجاح تعديلها. */
  applyTransaction: (transaction: Transaction) => void;
  /** يُسقط حركة من النسخة المعروضة بعد نجاح حذفها. */
  dropTransaction: (transactionId: string) => void;
  /** يستبدل بيانات صاحب الدفتر بعد نجاح تعديلها. */
  applyContact: (contact: Contact) => void;
}

/**
 * يجلب سجل شخص واحد مُرشَّحاً على الخادم، ويعيد الجلب عند كل عودة إلى
 * الشاشة حتى تظهر الحركة المضافة للتوّ فور الرجوع من شاشة الإضافة.
 */
export function useContactLedger(contactId: string): UseContactLedgerResult {
  const [data, setData] = useState<ContactLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchContactLedger(contactId));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'تعذّر تحميل سجل الشخص.',
      );
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /*
   * هذه الشاشة تقرأ من استعلامها الخاص لا من مصفوفة المزوّد، فتعديلٌ
   * ناجح في المزوّد وحده لا يظهر هنا حتى إعادة الجلب التالية — والمطلوب
   * أن يتغيّر الرصيد فوراً بلا تحديث يدوي. لذا نُطبّق الصفّ العائد من
   * الكتابة على النسخة المعروضة أيضاً، فيُعاد حساب `summarize` منها.
   */

  const applyTransaction = useCallback((transaction: Transaction) => {
    setData((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.map((row) =>
              row.id === transaction.id ? transaction : row,
            ),
          }
        : current,
    );
  }, []);

  const dropTransaction = useCallback((transactionId: string) => {
    setData((current) =>
      current
        ? {
            ...current,
            transactions: current.transactions.filter(
              (row) => row.id !== transactionId,
            ),
          }
        : current,
    );
  }, []);

  const applyContact = useCallback((contact: Contact) => {
    setData((current) => (current ? { ...current, contact } : current));
  }, []);

  return {
    data,
    loading,
    error,
    refresh,
    applyTransaction,
    dropTransaction,
    applyContact,
  };
}
