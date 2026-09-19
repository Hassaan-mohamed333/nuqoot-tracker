import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { palette } from '@/lib/palette';

interface DateFieldProps {
  label?: string;
  /** القيمة الحالية، أو `null` لحقل لم يُملأ بعد. */
  value: Date | null;
  onChange: (next: Date) => void;
  /** أقصى تاريخ مقبول (اليوم، لتاريخ الميلاد). */
  maximumDate?: Date;
  minimumDate?: Date;
  /** ما يُعرض حين لا قيمة. */
  placeholder?: string;
  hint?: string;
  error?: string | null;
  accessibilityLabel?: string;
  className?: string;
}

/** `YYYY-MM-DD` بالتوقيت المحلي. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * يبني تاريخاً من `YYYY-MM-DD` بالتوقيت المحلي.
 *
 * `new Date('1990-05-01')` يفسّره المحرّك على أنه UTC، فيصير ٣٠ أبريل
 * لكل من يسكن غرب غرينتش. تمرير المكوّنات منفصلةً يبني اليوم المقصود.
 */
export function fromDateInputValue(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * حقل تاريخ يعمل على الويب والهاتف معاً.
 *
 * `@react-native-community/datetimepicker` لا ينفّذ شيئاً على الويب —
 * يعيد `null` ويطبع تحذيراً — فالضغط على الحقل في المتصفّح لم يكن يفتح
 * شيئاً. لذا: على الهاتف المنتقي الأصلي، وعلى الويب `<input type="date">`
 * شفّاف فوق نفس الهيكل المرئي، فيبقى شكل الحقل واحداً على المنصّتين
 * بينما يفتح كلٌّ منهما واجهة التاريخ التي يعرفها مستخدمه.
 *
 * ولتاريخ الميلاد خاصّةً هذا فرق جوهري: منتقي الهاتف يبدأ من اليوم
 * ويحتاج عشرات التمريرات للوصول إلى سنة ميلاد، بينما حقل المتصفّح يقبل
 * كتابة السنة مباشرة.
 */
export function DateField({
  label,
  value,
  onChange,
  maximumDate,
  minimumDate,
  placeholder = 'اختر التاريخ',
  hint,
  error,
  accessibilityLabel,
  className,
}: DateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const isWeb = Platform.OS === 'web';

  const display = value ? formatGregorian(value) : placeholder;

  return (
    <View className={className}>
      {label ? (
        <Text className="mb-2 text-right text-sm font-bold text-ink">
          {label}
        </Text>
      ) : null}

      <View className="relative">
        <Pressable
          onPress={isWeb ? undefined : () => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label ?? 'اختيار تاريخ'}
          className={`flex-row-reverse items-center justify-between rounded-tile border bg-surface px-4 py-3 ${
            error ? 'border-danger' : 'border-line'
          }`}>
          <Text
            className={`text-right text-base ${
              value ? 'text-ink' : 'text-ink-subtle'
            }`}>
            {display}
          </Text>
          <CalendarDays size={18} color={palette.muted} />
        </Pressable>

        {isWeb ? (
          <WebDateInput
            value={value}
            onChange={onChange}
            max={maximumDate}
            min={minimumDate}
            label={accessibilityLabel ?? label ?? 'اختيار تاريخ'}
          />
        ) : null}
      </View>

      {showPicker && !isWeb ? (
        <DateTimePicker
          value={value ?? maximumDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(_event, selected) => {
            // أندرويد يغلق النافذة بنفسه بعد كل اختيار أو إلغاء.
            if (Platform.OS !== 'ios') setShowPicker(false);
            if (selected) onChange(selected);
          }}
        />
      ) : null}

      {showPicker && Platform.OS === 'ios' ? (
        <Pressable
          onPress={() => setShowPicker(false)}
          accessibilityRole="button"
          className="mt-1 self-start rounded-full bg-surface-raised px-4 py-1.5">
          <Text className="text-xs font-bold text-primary">تم</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text className="mt-1.5 text-right text-caption text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="mt-1.5 text-right text-caption text-ink-muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * حقل التاريخ الأصلي للمتصفّح، شفّافاً فوق الهيكل المرئي.
 *
 * شفّاف لا مخفيّ: `display:none` أو `visibility:hidden` يمنع فتح
 * المنتقي، والشفافية تُبقي العنصر قابلاً للنقر ولقارئ الشاشة معاً.
 */
function WebDateInput({
  value,
  onChange,
  max,
  min,
  label,
}: {
  value: Date | null;
  onChange: (next: Date) => void;
  max?: Date;
  min?: Date;
  label: string;
}) {
  // عنصر DOM خام داخل شجرة react-native-web: RNW يصيّر عناصر HTML
  // حقيقية، فالـ input يجد موضعه الطبيعي بينها.
  return React.createElement('input', {
    type: 'date',
    'aria-label': label,
    value: value ? toDateInputValue(value) : '',
    max: max ? toDateInputValue(max) : undefined,
    min: min ? toDateInputValue(min) : undefined,
    onChange: (event: { target: { value: string } }) => {
      const next = fromDateInputValue(event.target.value);
      if (next) onChange(next);
    },
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      opacity: 0,
      border: 'none',
      padding: 0,
      margin: 0,
      cursor: 'pointer',
      // الخط يتبع الصفحة حتى لا يوسّع المتصفّح العنصر عن الهيكل تحته.
      font: 'inherit',
    },
  });
}

const GREGORIAN = new Intl.DateTimeFormat('ar-EG', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatGregorian(date: Date): string {
  return GREGORIAN.format(date);
}
