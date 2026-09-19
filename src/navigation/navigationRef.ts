import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from '@/navigation/types';

/**
 * مرجع المتنقّل، للتنقّل من خارج الشاشات.
 *
 * `useNavigation` يقرأ سياقاً توفّره الشاشات والمتنقّلات، فلا يعمل في
 * مكوّن مركَّب بجوار `Stack.Navigator` — وهو بالضبط موضع زرّ المساعد
 * العائم. المرجع هو المخرج الرسمي لهذه الحالة، وهو مكتوب الأنواع.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
