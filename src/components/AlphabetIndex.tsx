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
  // الحروف الموجودة فعلاً فقط: عمود من أربعين حرفاً أغلبها باهت كان يطول
  // على الشاشة ويزاحم الكروت، ولا يُقفز إلى الباهت أصلاً.
  const visibleLetters = letters.filter((letter) => active.has(letter));

  return (
    <View className="w-6 items-center justify-center py-2">
      {visibleLetters.map((letter) => {
        const isActive = active.has(letter);
        const isSelected = selectedLetter === letter;

        return (
          <Pressable
            key={letter}
            disabled={!isActive}
            onPress={() => onSelectLetter(letter)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`الانتقال إلى حرف ${letter}`}
            className="min-w-[24px] items-center py-[2px]">
            <Text
              className={
                isSelected
                  ? 'text-caption font-bold text-primary-strong'
                  : isActive
                    ? 'text-caption font-semibold text-ink'
                    : 'text-caption text-ink-subtle'
              }>
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
