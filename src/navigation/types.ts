import type { NavigatorScreenParams } from '@react-navigation/native';

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
  AddTransaction: { contactId?: string; eventId?: string } | undefined;
  /** returnTo: يعود إلى شاشة الحركة ويختار ما أُنشئ للتوّ. */
  AddContact: { returnTo?: 'AddTransaction' } | undefined;
  AddEvent: { returnTo?: 'AddTransaction'; hostContactId?: string } | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
