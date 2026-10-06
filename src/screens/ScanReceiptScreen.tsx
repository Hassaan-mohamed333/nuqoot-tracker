import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  Image as ImageIcon,
  Split,
  TriangleAlert,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { notify } from '@/lib/alerts';
import { scanReceipt, type ReceiptScan } from '@/lib/ai';
import { palette } from '@/lib/palette';
import type { RootStackParamList } from '@/navigation/types';
import { formatAmount, formatDate } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * قارئ الإيصالات: التقاط أو اختيار صورة، استخراج المبلغ والتاريخ والمتجر،
 * ثم متابعة في نموذج الحركة. الصورة تُرفع عند الحفظ لا قبله.
 */
export function ScanReceiptScreen() {
  const navigation = useNavigation<Navigation>();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scan, setScan] = useState<ReceiptScan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImage(uri: string, base64: string | null | undefined) {
    setImageUri(uri);
    setScan(null);
    setError(null);

    // على الويب لا يملأ المنتقي base64 أحياناً، لكن الـ uri نفسه يكون
    // data URL. الدالة على الخادم تزيل البادئة، فيصلح الاثنان.
    const payload =
      base64 ?? (uri.startsWith('data:') ? uri : null);

    if (!payload) {
      setError('تعذّرت قراءة الصورة.');
      return;
    }

    setBusy(true);
    try {
      setScan(await scanReceipt(payload));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'تعذّرت قراءة الإيصال. يمكنك إدخال البيانات يدوياً.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      notify('إذن مطلوب', 'فعّل إذن الكاميرا لتصوير الإيصالات.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      await handleImage(result.assets[0].uri, result.assets[0].base64);
    }
  }

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      await handleImage(result.assets[0].uri, result.assets[0].base64);
    }
  }

  function continueToForm(split = false) {
    navigation.navigate('AddTransaction', {
      prefill: {
        amount: scan?.total ?? undefined,
        // الإيصال إثبات دفع، فالاتجاه الافتراضي OUT ويظل قابلاً للتغيير.
        direction: 'OUT',
        note: scan?.merchant ?? scan?.summary ?? undefined,
        receiptUri: imageUri ?? undefined,
        split,
      },
    });
  }

  return (
    <ScrollView className="flex-1 bg-base" contentContainerClassName="p-4 pb-10">
      <View className="flex-row-reverse">
        <Pressable
          onPress={() => void capture()}
          disabled={busy}
          accessibilityRole="button"
          className="flex-1 flex-row-reverse items-center justify-center rounded-full bg-primary py-3">
          <Camera size={18} color={palette.onPrimary} />
          <Text className="mr-2 text-sm font-bold text-primary-fg">تصوير إيصال</Text>
        </Pressable>
        <Pressable
          onPress={() => void pick()}
          disabled={busy}
          accessibilityRole="button"
          className="mr-2 flex-1 flex-row-reverse items-center justify-center rounded-full border border-line bg-surface py-3">
          <ImageIcon size={18} color={palette.primaryStrong} />
          <Text className="mr-2 text-sm font-bold text-primary-strong">من المعرض</Text>
        </Pressable>
      </View>

      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          className="mt-4 h-64 w-full rounded-2xl"
          resizeMode="contain"
        />
      ) : null}

      {busy ? (
        <View className="mt-4 items-center">
          <ActivityIndicator color={palette.primaryStrong} />
          <Text className="mt-2 text-xs text-ink-muted">جارٍ قراءة الإيصال…</Text>
        </View>
      ) : null}

      {error ? (
        <View className="mt-4 flex-row-reverse items-center rounded-xl bg-warning-soft p-3">
          <TriangleAlert size={16} color={palette.warning} />
          <Text className="mr-2 flex-1 text-right text-xs text-ink-muted">
            {error}
          </Text>
        </View>
      ) : null}

      {scan ? (
        <View className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <Text className="text-right text-sm font-bold text-ink">
            ما قرأناه
          </Text>
          <Row label="المتجر" value={scan.merchant ?? '—'} />
          <Row
            label="الإجمالي"
            value={
              scan.total === null
                ? '—'
                : formatAmount(scan.total, scan.currency ?? 'EGP')
            }
          />
          <Row label="التاريخ" value={scan.date ? formatDate(scan.date) : '—'} />
          <Row label="الوصف" value={scan.summary ?? '—'} />
        </View>
      ) : null}

      {imageUri && !busy ? (
        <Pressable
          onPress={() => continueToForm()}
          accessibilityRole="button"
          className="mt-6 items-center rounded-full bg-primary py-3">
          <Text className="text-base font-bold text-primary-fg">
            متابعة في النموذج
          </Text>
        </Pressable>
      ) : null}

      {/* فاتورةٌ بين عدّة أشخاص: نذهب إلى النموذج وورقة القسمة مفتوحة على
          الإجمالي المقروء، بدل أن يعيد المستخدم كتابته. */}
      {imageUri && !busy && (scan?.total ?? 0) > 0 ? (
        <Pressable
          onPress={() => continueToForm(true)}
          accessibilityRole="button"
          className="mt-3 flex-row-reverse items-center justify-center rounded-full border border-primary/50 bg-primary-soft py-3">
          <Split size={16} color={palette.primaryStrong} />
          <Text className="mr-2 text-base font-bold text-ink">
            تقسيم الفاتورة مع أفراد
          </Text>
        </Pressable>
      ) : null}

      {imageUri ? (
        <Text className="mt-2 text-center text-[11px] text-ink-muted">
          تُرفع الصورة عند حفظ الحركة، لا قبل ذلك.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-2 flex-row-reverse items-center justify-between">
      <Text className="text-right text-xs text-ink-muted">{label}</Text>
      <Text className="flex-1 text-right text-sm font-semibold text-ink">
        {value}
      </Text>
    </View>
  );
}
