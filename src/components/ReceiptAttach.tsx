import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, TriangleAlert } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Image, Platform, Text, View } from 'react-native';

import { Button, Card, SectionTitle } from '@/components/ui';
import { notify } from '@/lib/alerts';
import { palette } from '@/lib/palette';

/** صورة اختارها المستخدم، جاهزة للرفع وللقراءة الآلية. */
export interface PickedReceipt {
  uri: string;
  /**
   * محتوى الصورة للقراءة الآلية. على الويب قد لا يملأ المنتقي base64، لكن
   * الـ uri نفسه يكون data URL، والدالة على الخادم تزيل البادئة فيصلح الاثنان.
   */
  payload: string | null;
}

interface ReceiptAttachProps {
  uri: string | null;
  /** القراءة الآلية جارية. */
  scanning: boolean;
  /** ما انتهت إليه القراءة: ما استُخرج، أو سبب تعذّرها. */
  note: string | null;
  noteIsWarning?: boolean;
  onPicked: (receipt: PickedReceipt) => void;
  onClear: () => void;
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedReceipt {
  return {
    uri: asset.uri,
    payload: asset.base64 ?? (asset.uri.startsWith('data:') ? asset.uri : null),
  };
}

/**
 * إرفاق صورة فاتورة بمصروف: تصوير أو اختيار من المعرض.
 *
 * المكوّن لا يقرأ الفاتورة ولا يرفعها؛ يسلّم الصورة لشاشته. القراءة والرفع
 * قراران للشاشة (ماذا تملأ، ومتى تُرفع)، فيبقى هذا جزءاً بصرياً فقط.
 */
export function ReceiptAttach({
  uri,
  scanning,
  note,
  noteIsWarning = false,
  onPicked,
  onClear,
}: ReceiptAttachProps) {
  async function capture() {
    // الويب: المنتقي يفتح الكاميرا عبر خاصية capture في حقل الملف، ولا يمرّ
    // بإذن كاميرا منفصل؛ طلب الإذن هناك قد يرفض دون سبب.
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        notify('إذن مطلوب', 'فعّل إذن الكاميرا لتصوير الفواتير.');
        return;
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) onPicked(toPicked(result.assets[0]));
  }

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) onPicked(toPicked(result.assets[0]));
  }

  // على جوّال المتصفّح تفتح الكاميرا مباشرة، وعلى سطح المكتب يفتح اختيار ملف.
  const canCapture = true;

  return (
    <View>
      <SectionTitle>فاتورة (اختياري)</SectionTitle>
      <Card variant="panel" padded={false} animate={false} className="gap-3 p-4">
        {uri ? (
          <Image
            source={{ uri }}
            accessibilityLabel="صورة الفاتورة"
            className="h-52 w-full rounded-tile bg-surface"
            resizeMode="contain"
          />
        ) : (
          <Text className="text-right text-caption text-ink-muted">
            ارفع صورة الفاتورة لنقرأ المبلغ والتفاصيل تلقائياً، ويراها أعضاء
            المناسبة مع المصروف.
          </Text>
        )}

        {scanning ? (
          <View className="flex-row-reverse items-center gap-2">
            <ActivityIndicator color={palette.primaryStrong} />
            <Text className="text-right text-caption text-ink-muted">
              جارٍ قراءة الفاتورة…
            </Text>
          </View>
        ) : note ? (
          <View className="flex-row-reverse items-start gap-2">
            {noteIsWarning ? (
              <TriangleAlert size={16} color={palette.warning} />
            ) : null}
            <Text className="flex-1 text-right text-caption text-ink-muted">
              {note}
            </Text>
          </View>
        ) : null}

        <View className="flex-row-reverse gap-2">
          {canCapture ? (
            <View className="flex-1">
              <Button
                title="تصوير"
                size="sm"
                variant={uri ? 'outline' : 'primary'}
                icon={
                  <Camera
                    size={16}
                    color={uri ? palette.text : palette.onPrimary}
                  />
                }
                onPress={() => void capture()}
                disabled={scanning}
              />
            </View>
          ) : null}
          <View className="flex-1">
            <Button
              title={uri ? 'استبدال' : 'من المعرض'}
              size="sm"
              variant={uri || canCapture ? 'outline' : 'primary'}
              icon={
                <ImageIcon
                  size={16}
                  color={uri || canCapture ? palette.text : palette.onPrimary}
                />
              }
              onPress={() => void pick()}
              disabled={scanning}
            />
          </View>
          {uri ? (
            <View className="flex-1">
              <Button
                title="إزالة"
                size="sm"
                variant="ghost"
                onPress={onClear}
                disabled={scanning}
              />
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}
