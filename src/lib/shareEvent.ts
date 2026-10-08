import { Platform, Share } from 'react-native';

import { inviteBaseUrl } from '@/lib/appLinks';
import { APP_NAME } from '@/lib/brand';
import { createInvite } from '@/lib/sharedEvents';
import type { Event } from '@/types';
import { buildInviteLink, buildInviteMessage } from '@/utils/eventInvite';
import { formatDate } from '@/utils/ledger';

/**
 * إرسال المناسبة للأعضاء: دعوة + رسالة جاهزة + نافذة المشاركة، في خطوة واحدة.
 *
 * ما يُرسَل هو رابط دعوة وكودها فقط، لا بيانات الدفتر: المدعوّ يرى المناسبة بعد
 * أن ينضمّ ويمرّ على صلاحيات الخادم، لا من نصّ الرسالة.
 */

/** كيف وصلت الرسالة للمستخدم، ليختار الواجهة رسالة التأكيد المناسبة. */
export type DeliveryResult =
  /** فُتحت نافذة المشاركة (واتساب، رسائل…). */
  | 'shared'
  /** نُسخت إلى الحافظة؛ يلصقها المستخدم بنفسه. */
  | 'copied'
  /** تعذّر الأمران؛ تُعرض الرسالة نصّاً ليختارها. */
  | 'shown'
  /** أغلق المستخدم نافذة المشاركة دون إرسال. */
  | 'cancelled';

interface WebShareNavigator {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/** يسلّم نصّاً للمستخدم بأفضل طريقة متاحة في المنصّة. */
export async function deliverText(message: string): Promise<DeliveryResult> {
  if (Platform.OS !== 'web') {
    try {
      const result = await Share.share({ message });
      return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
    } catch {
      return 'shown';
    }
  }

  const nav = (typeof navigator === 'undefined' ? null : navigator) as
    | WebShareNavigator
    | null;

  // متصفّحات الجوّال تفتح قائمة المشاركة الأصلية؛ سطح المكتب غالباً لا.
  if (nav?.share) {
    try {
      await nav.share({ text: message });
      return 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  if (nav?.clipboard) {
    try {
      await nav.clipboard.writeText(message);
      return 'copied';
    } catch {
      // الحافظة ممنوعة خارج تفاعل مباشر أو بلا HTTPS.
    }
  }
  return 'shown';
}

/** نصّ الدعوة الكامل لمناسبة: اسمها وتاريخها ومكانها والرابط والكود. */
export function composeInviteMessage(
  event: Pick<Event, 'title' | 'event_date' | 'location'>,
  code: string,
): { message: string; link: string } {
  const link = buildInviteLink(code, inviteBaseUrl());
  const message = buildInviteMessage({
    eventTitle: event.title,
    eventDate: formatDate(event.event_date),
    location: event.location,
    code,
    link,
    appName: APP_NAME,
  });
  return { message, link };
}

/** ينشئ دعوة ويسلّمها للمستخدم ليرسلها. للمالك فقط (الخادم يفرض ذلك). */
export async function sendEventInvite(
  event: Pick<Event, 'id' | 'title' | 'event_date' | 'location'>,
  role: 'editor' | 'viewer' = 'editor',
): Promise<{ delivery: DeliveryResult; message: string }> {
  const code = await createInvite(event.id, role);
  const { message } = composeInviteMessage(event, code);
  const delivery = await deliverText(message);
  return { delivery, message };
}
