import { Platform } from 'react-native';

/** ملف محلي مقروء، مع نوعه الحقيقي. */
export interface LocalFile {
  bytes: ArrayBuffer;
  mimeType: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  m4a: 'audio/m4a',
  mp4: 'audio/mp4',
  caf: 'audio/x-caf',
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/webm': 'webm',
  'audio/x-caf': 'caf',
};

/** يستنتج النوع من امتداد المسار (المنصات الأصلية فقط). */
function mimeFromUri(uri: string): string {
  const withoutQuery = uri.split('?')[0];
  const lastSegment = withoutQuery.split('/').pop() ?? '';
  // نطلب نقطة داخل اسم الملف نفسه؛ نقاط النطاقات ليست امتدادات.
  const extension = lastSegment.includes('.')
    ? (lastSegment.split('.').pop() ?? '').toLowerCase()
    : '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/**
 * الامتداد المناسب لنوع المحتوى.
 *
 * لا نشتقّه من العنوان: على الويب يكون العنوان blob: أو data:، ولا يحمل
 * اسم ملف، فينتج عنه "امتداد" يحوي ':' و'/' ويُفسد مفتاح التخزين.
 */
export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType.split(';')[0].trim().toLowerCase()] ?? 'bin';
}

/**
 * قراءة ملف محلي مع نوعه.
 *
 * صنف File في expo-file-system غير مُنفَّذ على الويب (باني الصنف ينادي
 * this.validatePath المفقودة)، لذا نستخدم fetch هناك — وهو يقرأ blob:
 * و data: و http: ويعطينا النوع الحقيقي من الـ Blob.
 */
export async function readLocalFile(
  uri: string,
  /**
   * الملف نفسه إن كان بين أيدينا.
   *
   * `expo-image-picker` يعيد `asset.file` على الويب، وقراءته مباشرةً
   * أضمن من جلب عنوان blob: — وأسرع، ولا تمرّ بسياسة المحتوى أصلاً.
   */
  blob?: Blob,
): Promise<LocalFile> {
  if (blob) {
    return {
      bytes: await blob.arrayBuffer(),
      mimeType: blob.type || mimeFromUri(uri),
    };
  }

  if (Platform.OS === 'web') {
    let response: Response;
    try {
      response = await fetch(uri);
    } catch (error) {
      /*
       * `fetch` على عنوان blob: أو data: يخضع لـ `connect-src` لا لـ
       * `img-src`. وغيابهما من السياسة كان يُسقط كل رفع بـ
       * "Failed to fetch" — وهو نصّ يُترجَم «تعذّر الاتصال بالخادم»
       * رغم أن الملف على الجهاز والخادمُ لم يُخاطَب.
       */
      throw new Error(
        'تعذّرت قراءة الملف من الجهاز. إن كنت على الويب فتحقّق من أن ' +
          "سياسة المحتوى تسمح بـ blob: و data: في connect-src. " +
          `(${(error as Error)?.message ?? 'سبب غير معروف'})`,
      );
    }

    if (!response.ok) {
      throw new Error(`تعذّرت قراءة الملف (${response.status}).`);
    }
    const body = await response.blob();
    return {
      bytes: await body.arrayBuffer(),
      mimeType: body.type || mimeFromUri(uri),
    };
  }

  // استيراد كسول: يُبقي expo-file-system خارج مسار الإقلاع.
  const { File } = await import('expo-file-system');
  return { bytes: await new File(uri).arrayBuffer(), mimeType: mimeFromUri(uri) };
}
