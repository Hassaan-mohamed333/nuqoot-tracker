import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, TriangleAlert } from 'lucide-react-native';
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

  function continueToForm() {
    navigation.navigate('AddTransaction', {
      prefill: {
        amount: scan?.total ?? undefined,
        // الإيصال إثبات دفع، فالاتجاه الافتراضي OUT ويظل قابلاً للتغيير.
        direction: 'OUT',
        note: scan?.merchant ?? scan?.summary ?? undefined,
        receiptUri: imageUri ?? undefined,
      },
    });
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerClassName="p-4 pb-10">
      <View className="flex-row-reverse">
        <Pressable
          onPress={() => void capture()}
          disabled={busy}
          accessibilityRole="button"
          className="flex-1 flex-row-reverse items-center justify-center rounded-2xl bg-green-600 py-3">
          <Camera size={18} color="#ffffff" />
          <Text className="mr-2 text-sm font-bold text-white">تصوير إيصال</Text>
        </Pressable>
        <Pressable
          onPress={() => void pick()}
          disabled={busy}
          accessibilityRole="button"
          className="mr-2 flex-1 flex-row-reverse items-center justify-center rounded-2xl border border-gray-200 bg-white py-3">
          <ImageIcon size={18} color="#16a34a" />
          <Text className="mr-2 text-sm font-bold text-green-700">من المعرض</Text>
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
          <ActivityIndicator color="#16a34a" />
          <Text className="mt-2 text-xs text-gray-500">جارٍ قراءة الإيصال…</Text>
        </View>
      ) : null}

      {error ? (
        <View className="mt-4 flex-row-reverse items-center rounded-xl bg-amber-50 p-3">
          <TriangleAlert size={16} color="#b45309" />
          <Text className="mr-2 flex-1 text-right text-xs text-amber-800">
            {error}
          </Text>
        </View>
      ) : null}

      {scan ? (
        <View className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
          <Text className="text-right text-sm font-bold text-gray-900">
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
          onPress={continueToForm}
          accessibilityRole="button"
          className="mt-6 items-center rounded-2xl bg-green-600 py-3">
          <Text className="text-base font-bold text-white">
            متابعة في النموذج
          </Text>
        </Pressable>
      ) : null}

      {imageUri ? (
        <Text className="mt-2 text-center text-[11px] text-gray-500">
          تُرفع الصورة عند حفظ الحركة، لا قبل ذلك.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-2 flex-row-reverse items-center justify-between">
      <Text className="text-right text-xs text-gray-500">{label}</Text>
      <Text className="flex-1 text-right text-sm font-semibold text-gray-900">
        {value}
      </Text>
    </View>
  );
}
