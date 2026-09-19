import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Button, Field, Sheet, SegmentedControl } from '@/components/ui';
import { reportError } from '@/lib/alerts';
import { palette } from '@/lib/palette';
import type { TransactionPatch } from '@/lib/validateEntities';
import type { Transaction, TransactionDirection } from '@/types';
import { formatDate } from '@/utils/ledger';

interface TransactionEditSheetProps {
  /** الحركة المطلوب تعديلها؛ `null` يُبقي الورقة مغلقة. */
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (
    transactionId: string,
    updates: TransactionPatch,
  ) => Promise<unknown>;
}

const DIRECTION_OPTIONS: ReadonlyArray<{
  value: TransactionDirection;
  label: string;
}> = [
  { value: 'OUT', label: 'دفعت' },
  { value: 'IN', label: 'استلمت' },
];

/**
 * ورقة تعديل حركة: المبلغ، الاتجاه، التاريخ، والملاحظة.
 *
 * تُرسل الحقول المتغيّرة وحدها لا الصف كاملاً. الفرق ليس تجميلاً: إرسال
 * الصف كاملاً يعني أن تعديل المبلغ يكتب فوق ملاحظةٍ عدّلها جهاز آخر في
 * الأثناء، بينما الحمولة الجزئية تترك ما لم يُمَسّ كما هو.
 */
export function TransactionEditSheet({
  transaction,
  onClose,
  onSave,
}: TransactionEditSheetProps) {
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<TransactionDirection>('OUT');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // الحقول تُملأ من الحركة عند كل فتح: الورقة تبقى مركّبة بين الفتحات،
  // فبلا هذا يرى المستخدم بيانات الحركة السابقة في المرّة التالية.
  useEffect(() => {
    if (!transaction) return;
    setAmount(String(transaction.amount));
    setDirection(transaction.direction);
    setNote(transaction.note ?? '');
    setOccurredAt(new Date(transaction.occurred_at));
    setShowPicker(false);
  }, [transaction]);

  const parsedAmount = Number(amount.replace(',', '.'));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleSave() {
    if (!transaction || !amountValid || saving) return;

    // لا نرسل إلا ما تغيّر فعلاً. حمولة فارغة يرفضها المتحقّق، فنغلق
    // الورقة بلا نداء بدل أن نُظهر خطأً على «حفظ» بلا تعديل.
    const updates: TransactionPatch = {};
    if (parsedAmount !== transaction.amount) updates.amount = parsedAmount;
    if (direction !== transaction.direction) updates.direction = direction;

    const nextNote = note.trim() || null;
    if (nextNote !== (transaction.note ?? null)) updates.note = nextNote;

    const nextDate = occurredAt.toISOString();
    if (nextDate !== transaction.occurred_at) updates.occurred_at = nextDate;

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await onSave(transaction.id, updates);
      onClose();
    } catch (error) {
      reportError('تعذّر حفظ التعديل', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={transaction !== null}
      onClose={onClose}
      title="تعديل الحركة"
      dismissable={!saving}>
      <SegmentedControl
        options={DIRECTION_OPTIONS}
        value={direction}
        onChange={setDirection}
      />

      <Field
        label="المبلغ"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        emphasis
        className="mt-4"
        error={amount.length > 0 && !amountValid ? 'أدخل مبلغاً أكبر من صفر.' : null}
      />

      <Text className="mb-2 mt-4 text-right text-sm font-bold text-ink">
        التاريخ
      </Text>
      <Pressable
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel="تغيير تاريخ الحركة"
        className="flex-row-reverse items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
        <Text className="text-right text-base text-ink">
          {formatDate(occurredAt.toISOString())}
        </Text>
        <CalendarDays size={18} color={palette.muted} />
      </Pressable>

      {showPicker ? (
        <DateTimePicker
          value={occurredAt}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_event, selected) => {
            // أندرويد يغلق النافذة بنفسه بعد كل اختيار أو إلغاء.
            if (Platform.OS !== 'ios') setShowPicker(false);
            if (selected) setOccurredAt(selected);
          }}
        />
      ) : null}

      <Field
        label="الوصف"
        value={note}
        onChangeText={setNote}
        placeholder="ملاحظة اختيارية"
        multiline
        className="mt-4"
      />

      <View className="mt-5 flex-row-reverse">
        <Button
          title="حفظ"
          onPress={() => void handleSave()}
          disabled={!amountValid}
          loading={saving}
          block={false}
          className="flex-1"
        />
        <View className="w-3" />
        <Button
          title="إلغاء"
          variant="outline"
          onPress={onClose}
          disabled={saving}
          block={false}
          className="flex-1"
        />
      </View>
    </Sheet>
  );
}
