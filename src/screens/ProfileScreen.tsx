import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  CloudOff,
  Fingerprint,
  ImagePlus,
  LogIn,
  LogOut,
  Phone,
  ShieldCheck,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Switch,
  Text,
  View,
} from 'react-native';

import { PressableScale } from '@/components/motion';
import { PhoneLinkSheet } from '@/components/PhoneLinkSheet';
import {
  Avatar,
  Button,
  DateField,
  Field,
  Screen,
  SectionTitle,
  SegmentedControl,
} from '@/components/ui';
import {
  compressForUpload,
  toDataUri,
  type CompressedImage,
} from '@/lib/imageCompress';
import { formatPhone } from '@/lib/phoneAuth';
import { useLock } from '@/store/LockProvider';
import { DEFAULT_CURRENCY } from '@/utils/ledger';
import { confirmAction, notify, reportError } from '@/lib/alerts';
import { fromDateInputValue, toDateInputValue } from '@/components/ui';
import { palette } from '@/lib/palette';
import {
  fetchUserProfile,
  resolveProfileId,
  updateUserProfile,
  uploadAvatar,
} from '@/lib/repository';
import { usesServerData } from '@/lib/supabase';
import { userMessage } from '@/lib/supabaseError';
import { logger } from '@/lib/logger';
import { LIMITS } from '@/lib/validation';
import { useAuth } from '@/store/AuthProvider';
import type { UserProfileInput } from '@/types';

/** الحدّ الذي يقبله دلو avatars؛ مطابق لـ file_size_limit في المخطط. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** العملات المتاحة. قصيرة عمداً، كقائمة الدول في منتقي الهاتف. */
const CURRENCIES = [
  { value: 'EGP', label: 'ج.م' },
  { value: 'SAR', label: 'ر.س' },
  { value: 'AED', label: 'د.إ' },
  { value: 'USD', label: '$' },
] as const;

/**
 * الملف الشخصي: الاسم، تاريخ الميلاد، والصورة.
 *
 * الصورة تُرفع عند الحفظ لا عند الاختيار: الرفع الفوري يترك في الدلو
 * ملفاً معلّقاً لكل مرّة يبدّل فيها المستخدم رأيه ثم يخرج بلا حفظ.
 */
export function ProfileScreen() {
  const { userId, user, authDisabled, signOut } = useAuth();
  const lock = useLock();
  // في الوضع المحلي لا جلسة ولا معرّف مستخدم، والتطبيق كلّه يعمل هناك.
  const profileId = resolveProfileId(userId, authDisabled);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  /** الرابط المحفوظ فعلاً على الخادم. */
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  /**
   * صورة اختيرت ولم تُرفع بعد — مضغوطةً وبايتاتها جاهزة.
   *
   * تُقرأ وتُضغط لحظة الاختيار لا لحظة الحفظ: عنوان blob: على الويب
   * يعيش ما دامت الصفحة، والقراءة المؤجَّلة تمرّ بـ fetch عليه فتخضع
   * لسياسة المحتوى. وإمساك البايتات مبكّراً يُخرج الرفع من كل ذلك.
   */
  const [pendingAvatar, setPendingAvatar] =
    useState<CompressedImage | null>(null);
  const [phoneSheet, setPhoneSheet] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  /** الرقم الموثَّق، من الجلسة أو من ربطٍ تمّ للتوّ. */
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  // `phone_confirmed_at` هو ما يثبت التوثيق: وجود الرقم وحده لا يكفي،
  // فالرقم المُرسَل إليه رمزٌ لم يُؤكَّد يظهر في الجلسة أيضاً.
  const verifiedPhone =
    linkedPhone ?? (user?.phone_confirmed_at ? (user.phone ?? null) : null);

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
        profile.birth_date ? fromDateInputValue(profile.birth_date) : null,
      );
      setSavedAvatar(profile.avatar_url);
      setCurrency(profile.currency ?? DEFAULT_CURRENCY);
      if (profile.phone) setLinkedPhone(profile.phone);
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

  const shownAvatar = pendingAvatar?.uri ?? savedAvatar;
  const nameValid = fullName.trim().length === 0 || fullName.trim().length >= 2;

  async function useAsset(asset: ImagePicker.ImagePickerAsset) {
    try {
      // الضغط أولاً: صورة هاتفٍ حديث بضعة ميغابايت وتُعرض في دائرة
      // قطرها ١١٢ بكسل. وبعده يندر أن يقترب شيء من سقف الدلو.
      const compressed = await compressForUpload(
        asset.uri,
        (asset as { file?: Blob }).file,
      );

      if (compressed.bytes.byteLength > MAX_AVATAR_BYTES) {
        notify('الصورة كبيرة', 'اختر صورة أصغر أو أقلّ تفصيلاً.');
        return;
      }

      setPendingAvatar(compressed);
    } catch (error) {
      reportError('تعذّرت قراءة الصورة', error);
    }
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

  /**
   * يرفع الصورة إن وُجدت، ولا يُسقط الحفظ إن فشل الرفع.
   *
   * الرفع أكثر ما يفشل في هذه الشاشة: حجم، أو نوع يرفضه الدلو، أو شبكة
   * تنقطع في منتصف الملف. وكان فشله يمنع حفظ الاسم وتاريخ الميلاد
   * معهما — فيخسر المستخدم ما كتبه من أجل صورة. الآن يُحفظ النصّ،
   * ويُقال له إن الصورة وحدها لم تُرفع.
   */
  async function resolveAvatarUrl(): Promise<{
    url: string | null;
    uploadError: unknown;
  }> {
    if (!pendingAvatar) return { url: savedAvatar, uploadError: null };

    // بلا خادم لا رفع: نحتفظ بمسار الصورة على الجهاز، فتظهر الصورة في
    // الوضع المحلي بدل أن يفشل الحفظ كله من أجلها.
    if (!usesServerData()) {
      // عنوان `data:` لا `blob:`: الثاني يموت مع إعادة تحميل الصفحة،
      // فتعود الصورة مربّعاً مكسوراً في المرّة التالية.
      return {
        url: toDataUri(pendingAvatar.bytes, pendingAvatar.mimeType),
        uploadError: null,
      };
    }

    try {
      const url = await uploadAvatar(pendingAvatar.uri, {
        bytes: pendingAvatar.bytes,
        mimeType: pendingAvatar.mimeType,
      });
      return { url, uploadError: null };
    } catch (error) {
      logger.error('profile', 'فشل رفع الصورة الرمزية', error);
      // نُبقي الرابط المحفوظ سابقاً: الفشل لا يمحو صورةً كانت تعمل.
      return { url: savedAvatar, uploadError: error };
    }
  }

  /**
   * الخروج — أو الدخول في الوضع المحلي.
   *
   * موضعه هنا لا في الترويسة: زرُّ خروجٍ بجانب زرّ «إضافة حركة» يُضغط
   * بالخطأ، وثمنُه جلسةٌ تُفقد ونسخةٌ محليّة تُمسح. وفي صفحة الحساب
   * يُبحث عنه قصداً.
   */
  async function handleAuthAction() {
    if (signingOut) return;

    if (authDisabled) {
      // لا جلسة لتُنهى: `signOut` يمسح النسخة المحلية ويعيد شاشة الدخول
      // إن كان الخادم مُعدّاً، وهو ما يريده من ضغط «تسجيل الدخول».
      await signOut().catch((error) =>
        reportError('تعذّر فتح شاشة الدخول', error),
      );
      return;
    }

    const approved = await confirmAction({
      title: 'تسجيل الخروج',
      message:
        'ستُحذف النسخة المحفوظة على هذا الجهاز، وتبقى بياناتك على الخادم.',
      confirmLabel: 'خروج',
      destructive: true,
    });
    if (!approved) return;

    setSigningOut(true);
    try {
      await signOut();
      // لا تنقّل يدوي: `AppGate` يعرض شاشة الدخول فور اختفاء الجلسة.
    } catch (error) {
      reportError('تعذّر تسجيل الخروج', error);
    } finally {
      setSigningOut(false);
    }
  }

  async function handleSave() {
    if (!profileId || saving || !nameValid) return;
    setSaving(true);
    try {
      const { url, uploadError } = await resolveAvatarUrl();

      const patch: UserProfileInput = {
        full_name: fullName.trim() || null,
        birth_date: birthDate ? toDateInputValue(birthDate) : null,
        avatar_url: url,
        currency,
        // الرقم الموثَّق يُنسخ إلى الملف ليُقرأ بلا نداء على الجلسة.
        phone: verifiedPhone,
      };

      const saved = await updateUserProfile(profileId, patch);
      setSavedAvatar(saved.avatar_url);
      if (!uploadError) setPendingAvatar(null);

      if (uploadError) {
        notify(
          'حُفظت بياناتك، والصورة لا',
          `الاسم وتاريخ الميلاد محفوظان. أمّا الصورة فلم تُرفع: ${userMessage(
            uploadError,
          )}`,
        );
      } else {
        notify('تم الحفظ', 'حُدّثت بيانات ملفك الشخصي.');
      }
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
        {/* البديل أيقونةٌ لا حرف: الدائرة هنا كبيرة وموضعُها موضع
            الصورة، فحرفٌ وحده فيها يبدو نصّاً تائهاً لا صورةً غائبة. */}
        <Avatar
          url={shownAvatar}
          size={112}
          fallback="icon"
          accessibilityLabel="صورة الملف الشخصي"
          className="border border-line bg-surface-raised"
        />

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

      <Text className="mb-2 mt-5 text-right text-sm font-bold text-ink">
        العملة الافتراضية
      </Text>
      <SegmentedControl
        options={CURRENCIES}
        value={currency}
        onChange={setCurrency}
      />
      <Text className="mt-1.5 text-right text-caption text-ink-muted">
        تُقترح في كل حركة جديدة، ويمكن تغييرها لكل حركة.
      </Text>

      <SectionTitle className="mt-8">الأمان</SectionTitle>

      {/* ---- رقم الهاتف ---- */}
      <View className="rounded-2xl border border-line bg-surface p-4">
        <View className="flex-row-reverse items-center justify-between">
          <View className="flex-row-reverse items-center">
            <Phone size={16} color={palette.muted} />
            <Text className="mr-2 text-right text-sm font-bold text-ink">
              رقم الهاتف
            </Text>
          </View>

          {verifiedPhone ? (
            <View className="flex-row-reverse items-center rounded-full bg-success/15 px-2 py-0.5">
              <ShieldCheck size={12} color={palette.success} />
              <Text className="mr-1 text-[10px] font-bold text-success">
                موثَّق
              </Text>
            </View>
          ) : null}
        </View>

        <Text className="mt-2 text-right text-sm text-ink-muted">
          {verifiedPhone
            ? formatPhone(verifiedPhone)
            : 'لم يُربط رقم بعد. الربط يسهّل استعادة حسابك.'}
        </Text>

        <Button
          title={verifiedPhone ? 'تغيير الرقم' : 'ربط رقم'}
          variant="outline"
          size="sm"
          onPress={() => setPhoneSheet(true)}
          // الربط يمرّ برسالة SMS من الخادم، فلا معنى له بلا جلسة.
          disabled={!usesServerData()}
          className="mt-3"
        />

        {usesServerData() ? null : (
          <Text className="mt-2 text-right text-caption text-ink-subtle">
            يحتاج تسجيل الدخول واتصالاً بالخادم.
          </Text>
        )}
      </View>

      {/* ---- القفل الحيوي ---- */}
      {lock ? (
        <View className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <View className="flex-row-reverse items-center justify-between">
            <View className="flex-1 flex-row-reverse items-center">
              <Fingerprint size={16} color={palette.muted} />
              <Text className="mr-2 text-right text-sm font-bold text-ink">
                قفل بالبصمة
              </Text>
            </View>

            {lock.checking ? (
              <ActivityIndicator color={palette.primary} size="small" />
            ) : (
              <Switch
                value={lock.enabled}
                onValueChange={(next) => void lock.setEnabled(next)}
                disabled={!lock.capability?.available}
                accessibilityLabel="تفعيل القفل بالبصمة"
                trackColor={{ false: palette.border, true: palette.primary }}
                thumbColor={palette.surface}
              />
            )}
          </View>

          <Text className="mt-2 text-right text-sm text-ink-muted">
            {lock.capability?.available
              ? 'يُطلب التحقّق عند فتح التطبيق بعد غياب قصير.'
              : (lock.capability?.reason ??
                'جارٍ فحص إمكانات الجهاز…')}
          </Text>

          {lock.lastError ? (
            <Text className="mt-2 text-right text-caption text-danger">
              {lock.lastError}
            </Text>
          ) : null}
        </View>
      ) : null}

      <SectionTitle className="mt-8">الحساب</SectionTitle>

      <View className="rounded-2xl border border-line bg-surface p-4">
        <Text className="text-right text-sm text-ink-muted">
          {user?.email ?? (authDisabled ? 'وضع محلي بلا حساب' : 'حساب ضيف')}
        </Text>

        <PressableScale
          onPress={() => void handleAuthAction()}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel={authDisabled ? 'تسجيل الدخول' : 'تسجيل الخروج'}
          accessibilityState={{ disabled: signingOut, busy: signingOut }}
          activeScale={0.97}
          className={`mt-3 flex-row-reverse items-center justify-center rounded-xl bg-danger-soft py-3 ${
            signingOut ? 'opacity-50' : ''
          }`}>
          {signingOut ? (
            <ActivityIndicator color={palette.danger} size="small" />
          ) : authDisabled ? (
            <LogIn size={16} color={palette.danger} />
          ) : (
            <LogOut size={16} color={palette.danger} />
          )}
          <Text className="mr-2 text-sm font-bold text-danger">
            {authDisabled ? 'تسجيل الدخول' : 'تسجيل الخروج'}
          </Text>
        </PressableScale>
      </View>

      <PhoneLinkSheet
        visible={phoneSheet}
        onClose={() => setPhoneSheet(false)}
        currentPhone={verifiedPhone}
        onLinked={(phone) => {
          setLinkedPhone(phone);
          // يُكتب في الملف فوراً لا عند الحفظ التالي: من ربط رقمه ثم
          // أغلق الشاشة كان يفقده حتى تحقّقٍ ثانٍ.
          if (profileId) {
            void updateUserProfile(profileId, { phone }).catch((error) => {
              logger.error('profile', 'تعذّر حفظ الرقم في الملف', error);
            });
          }
        }}
      />
    </Screen>
  );
}
