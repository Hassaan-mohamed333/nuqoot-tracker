import React, { Suspense } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

/**
 * تحميل كسول لشاشة، مع عزل أخطائها.
 *
 * الشاشات التي تعتمد على وحدات أصلية (الكاميرا، الميكروفون، الملفات) لا
 * تُحمَّل عند الإقلاع بل عند فتحها. هكذا لا يستطيع فشل وحدة أصلية واحدة
 * أن يوقف التطبيق كله عند البدء، ويظهر الخطأ داخل شاشته بدل شاشة حمراء.
 */
interface LazyScreenProps {
  load: () => Promise<{ default: React.ComponentType }>;
}

export function lazyScreen(
  load: LazyScreenProps['load'],
): React.ComponentType {
  const Component = React.lazy(load);

  return function LazyScreenWrapper() {
    return (
      <ScreenErrorBoundary>
        <Suspense fallback={<ScreenFallback />}>
          <Component />
        </Suspense>
      </ScreenErrorBoundary>
    );
  };
}

function ScreenFallback() {
  return (
    <View className="flex-1 items-center justify-center bg-gray-50">
      <ActivityIndicator color="#16a34a" />
    </View>
  );
}

interface BoundaryState {
  message: string | null;
}

/** يمنع خطأ شاشة واحدة من إسقاط التطبيق. */
class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      message:
        error instanceof Error ? error.message : 'تعذّر تحميل هذه الشاشة.',
    };
  }

  render() {
    if (this.state.message !== null) {
      return (
        <View className="flex-1 items-center justify-center bg-gray-50 px-8">
          <Text className="text-center text-sm font-semibold text-gray-800">
            تعذّر تحميل هذه الشاشة
          </Text>
          <Text className="mt-2 text-center text-xs text-gray-500">
            {this.state.message}
          </Text>
          <Text className="mt-3 text-center text-[11px] text-gray-400">
            الميزات التي تحتاج الكاميرا أو الميكروفون تتطلب development build،
            ولا تعمل في Expo Go.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
