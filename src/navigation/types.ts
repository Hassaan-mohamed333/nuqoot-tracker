import type { NavigatorScreenParams } from '@react-navigation/native';

import type { TransactionDirection } from '@/types';

/** تبويبات الشريط السفلي. */
export type TabParamList = {
  Home: undefined;
  Contacts: undefined;
  /** زرّ مركزي لا شاشة: يفتح إضافة حركة. */
  Add: undefined;
  Events: undefined;
  /** تبويب يفتح نافذة المساعد لا شاشة. */
  Assistant: undefined;
};

/** المكدس الرئيسي. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  ContactProfile: { contactId: string };
  AddTransaction:
    | {
        contactId?: string;
        eventId?: string;
        /** قيم مقترحة من الإدخال الذكي أو قارئ الإيصالات، للمراجعة. */
        prefill?: {
          amount?: number;
          direction?: TransactionDirection;
          note?: string;
          receiptUri?: string;
          /** فتح ورقة تقسيم الفاتورة فور الوصول. */
          split?: boolean;
        };
      }
    | undefined;
  /** returnTo: يعود إلى شاشة الحركة ويختار ما أُنشئ للتوّ. */
  AddContact: { returnTo?: 'AddTransaction' } | undefined;
  AddEvent: { returnTo?: 'AddTransaction'; hostContactId?: string } | undefined;
  /** الدفتر الجماعي لمناسبة: المشاركون، المصاريف، ومن يدين لمن. */
  EventLedger: { eventId: string };
  AddSharedExpense: {
    eventId: string;
    /** قيم منقولة من نموذج الحركة عند التحويل إلى مصروف مشترك. */
    prefill?: { description?: string; amount?: number; receiptUri?: string };
  };
  EventParticipants: { eventId: string };
  /** أعضاء المناسبة المشتركة: الدعوة والأدوار. */
  EventMembers: { eventId: string };
  /** الانضمام بكود؛ `code` يصل مملوءاً من رابط الدعوة. */
  JoinEvent: { code?: string } | undefined;
  SmartInput: undefined;
  ScanReceipt: undefined;
  /** الملف الشخصي لصاحب الحساب. */
  Profile: undefined;
  /** الأرشيف: ما أُخرج من الدفتر ولم يُتلف. */
  Archive: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
