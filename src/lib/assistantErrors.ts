/**
 * تشخيص فشل نداء دالّة الحافة.
 *
 * وحدة نقيّة عمداً (لا react-native ولا supabase) كي تُختبر وحدها تحت
 * node: منطق التشخيص هو ما انكسر، فوجب أن يكون هو ما يُختبر مباشرةً.
 */

import { userMessage } from '@/lib/supabaseError';

/** جسم الخطأ كما تكتبه دالّة الحافة. */
interface EdgeErrorBody {
  error?: string;
  code?: string;
}

/**
 * يقرأ جسم استجابة الفشل، إن كان JSON.
 *
 * `context` في أخطاء supabase-js هو الاستجابة نفسها لأخطاء HTTP، وكائن
 * الشبكة الأصلي لأخطاء الإرسال. فنفحص قبل أن نقرأ.
 */
async function readErrorBody(context: unknown): Promise<EdgeErrorBody | null> {
  const response = context as { json?: () => Promise<unknown> } | null;
  if (!response || typeof response.json !== 'function') return null;
  try {
    return (await response.json()) as EdgeErrorBody;
  } catch {
    // الجسم ليس JSON — الحالة مشروحة بالحالة أدناه.
    return null;
  }
}

/**
 * يترجم فشل نداء دالّة الحافة إلى سبب يمكن التصرّف بناءً عليه.
 *
 * ---------------------------------------------------------------------
 * لماذا هذه الدالّة بهذا الطول: كانت كل مسارات الفشل تنتهي إلى رسالة
 * واحدة — «تعذّر إتمام العملية. حاول مرّة أخرى.» — فيرى المستخدم النصّ
 * نفسه سواء كانت الدالّة غير منشورة، أو المفتاح غير مضبوط، أو الجلسة
 * منتهية، أو CORS يمنع الطلب. أربعة أعطال مختلفة، أربعة إصلاحات
 * مختلفة، ورسالة واحدة لا تدلّ على أيّها.
 *
 * السبب التقني: `userMessage` يقرأ `code`/`status` من الخطأ نفسه، وأخطاء
 * `functions-js` لا تحملهما — الحالة داخل `context` (الاستجابة)، ونصّ
 * عطب الشبكة داخل `context` أيضاً لا في `message`. فكان كل شيء يسقط إلى
 * الحالة العامّة.
 * ---------------------------------------------------------------------
 */
export async function describeFunctionError(error: unknown): Promise<string> {
  const shape = error as { name?: string; context?: unknown } | null;
  const context = shape?.context;

  // ١. عطب إرسال: لم تصل الطلب أصلاً. السبب شبكة، أو CORS، أو نطاق خاطئ.
  if (shape?.name === 'FunctionsFetchError') {
    const cause = (context as { message?: string } | null)?.message ?? '';
    return (
      'تعذّر الوصول إلى خادم المساعد. تحقّق من الشبكة، ومن أن عنوان ' +
      'Supabase صحيح، ومن أن نطاق الموقع مسموح في إعدادات CORS للدالّة.' +
      (cause ? ` (${cause})` : '')
    );
  }

  if (shape?.name === 'FunctionsRelayError') {
    return 'تعذّر على Supabase الوصول إلى دالّة المساعد. أعد المحاولة بعد قليل.';
  }

  const status = (context as { status?: number } | null)?.status;
  const body = await readErrorBody(context);

  // ٢. رسالة الدالّة نفسها أدقّ ما لدينا: هي تعرف سبب رفضها.
  if (body?.error) return body.error;

  switch (status) {
    case 401:
      return 'انتهت جلستك. سجّل الدخول من جديد.';
    case 403:
      return 'لا تملك صلاحية لاستدعاء المساعد.';
    case 404:
      // العطب الأشيع عند أوّل تشغيل، وكان أغمض الرسائل.
      return (
        'دالّة المساعد غير منشورة على مشروعك. انشرها بالأمر: ' +
        'supabase functions deploy assistant'
      );
    case 429:
      return 'طلبات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.';
    case 500:
    case 502:
    case 503:
    case 504:
      return (
        'خادم المساعد ردّ بخطأ. الأرجح أن GEMINI_API_KEY غير مضبوط: ' +
        'supabase secrets set GEMINI_API_KEY=…'
      );
    default:
      break;
  }

  if (body?.code) return `رفض الخادم الطلب (${body.code}).`;
  return userMessage(error);
}
