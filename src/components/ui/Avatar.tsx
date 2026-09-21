import { User } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { initialOf } from '@/lib/displayName';
import { palette } from '@/lib/palette';

interface AvatarProps {
  /** رابط الصورة المحفوظ، أو `null` حين لا صورة. */
  url?: string | null;
  /** قطر الدائرة بالبكسل. */
  size: number;
  /** مصادر الاسم، للحرف البديل. */
  profileName?: string | null;
  metadataName?: unknown;
  /** يعرض أيقونة شخص بدل الحرف — لصورة كبيرة في شاشة الملف. */
  fallback?: 'initial' | 'icon';
  accessibilityLabel?: string;
  className?: string;
}

/**
 * الصورة الرمزية: صورةٌ إن حُمِّلت، وبديلٌ مقروء إن لم تُحمَّل.
 *
 * البديل ليس ترفاً. رابط الصورة يُحفظ في قاعدة البيانات ويبقى فيها بعد
 * أن يفقد معناه: دلوٌ صار خاصاً، أو ملفٌ حُذف، أو سياسة محتوى تمنع
 * النطاق. وكل هذه تُسقط التحميل بلا خطأ في التطبيق — فكانت الدائرة
 * تُرسم شفّافةً فارغة، وهي أسوأ ما يمكن عرضه: لا صورةَ ولا علامةَ على
 * أن شيئاً فُقد. فنعود هنا إلى الحرف الأوّل، وهو ما يظهر أصلاً لمن لا
 * صورة له، فيبدو حساباً بلا صورة لا واجهةً معطوبة.
 */
export function Avatar({
  url,
  size,
  profileName,
  metadataName,
  fallback = 'initial',
  accessibilityLabel = 'الصورة الشخصية',
  className = '',
}: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // رابطٌ جديد يستحقّ محاولةً جديدة: بدون هذا يبقى الفشل لاصقاً بالمكوّن
  // فلا تظهر الصورة التالية وإن كانت سليمة.
  useEffect(() => setFailed(false), [url]);

  const showImage = Boolean(url) && !failed;

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={`items-center justify-center overflow-hidden ${className}`}>
      {showImage ? (
        <Image
          source={{ uri: url as string }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          accessibilityLabel={accessibilityLabel}
          onError={() => {
            /*
             * `console.error` مباشرةً لا عبر `logger`: الغرض هنا تتبّع
             * رابط بعينه في أدوات المطوّر، و`logger` يحذف الحمولة في
             * الإنتاج ويُخفي اسم ملفٍ رقمي بوصفه رقم هاتف. والرابط ليس
             * سرّاً أصلاً — هو مكتوب في `src` في الصفحة نفسها.
             */
            console.error('Avatar load error for URL:', url);
            setFailed(true);
          }}
        />
      ) : fallback === 'icon' ? (
        <User size={Math.round(size * 0.4)} color={palette.subtle} />
      ) : (
        <Text
          style={{ fontSize: Math.round(size * 0.4) }}
          className="font-bold text-primary-strong">
          {initialOf({ profileName, metadataName })}
        </Text>
      )}
    </View>
  );
}
