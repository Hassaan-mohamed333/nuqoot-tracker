import {
  corsHeaders,
  generateJson,
  isConfigured,
  jsonResponse,
} from '../_shared/gemini.ts';

/**
 * يحوّل جملة طبيعية (أو تسجيلاً صوتياً) إلى حقول حركة مقترحة.
 *
 * الدالة تقترح فقط: التطبيق يعرض النتيجة في النموذج ليراجعها المستخدم
 * قبل الحفظ، فلا يُكتب شيء في قاعدة البيانات من هنا.
 */

interface RequestBody {
  /** نص المستخدم؛ مطلوب ما لم يُرسل صوت. */
  text?: string;
  /** تسجيل صوتي بصيغة base64 مع نوعه، لتفريغه وتحليله في خطوة واحدة. */
  audioBase64?: string;
  audioMimeType?: string;
  /** أسماء جهات الاتصال المعروفة، ليطابق النموذج اسماً قائماً بدل اختراعه. */
  knownContacts?: string[];
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    contact_name: { type: 'string', nullable: true },
    amount: { type: 'number', nullable: true },
    type: { type: 'string', enum: ['CREDIT', 'DEBIT'], nullable: true },
    note: { type: 'string', nullable: true },
    currency: { type: 'string', nullable: true },
  },
  required: ['contact_name', 'amount', 'type', 'note', 'currency'],
};

const SYSTEM_INSTRUCTION = `أنت مساعد لتطبيق "النقوط والواجبات" المصري.
حوّل كلام المستخدم إلى حقول حركة مالية.

القواعد:
- type = "CREDIT" عندما يدفع المستخدم أو يعطي غيره (دفعت، نقّطت، أعطيت، gave, paid).
- type = "DEBIT" عندما يستلم المستخدم من غيره (أخذت، استلمت، قبضت، took, received).
- amount رقم موجب دائماً بلا رمز عملة.
- currency رمز ISO مثل EGP أو SAR، أو null إن لم يُذكر.
- contact_name يجب أن يطابق اسماً من القائمة المعطاة حرفياً إن وُجد ما يقابله؛
  وإلا ضع الاسم كما نطقه المستخدم، أو null إن لم يُذكر اسم.
- note وصف مختصر جداً للسبب، أو null.
- لا تخمّن حقلاً غير مذكور: ضع null بدل التخمين.`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isConfigured()) {
    // 503 وليس 500: الخدمة غير مُهيّأة، والتطبيق يتحوّل إلى التحليل المحلي.
    return jsonResponse(
      { error: 'AI_NOT_CONFIGURED', message: 'مفتاح Gemini غير مضبوط.' },
      503,
    );
  }

  try {
    const body = (await request.json()) as RequestBody;
    const knownContacts = body.knownContacts ?? [];

    const parts = [];
    if (body.audioBase64 && body.audioMimeType) {
      parts.push({
        inline_data: {
          mime_type: body.audioMimeType,
          data: body.audioBase64,
        },
      });
      parts.push({ text: 'فرّغ هذا التسجيل ثم استخرج حقول الحركة منه.' });
    } else if (body.text?.trim()) {
      parts.push({ text: body.text.trim() });
    } else {
      return jsonResponse(
        { error: 'EMPTY_INPUT', message: 'أرسل نصاً أو تسجيلاً صوتياً.' },
        400,
      );
    }

    if (knownContacts.length > 0) {
      parts.push({
        text: `أسماء جهات الاتصال المتاحة: ${knownContacts.join(' | ')}`,
      });
    }

    const parsed = await generateJson<Record<string, unknown>>(
      parts,
      RESPONSE_SCHEMA,
      SYSTEM_INSTRUCTION,
    );

    return jsonResponse({ ...parsed, confidence: 'high' });
  } catch (error) {
    return jsonResponse(
      {
        error: 'AI_FAILED',
        message: error instanceof Error ? error.message : 'خطأ غير متوقع.',
      },
      502,
    );
  }
});
