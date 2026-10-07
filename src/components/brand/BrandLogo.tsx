import React from 'react';
import { Image, View } from 'react-native';

/** نسبة عرض الصورة إلى ارتفاعها (1231 × 779 بعد القص). */
const ASPECT = 1231 / 779;

interface BrandLogoProps {
  /** عرض الشعار بالبكسل. الارتفاع يُحسب من نسبة الصورة. */
  width?: number;
  className?: string;
}

/** شعار "الكراسة الصفرا" كصورة. الخلفية شفافة فيصلح على السمتين. */
export function BrandLogo({ width = 160, className }: BrandLogoProps) {
  return (
    <View
      className={className}
      accessibilityRole="image"
      accessibilityLabel="الكراسة الصفرا">
      <Image
        source={require('../../../assets/logo.png')}
        style={{ width, height: width / ASPECT }}
        resizeMode="contain"
      />
    </View>
  );
}
