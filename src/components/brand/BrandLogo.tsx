import React from 'react';
import { Image, View } from 'react-native';

import { APP_NAME } from '@/lib/brand';

/** نسبة عرض الصورة إلى ارتفاعها (1231 × 779 بعد القص). */
const ASPECT = 1231 / 779;

interface BrandLogoProps {
  /** عرض الشعار بالبكسل. الارتفاع يُحسب من نسبة الصورة. */
  width?: number;
  /** نص بديل لقارئات الشاشة. */
  label?: string;
  className?: string;
}

/** شعار "الكراسة الصفرا" كصورة. الخلفية شفافة فيصلح على السمتين. */
export function BrandLogo({
  width = 160,
  label = APP_NAME,
  className,
}: BrandLogoProps) {
  return (
    <View
      className={className}
      accessibilityRole="image"
      accessibilityLabel={label}>
      <Image
        source={require('../../../assets/logo.png')}
        style={{ width, height: width / ASPECT }}
        resizeMode="contain"
      />
    </View>
  );
}
