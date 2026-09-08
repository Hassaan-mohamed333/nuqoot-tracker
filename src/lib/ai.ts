import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { TransactionDirection } from '@/types';
import {
  parseTransactionText,
  type ParsedTransaction,
} from '@/utils/parseTransactionText';

/**
 * جسر التطبيق إلى دوال الحافة التي تحمل مفتاح Gemini.
 *
 * لا يوجد مفتاح في التطبيق إطلاقاً: الاستدعاء يمرّ بجلسة المستخدم إلى
 * الدالة، وهي وحدها من يعرف المفتاح. عند تعذّر الخدمة نرجع إلى التحليل
 * المحلي بدل تعطيل الميزة.
 */

/** استجابة دالة parse-transaction. */
interface ParseResponse {
  contact_name: string | null;
  amount: number | null;
  type: 'CREDIT' | 'DEBIT' | null;
  note: string | null;
  currency: string | null;
}

/** استجابة دالة scan-receipt. */
export interface ReceiptScan {
  merchant: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  summary: string | null;
}

/** CREDIT في واجهة النموذج = المستخدم دفع = OUT في نموذج البيانات. */
function toDirection(type: ParseResponse['type']): TransactionDirection | null {
  if (type === 'CREDIT') return 'OUT';
  if (type === 'DEBIT') return 'IN';
  return null;
}

/** هل يمكن أصلاً محاولة استدعاء الذكاء الاصطناعي؟ */
export const isAiAvailable = isSupabaseConfigured;

export interface SmartParseResult {
  parsed: ParsedTransaction;
  /** true عندما جاء التحليل من النموذج لا من الشبكة الاحتياطية المحلية. */
  usedAi: boolean;
  /** سبب الرجوع إلى التحليل المحلي، إن حدث. */
  fallbackReason: string | null;
}

/**
 * يحلّل نصاً أو تسجيلاً صوتياً.
 * يحاول النموذج أولاً، ثم يرجع إلى المحلّل المحلي عند أي تعذّر.
 */
export async function smartParse(
  input: { text?: string; audioBase64?: string; audioMimeType?: string },
  knownContacts: string[],
): Promise<SmartParseResult> {
  const localFallback = (reason: string): SmartParseResult => ({
    parsed: parseTransactionText(input.text ?? '', knownContacts),
    usedAi: false,
    fallbackReason: reason,
  });

  if (!supabase) {
    return localFallback('الخدمة غير مضبوطة — استُخدم التحليل المحلي.');
  }

  try {
    const { data, error } = await supabase.functions.invoke<ParseResponse>(
      'parse-transaction',
      { body: { ...input, knownContacts } },
    );

    if (error) throw error;
    if (!data) throw new Error('استجابة فارغة.');

    return {
      parsed: {
        contactName: data.contact_name,
        amount: data.amount,
        direction: toDirection(data.type),
        note: data.note,
        currency: data.currency,
        confidence: 'high',
      },
      usedAi: true,
      fallbackReason: null,
    };
  } catch (caught) {
    // الصوت لا يمكن تحليله محلياً، فنُبلغ بدل ادّعاء نتيجة.
    if (input.audioBase64) {
      throw new Error(
        caught instanceof Error
          ? `تعذّر تحليل التسجيل: ${caught.message}`
          : 'تعذّر تحليل التسجيل الصوتي.',
      );
    }
    return localFallback('تعذّر الوصول إلى الخدمة — استُخدم التحليل المحلي.');
  }
}

/** يقرأ صورة إيصال. لا يوجد بديل محلي، فالفشل هنا فشل صريح. */
export async function scanReceipt(
  imageBase64: string,
  imageMimeType = 'image/jpeg',
): Promise<ReceiptScan> {
  if (!supabase) {
    throw new Error('قراءة الإيصالات تحتاج إلى إعداد Supabase و Gemini.');
  }

  const { data, error } = await supabase.functions.invoke<ReceiptScan>(
    'scan-receipt',
    { body: { imageBase64, imageMimeType } },
  );

  if (error) throw error;
  if (!data) throw new Error('تعذّرت قراءة الإيصال.');
  return data;
}
