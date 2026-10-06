import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CheckRow, Sheet } from '@/components/ui';
import { logger } from '@/lib/logger';
import { palette } from '@/lib/palette';
import {
  POLICY_ACCEPT_LABEL,
  POLICY_CTA,
  POLICY_INTRO,
  POLICY_SECTIONS,
  POLICY_TITLE,
  acceptPolicy,
  canAcceptPolicy,
  hasAcceptedPolicy,
  isScrolledToEnd,
  type PolicyStore,
} from '@/lib/policy';

/** على الويب AsyncStorage هو localStorage، فالمفتاح هناك حرفياً. */
const store: PolicyStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
};

/** نصّ السياسة وحده، يُستعمل في الشاشة الأولى وفي المراجعة. */
function PolicyText() {
  return (
    <>
      <Text className="text-right text-body text-ink-muted">{POLICY_INTRO}</Text>
      {POLICY_SECTIONS.map((section) => (
        <View key={section.title} className="mt-5">
          <Text className="text-right text-body font-bold text-ink">
            {section.title}
          </Text>
          <Text
            className="mt-1 text-right text-body text-ink-muted"
            style={{ lineHeight: 24 }}>
            {section.body}
          </Text>
        </View>
      ))}
    </>
  );
}

/**
 * يحجب التطبيق كلّه حتى توافق صراحةً.
 *
 * لا زرّ إغلاق ولا رجوع: الخروج من الشاشة بلا موافقة يعيد عرضها لأنها
 * ليست نافذة فوق التطبيق بل بديل عنه ما دام المفتاح غائباً.
 */
export function PolicyGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'needed' | 'accepted'>(
    'loading',
  );

  useEffect(() => {
    let alive = true;
    void hasAcceptedPolicy(store).then((accepted) => {
      if (alive) setStatus(accepted ? 'accepted' : 'needed');
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleAccept = useCallback(async () => {
    try {
      await acceptPolicy(store);
    } catch (error) {
      // تخزين متعذّر: لا نحبس من وافق، لكن ستُعرض الشاشة ثانيةً لاحقاً.
      logger.warn('policy', 'تعذّر حفظ الموافقة', error);
    }
    setStatus('accepted');
  }, []);

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-base">
        <ActivityIndicator color={palette.primaryStrong} />
      </View>
    );
  }
  if (status === 'needed') {
    return <PolicyConsentScreen onAccept={handleAccept} />;
  }
  return <>{children}</>;
}

function PolicyConsentScreen({ onAccept }: { onAccept: () => void }) {
  const insets = useSafeAreaInsets();
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const check = useCallback(
    (offsetY: number, viewport: number, content: number) => {
      if (
        isScrolledToEnd({
          contentOffsetY: offsetY,
          viewportHeight: viewport,
          contentHeight: content,
        })
      ) {
        setScrolledToEnd(true);
      }
    },
    [],
  );

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    check(contentOffset.y, layoutMeasurement.height, contentSize.height);
  }

  // نصٌّ يتّسع له الإطار بلا تمرير يُعدّ مقروءاً.
  useEffect(() => {
    check(0, viewportHeight, contentHeight);
  }, [viewportHeight, contentHeight, check]);

  const enabled = canAcceptPolicy(scrolledToEnd, checked);

  return (
    <View
      className="flex-1 bg-base"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
      <Text className="px-4 text-right text-title text-ink">{POLICY_TITLE}</Text>

      <ScrollView
        className="mt-3 flex-1"
        contentContainerClassName="px-4 pb-6"
        onScroll={onScroll}
        scrollEventThrottle={64}
        onLayout={(e: LayoutChangeEvent) =>
          setViewportHeight(e.nativeEvent.layout.height)
        }
        onContentSizeChange={(_, h) => setContentHeight(h)}>
        <PolicyText />
      </ScrollView>

      <View className="px-4 pt-2">
        <CheckRow
          label={POLICY_ACCEPT_LABEL}
          checked={checked}
          onToggle={() => setChecked((v) => !v)}
        />
        <Button
          title={POLICY_CTA}
          onPress={onAccept}
          disabled={!enabled}
          disabledReason="مرّر حتى نهاية النص أو علّم «قرأت ووافقت»"
          className="mt-2"
        />
      </View>
    </View>
  );
}

/** مراجعة السياسة من الإعدادات: القراءة فقط، تُغلق متى شئت. */
export function PolicyReviewSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={POLICY_TITLE}>
      <ScrollView style={{ maxHeight: 420 }} contentContainerClassName="pb-4">
        <PolicyText />
      </ScrollView>
      <Button title="إغلاق" variant="outline" onPress={onClose} className="mt-2" />
    </Sheet>
  );
}
