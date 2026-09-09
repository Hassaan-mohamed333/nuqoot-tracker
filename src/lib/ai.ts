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

/**
 * يستخرج رسالة الخطأ الحقيقية من فشل دالة الحافة.
 *
 * supabase-js يضع في error.message نصاً عاماً دائماً ("Edge Function
 * returned a non-2xx status code")، بينما الجسم الحقيقي — وفيه سبب الفشل —
 * موجود في error.context كاستجابة. بلا قراءتها لا يرى المستخدم إلا الرسالة
 * العامة مهما كان السبب.
 */
async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context as
    | { status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> }
    | undefined;

  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as {
        error?: string;
        code?: string;
        detail?: string;
      };
      if (body?.error) {
        // detail يحمل حصيلة كل طراز في السلسلة؛ مفيد جداً عند تشخيص
        // الازدحام مقابل اسم طراز خاطئ.
        const parts = [body.error];
        if (body.code) parts.push(`[${body.code}]`);
        if (body.detail) parts.push(`— ${body.detail}`);
        return parts.join(' ');
      }
    } catch {
      // الجسم ليس JSON — نجرّب النص الخام أدناه.
    }
  }

  if (context && typeof context.text === 'function') {
    try {
      const raw = (await context.text()).trim();
      if (raw) return raw.slice(0, 300);
    } catch {
      // نتجاهل ونكتفي بالحالة.
    }
  }

  if (context?.status) {
    return `فشل الطلب بالحالة ${context.status}.`;
  }

  return error instanceof Error ? error.message : 'خطأ غير متوقع.';
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

    if (error) throw new Error(await describeFunctionError(error));
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
    const reason = await describeFunctionError(caught);
    return localFallback(`تعذّر الوصول إلى الخدمة (${reason}) — استُخدم التحليل المحلي.`);
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

  if (error) throw new Error(await describeFunctionError(error));
  if (!data) throw new Error('تعذّرت قراءة الإيصال.');
  return data;
}
