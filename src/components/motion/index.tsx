import React, { useEffect } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// الاستيراد يسجّل مكوّنات Reanimated لدى NativeWind كأثر جانبي، وبدونه
// يُهمَل `className` على كل عنصر متحرّك بصمت.
import { AnimatedPressable } from './animated';

/** إيقاع موحّد: كل الحركات القصيرة في التطبيق تستخدم هذه القيم. */
export const MOTION = {
  /** تأخير كل عنصر عن سابقه في الدخول المتتابع. */
  stagger: 55,
  /** أقصى تأخير: بعده تدخل العناصر معاً حتى لا تنتظر القوائم الطويلة. */
  staggerCap: 420,
  duration: 260,
  spring: { damping: 16, stiffness: 190, mass: 0.6 },
  easing: Easing.out(Easing.cubic),
} as const;

/** تأخير الدخول لعنصر في الترتيب `index`، بسقف يمنع القوائم من التباطؤ. */
export function staggerDelay(index: number): number {
  return Math.min(index * MOTION.stagger, MOTION.staggerCap);
}

interface FadeSlideInProps {
  children: React.ReactNode;
  /** ترتيب العنصر داخل القائمة، لحساب التأخير. */
  index?: number;
  /** تأخير إضافي بالمللي ثانية فوق تأخير الترتيب. */
  delay?: number;
  className?: string;
  style?: ViewStyle;
}

/**
 * دخول العنصر: تلاشٍ مع انزلاق من الأسفل، متتابع حسب الترتيب.
 *
 * `LinearTransition` تجعل إعادة الترتيب أو الحذف ينزلق بدل أن يقفز.
 */
export function FadeSlideIn({
  children,
  index = 0,
  delay = 0,
  className,
  style,
}: FadeSlideInProps) {
  const reduced = useReducedMotion();

  // احترام إعداد "تقليل الحركة": الحركة تُلغى ولا يختفي المحتوى.
  if (reduced) {
    return (
      <View className={className} style={style}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View
      className={className}
      style={style}
      entering={FadeInDown.duration(MOTION.duration)
        .delay(staggerDelay(index) + delay)
        .easing(MOTION.easing)}
      layout={LinearTransition.springify().damping(18)}>
      {children}
    </Animated.View>
  );
}

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  /** مقدار الانكماش عند الضغط. الأزرار الكبيرة تحتاج أقل. */
  activeScale?: number;
  /** خفض الشفافية مع الضغط، للعناصر التي لا يظهر تكبيرها. */
  dimOnPress?: boolean;
}

/**
 * ضغطة ملموسة: انكماش نابض عند اللمس.
 *
 * الحركة على خيط الواجهة (Reanimated) فلا تتأثر بانشغال خيط جافاسكربت
 * أثناء الحفظ أو جلب البيانات.
 */
export function PressableScale({
  children,
  className,
  style,
  activeScale = 0.96,
  dimOnPress = false,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduced
          ? 1
          : withSpring(1 - pressed.value * (1 - activeScale), MOTION.spring),
      },
    ],
    opacity: dimOnPress ? withTiming(1 - pressed.value * 0.35) : 1,
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      className={className}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        pressed.value = 1;
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = 0;
        onPressOut?.(event);
      }}>
      {children}
    </AnimatedPressable>
  );
}

interface BalanceBarProps {
  /** نسبة الامتلاء من 0 إلى 1. */
  ratio: number;
  /** لون الامتلاء (قيمة لونية صريحة، لأن العرض يُحرَّك برمجياً). */
  color: string;
  trackColor: string;
  height?: number;
  /** تأخير الدخول، لتتابع الأشرطة داخل قائمة. */
  delay?: number;
}

/**
 * شريط نسبة متحرّك لتفصيل الأرصدة.
 *
 * العرض بنسبة مئوية لا بالبكسل، فلا يحتاج قياس التخطيط ويعمل قبل أول رسم.
 */
export function BalanceBar({
  ratio,
  color,
  trackColor,
  height = 8,
  delay = 0,
}: BalanceBarProps) {
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));

  useEffect(() => {
    progress.value = reduced
      ? target
      : withTiming(target, { duration: 620, easing: MOTION.easing });
  }, [progress, target, reduced]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={{ height, borderRadius: height, backgroundColor: trackColor }}
      className="w-full overflow-hidden">
      <Animated.View
        entering={FadeInDown.duration(MOTION.duration).delay(delay)}
        style={[
          { height, borderRadius: height, backgroundColor: color },
          fillStyle,
        ]}
      />
    </View>
  );
}

interface AnimatedCheckProps {
  checked: boolean;
  size?: number;
  activeColor: string;
  inactiveColor: string;
  /** لون علامة الصح داخل المربّع. */
  markColor: string;
}

/**
 * مربّع اختيار متحرّك: تعبئة متدرّجة اللون وعلامة صح تنبض عند التفعيل.
 *
 * الحالة تُشتق من `checked` مباشرة فلا تنفصل الحركة عن الحالة الحقيقية
 * عند إعادة الرسم من الأعلى.
 */
export function AnimatedCheck({
  checked,
  size = 22,
  activeColor,
  inactiveColor,
  markColor,
}: AnimatedCheckProps) {
  const progress = useSharedValue(checked ? 1 : 0);
  const reduced = useReducedMotion();

  useEffect(() => {
    progress.value = reduced
      ? checked
        ? 1
        : 0
      : withTiming(checked ? 1 : 0, { duration: 180, easing: MOTION.easing });
  }, [checked, progress, reduced]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(0,0,0,0)', activeColor],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [inactiveColor, activeColor],
    ),
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.6 + progress.value * 0.4 }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          borderWidth: 2,
        },
        boxStyle,
      ]}
      className="items-center justify-center">
      <Animated.View style={markStyle}>
        <CheckMark size={size * 0.58} color={markColor} />
      </Animated.View>
    </Animated.View>
  );
}

/** علامة صح مرسومة بحدّين، أخف من تحميل أيقونة كاملة. */
function CheckMark({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.55,
        borderLeftWidth: 2.2,
        borderBottomWidth: 2.2,
        borderColor: color,
        transform: [{ rotate: '-45deg' }],
        marginTop: -size * 0.14,
      }}
    />
  );
}
