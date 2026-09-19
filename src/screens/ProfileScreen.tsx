import * as ImagePicker from 'expo-image-picker';
import { Camera, CloudOff, ImagePlus, User } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { Button, DateField, Field, Screen } from '@/components/ui';
import { notify, reportError } from '@/lib/alerts';
import { fromDateInputValue, toDateInputValue } from '@/components/ui';
import { palette } from '@/lib/palette';
import {
  fetchUserProfile,
  resolveProfileId,
  updateUserProfile,
  uploadAvatar,
} from '@/lib/repository';
import { isSupabaseReady } from '@/lib/supabase';
import { LIMITS } from '@/lib/validation';
import { useAuth } from '@/store/AuthProvider';
import type { UserProfileInput } from '@/types';

/** الحدّ الذي يقبله دلو avatars؛ مطابق لـ file_size_limit في المخطط. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * الملف الشخصي: الاسم، تاريخ الميلاد، والصورة.
 *
 * الصورة تُرفع عند الحفظ لا عند الاختيار: الرفع الفوري يترك في الدلو
 * ملفاً معلّقاً لكل مرّة يبدّل فيها المستخدم رأيه ثم يخرج بلا حفظ.
 */
export function ProfileScreen() {
  const { userId, user, authDisabled } = useAuth();
  // في الوضع المحلي لا جلسة ولا معرّف مستخدم، والتطبيق كلّه يعمل هناك.
  const profileId = resolveProfileId(userId, authDisabled);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  /** الرابط المحفوظ فعلاً على الخادم. */
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  /** صورة اختيرت ولم تُرفع بعد. */
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const profile = await fetchUserProfile(profileId);
      setFullName(profile.full_name ?? '');
      setBirthDate(
        profile.date_of_birth ? fromDateInputValue(profile.date_of_birth) : null,
      );
      setSavedAvatar(profile.avatar_url);
      setPendingAvatar(null);
    } catch (error) {
      reportError('تعذّر تحميل الملف الشخصي', error);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shownAvatar = pendingAvatar ?? savedAvatar;
  const nameValid = fullName.trim().length === 0 || fullName.trim().length >= 2;

  async function useAsset(asset: ImagePicker.ImagePickerAsset) {
    // الفحص هنا لا عند الرفع: رسالة الخادم عن تجاوز الحجم عامّة، ورفعُ
    // ملفين ميغابايت ثم رفضه يُهدر وقت المستخدم وحزمة بياناته.
    if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) {
      notify('الصورة كبيرة', 'اختر صورة أصغر من ٢ ميغابايت.');
      return;
    }
    setPendingAvatar(asset.uri);
  }

  async function pickFromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // مربّع: الصورة تُعرض في دائرة، والقصّ المسبق يمنع اقتطاعاً
        // عشوائياً للوجه عند العرض.
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) await useAsset(result.assets[0]);
    } catch (error) {
      reportError('تعذّر فتح معرض الصور', error);
    }
  }

  async function capture() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        notify('إذن مطلوب', 'فعّل إذن الكاميرا لالتقاط صورة.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) await useAsset(result.assets[0]);
    } catch (error) {
      reportError('تعذّر فتح الكاميرا', error);
    }
  }

  async function handleSave() {
    if (!profileId || saving || !nameValid) return;
    setSaving(true);
    try {
      let avatarUrl = savedAvatar;

      if (pendingAvatar) {
        // بلا خادم لا رفع: نحتفظ بمسار الصورة على الجهاز، فتظهر الصورة
        // في الوضع المحلي بدل أن يفشل الحفظ كله من أجلها.
        avatarUrl = isSupabaseReady()
          ? await uploadAvatar(pendingAvatar)
          : pendingAvatar;
      }

      const patch: UserProfileInput = {
        full_name: fullName.trim() || null,
        date_of_birth: birthDate ? toDateInputValue(birthDate) : null,
        avatar_url: avatarUrl,
      };

      const saved = await updateUserProfile(profileId, patch);
      setSavedAvatar(saved.avatar_url);
      setPendingAvatar(null);
      notify('تم الحفظ', 'حُدّثت بيانات ملفك الشخصي.');
    } catch (error) {
      reportError('تعذّر حفظ التغييرات', error);
    } finally {
      setSaving(false);
    }
  }

  if (!profileId) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-center text-sm text-ink-muted">
            سجّل الدخول لعرض ملفك الشخصي.
          </Text>
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          title="حفظ التغييرات"
          onPress={() => void handleSave()}
          loading={saving}
          disabled={!nameValid}
          size="lg"
        />
      }>
      {authDisabled ? (
        <View className="mb-4 flex-row-reverse items-center rounded-xl bg-warning-soft p-3">
          <CloudOff size={16} color={palette.warning} />
          <Text className="mr-2 flex-1 text-right text-xs text-ink-muted">
            وضع محلي: بياناتك محفوظة على هذا الجهاز ولا تُرفع الصورة إلى الخادم.
          </Text>
        </View>
      ) : null}

      <View className="items-center">
        <View className="h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-raised">
          {shownAvatar ? (
            <Image
              source={{ uri: shownAvatar }}
              // النمط لا الأصناف: الأبعاد الثابتة داخل حاوية دائرية أوضح
              // هنا، وresizeMode لا يقابله صنف.
              style={{ width: 112, height: 112 }}
              resizeMode="cover"
              accessibilityLabel="صورة الملف الشخصي"
            />
          ) : (
            <User size={44} color={palette.subtle} />
          )}
        </View>

        {pendingAvatar ? (
          <Text className="mt-2 text-center text-caption text-ink-muted">
            صورة جديدة — تُرفع عند الحفظ.
          </Text>
        ) : null}

        <View className="mt-3 flex-row-reverse items-center">
          <PressableScale
            onPress={() => void pickFromLibrary()}
            accessibilityRole="button"
            accessibilityLabel="اختيار صورة من الجهاز"
            activeScale={0.95}
            className="flex-row-reverse items-center rounded-full border border-line-strong bg-surface px-4 py-2">
            <ImagePlus size={16} color={palette.text} />
            <Text className="mr-1.5 text-sm font-semibold text-ink">
              اختيار صورة
            </Text>
          </PressableScale>

          {/* الكاميرا على الهاتف وحده: على الويب يفتح المنتقي نفسه نافذة
              الملفات، فزرّ «التقاط» هناك يعِد بما لا يفعله. */}
          {Platform.OS === 'web' ? null : (
            <PressableScale
              onPress={() => void capture()}
              accessibilityRole="button"
              accessibilityLabel="التقاط صورة بالكاميرا"
              activeScale={0.95}
              className="mr-2 flex-row-reverse items-center rounded-full border border-line-strong bg-surface px-4 py-2">
              <Camera size={16} color={palette.text} />
              <Text className="mr-1.5 text-sm font-semibold text-ink">التقاط</Text>
            </PressableScale>
          )}
        </View>

        {user?.email ? (
          <Text className="mt-3 text-center text-caption text-ink-subtle">
            {user.email}
          </Text>
        ) : null}
      </View>

      <Field
        label="الاسم الكامل"
        value={fullName}
        onChangeText={setFullName}
        placeholder="اكتب اسمك"
        maxLength={LIMITS.name}
        className="mt-6"
        error={nameValid ? null : 'الاسم حرفان على الأقل.'}
      />

      <DateField
        label="تاريخ الميلاد"
        value={birthDate}
        onChange={setBirthDate}
        maximumDate={today}
        placeholder="لم يُحدَّد"
        hint="اختياري — يُستخدم لتذكيرك بمناسباتك."
        accessibilityLabel="اختيار تاريخ الميلاد"
        className="mt-5"
      />
    </Screen>
  );
}
