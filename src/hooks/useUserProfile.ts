import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { fetchUserProfile, resolveProfileId } from '@/lib/repository';
import { useAuth } from '@/store/AuthProvider';
import type { UserProfile } from '@/types';

/**
 * الملف الشخصي لصاحب الحساب.
 *
 * يُعاد جلبه عند كل عودة إلى الشاشة، فتظهر الصورة المحدَّثة في الترويسة
 * فور الرجوع من شاشة الملف — بلا حالة عامّة لقيمةٍ تُقرأ في موضعين.
 */
export function useUserProfile() {
  const { userId, authDisabled } = useAuth();
  const profileId = resolveProfileId(userId, authDisabled);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await fetchUserProfile(profileId));
    } catch {
      // الترويسة تعرض أيقونة بديلة؛ لا داعي لإزعاج المستخدم بخطأ هنا.
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { profile, profileId, refresh };
}
