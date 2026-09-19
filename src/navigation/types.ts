import type { NavigatorScreenParams } from '@react-navigation/native';

import type { TransactionDirection } from '@/types';

/** تبويبات الشريط السفلي. */
export type TabParamList = {
  Home: undefined;
  Contacts: undefined;
  Events: undefined;
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
  SmartInput: undefined;
  ScanReceipt: undefined;
  /** الملف الشخصي لصاحب الحساب. */
  Profile: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
