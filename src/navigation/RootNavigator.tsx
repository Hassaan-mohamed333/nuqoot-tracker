import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CalendarDays, Home, Users } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lazyScreen } from '@/navigation/LazyScreen';
import type { RootStackParamList, TabParamList } from '@/navigation/types';
import { AddContactScreen } from '@/screens/AddContactScreen';
import { AddSharedExpenseScreen } from '@/screens/AddSharedExpenseScreen';
import { AddTransactionScreen } from '@/screens/AddTransactionScreen';
import { ContactProfileScreen } from '@/screens/ContactProfileScreen';
import { ContactsListScreen } from '@/screens/ContactsListScreen';
import { EventLedgerScreen } from '@/screens/EventLedgerScreen';
import { EventParticipantsScreen } from '@/screens/EventParticipantsScreen';
import { EventsScreen } from '@/screens/EventsScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { usePalette, useTheme } from '@/store/ThemeProvider';

/**
 * هذه الشاشات وحدها تلمس وحدات أصلية (منتقي التاريخ، الكاميرا،
 * الميكروفون، نظام الملفات)، فتُحمَّل عند فتحها لا عند إقلاع التطبيق.
 */
const AddEventScreen = lazyScreen(() =>
  import('@/screens/AddEventScreen').then((m) => ({ default: m.AddEventScreen })),
);
const SmartInputScreen = lazyScreen(() =>
  import('@/screens/SmartInputScreen').then((m) => ({
    default: m.SmartInputScreen,
  })),
);
const ScanReceiptScreen = lazyScreen(() =>
  import('@/screens/ScanReceiptScreen').then((m) => ({
    default: m.ScanReceiptScreen,
  })),
);

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/** حبّة ذهبية خلف أيقونة التبويب النشط، وشفافة فيما عداه. */
function TabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      className={`items-center justify-center rounded-full px-5 py-1 ${
        focused ? 'bg-accent' : 'bg-transparent'
      }`}>
      {children}
    </View>
  );
}

function TabsNavigator() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        /*
         * الحبّة الذهبية تُرسم داخل الأيقونة لا عبر
         * `tabBarActiveBackgroundColor`: تلك تملأ مستطيل العنصر كاملاً،
         * فتتجاوز استدارة الشريط وتظهر مربّعة عند الحافة، ومعها اختفت
         * التسميات لضيق ما تبقّى من ارتفاع.
         *
         * والتسمية النشطة حبرية لا ذهبية: الذهب على سطح فاتح تباينه
         * ‎1.4:1‎ فلا يصلح لوناً لنصّ.
         */
        tabBarActiveTintColor: palette.text,
        tabBarInactiveTintColor: palette.muted,
        /*
         * تسمية أصغر بسطر واحد: 11 مع ارتفاع 64 كانت تقصّ الكلمات
         * ("ال ئيسية" بدل "الرئيسية")، والعربية أعرض من اللاتينية.
         */
        tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
        tabBarIconStyle: { marginTop: 2 },
        /*
         * شريط عائم بشكل حبّة، لا شريطاً ملتصقاً بأسفل الشاشة: هذا شكله
         * في المرجعين معاً. كونه مطلقاً يعني أنه يغطّي أسفل المحتوى، لذا
         * تضيف شاشات التبويبات حشوة سفلية تعادل ارتفاعه.
         */
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: 16,
          marginBottom: Math.max(insets.bottom, 12),
          height: 72,
          borderRadius: 36,
          borderTopWidth: 0,
          paddingBottom: 10,
          paddingTop: 10,
          backgroundColor: palette.surface,
          shadowColor: '#101014',
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
          overflow: 'hidden',
        },
        // يمنع أي تعبئة من تجاوز استدارة الشريط العائم.
        tabBarItemStyle: { borderRadius: 26 },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon focused={focused}>
              <Home size={size} color={focused ? palette.onAccent : color} />
            </TabIcon>
          ),
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsListScreen}
        options={{
          title: 'جهات الاتصال',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon focused={focused}>
              <Users size={size} color={focused ? palette.onAccent : color} />
            </TabIcon>
          ),
        }}
      />
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{
          title: 'المناسبات',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon focused={focused}>
              <CalendarDays size={size} color={focused ? palette.onAccent : color} />
            </TabIcon>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const palette = usePalette();
  const { scheme } = useTheme();

  /**
   * سمة التنقّل تُضبط هنا أيضاً، لا في أصناف الشاشات وحدها: الخلفية بين
   * الشاشات أثناء الانتقال يرسمها المتنقّل نفسه، فتظهر وميضاً أبيض في
   * الوضع الليلي إن بقيت على القيمة الافتراضية.
   */
  const navigationTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: palette.primary,
      background: palette.base,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.text,
          contentStyle: { backgroundColor: palette.base },
        }}>
        <Stack.Screen
          name="Tabs"
          component={TabsNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ContactProfile"
          component={ContactProfileScreen}
          options={{ title: 'ملف جهة الاتصال' }}
        />
        <Stack.Screen
          name="AddTransaction"
          component={AddTransactionScreen}
          options={{ title: 'إضافة حركة', presentation: 'modal' }}
        />
        <Stack.Screen
          name="AddContact"
          component={AddContactScreen}
          options={{ title: 'جهة اتصال جديدة', presentation: 'modal' }}
        />
        <Stack.Screen
          name="AddEvent"
          component={AddEventScreen}
          options={{ title: 'مناسبة جديدة', presentation: 'modal' }}
        />
        <Stack.Screen
          name="SmartInput"
          component={SmartInputScreen}
          options={{ title: 'إدخال ذكي', presentation: 'modal' }}
        />
        <Stack.Screen
          name="ScanReceipt"
          component={ScanReceiptScreen}
          options={{ title: 'قراءة إيصال', presentation: 'modal' }}
        />
        <Stack.Screen
          name="EventLedger"
          component={EventLedgerScreen}
          options={{ title: 'دفتر المناسبة' }}
        />
        <Stack.Screen
          name="EventParticipants"
          component={EventParticipantsScreen}
          options={{ title: 'المشاركون', presentation: 'modal' }}
        />
        <Stack.Screen
          name="AddSharedExpense"
          component={AddSharedExpenseScreen}
          options={{ title: 'مصروف جماعي', presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
