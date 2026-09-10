import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { usePalette } from '@/store/ThemeProvider';

export type LogoVariant = 'mark' | 'badge' | 'full';
export type LogoTone = 'brand' | 'mono' | 'inverse';

interface AppLogoProps {
  /** ضلع الشعار بالبكسل. باقي الأبعاد مشتقّة منه فيبقى متناسقاً. */
  size?: number;
  variant?: LogoVariant;
  tone?: LogoTone;
  /** دخول متحرّك: للشاشة الافتتاحية وشاشة الدخول. */
  animated?: boolean;
  className?: string;
}

/**
 * الشعار: عملة تتداخل مع محفظة، وعقدة مملوءة عند التقاطع.
 *
 * الدلالة: النقوط (العملة) والدفتر (المحفظة) مرتبطان بعقدة مشتركة، وهي
 * فكرة المصروف المقسوم بين أكثر من شخص.
 */
export function AppLogo({
  size = 40,
  variant = 'badge',
  tone = 'brand',
  animated = false,
  className,
}: AppLogoProps) {
  const palette = usePalette();

  const isBadge = variant === 'badge' || variant === 'full';

  // على الخلفية المتدرّجة يكون الرسم أبيض؛ وإلا يأخذ لون النغمة.
  const glyphColor = isBadge
    ? '#FFFFFF'
    : tone === 'mono'
      ? palette.text
      : tone === 'inverse'
        ? palette.onPrimary
        : palette.primary;

  /**
   * الخلفية والرسم في عنصر SVG واحد لا اثنين متراكبين.
   *
   * الطبقة المطلقة (`position: absolute`) تُرسم فوق أشقّائها العاديين مهما
   * كان ترتيبها في الشجرة، فكانت خلفية الشارة تحجب الرسم تماماً.
   */
  const gradientId = `nuqoot-badge-${tone}`;

  const art = (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {isBadge ? (
        <>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop
                offset="0"
                stopColor={tone === 'mono' ? palette.text : palette.primary}
              />
              <Stop
                offset="1"
                stopColor={tone === 'mono' ? palette.muted : palette.secondary}
              />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="48"
            height="48"
            rx="14.4"
            fill={`url(#${gradientId})`}
          />
          {/* 9.12 = (48 − 48 × 0.62) ÷ 2، أي توسيط الرسم بعد تصغيره. */}
          <G transform="translate(9.12 9.12) scale(0.62)">
            <LogoShapes color={glyphColor} />
          </G>
        </>
      ) : (
        <LogoShapes color={glyphColor} />
      )}
    </Svg>
  );

  const body = animated ? (
    <AnimatedEntrance size={size}>{art}</AnimatedEntrance>
  ) : (
    art
  );

  if (variant !== 'full') {
    return (
      <View
        className={className}
        accessibilityRole="image"
        accessibilityLabel="نقوط">
        {body}
      </View>
    );
  }

  return (
    <View
      className={`flex-row-reverse items-center ${className ?? ''}`}
      accessibilityRole="image"
      accessibilityLabel="نقوط">
      {body}
      <View className="mr-3">
        {/* الاسم بنص React Native لا SVG: تشكيل الحروف العربية داخل
            react-native-svg غير موثوق عبر المنصّات. */}
        <Text
          style={{ fontSize: size * 0.46 }}
          className="text-right font-extrabold text-ink">
          نقوط
        </Text>
        <Text
          style={{ fontSize: size * 0.24 }}
          className="-mt-0.5 text-right font-semibold text-ink-muted">
          دفتر النقوط والواجبات
        </Text>
      </View>
    </View>
  );
}

/** أشكال الشعار داخل شبكة 48×48، تُركَّب داخل SVG الأب. */
function LogoShapes({ color }: { color: string }) {
  return (
    <>
      {/*
        العملة والمحفظة متساويتا الارتفاع ومتمركزتان كانتا تُقرآن ككبسولة
        واحدة (أشبه بمفتاح تبديل). الإزاحة القُطرية واختلاف الحجم يفصلان
        الشكلين بوضوح في الأحجام الصغيرة.
      */}

      {/* المحفظة: أعلى اليمين. */}
      <Rect
        x="20"
        y="11"
        width="22"
        height="22"
        rx="7"
        fill={color}
        fillOpacity={0.24}
      />
      <Rect
        x="20"
        y="11"
        width="22"
        height="22"
        rx="7"
        stroke={color}
        strokeWidth={2.8}
        fill="none"
      />
      {/* مشبك المحفظة. */}
      <Circle cx="36.6" cy="22" r="1.8" fill={color} />

      {/* العملة: أصغر، أسفل اليسار، بحلقة داخلية تجعلها تُقرأ نقداً. */}
      <Circle
        cx="16"
        cy="30"
        r="9"
        stroke={color}
        strokeWidth={2.8}
        fill="none"
      />
      <Circle
        cx="16"
        cy="30"
        r="3.6"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
      />

      {/* عقدة الربط عند تقاطع الشكلين: المصروف المشترك بينهما. */}
      <Circle cx="22.2" cy="23.8" r="2.9" fill={color} />
    </>
  );
}

/** دخول الشعار: تكبير نابض ثم نبضة خفيفة مستمرة على الشارة. */
function AnimatedEntrance({
  children,
  size,
}: {
  children: React.ReactNode;
  size: number;
}) {
  const scale = useSharedValue(0.72);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.quad),
    });
    // تسلسل واحد: إسناد ثانٍ إلى scale.value كان يلغي الحركة الأولى فوراً.
    scale.value = withSequence(
      withSpring(1.06, { damping: 12, stiffness: 160 }),
      withSpring(1, { damping: 14, stiffness: 180 }),
      // نبضة بطيئة بعد الاستقرار: تُبقي الشاشة الافتتاحية حيّة بلا إلهاء.
      withDelay(
        700,
        withRepeat(
          withSequence(
            withTiming(1.035, {
              duration: 1300,
              easing: Easing.inOut(Easing.quad),
            }),
            withTiming(1, {
              duration: 1300,
              easing: Easing.inOut(Easing.quad),
            }),
          ),
          -1,
          false,
        ),
      ),
    );
  }, [opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      {children}
    </Animated.View>
  );
}
