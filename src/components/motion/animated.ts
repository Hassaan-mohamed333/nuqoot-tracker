import { cssInterop } from 'nativewind';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

/**
 * تسجيل مكوّنات Reanimated لدى NativeWind.
 *
 * NativeWind يحوّل `className` إلى `style` عبر خريطة مكوّنات مسجّلة
 * (`interopComponents`)، وهي تضمّ مكوّنات React Native الأساسية فقط. أي
 * مكوّن ناتج عن `createAnimatedComponent` غير مسجَّل، فيُمرَّر `className`
 * كخاصية مجهولة ويُهمَل بصمت: لا خطأ، فقط عنصر بلا تنسيق. لذلك نسجّلها
 * هنا مرّة واحدة، ويستوردها كل من يستعمل نسخة متحرّكة.
 */

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.Text, { className: 'style' });
cssInterop(Animated.ScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
});
cssInterop(AnimatedPressable, { className: 'style' });
