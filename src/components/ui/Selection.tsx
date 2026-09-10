import React from 'react';
import { Text, View } from 'react-native';

import { AnimatedCheck, PressableScale } from '@/components/motion';
import { usePalette } from '@/store/ThemeProvider';

interface CheckRowProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** نص ثانوي على يسار الصف: مبلغ الحصة مثلاً. */
  trailing?: React.ReactNode;
  /** وصف صغير تحت الاسم. */
  caption?: string;
  disabled?: boolean;
}

/** صف اختيار بمربّع متحرّك: لتحديد المشاركين في مصروف مشترك. */
export function CheckRow({
  label,
  checked,
  onToggle,
  trailing,
  caption,
  disabled = false,
}: CheckRowProps) {
  const palette = usePalette();

  return (
    <PressableScale
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      activeScale={0.985}
      className={`mb-1 flex-row-reverse items-center rounded-tile px-3 py-2.5 ${
        checked ? 'bg-primary/10' : 'bg-transparent'
      } ${disabled ? 'opacity-45' : ''}`}>
      <AnimatedCheck
        checked={checked}
        activeColor={palette.primary}
        inactiveColor={palette.border}
        markColor={palette.onPrimary}
      />
      <View className="mr-3 flex-1">
        <Text className="text-right text-body font-semibold text-ink">
          {label}
        </Text>
        {caption ? (
          <Text className="text-right text-caption text-ink-muted">
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing}
    </PressableScale>
  );
}

interface RadioRowProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
  caption?: string;
  trailing?: React.ReactNode;
}

/** صف اختيار مفرد: لاختيار الدافع أو جهة الاتصال. */
export function RadioRow({
  label,
  selected,
  onSelect,
  caption,
  trailing,
}: RadioRowProps) {
  return (
    <PressableScale
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      activeScale={0.985}
      className={`mb-1 flex-row-reverse items-center rounded-tile px-3 py-2.5 ${
        selected ? 'bg-primary/10' : 'bg-transparent'
      }`}>
      <View
        className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
          selected ? 'border-primary' : 'border-line-strong'
        }`}>
        {selected ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
      </View>
      <View className="mr-3 flex-1">
        <Text className="text-right text-body font-semibold text-ink">
          {label}
        </Text>
        {caption ? (
          <Text className="text-right text-caption text-ink-muted">
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing}
    </PressableScale>
  );
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}

/** مبدّل شرائح: لطريقة القسمة واتجاه الحركة. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <View
      className={`flex-row-reverse rounded-full bg-surface-raised p-1 ${
        className ?? ''
      }`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <PressableScale
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            activeScale={0.97}
            className={`flex-1 items-center rounded-full py-2.5 ${
              active ? 'bg-primary' : 'bg-transparent'
            }`}>
            <Text
              className={`text-xs font-bold ${
                active ? 'text-primary-fg' : 'text-ink-muted'
              }`}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
