import {
  ApiError,
  errorResponse,
  generateJson,
  handleOptions,
  jsonResponse,
  MAX_IMAGE_BYTES,
  readJsonBody,
  toErrorResponse,
  type GeminiPart,
} from '../_shared/gemini.ts';

/**
 * يحوّل جملة طبيعية (أو تسجيلاً صوتياً) إلى حقول حركة مقترحة.
 *
 * الدالة تقترح فقط: التطبيق يعرض النتيجة في النموذج ليراجعها المستخدم
 * قبل الحفظ، فلا يُكتب شيء في قاعدة البيانات من هنا.
 */

interface RequestBody {
  text?: unknown;
  audioBase64?: unknown;
  audioMimeType?: unknown;
  knownContacts?: unknown;
}

interface ParseResponse {
  contact_name: string | null;
  amount: number | null;
  type: 'CREDIT' | 'DEBIT' | null;
  note: string | null;
  currency: string | null;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    contact_name: { type: 'STRING', nullable: true },
    amount: { type: 'NUMBER', nullable: true },
    type: { type: 'STRING', enum: ['CREDIT', 'DEBIT'], nullable: true },
    note: { type: 'STRING', nullable: true },
    currency: { type: 'STRING', nullable: true },
  },
  required: ['contact_name', 'amount', 'type', 'note', 'currency'],
} as const;

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

/** ينظّف حمولة الصوت: يزيل بادئة data URL والفراغات، ويتحقق من الحجم. */
function normalizeAudio(input: string, mimeType: string) {
  let value = input.trim();
  let resolvedMime = mimeType;

  const dataUrl = value.match(/^data:([^;,]+);base64,(.*)$/s);
  if (dataUrl) {
    resolvedMime = dataUrl[1];
    value = dataUrl[2];
  }
  value = value.replace(/\s+/g, '');

  if (!value) {
    throw new ApiError('EMPTY_AUDIO', 'حمولة الصوت فارغة.', 400);
  }

  const bytes = Math.floor((value.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new ApiError(
      'AUDIO_TOO_LARGE',
      `حجم التسجيل ${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت ويتجاوز الحد. سجّل مقطعاً أقصر.`,
      413,
    );
  }

  return { data: value, mimeType: resolvedMime };
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'POST') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      `الطريقة ${request.method} غير مدعومة؛ استخدم POST.`,
      405,
    );
  }

  try {
    const body = await readJsonBody<RequestBody>(request);

    const knownContacts = Array.isArray(body.knownContacts)
      ? body.knownContacts.filter((name): name is string => typeof name === 'string')
      : [];

    const parts: GeminiPart[] = [];

    if (typeof body.audioBase64 === 'string' && body.audioBase64.trim()) {
      const audio = normalizeAudio(
        body.audioBase64,
        typeof body.audioMimeType === 'string' && body.audioMimeType.trim()
          ? body.audioMimeType.trim()
          : 'audio/m4a',
      );
      parts.push({
        inline_data: { mime_type: audio.mimeType, data: audio.data },
      });
      parts.push({ text: 'فرّغ هذا التسجيل ثم استخرج حقول الحركة منه.' });
    } else if (typeof body.text === 'string' && body.text.trim()) {
      parts.push({ text: body.text.trim() });
    } else {
      return errorResponse(
        'EMPTY_INPUT',
        'أرسل نصاً في الحقل text أو تسجيلاً في الحقل audioBase64.',
        400,
      );
    }

    if (knownContacts.length > 0) {
      parts.push({
        text: `أسماء جهات الاتصال المتاحة: ${knownContacts.join(' | ')}`,
      });
    }

    const parsed = await generateJson<ParseResponse>(
      parts,
      RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      SYSTEM_INSTRUCTION,
    );

    return jsonResponse({
      contact_name: parsed.contact_name ?? null,
      amount: typeof parsed.amount === 'number' ? parsed.amount : null,
      type: parsed.type ?? null,
      note: parsed.note ?? null,
      currency: parsed.currency ?? null,
      confidence: 'high',
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error('parse-transaction unexpected failure:', error);
    }
    return toErrorResponse(error);
  }
});
