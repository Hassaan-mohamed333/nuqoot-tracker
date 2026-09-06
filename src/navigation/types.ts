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
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
