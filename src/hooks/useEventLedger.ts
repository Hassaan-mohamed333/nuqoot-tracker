import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { fetchEventLedger, type EventLedger } from '@/lib/repository';

interface UseEventLedgerResult {
  data: EventLedger | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** يجلب دفتر المناسبة الجماعي، ويعيد الجلب عند كل عودة إلى الشاشة. */
export function useEventLedger(eventId: string): UseEventLedgerResult {
  const [data, setData] = useState<EventLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchEventLedger(eventId));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'تعذّر تحميل دفتر المناسبة.',
      );
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { data, loading, error, refresh };
}
