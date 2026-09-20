import { Check, Plus, UserRound, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { Button, Field, SegmentedControl, Sheet } from '@/components/ui';
import {
  SPLIT_MODES,
  billableShares,
  computeSplit,
  ownShare,
  seedInputs,
  type BillSplitMode,
  type SplitInputs,
  type SplitParticipant,
} from '@/lib/billSplit';
import { palette } from '@/lib/palette';
import { sanitizeLine } from '@/lib/validation';
import type { Contact } from '@/types';
import { formatAmount } from '@/utils/ledger';
import { ME_LABEL } from '@/utils/split';

interface BillSplitSheetProps {
  visible: boolean;
  onClose: () => void;
  /** مبلغ الفاتورة الكامل. */
  amount: number;
  currency: string;
  contacts: readonly Contact[];
  /** يُستدعى عند التأكيد بالحصص النهائية (بلا حصّة المستخدم). */
  onConfirm: (entries: { contactId: string | null; name: string; amount: number }[]) => void;
  /** ما أُكّد سابقاً، لإعادة فتح الورقة على حالتها. */
  initialKeys?: readonly string[];
}

/** المستخدم نفسه: طرفٌ في الحساب بلا حركة. */
const SELF: SplitParticipant = {
  key: 'self',
  contactId: null,
  name: ME_LABEL,
  isSelf: true,
};

/**
 * ورقة تقسيم الفاتورة.
 *
 * ثلاث طرق في ورقة واحدة: بالتساوي، بالنسبة، وبمبلغ محدَّد. والمعروض
 * دائماً هو الحصّة **بالعملة** مهما كانت الطريقة — النسبة وسيلةُ إدخال
 * لا وحدةُ حساب، ومن يقسم فاتورة يريد أن يرى كم على كلٍّ لا كم بالمئة.
 */
export function BillSplitSheet({
  visible,
  onClose,
  amount,
  currency,
  contacts,
  onConfirm,
  initialKeys,
}: BillSplitSheetProps) {
  const [mode, setMode] = useState<BillSplitMode>('equal');
  const [selectedKeys, setSelectedKeys] = useState<string[]>(['self']);
  const [inputs, setInputs] = useState<SplitInputs>({});
  const [guests, setGuests] = useState<SplitParticipant[]>([]);
  const [guestName, setGuestName] = useState('');

  const available = useMemo<SplitParticipant[]>(
    () => [
      SELF,
      ...contacts.map((contact) => ({
        key: contact.id,
        contactId: contact.id,
        name: contact.full_name,
        isSelf: false,
      })),
      ...guests,
    ],
    [contacts, guests],
  );

  const participants = useMemo(
    () => available.filter((item) => selectedKeys.includes(item.key)),
    [available, selectedKeys],
  );

  // فتحٌ جديد يبدأ من اختيار سابق إن وُجد، وإلا من «أنا» وحدها.
  useEffect(() => {
    if (!visible) return;
    setSelectedKeys((current) =>
      initialKeys && initialKeys.length > 0 ? [...initialKeys] : current,
    );
  }, [visible, initialKeys]);

  // تبديل الطريقة يملأ الحقول بتوزيع متساوٍ: البدء من فراغ يجعل كل
  // تبديل عملاً يدوياً كاملاً، والبدء من متساوٍ يحتاج تعديلاً واحداً.
  useEffect(() => {
    if (mode === 'equal') return;
    setInputs(seedInputs(amount, participants, mode));
    // المشاركون بمفاتيحهم: إضافةُ شخص تعيد التوزيع، وتغيير ترتيبٍ لا.
  }, [mode, amount, participants.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(
    () => computeSplit(amount, participants, mode, inputs),
    [amount, participants, mode, inputs],
  );

  const billable = billableShares(result);
  const mine = ownShare(result);

  function toggle(key: string) {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function addGuest() {
    const name = sanitizeLine(guestName);
    if (name.length < 2) return;

    const key = `guest:${name}:${guests.length}`;
    setGuests((current) => [
      ...current,
      { key, contactId: null, name, isSelf: false },
    ]);
    setSelectedKeys((current) => [...current, key]);
    setGuestName('');
  }

  function confirm() {
    if (!result.valid || billable.length === 0) return;
    onConfirm(
      billable.map((share) => ({
        contactId: share.participant.contactId,
        name: share.participant.name,
        amount: share.amount,
      })),
    );
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="تقسيم الفاتورة مع أفراد">
      <Text className="text-right text-sm text-ink-muted">
        الفاتورة {formatAmount(amount, currency)} — اختر من تقسمها معهم.
      </Text>

      <SegmentedControl
        options={SPLIT_MODES}
        value={mode}
        onChange={setMode}
        className="mt-3"
      />

      <ScrollView className="mt-3 max-h-80" keyboardShouldPersistTaps="handled">
        {available.map((participant) => {
          const selected = selectedKeys.includes(participant.key);
          const share = result.shares.find(
            (item) => item.participant.key === participant.key,
          );

          return (
            <View
              key={participant.key}
              className="mb-2 flex-row-reverse items-center rounded-2xl border border-line bg-surface p-3">
              <PressableScale
                onPress={() => toggle(participant.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={participant.name}
                activeScale={0.95}
                className={`h-8 w-8 items-center justify-center rounded-full ${
                  selected ? 'bg-primary' : 'border border-line bg-surface'
                }`}>
                {selected ? (
                  <Check size={16} color={palette.onPrimary} />
                ) : (
                  <UserRound size={15} color={palette.subtle} />
                )}
              </PressableScale>

              <Text className="mr-3 flex-1 text-right text-base text-ink">
                {participant.name}
                {participant.isSelf ? (
                  <Text className="text-caption text-ink-subtle"> · حصّتك</Text>
                ) : null}
                {participant.contactId === null && !participant.isSelf ? (
                  <Text className="text-caption text-ink-subtle"> · جديد</Text>
                ) : null}
              </Text>

              {selected && mode !== 'equal' ? (
                <View className="w-24 flex-row-reverse items-center rounded-xl border border-line bg-surface-raised px-2">
                  <TextInput
                    value={inputs[participant.key] ?? ''}
                    onChangeText={(text) =>
                      setInputs((current) => ({
                        ...current,
                        [participant.key]: text,
                      }))
                    }
                    keyboardType="decimal-pad"
                    accessibilityLabel={`حصّة ${participant.name}`}
                    placeholderTextColor={palette.subtle}
                    className="flex-1 py-2 text-center text-sm text-ink"
                  />
                  <Text className="text-[10px] text-ink-subtle">
                    {mode === 'percent' ? '%' : currency}
                  </Text>
                </View>
              ) : selected && share ? (
                <Text className="text-sm font-bold text-primary">
                  {formatAmount(share.amount, currency)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* اسم خارج الدفتر: يُنشأ جهةَ اتصال عند الحفظ، وإلا لم تُحسب حصّته
          في رصيد أحد. */}
      <View className="mt-1 flex-row-reverse items-center">
        <Field
          value={guestName}
          onChangeText={setGuestName}
          placeholder="اسم غير مسجّل…"
          accessibilityLabel="إضافة اسم غير مسجّل"
          className="flex-1"
          onSubmitEditing={addGuest}
        />
        <PressableScale
          onPress={addGuest}
          disabled={sanitizeLine(guestName).length < 2}
          accessibilityRole="button"
          accessibilityLabel="إضافة الاسم إلى القسمة"
          activeScale={0.9}
          className={`mr-2 h-11 w-11 items-center justify-center rounded-full bg-primary ${
            sanitizeLine(guestName).length < 2 ? 'opacity-40' : ''
          }`}>
          <Plus size={18} color={palette.onPrimary} />
        </PressableScale>
      </View>

      <View className="mt-3 rounded-xl bg-surface-raised p-3">
        <View className="flex-row-reverse items-center justify-between">
          <Text className="text-right text-caption text-ink-muted">
            مجموع الحصص
          </Text>
          <Text
            className={`text-sm font-bold ${
              result.valid ? 'text-success' : 'text-danger'
            }`}>
            {formatAmount(result.total, currency)}
          </Text>
        </View>

        {mine > 0 ? (
          <Text className="mt-1 text-right text-caption text-ink-muted">
            حصّتك {formatAmount(mine, currency)} — لا تُسجَّل ديناً عليك.
          </Text>
        ) : null}

        {result.error ? (
          <Text className="mt-1 text-right text-caption text-danger">
            {result.error}
          </Text>
        ) : billable.length === 0 ? (
          <Text className="mt-1 text-right text-caption text-danger">
            اختر شخصاً آخر غيرك لتقسم معه.
          </Text>
        ) : (
          <Text className="mt-1 text-right text-caption text-ink-muted">
            ستُسجَّل {billable.length} حركة، واحدة لكل مشارك.
          </Text>
        )}
      </View>

      <View className="mt-4 flex-row-reverse">
        <Button
          title="تأكيد القسمة"
          onPress={confirm}
          disabled={!result.valid || billable.length === 0}
          block={false}
          className="flex-1"
        />
        <View className="w-3" />
        <Button
          title="إلغاء"
          variant="outline"
          onPress={onClose}
          block={false}
          className="flex-1"
          icon={<X size={14} color={palette.text} />}
        />
      </View>
    </Sheet>
  );
}
