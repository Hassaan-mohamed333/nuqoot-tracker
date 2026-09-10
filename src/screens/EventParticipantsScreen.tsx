import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Check, UserPlus, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { reportError } from '@/lib/alerts';
import { fetchEventLedger, setEventParticipants } from '@/lib/repository';
import { describeSupabaseError, logStepFailure } from '@/lib/supabaseError';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { NewEventMember } from '@/types';
import { ME_LABEL } from '@/utils/split';
import { usePalette } from '@/store/ThemeProvider';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ParticipantsRoute = RouteProp<RootStackParamList, 'EventParticipants'>;

/** اختيار من يشارك في المناسبة (بمن فيهم المستخدم نفسه). */
export function EventParticipantsScreen() {
  const palette = usePalette();
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<ParticipantsRoute>();
  const { contacts } = useLedger();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeMe, setIncludeMe] = useState(true);
  /** أعضاء بأسماء حرة، خارج دفتر جهات الاتصال. */
  const [guests, setGuests] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sortedContacts = useMemo(
    () =>
      [...contacts]
        .filter((contact) => !contact.is_archived)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
    [contacts],
  );

  // نبدأ من المشاركين المحفوظين حتى يكون الحفظ تعديلاً لا استبدالاً أعمى.
  useEffect(() => {
    let active = true;
    void fetchEventLedger(params.eventId)
      .then((ledger) => {
        if (!active) return;
        setSelected(
          new Set(
            ledger.participants
              .map((row) => row.contact_id)
              .filter((id): id is string => id !== null),
          ),
        );
        setIncludeMe(
          ledger.participants.length === 0 ||
            ledger.participants.some(
              (row) => !row.contact_id && !row.display_name,
            ),
        );
        setGuests(
          ledger.participants
            .map((row) => row.display_name)
            .filter((name): name is string => Boolean(name)),
        );
      })
      .catch((error: unknown) => {
        // بلا هذا المعالج يبقى الرفض صامتاً وتظهر الشاشة فارغة بلا سبب.
        logStepFailure('تحميل مشاركي المناسبة', error);
        if (active) setLoadError(describeSupabaseError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.eventId]);

  function addGuest() {
    const name = guestDraft.trim();
    // الأسماء الحرة فريدة داخل المناسبة، فنمنع التكرار قبل الحفظ.
    if (!name || guests.includes(name)) {
      setGuestDraft('');
      return;
    }
    setGuests((current) => [...current, name]);
    setGuestDraft('');
  }

  function toggle(contactId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const members: NewEventMember[] = [
        ...(includeMe ? [{ kind: 'self' as const }] : []),
        ...[...selected].map((contactId) => ({
          kind: 'contact' as const,
          contactId,
        })),
        ...guests.map((displayName) => ({
          kind: 'guest' as const,
          displayName,
        })),
      ];
      await setEventParticipants(params.eventId, members);
      navigation.goBack();
    } catch (error) {
      reportError('تعذّر الحفظ', error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-base">
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-base">
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-28">
        <Text className="mb-2 text-right text-sm font-bold text-ink">
          من يشارك في هذه المناسبة؟
        </Text>

        {loadError ? (
          <View className="mb-3 rounded-2xl border border-danger/25 bg-danger-soft p-3">
            <Text className="text-right text-xs text-danger">
              تعذّر تحميل المشاركين الحاليين: {loadError}
            </Text>
          </View>
        ) : null}

        <View className="rounded-2xl border border-line bg-surface p-2">
          <Pressable
            onPress={() => setIncludeMe((current) => !current)}
            accessibilityRole="button"
            className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
              includeMe ? 'bg-primary/10' : ''
            }`}>
            <Text className="text-right text-sm font-semibold text-ink">
              {ME_LABEL}
            </Text>
            {includeMe ? <Check size={16} color={palette.primary} /> : null}
          </Pressable>

          {sortedContacts.length === 0 ? (
            <Text className="p-3 text-right text-xs text-ink-muted">
              لا توجد جهات اتصال نشطة.
            </Text>
          ) : (
            sortedContacts.map((contact) => (
              <Pressable
                key={contact.id}
                onPress={() => toggle(contact.id)}
                accessibilityRole="button"
                className={`mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2 ${
                  selected.has(contact.id) ? 'bg-primary/10' : ''
                }`}>
                <Text className="text-right text-sm text-ink">
                  {contact.full_name}
                </Text>
                {selected.has(contact.id) ? (
                  <Check size={16} color={palette.primary} />
                ) : null}
              </Pressable>
            ))
          )}
        </View>

        <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
          أعضاء من خارج جهات الاتصال
        </Text>
        <Text className="mb-2 text-right text-[11px] text-ink-muted">
          لرحلة أو مناسبة عابرة: أضف اسماً دون إنشاء جهة اتصال. أرصدة هؤلاء
          تبقى داخل هذه المناسبة ولا تدخل دفتر النقوط.
        </Text>

        <View className="flex-row-reverse">
          <TextInput
            value={guestDraft}
            onChangeText={setGuestDraft}
            onSubmitEditing={addGuest}
            returnKeyType="done"
            placeholder="اسم العضو"
            placeholderTextColor={palette.muted}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-right text-sm text-ink"
          />
          <Pressable
            onPress={addGuest}
            disabled={guestDraft.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="إضافة عضو"
            className={`mr-2 h-12 w-12 items-center justify-center rounded-xl ${
              guestDraft.trim().length === 0 ? 'bg-line-strong' : 'bg-primary'
            }`}>
            <UserPlus size={20} color={palette.onPrimary} />
          </Pressable>
        </View>

        {guests.length > 0 ? (
          <View className="mt-2 rounded-2xl border border-line bg-surface p-2">
            {guests.map((name) => (
              <View
                key={name}
                className="mb-1 flex-row-reverse items-center justify-between rounded-xl px-3 py-2">
                <Text className="text-right text-sm text-ink">{name}</Text>
                <Pressable
                  onPress={() =>
                    setGuests((current) => current.filter((g) => g !== name))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`إزالة ${name}`}
                  hitSlop={8}>
                  <X size={16} color={palette.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text className="mt-4 text-right text-[11px] text-ink-muted">
          المجموع: {selected.size + guests.length + (includeMe ? 1 : 0)} مشارك.
        </Text>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-line bg-surface p-4 pb-6">
        <Pressable
          onPress={() => void handleSave()}
          disabled={saving}
          accessibilityRole="button"
          className={`items-center rounded-full py-3 ${
            saving ? 'bg-line-strong' : 'bg-primary'
          }`}>
          {saving ? (
            <ActivityIndicator color={palette.onPrimary} />
          ) : (
            <Text className="text-base font-bold text-primary-fg">حفظ المشاركين</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
