import { Platform } from 'react-native';

/**
 * قراءة ملف محلي كـ ArrayBuffer، بمسار مختلف لكل منصة.
 *
 * صنف File في expo-file-system غير مُنفَّذ على الويب: النسخة الويبية من
 * FileSystemFile هيكل فارغ بلا validatePath ولا arrayBuffer، وباني الصنف
 * ينادي this.validatePath()، فيخرج الخطأ:
 *   "this.validatePath is not a function"
 *
 * على الويب يكون العنوان blob: أو data: أو http:، وكلّها يقرأها fetch.
 * على المنصات الأصلية يكون file:// وهو ما لا يقرأه fetch بثبات، فنستخدم
 * صنف File هناك.
 */
export async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`تعذّرت قراءة الملف (${response.status}).`);
    }
    return await response.arrayBuffer();
  }

  // استيراد كسول: يُبقي expo-file-system خارج مسار الإقلاع.
  const { File } = await import('expo-file-system');
  return await new File(uri).arrayBuffer();
}
