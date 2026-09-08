import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { fetchContactLedger, type ContactLedger } from '@/lib/repository';

interface UseContactLedgerResult {
  data: ContactLedger | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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

  return { data, loading, error, refresh };
}
