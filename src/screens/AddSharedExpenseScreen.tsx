import type { RouteProp } from '@react-navigation/native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CloudOff, TriangleAlert, UserPlus } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { BalanceBar, FadeSlideIn } from '@/components/motion';
import {
  Button,
  Card,
  CheckRow,
  Field,
  RadioRow,
  Screen,
  SectionTitle,
  SegmentedControl,
} from '@/components/ui';
import { reportError } from '@/lib/alerts';
import { palette } from '@/lib/palette';
import type { EventLedger } from '@/lib/repository';
import { createSharedExpense, fetchEventLedger } from '@/lib/repository';
import { logStepFailure, userMessage } from '@/lib/supabaseError';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import type { EventParticipant, SplitMode } from '@/types';
import { DEFAULT_CURRENCY, formatAmount } from '@/utils/ledger';
import { participantName, sharesMatchAmount, splitEqually } from '@/utils/split';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type ExpenseRoute = RouteProp<RootStackParamList, 'AddSharedExpense'>;

const SPLIT_MODES = [
  { value: 'equal' as const, label: 'بالتساوي' },
  { value: 'custom' as const, label: 'حصص مخصّصة' },
];

/** تسجيل مصروف جماعي وتقسيمه بالتساوي أو بحصص مخصّصة. */
export function AddSharedExpenseScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<ExpenseRoute>();
  const { contacts } = useLedger();

  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** الدفتر جاء من النسخة المحلية لتعذّر الوصول للخادم. */
  const [offline, setOffline] = useState(false);
  // قيم منقولة من نموذج الحركة عند التحويل إلى مصروف مشترك.
  const [description, setDescription] = useState(
    params.prefill?.description ?? '',
  );
  const [amount, setAmount] = useState(
    params.prefill?.amount !== undefined ? String(params.prefill.amount) : '',
  );
  const [payerId, setPayerId] = useState<string>('');
  const [mode, setMode] = useState<SplitMode>('equal');
  const [includedKeys, setIncludedKeys] = useState<Set<string>>(new Set());
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const contactNames = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.full_name])),
    [contacts],
  );

  const nameOf = (participant: EventParticipant) =>
    participantName(participant, contactNames);

  /** أعضاء آخر تحميل، للتمييز بين من استُبعد يدوياً ومن استجدّ. */
  const knownIds = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);

  const applyLedger = useCallback((ledger: EventLedger) => {
    const rows = ledger.participants;
    const ids = rows.map((row) => row.id);
    setParticipants(rows);
    setOffline(ledger.offline);

    setIncludedKeys((current) => {
      // أول تحميل: الجميع مشاركون في هذا المصروف.
      if (!hydrated.current) return new Set(ids);
      // إعادة تحميل (بعد إضافة أعضاء مثلاً): نحافظ على استبعاد المستخدم
      // اليدوي، ونضمّ من استجدّ فقط بدل إعادة الضبط فوق تعديلاته.
      const next = new Set(ids.filter((id) => current.has(id)));
      ids.forEach((id) => {
        if (!knownIds.current.has(id)) next.add(id);
      });
      return next;
    });

    setPayerId((current) => {
      if (current && ids.includes(current)) return current;
      // الدافع الافتراضي: المستخدم نفسه إن كان ضمن الأعضاء.
      const self = rows.find((row) => !row.contact_id && !row.display_name);
      return self?.id ?? ids[0] ?? '';
    });

    knownIds.current = new Set(ids);
    hydrated.current = true;
  }, []);

  // useFocusEffect لا useEffect: العودة من شاشة المشاركين تعيد التحميل،
  // وإلا بقيت القائمة فارغة بعد إضافة الأعضاء للتوّ.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const ledger = await fetchEventLedger(params.eventId);
          if (!active) return;
          applyLedger(ledger);
          setLoadError(null);
        } catch (error) {
          // لا نترك الرفض بلا معالجة: الشاشة تبقى قابلة للاستخدام والسبب يظهر.
          logStepFailure('تحميل مشاركي المناسبة', error);
          if (active) setLoadError(userMessage(error));
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [params.eventId, applyLedger]),
  );

  const hasParticipants = participants.length > 0;

  const parsedAmount = Number(amount.replace(',', '.'));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const includedList = useMemo(
    () => participants.filter((row) => includedKeys.has(row.id)),
    [participants, includedKeys],
  );

  /** الحصص النهائية حسب الوضع المختار. */
  const shares = useMemo(() => {
    if (!amountValid || includedList.length === 0) return [];

    if (mode === 'equal') {
      const amounts = splitEqually(parsedAmount, includedList.length);
      return includedList.map((member, index) => ({
        participant_id: member.id,
        share_amount: amounts[index],
      }));
    }

    return includedList.map((member) => ({
      participant_id: member.id,
      share_amount: Number((customShares[member.id] ?? '').replace(',', '.')),
    }));
  }, [amountValid, includedList, mode, parsedAmount, customShares]);

  /** الحصة لكل مشارك، لعرضها بجانب اسمه بلا إعادة حساب في كل صف. */
  const shareByParticipant = useMemo(
    () =>
      new Map(shares.map((share) => [share.participant_id, share.share_amount])),
    [shares],
  );

  const sharesTotal = shares.reduce(
    (sum, share) =>
      sum + (Number.isFinite(share.share_amount) ? share.share_amount : 0),
    0,
  );
  const sharesValid =
    shares.length > 0 &&
    shares.every(
      (share) => Number.isFinite(share.share_amount) && share.share_amount >= 0,
    ) &&
    sharesMatchAmount(shares, parsedAmount);

  const isValid =
    description.trim().length > 0 && amountValid && sharesValid && payerId !== '';

  function toggleIncluded(key: string) {
    setIncludedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** يملأ الحصص المخصّصة بقيم التقسيم بالتساوي كنقطة بداية. */
  function seedCustomFromEqual() {
    if (!amountValid || includedList.length === 0) return;
    const amounts = splitEqually(parsedAmount, includedList.length);
    const seeded: Record<string, string> = {};
    includedList.forEach((member, index) => {
      seeded[member.id] = String(amounts[index]);
    });
    setCustomShares(seeded);
  }

  async function handleSave() {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await createSharedExpense({
        event_id: params.eventId,
        payer_participant_id: payerId,
        description,
        amount: parsedAmount,
        currency: DEFAULT_CURRENCY,
        shares,
      });
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
    <Screen
      footer={
        <Button
          title="حفظ المصروف"
          onPress={() => void handleSave()}
          disabled={!isValid}
          loading={saving}
          size="lg"
        />
      }>
      <FadeSlideIn index={0}>
        <Field
          label="الوصف"
          value={description}
          onChangeText={setDescription}
          placeholder="مثال: عشاء المطعم"
        />
      </FadeSlideIn>

      <FadeSlideIn index={1} className="mt-6">
        <Field
          label="المبلغ الإجمالي"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          emphasis
        />
      </FadeSlideIn>

      {loadError ? (
        <Card variant="danger" className="mt-6" padded={false} animate={false}>
          <View className="flex-row-reverse items-center p-3">
            <TriangleAlert size={16} color={palette.danger} />
            <Text className="mr-2 flex-1 text-right text-caption text-danger">
              تعذّر تحميل المشاركين: {loadError}
            </Text>
          </View>
        </Card>
      ) : null}

      {offline ? (
        <Card
          variant="warning"
          className="mt-6"
          padded={false}
          animate={false}>
          <View className="flex-row-reverse items-center p-3">
            <CloudOff size={16} color={palette.warning} />
            <Text className="mr-2 flex-1 text-right text-caption text-ink-muted">
              نسخة محلية: تعذّر الوصول للخادم، والاختيار يجري على آخر قائمة
              مشاركين محفوظة على الجهاز.
            </Text>
          </View>
        </Card>
      ) : null}

      {hasParticipants ? (
        <>
          <FadeSlideIn index={2} className="mt-6">
            <SectionTitle>من دفع؟</SectionTitle>
            <Card
              variant="panel"
              padded={false}
              animate={false}
              className="p-2">
              {participants.map((row) => (
                <RadioRow
                  key={row.id}
                  label={nameOf(row)}
                  selected={payerId === row.id}
                  onSelect={() => setPayerId(row.id)}
                />
              ))}
            </Card>
          </FadeSlideIn>

          <FadeSlideIn index={3} className="mt-6">
            <SectionTitle>طريقة القسمة</SectionTitle>
            <SegmentedControl
              options={SPLIT_MODES}
              value={mode}
              onChange={(next) => {
                setMode(next);
                if (next === 'custom') seedCustomFromEqual();
              }}
            />
          </FadeSlideIn>

          <FadeSlideIn index={4} className="mt-6">
            <SectionTitle>على من تُقسم؟</SectionTitle>
            <Card
              variant="panel"
              padded={false}
              animate={false}
              className="p-2">
              {participants.map((row) => {
                const included = includedKeys.has(row.id);
                const share = shareByParticipant.get(row.id);

                return (
                  <CheckRow
                    key={row.id}
                    label={nameOf(row)}
                    checked={included}
                    onToggle={() => toggleIncluded(row.id)}
                    trailing={
                      included && mode === 'custom' ? (
                        <TextInput
                          value={customShares[row.id] ?? ''}
                          onChangeText={(value) =>
                            setCustomShares((current) => ({
                              ...current,
                              [row.id]: value,
                            }))
                          }
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={palette.muted}
                          className="w-24 rounded-xl border border-line bg-surface px-2 py-1.5 text-right text-body text-ink"
                        />
                      ) : included && share !== undefined ? (
                        <Text className="text-body font-bold text-ink">
                          {formatAmount(share, DEFAULT_CURRENCY)}
                        </Text>
                      ) : null
                    }
                  />
                );
              })}
            </Card>

            {/* شريط المطابقة: يُظهر بُعد مجموع الحصص عن المبلغ بلا حساب ذهني. */}
            {amountValid && shares.length > 0 ? (
              <View className="mt-3">
                <BalanceBar
                  ratio={parsedAmount === 0 ? 0 : sharesTotal / parsedAmount}
                  color={sharesValid ? palette.success : palette.danger}
                  trackColor={palette.border}
                />
                <Text
                  className={`mt-1.5 text-right text-caption ${
                    sharesValid ? 'text-ink-muted' : 'text-danger'
                  }`}>
                  مجموع الحصص {formatAmount(sharesTotal, DEFAULT_CURRENCY)} من{' '}
                  {formatAmount(parsedAmount, DEFAULT_CURRENCY)}
                  {sharesValid ? '' : ' — يجب أن يتطابقا.'}
                </Text>
              </View>
            ) : null}
          </FadeSlideIn>
        </>
      ) : (
        <FadeSlideIn index={2} className="mt-6">
          <Card variant="surface" animate={false}>
            <Text className="text-right text-body font-bold text-ink">
              لا يوجد مشاركون في هذه المناسبة بعد
            </Text>
            <Text className="mt-1 text-right text-caption text-ink-muted">
              المصروف الجماعي يُقسَّم على أعضاء المناسبة، فأضِف الأعضاء أولاً —
              من جهات الاتصال أو بأسماء حرة لمن ليس في الدفتر.
            </Text>
            <Button
              title="إضافة مشاركين"
              className="mt-3"
              icon={<UserPlus size={16} color={palette.onPrimary} />}
              onPress={() =>
                navigation.navigate('EventParticipants', {
                  eventId: params.eventId,
                })
              }
            />
          </Card>
        </FadeSlideIn>
      )}
    </Screen>
  );
}
