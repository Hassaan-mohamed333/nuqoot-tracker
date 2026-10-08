import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { palette } from '@/lib/palette';
import { InviteError, joinEvent, sharingAvailable } from '@/lib/sharedEvents';
import { logStepFailure, userMessage } from '@/lib/supabaseError';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { formatInviteCode, parseInviteCode } from '@/utils/eventInvite';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type JoinRoute = RouteProp<RootStackParamList, 'JoinEvent'>;

/** الانضمام إلى مناسبة بكود أو رابط دعوة. */
export function JoinEventScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<JoinRoute>();
  const { refresh } = useLedger();

  // الكود يصل مملوءاً من الرابط؛ ويُكتب يدوياً إن لم يعمل الرابط.
  const [input, setInput] = useState(
    params?.code ? formatInviteCode(params.code) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = sharingAvailable();
  const valid = parseInviteCode(input) !== null;

  async function handleJoin() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const eventId = await joinEvent(input);
      // المناسبة صارت ظاهرة لي: نحدّث القائمة ثم نفتح دفترها.
      await refresh();
      navigation.replace('EventLedger', { eventId });
    } catch (joinError) {
      if (!(joinError instanceof InviteError)) {
        logStepFailure('الانضمام إلى مناسبة', joinError);
      }
      setError(
        joinError instanceof InviteError ? joinError.message : userMessage(joinError),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow justify-center p-6">
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
            <Users size={28} color={palette.primaryStrong} />
          </View>
          <Text className="mt-4 text-center text-title text-ink">
            الانضمام إلى مناسبة
          </Text>
          <Text className="mt-1 text-center text-caption text-ink-muted">
            الصق رابط الدعوة أو اكتب الكود الذي وصلك من صاحب المناسبة.
          </Text>
        </View>

        {!available ? (
          <View className="mt-6 rounded-2xl border border-line bg-surface p-3">
            <Text className="text-right text-xs text-ink-muted">
              المشاركة تحتاج حساباً متصلاً. سجّل الدخول بحسابك ثم أعد المحاولة.
            </Text>
          </View>
        ) : null}

        <Field
          className="mt-6"
          label="كود الدعوة أو رابطها"
          value={input}
          onChangeText={(text) => {
            setInput(text);
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="XXXX-XXXX-XXXX"
          returnKeyType="done"
          onSubmitEditing={() => void handleJoin()}
          error={error}
        />

        <Button
          className="mt-4"
          title="انضمام"
          onPress={() => void handleJoin()}
          loading={busy}
          disabled={!valid || !available}
          size="lg"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
