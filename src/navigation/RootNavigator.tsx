import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CalendarDays, Home, Users } from 'lucide-react-native';
import React from 'react';

import type { RootStackParamList, TabParamList } from '@/navigation/types';
import { AddContactScreen } from '@/screens/AddContactScreen';
import { AddEventScreen } from '@/screens/AddEventScreen';
import { AddSharedExpenseScreen } from '@/screens/AddSharedExpenseScreen';
import { AddTransactionScreen } from '@/screens/AddTransactionScreen';
import { ContactProfileScreen } from '@/screens/ContactProfileScreen';
import { ContactsListScreen } from '@/screens/ContactsListScreen';
import { EventLedgerScreen } from '@/screens/EventLedgerScreen';
import { EventParticipantsScreen } from '@/screens/EventParticipantsScreen';
import { EventsScreen } from '@/screens/EventsScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { ScanReceiptScreen } from '@/screens/ScanReceiptScreen';
import { SmartInputScreen } from '@/screens/SmartInputScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#16a34a',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 11 },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsListScreen}
        options={{
          title: 'جهات الاتصال',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Events"
        component={EventsScreen}
        options={{
          title: 'المناسبات',
          tabBarIcon: ({ color, size }) => (
            <CalendarDays size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#111827',
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
