import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface AlphabetIndexProps {
  /** الحروف المتاحة فعلياً في القائمة (تظهر بلون داكن). */
  activeLetters: string[];
  /** كل الحروف المعروضة في الشريط بالترتيب. */
  letters: string[];
  selectedLetter?: string | null;
  onSelectLetter: (letter: string) => void;
}

/**
 * الفهرس الأبجدي الجانبي (A-Z / ا-ي) للقفز السريع داخل قائمة جهات الاتصال.
 * الحروف غير الموجودة في القائمة تظهر باهتة وغير قابلة للضغط.
 */
export function AlphabetIndex({
  activeLetters,
  letters,
  selectedLetter,
  onSelectLetter,
}: AlphabetIndexProps) {
  const active = new Set(activeLetters);

  return (
    <View className="w-6 items-center justify-center py-2">
      {letters.map((letter) => {
        const isActive = active.has(letter);
        const isSelected = selectedLetter === letter;

        return (
          <Pressable
            key={letter}
            disabled={!isActive}
            onPress={() => onSelectLetter(letter)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`الانتقال إلى حرف ${letter}`}
            className="py-[1px]">
            <Text
              className={
                isSelected
                  ? 'text-[11px] font-bold text-primary-strong'
                  : isActive
                    ? 'text-[11px] font-semibold text-ink'
                    : 'text-[11px] text-ink-subtle'
              }>
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
