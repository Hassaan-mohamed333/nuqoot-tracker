/**
 * غلاف مشترك حول Gemini لدوال الحافة (Edge Functions).
 *
 * المفتاح يبقى هنا على الخادم كسرّ (secret) ولا يصل إلى التطبيق أبداً:
 * أي مفتاح يوضع في متغير EXPO_PUBLIC_* يُحزم داخل حزمة JavaScript ويمكن
 * استخراجه من ملف التطبيق، فيُستهلك رصيد الحساب من أي شخص.
 *
 * قاعدة هذا الملف: لا يخرج من الدالة إلا JSON. أي فشل يتحوّل إلى
 * ApiError برمز ورسالة وحالة HTTP مناسبة، فلا يرى العميل جسماً فارغاً.
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

/**
 * يُضبط من أسرار المشروع؛ غيّره دون تعديل الكود عند تغيّر أسماء الطُرُز:
 *   supabase secrets set GEMINI_MODEL=...
 *
 * نُزيل بادئة "models/" إن كتبها أحد في المتغير، لأن ENDPOINT يحتوي عليها
 * أصلاً وتكرارها ينتج مساراً خاطئاً ينتهي بـ 404.
 */
const GEMINI_MODEL = (Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash')
  .trim()
  .replace(/^models\//, '');

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** الرابط الكامل كما تتوقعه واجهة REST. */
function generateContentUrl(): string {
  return `${ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
}

/** مهلة الطلب: بلا مهلة قد يبقى الاستدعاء معلّقاً ويستهلك زمن التنفيذ. */
const TIMEOUT_MS = 25000;

/** أقصى حجم صورة بعد فك الترميز. أكبر من ذلك يُرفض برسالة واضحة. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * ترويسات CORS كاملة.
 *
 * معاينة الويب ترسل طلب preflight من أصل مختلف، ولا بد أن تُرد الترويسات
 * على كل استجابة — بما فيها استجابات الخطأ — وإلا رأى المتصفح خطأ CORS
 * غامضاً بدل رسالتنا.
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

/** خطأ يحمل رمزاً وحالة HTTP، ليصل إلى العميل كـ JSON مفهوم. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** استجابة خطأ موحّدة: { error, code }. */
export function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return jsonResponse({ error: message, code }, status);
}

/** يحوّل أي استثناء إلى استجابة JSON، فلا يخرج جسم فارغ أبداً. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message, error.status);
  }
  const message =
    error instanceof Error ? error.message : 'خطأ غير متوقع في الخادم.';
  return errorResponse('INTERNAL_ERROR', message, 500);
}

/** رد الـ preflight. 204 بلا جسم هو الرد الصحيح لـ OPTIONS. */
export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function isConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

/** يتحقق من ضبط المفتاح ويرمي خطأً واضحاً إن غاب. */
export function assertConfigured(): void {
  if (!isConfigured()) {
    throw new ApiError(
      'AI_NOT_CONFIGURED',
      'GEMINI_API_KEY غير مضبوط في أسرار المشروع. نفّذ: supabase secrets set GEMINI_API_KEY=...',
      503,
    );
  }
}

/**
 * يقرأ جسم الطلب كـ JSON.
 *
 * request.json() على جسم فارغ يرمي "Unexpected end of JSON input"، وهي
 * رسالة لا تدل المستخدم على شيء؛ نحوّلها إلى 400 مفهوم.
 */
export async function readJsonBody<T>(request: Request): Promise<T> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new ApiError('INVALID_BODY', 'تعذّرت قراءة جسم الطلب.', 400);
  }

  if (!raw.trim()) {
    throw new ApiError('EMPTY_BODY', 'جسم الطلب فارغ.', 400);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError('INVALID_JSON', 'جسم الطلب ليس JSON صالحاً.', 400);
  }
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export interface NormalizedImage {
  data: string;
  mimeType: string;
  bytes: number;
}

/**
 * يطبّع حمولة base64 قادمة من العميل.
 *
 * عميل الويب كثيراً ما يعطي data URL كاملاً
 * ("data:image/jpeg;base64,...") بينما ينتظر Gemini الترميز الخام فقط،
 * وبعض المنصات تُدخل أسطراً جديدة. الطرفان يُعالجان هنا، ونستخرج نوع
 * الصورة من الـ data URL إن وُجد.
 */
export function normalizeImagePayload(
  input: unknown,
  fallbackMimeType = 'image/jpeg',
): NormalizedImage {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ApiError(
      'EMPTY_IMAGE',
      'أرسل صورة الإيصال في الحقل imageBase64.',
      400,
    );
  }

  let value = input.trim();
  let mimeType = fallbackMimeType;

  const dataUrl = value.match(/^data:([^;,]+);base64,(.*)$/s);
  if (dataUrl) {
    mimeType = dataUrl[1];
    value = dataUrl[2];
  }

  // إزالة أي فراغات أو أسطر داخل الترميز.
  value = value.replace(/\s+/g, '');

  if (value.length === 0) {
    throw new ApiError('EMPTY_IMAGE', 'حمولة الصورة فارغة بعد التنظيف.', 400);
  }

  if (!BASE64_PATTERN.test(value)) {
    throw new ApiError(
      'INVALID_IMAGE',
      'حمولة الصورة ليست ترميز base64 صالحاً.',
      400,
    );
  }

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((value.length * 3) / 4) - padding;

  if (bytes > MAX_IMAGE_BYTES) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    const limit = (MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0);
    throw new ApiError(
      'IMAGE_TOO_LARGE',
      `حجم الصورة ${mb} ميجابايت ويتجاوز الحد ${limit}. صوّر بجودة أقل أو قصّ الصورة.`,
      413,
    );
  }

  if (!mimeType.startsWith('image/')) {
    throw new ApiError(
      'INVALID_MIME_TYPE',
      `نوع الملف "${mimeType}" ليس صورة.`,
      400,
    );
  }

  return { data: value, mimeType, bytes };
}

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

/**
 * ينادي Gemini ويطلب مخرجاً بصيغة JSON مطابقاً للمخطط المعطى.
 *
 * كل حالات الفشل تتحوّل إلى ApiError: انتهاء المهلة، خطأ HTTP من Gemini،
 * حجب بفلاتر الأمان، رد بلا نص، أو نص ليس JSON. الحالة الأخيرة تحديداً
 * هي مصدر رسالة "Unexpected end of JSON input" حين كنا نمرّر النص إلى
 * JSON.parse بلا فحص.
 */
export async function generateJson<T>(
  parts: GeminiPart[],
  responseSchema: Record<string, unknown>,
  systemInstruction: string,
): Promise<T> {
  assertConfigured();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      generateContentUrl(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: 0,
          },
        }),
      },
    );
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') {
      throw new ApiError(
        'GEMINI_TIMEOUT',
        `لم يستجب Gemini خلال ${TIMEOUT_MS / 1000} ثانية.`,
        504,
      );
    }
    throw new ApiError(
      'GEMINI_UNREACHABLE',
      `تعذّر الوصول إلى Gemini: ${
        caught instanceof Error ? caught.message : 'سبب غير معروف'
      }`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    // 404 يعني أن اسم الطراز غير معروف لهذا المفتاح — خطأ إعداد لا عطل
    // مؤقت، فنسمّي الطراز في الرسالة ونشير إلى طريقة تغييره.
    if (response.status === 404) {
      throw new ApiError(
        'GEMINI_MODEL_NOT_FOUND',
        `الطراز "${GEMINI_MODEL}" غير متاح لهذا المفتاح. غيّره بـ: supabase secrets set GEMINI_MODEL=<model>`,
        503,
      );
    }

    // 401/403 من Gemini تعني مفتاحاً خاطئاً، وهو خطأ إعداد لا خطأ مستخدم.
    const status = response.status === 401 || response.status === 403 ? 503 : 502;
    throw new ApiError(
      'GEMINI_HTTP_ERROR',
      `Gemini ردّ بالحالة ${response.status}: ${
        detail.slice(0, 400) || 'بلا تفاصيل'
      }`,
      status,
    );
  }

  let payload: {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('GEMINI_BAD_RESPONSE', 'رد Gemini ليس JSON.', 502);
  }

  const blockReason = payload.promptFeedback?.blockReason;
  if (blockReason) {
    throw new ApiError(
      'GEMINI_BLOCKED',
      `رفض Gemini المحتوى (${blockReason}).`,
      422,
    );
  }

  const candidate = payload.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (finishReason && finishReason !== 'STOP') {
    const hint =
      finishReason === 'MAX_TOKENS'
        ? 'تجاوز الرد الحد الأقصى للطول.'
        : `سبب الإنهاء: ${finishReason}.`;
    throw new ApiError('GEMINI_INCOMPLETE', `لم يكتمل رد Gemini. ${hint}`, 502);
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new ApiError(
      'GEMINI_EMPTY',
      'رد Gemini بلا محتوى نصي قابل للقراءة.',
      502,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      'GEMINI_BAD_JSON',
      `رد Gemini ليس JSON صالحاً: ${text.slice(0, 200)}`,
      502,
    );
  }
}
