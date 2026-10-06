/**
 * يفكّ المسار المستعار `@/...` لمشغّل اختبارات node.
 *
 * TypeScript و Metro يعرفان الاسم المستعار من tsconfig و babel، وnode لا
 * يعرفه. بدون هذا الحلّ كان على كل وحدة تريد اختباراً أن تكتب مسارات
 * نسبية — أي أن يفرض الاختبارُ شكلَ الشيفرة، وهو عكس الترتيب الصحيح.
 */
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** الامتدادات المجرَّبة بالترتيب، كما يفعل محلِّل Metro. */
const CANDIDATES = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, next) {
  if (!specifier.startsWith('@/')) return next(specifier, context);

  const base = path.join(SRC, specifier.slice(2));
  for (const suffix of CANDIDATES) {
    const candidate = base + suffix;
    try {
      // ملفٌ لا مجلّد: المجلّد يُجرَّب لاحقاً بلاحقة /index.
      if (statSync(candidate).isFile()) {
        return next(pathToFileURL(candidate).href, context);
      }
    } catch {
      // غير موجود: نجرّب اللاحقة التالية.
    }
  }

  // لا ملف مطابق: نترك node يرفع خطأه الأصلي، فهو أوضح من خطأ نصنعه.
  return next(specifier, context);
}
