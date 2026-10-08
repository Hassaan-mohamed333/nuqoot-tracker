import DateTimePicker from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { palette } from '@/lib/palette';

import { fromDateInputValue, toDateInputValue } from './dateValue';

// ما زال يُستورد من هنا في بقية التطبيق.
export { fromDateInputValue, toDateInputValue };

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

  /*
   * الويب: الحقل الأصلي ظاهراً لا شفافاً.
   *
   * كان مدخل التاريخ شفافاً فوق هيكل مرسوم. هذا يعتمد على أن المتصفّح يفتح
   * المنتقي عند الضغط على عنصر غير مرئي، ولا يفعل ذلك كل متصفّح ولا كل
   * جهاز — فبدا الحقل معطّلاً. الحقل الظاهر يعمل في كل مكان: الكتابة
   * مباشرة، وأيقونة التقويم الأصلية، ومنتقي الجوّال عند اللمس.
   */
  if (isWeb) {
    return (
      <View className={className}>
        {label ? (
          <Text className="mb-2 text-right text-sm font-bold text-ink">
            {label}
          </Text>
        ) : null}

        <View
          className={`flex-row-reverse items-center rounded-tile border bg-surface px-4 ${
            error ? 'border-danger' : 'border-line'
          }`}>
          <CalendarDays size={18} color={palette.muted} />
          <View className="flex-1">
            <WebDateInput
              value={value}
              onChange={onChange}
              max={maximumDate}
              min={minimumDate}
              label={accessibilityLabel ?? label ?? 'اختيار تاريخ'}
            />
          </View>
        </View>

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
          <Text className="text-xs font-bold text-primary-strong">تم</Text>
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
 * حقل التاريخ الأصلي للمتصفّح، ظاهراً داخل إطار الحقل.
 *
 * حجم الخط 16px صراحةً: أقلّ منه يكبّر Safari على iPhone الصفحة كلها عند
 * التركيز. والضغط يستدعي showPicker حيث يُدعم، فيفتح متصفّح الكمبيوتر
 * التقويم بدل أن يكتفي بتحديد جزء من التاريخ.
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
  return React.createElement('input', {
    type: 'date',
    'aria-label': label,
    value: value ? toDateInputValue(value) : '',
    max: max ? toDateInputValue(max) : undefined,
    min: min ? toDateInputValue(min) : undefined,
    onClick: (event: { currentTarget: { showPicker?: () => void } }) => {
      try {
        event.currentTarget.showPicker?.();
      } catch {
        // بعض المتصفّحات ترفضه خارج تفاعل مباشر: يبقى التحرير بالكتابة.
      }
    },
    onChange: (event: { target: { value: string } }) => {
      const next = fromDateInputValue(event.target.value);
      if (next) onChange(next);
    },
    style: {
      width: '100%',
      minHeight: 48,
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      padding: '12px 8px',
      margin: 0,
      color: palette.text,
      font: 'inherit',
      fontSize: 16,
      textAlign: 'right',
      direction: 'rtl',
      cursor: 'pointer',
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
