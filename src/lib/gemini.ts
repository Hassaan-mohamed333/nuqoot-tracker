/**
 * طبقة خدمة المساعد الذكي.
 *
 * ---------------------------------------------------------------------
 * **أين مفتاح Gemini؟ على الخادم، لا هنا.**
 *
 * الطلب الأصلي لهذا الملف كان أن يُنشئ عميل `GoogleGenerativeAI` من
 * متغيّرات البيئة. لا يصحّ ذلك في تطبيق React Native: كل متغيّر
 * `EXPO_PUBLIC_*` يُدمَج في حزمة JavaScript ويُستخرج من ملف APK/IPA
 * بأدوات بسيطة، فيصير المفتاح في يد كل من حمّل التطبيق ويُستنزف رصيد
 * الحساب. وهي القاعدة المكتوبة في `.env.example` و
 * `supabase/functions/README.md` وأحد بنود SECURITY.md.
 *
 * فالتقسيم: هذا الملف يملك **عقد الأدوات وتهيئة النداء**، ودالّة الحافة
 * `assistant` تملك المفتاح وتنادي Gemini. ما يتغيّر هو موضع المفتاح لا
 * شكل الواجهة: `processUserCommand` يبقى نقطة الدخول الوحيدة.
 * ---------------------------------------------------------------------
 */

import { describeFunctionError } from '@/lib/assistantErrors';
import { logger } from '@/lib/logger';
import { isSupabaseReady, supabase } from '@/lib/supabase';
import { userMessage } from '@/lib/supabaseError';

export { describeFunctionError } from '@/lib/assistantErrors';

export {
  describeAction,
  parseToolCall,
  requiresConfirmation,
  SCREEN_TARGETS,
  TOOL_NAMES,
  type AssistantAction,
  type ScreenTarget,
  type ToolName,
} from '@/lib/assistantTools';

/** الطراز المطلوب. يُضبط على الخادم: `supabase secrets set GEMINI_MODEL=...` */
export const ASSISTANT_MODEL = 'gemini-2.5-flash';

/** نداء أداة كما وصل من الطراز، قبل التحقّق. */
export interface RawToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** دورة واحدة في سجلّ المحادثة المرسَل إلى الخادم. */
export interface AssistantTurn {
  role: 'user' | 'model';
  text?: string;
  functionCall?: RawToolCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
}

/** ما يعرفه المساعد عن حالة التطبيق لحظة السؤال. */
export interface AssistantContext {
  /** الشاشة المعروضة الآن، ليفهم «ارجع» و«هنا». */
  screen?: string;
  contactNames?: string[];
  eventTitles?: string[];
  currency?: string;
}

/** نتيجة دورة واحدة: كلام، أو نداءات أدوات، أو الاثنان. */
export type CommandResult =
  | { kind: 'text'; text: string }
  | { kind: 'calls'; calls: RawToolCall[]; text: string | null }
  | { kind: 'error'; message: string };

interface AssistantResponse {
  text: string | null;
  calls: RawToolCall[];
}

/**
 * يرسل دورة إلى المساعد ويعيد قراره.
 *
 * لا يرمي: كل مسارات الفشل تعود بـ `kind: 'error'` برسالة صالحة للعرض.
 * الرمي هنا كان سيعني أن كل مستدعٍ يكرّر نفس `try/catch`، وأن نسيانه
 * مرّة واحدة يُسقط الواجهة.
 */
export async function processUserCommand(
  history: AssistantTurn[],
  context?: AssistantContext,
): Promise<CommandResult> {
  if (!isSupabaseReady() || !supabase) {
    // الأوامر الشائعة تُفهم على الجهاز قبل بلوغ هذه الدالّة، فما يصل
    // إلى هنا في الوضع المحلي هو ما يحتاج فهماً حقيقياً فعلاً.
    return {
      kind: 'error',
      message:
        'أفهم أوامر التسجيل والتنقّل بلا خادم — مثل «سجّل ٥٠٠ لسامي». ' +
        'أمّا الأسئلة المفتوحة فتحتاج إعداد Supabase.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke<AssistantResponse>(
      'assistant',
      { body: { messages: history, context } },
    );

    if (error) {
      return { kind: 'error', message: await describeFunctionError(error) };
    }
    if (!data) {
      return { kind: 'error', message: 'وصلت استجابة فارغة من المساعد.' };
    }

    const calls = Array.isArray(data.calls) ? data.calls : [];
    if (calls.length > 0) {
      return { kind: 'calls', calls, text: data.text ?? null };
    }

    const text = (data.text ?? '').trim();
    if (!text) {
      return { kind: 'error', message: 'لم أفهم الطلب. أعد صياغته من فضلك.' };
    }
    return { kind: 'text', text };
  } catch (caught) {
    logger.error('assistant', 'فشل نداء المساعد', caught);
    return { kind: 'error', message: userMessage(caught) };
  }
}

/**
 * هل المساعد متاح؟ نعم دائماً.
 *
 * كان يعيد `isSupabaseReady()`، فيختفي الزرّ كلّه في الوضع المحلي. وقد
 * صار المفسّر المحلي يغطّي أوامر التسجيل والتنقّل بلا خادم ولا مفتاح،
 * فإخفاء المدخل يمنع ما يعمل من أجل ما لا يعمل.
 */
export function isAssistantAvailable(): boolean {
  return true;
}

/** هل يبلغ المساعد الطراز، أم يعمل بالمفسّر المحلي وحده؟ */
export function isModelReachable(): boolean {
  return isSupabaseReady();
}
