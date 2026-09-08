import {
  corsHeaders,
  generateJson,
  isConfigured,
  jsonResponse,
} from '../_shared/gemini.ts';

/** يقرأ صورة إيصال ويستخرج المبلغ والتاريخ واسم المتجر. */

interface RequestBody {
  /** الصورة بصيغة base64 بلا بادئة data:. */
  imageBase64: string;
  imageMimeType?: string;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string', nullable: true },
    total: { type: 'number', nullable: true },
    currency: { type: 'string', nullable: true },
    /** ISO 8601 (YYYY-MM-DD) أو null. */
    date: { type: 'string', nullable: true },
    summary: { type: 'string', nullable: true },
  },
  required: ['merchant', 'total', 'currency', 'date', 'summary'],
};

const SYSTEM_INSTRUCTION = `استخرج بيانات هذا الإيصال.

القواعد:
- total هو المبلغ الإجمالي النهائي المدفوع، لا مجموع فرعي ولا ضريبة منفردة.
- date بصيغة YYYY-MM-DD فقط، أو null إن لم يظهر تاريخ واضح.
- currency رمز ISO مثل EGP أو SAR، أو null.
- merchant اسم المتجر كما يظهر.
- summary سطر واحد يصف المشتريات.
- ضع null لأي حقل غير مقروء؛ لا تخمّن ولا تخترع رقماً.`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isConfigured()) {
    return jsonResponse(
      { error: 'AI_NOT_CONFIGURED', message: 'مفتاح Gemini غير مضبوط.' },
      503,
    );
  }

  try {
    const body = (await request.json()) as RequestBody;
    if (!body.imageBase64) {
      return jsonResponse(
        { error: 'EMPTY_INPUT', message: 'أرسل صورة الإيصال.' },
        400,
      );
    }

    const parsed = await generateJson<Record<string, unknown>>(
      [
        {
          inline_data: {
            mime_type: body.imageMimeType ?? 'image/jpeg',
            data: body.imageBase64,
          },
        },
        { text: 'استخرج بيانات الإيصال.' },
      ],
      RESPONSE_SCHEMA,
      SYSTEM_INSTRUCTION,
    );

    return jsonResponse(parsed);
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
