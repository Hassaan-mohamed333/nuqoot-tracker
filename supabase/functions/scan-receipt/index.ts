import {
  ApiError,
  errorResponse,
  generateJson,
  enforceUserRateLimit,
  handleOptions,
  jsonResponse,
  originOf,
  requireUser,
  normalizeImagePayload,
  readJsonBody,
  toErrorResponse,
} from '../_shared/gemini.ts';

/**
 * يقرأ صورة إيصال ويستخرج المبلغ والتاريخ واسم المتجر.
 *
 * كل مسار خروج يعيد JSON مع ترويسات CORS، بما في ذلك الأخطاء، حتى لا
 * يواجه العميل جسماً فارغاً ("Unexpected end of JSON input") أو خطأ CORS
 * بدل الرسالة الحقيقية.
 */

interface RequestBody {
  /** base64 خام أو data URL كامل؛ الاثنان مقبولان. */
  imageBase64?: unknown;
  imageMimeType?: unknown;
}

interface ReceiptScan {
  merchant: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  summary: string | null;
}

/**
 * أسماء الأنواع بحروف كبيرة هي الصيغة المعتمدة في Schema الخاص بـ Gemini.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    total: { type: 'NUMBER', nullable: true },
    currency: { type: 'STRING', nullable: true },
    date: { type: 'STRING', nullable: true },
    summary: { type: 'STRING', nullable: true },
  },
  required: ['merchant', 'total', 'currency', 'date', 'summary'],
} as const;

const SYSTEM_INSTRUCTION = `استخرج بيانات هذا الإيصال.

القواعد:
- total هو المبلغ الإجمالي النهائي المدفوع، لا مجموع فرعي ولا ضريبة منفردة.
- date بصيغة YYYY-MM-DD فقط، أو null إن لم يظهر تاريخ واضح.
- currency رمز ISO مثل EGP أو SAR، أو null.
- merchant اسم المتجر كما يظهر.
- summary سطر واحد يصف المشتريات.
- ضع null لأي حقل غير مقروء؛ لا تخمّن ولا تخترع رقماً.`;

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = originOf(request);

  // الـ preflight أولاً: قبل أي تحقق، وإلا حجبه المتصفح.
  if (request.method === 'OPTIONS') {
    return handleOptions(origin);
  }

  if (request.method !== 'POST') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      `الطريقة ${request.method} غير مدعومة؛ استخدم POST.`,
      405,
      undefined,
      origin,
    );
  }

  try {
    const userId = await requireUser(request);
    enforceUserRateLimit(userId);

    const body = await readJsonBody<RequestBody>(request);

    // يتحقق من الوجود والحجم وصحة الترميز، ويزيل بادئة data URL إن وُجدت.
    const image = normalizeImagePayload(
      body.imageBase64,
      typeof body.imageMimeType === 'string' && body.imageMimeType.trim()
        ? body.imageMimeType.trim()
        : 'image/jpeg',
    );

    const scan = await generateJson<ReceiptScan>(
      [
        {
          inline_data: { mime_type: image.mimeType, data: image.data },
        },
        { text: 'استخرج بيانات الإيصال.' },
      ],
      RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      SYSTEM_INSTRUCTION,
    );

    return jsonResponse(
      {
        merchant: scan.merchant ?? null,
        total: typeof scan.total === 'number' ? scan.total : null,
        currency: scan.currency ?? null,
        date: scan.date ?? null,
        summary: scan.summary ?? null,
      },
      200,
      origin,
    );
  } catch (error) {
    // ApiError يحمل حالته الصحيحة؛ أي شيء آخر يصبح 500 بجسم JSON.
    if (!(error instanceof ApiError)) {
      console.error('scan-receipt unexpected failure:', error);
    }
    return toErrorResponse(error, origin);
  }
});
