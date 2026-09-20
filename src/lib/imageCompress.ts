/**
 * تصغير الصورة قبل رفعها.
 *
 * صورةُ هاتفٍ حديث ٤٠٠٠×٣٠٠٠ بكسل وبضعة ميغابايت، وهي تُعرض في دائرة
 * قطرها ١١٢ بكسل. رفعُها كما هي يستهلك حزمة المستخدم، ويقترب من مهلة
 * الطلب على شبكة بطيئة، ويصطدم بسقف الدلو (٢ ميغابايت) فيُرفض بخطأ
 * لا يفهمه أحد. التصغير إلى ٥١٢ بكسل يجعلها عشرات الكيلوبايتات.
 */

import { encode } from 'base64-arraybuffer';
import { Platform } from 'react-native';

import { logger } from '@/lib/logger';

/** أقصى بُعد بعد التصغير. ضعف ما يُعرض، ليبقى حاداً على الشاشات الكثيفة. */
export const MAX_AVATAR_EDGE = 512;

export interface CompressedImage {
  /** عنوان صالح للعرض فوراً. */
  uri: string;
  /** البايتات جاهزة للرفع، بلا قراءة ثانية. */
  bytes: ArrayBuffer;
  mimeType: string;
}

/* ------------------------------------------------------------------ */
/* الويب: canvas                                                        */
/* ------------------------------------------------------------------ */

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(source);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذّرت قراءة الصورة.'));
    };
    image.src = url;
  });
}

function scaledSize(width: number, height: number): [number, number] {
  const longest = Math.max(width, height);
  if (longest <= MAX_AVATAR_EDGE) return [width, height];
  const ratio = MAX_AVATAR_EDGE / longest;
  return [Math.round(width * ratio), Math.round(height * ratio)];
}

async function compressWeb(blob: Blob): Promise<CompressedImage> {
  const image = await loadImage(blob);
  const [width, height] = scaledSize(image.naturalWidth, image.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('تعذّر تهيئة لوحة الرسم.');
  context.drawImage(image, 0, 0, width, height);

  const output = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!output) throw new Error('تعذّر ضغط الصورة.');

  return {
    uri: URL.createObjectURL(output),
    bytes: await output.arrayBuffer(),
    mimeType: 'image/jpeg',
  };
}

/* ------------------------------------------------------------------ */
/* الهاتف: expo-image-manipulator                                       */
/* ------------------------------------------------------------------ */

async function compressNative(uri: string): Promise<CompressedImage> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');

  const context = ImageManipulator.manipulate(uri);
  // البُعد الأطول وحده يُحدَّد، فتُحفظ النسبة ولا تُشوَّه الصورة.
  context.resize({ width: MAX_AVATAR_EDGE });

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: 0.82,
    format: SaveFormat.JPEG,
  });

  const { readLocalFile } = await import('@/lib/files');
  const file = await readLocalFile(result.uri);
  return { uri: result.uri, bytes: file.bytes, mimeType: 'image/jpeg' };
}

/* ------------------------------------------------------------------ */

/**
 * يصغّر الصورة، ويرجع إلى الأصل إن تعذّر.
 *
 * الرجوع لا الرمي: الضغط تحسينٌ لا شرط. صورةٌ لم تُضغط ترفع أبطأ، وصورةٌ
 * لم تُرفع لا تُعرض — والثاني أسوأ.
 */
export async function compressForUpload(
  uri: string,
  blob?: Blob,
): Promise<CompressedImage> {
  try {
    if (Platform.OS === 'web') {
      const source = blob ?? (await (await fetch(uri)).blob());
      return await compressWeb(source);
    }
    return await compressNative(uri);
  } catch (error) {
    logger.warn('image', 'تعذّر الضغط — سنرفع الأصل', error);
    const { readLocalFile } = await import('@/lib/files');
    const file = await readLocalFile(uri, blob);
    return { uri, bytes: file.bytes, mimeType: file.mimeType };
  }
}

/**
 * يحوّل البايتات إلى عنوان `data:` صالح للحفظ.
 *
 * ضروري للوضع المحلي: عنوان `blob:` يموت مع إعادة تحميل الصفحة، فصورةٌ
 * حُفظت به تعود مربّعاً مكسوراً في المرّة التالية. و`data:` يعيش في
 * التخزين نفسه. وهو مقبول هنا وحده لأن الصورة مضغوطة إلى عشرات
 * الكيلوبايتات، ولا تغادر الجهاز أصلاً.
 */
export function toDataUri(bytes: ArrayBuffer, mimeType: string): string {
  return `data:${mimeType};base64,${encode(bytes)}`;
}
