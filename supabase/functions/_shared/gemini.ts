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
function readModel(name: string, fallback: string): string {
  return (Deno.env.get(name) ?? fallback).trim().replace(/^models\//, '');
}

const GEMINI_MODEL = readModel('GEMINI_MODEL', 'gemini-2.0-flash');

/**
 * طراز احتياطي يُجرَّب عندما يعجز الأساسي (ضغط، حصة، أو طراز غير متاح).
 * قابل للضبط: supabase secrets set GEMINI_FALLBACK_MODEL=...
 */
const GEMINI_FALLBACK_MODEL = readModel(
  'GEMINI_FALLBACK_MODEL',
  'gemini-3.6-flash',
);

/**
 * طبقة خفيفة تُجرَّب أخيراً: عادةً حصتها أوسع وزمن ردها أقصر، فهي أفضل
 * فرصة للنجاح حين تكون الطبقات الأثقل مزدحمة.
 */
const GEMINI_LITE_MODEL = readModel(
  'GEMINI_LITE_MODEL',
  'gemini-3.1-flash-lite',
);

/** سلسلة المحاولة بالترتيب، بلا تكرار وبلا قيم فارغة. */
const MODEL_CHAIN = [
  ...new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_LITE_MODEL]),
].filter((model) => model.length > 0);

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** الرابط الكامل كما تتوقعه واجهة REST. */
function generateContentUrl(model: string): string {
  return `${ENDPOINT}/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

/**
 * ميزانية الوقت.
 *
 * العميل يقطع أي طلب بعد REQUEST_TIMEOUT_MS، فلو تجاوزت المحاولات وفترات
 * الانتظار تلك المهلة لرأى المستخدم انقطاعاً من طرفه بدل رسالتنا المهذّبة.
 * لذلك: مهلة قصيرة لكل محاولة، وسقف إجمالي أقل من مهلة العميل.
 */
const ATTEMPT_TIMEOUT_MS = 10000;
const TOTAL_BUDGET_MS = 32000;

/**
 * محاولة واحدة لكل طراز.
 *
 * طرازٌ مشبع لا يتعافى خلال نصف ثانية، فإعادة المحاولة عليه تُنفق من
 * ميزانية الوقت بلا مقابل. الانتقال الفوري إلى الطبقة التالية أعلى
 * احتمالاً للنجاح. ارفعها من الأسرار إن أردت إعادة المحاولة:
 *   supabase secrets set GEMINI_MAX_ATTEMPTS=2
 */
const MAX_ATTEMPTS_PER_MODEL = Math.max(
  1,
  Number(Deno.env.get('GEMINI_MAX_ATTEMPTS') ?? '1') || 1,
);
const BACKOFF_BASE_MS = 500;

/** حالات يُرجى أن تزول بإعادة المحاولة. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

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
    /** هل تستحق الحالة إعادة محاولة على الطراز نفسه؟ */
    readonly retryable = false,
    /** ثوانٍ اقترحها الخادم عبر ترويسة Retry-After. */
    readonly retryAfterMs?: number,
    /** تفصيل تقني للمطوّر، منفصل عن الرسالة الموجّهة للمستخدم. */
    readonly detail?: string,
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
  detail?: string,
): Response {
  return jsonResponse(detail ? { error: message, code, detail } : { error: message, code }, status);
}

/** يحوّل أي استثناء إلى استجابة JSON، فلا يخرج جسم فارغ أبداً. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.code, error.message, error.status, error.detail);
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** يقرأ ترويسة Retry-After (بالثواني) إن وُجدت. */
function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

interface RequestPayload {
  parts: GeminiPart[];
  responseSchema: Record<string, unknown>;
  systemInstruction: string;
}

/**
 * محاولة واحدة على طراز واحد.
 *
 * ترمي ApiError موسومة بـ retryable حين يكون الفشل عابراً (ضغط، حصة، عطل
 * مؤقت، انقطاع شبكة)، وغير موسومة حين يكون الفشل نهائياً (مفتاح خاطئ،
 * طلب غير صالح، محتوى محجوب).
 */
async function requestOnce<T>(
  model: string,
  { parts, responseSchema, systemInstruction }: RequestPayload,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(generateContentUrl(model), {
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
    });
  } catch (caught) {
    const aborted = caught instanceof DOMException && caught.name === 'AbortError';
    // انقطاع الشبكة وانتهاء المهلة كلاهما يستحق محاولة أخرى.
    throw new ApiError(
      aborted ? 'GEMINI_TIMEOUT' : 'GEMINI_UNREACHABLE',
      aborted
        ? `لم يستجب الطراز "${model}" خلال ${timeoutMs / 1000} ثانية.`
        : `تعذّر الوصول إلى Gemini: ${
            caught instanceof Error ? caught.message : 'سبب غير معروف'
          }`,
      aborted ? 504 : 502,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    if (RETRYABLE_STATUSES.has(response.status)) {
      throw new ApiError(
        response.status === 429 ? 'GEMINI_RATE_LIMITED' : 'GEMINI_OVERLOADED',
        `الطراز "${model}" ردّ بالحالة ${response.status}: ${
          detail.slice(0, 200) || 'ضغط مؤقت'
        }`,
        503,
        true,
        parseRetryAfter(response),
      );
    }

    // 404 لا يُصلحه التكرار على الطراز نفسه، لكنه يستحق تجربة الاحتياطي.
    if (response.status === 404) {
      throw new ApiError(
        'GEMINI_MODEL_NOT_FOUND',
        `الطراز "${model}" غير متاح لهذا المفتاح.`,
        503,
      );
    }

    // 401/403 مفتاح خاطئ، و400 طلب غير صالح: الإعادة بلا فائدة.
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

/**
 * ينادي Gemini ويطلب مخرجاً بصيغة JSON مطابقاً للمخطط المعطى.
 *
 * سياسة المحاولة:
 * 1. الطراز الأساسي، ثم إعادة واحدة بتراجع أسّي عند فشل عابر (429/503/...).
 * 2. إن بقي فاشلاً — أو كان الطراز نفسه غير متاح (404) — نجرّب الاحتياطي
 *    بالسياسة نفسها.
 * 3. إن سقط الجميع بسبب الضغط، نعيد رسالة واحدة مفهومة للمستخدم بدل
 *    تفاصيل تقنية، فلا ينكسر مسار قراءة الإيصال.
 *
 * كل ذلك داخل ميزانية زمنية أقل من مهلة العميل، حتى تصل الرسالة فعلاً.
 */
export async function generateJson<T>(
  parts: GeminiPart[],
  responseSchema: Record<string, unknown>,
  systemInstruction: string,
): Promise<T> {
  assertConfigured();

  const payload: RequestPayload = { parts, responseSchema, systemInstruction };
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: ApiError | null = null;
  // حصيلة كل طبقة، لتمييز "مزدحم فعلاً" عن "اسم طراز غير موجود".
  const outcomes: string[] = [];

  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const remaining = deadline - Date.now();
      // لا نبدأ محاولة لا يتسع لها الوقت المتبقي.
      if (remaining < 2000) {
        outcomes.push(`${model}=BUDGET_EXHAUSTED`);
        return failBusy(lastError, outcomes);
      }

      try {
        return await requestOnce<T>(
          model,
          payload,
          Math.min(ATTEMPT_TIMEOUT_MS, remaining),
        );
      } catch (caught) {
        if (!(caught instanceof ApiError)) throw caught;
        lastError = caught;
        outcomes.push(`${model}=${caught.code}`);

        // فشل نهائي: لا إعادة ولا انتقال إلى الاحتياطي.
        if (!caught.retryable && caught.code !== 'GEMINI_MODEL_NOT_FOUND') {
          throw caught;
        }

        console.warn(
          `[gemini] ${model} attempt ${attempt + 1} failed: ${caught.code}`,
        );

        // طراز غير متاح: انتقل مباشرةً إلى التالي بلا انتظار.
        if (caught.code === 'GEMINI_MODEL_NOT_FOUND') break;

        const isLastAttempt = attempt + 1 >= MAX_ATTEMPTS_PER_MODEL;
        if (isLastAttempt) break;

        // تراجع أسّي مع اهتزاز، ولا نتجاوز الوقت المتبقي.
        const backoff =
          caught.retryAfterMs ??
          BACKOFF_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 250);
        await sleep(Math.max(0, Math.min(backoff, deadline - Date.now() - 1500)));
      }
    }
  }

  return failBusy(lastError, outcomes);
}

/**
 * الرسالة الأخيرة بعد استنفاد السلسلة.
 *
 * الرسالة للمستخدم تبقى بسيطة، لكن detail يحمل حصيلة كل طبقة حتى يتبيّن
 * من السجل ما إذا كان الازدحام حقيقياً أم أن أحد الأسماء غير موجود أصلاً
 * (404) — وهما حالتان تُعالَجان بطريقتين مختلفتين تماماً.
 */
function failBusy(lastError: ApiError | null, outcomes: string[]): never {
  const detail = outcomes.join(', ');
  console.warn(`[gemini] chain exhausted: ${detail}`);

  // كل الطُرُز غير موجودة: المشكلة إعداد لا ضغط.
  const allMissing =
    outcomes.length > 0 &&
    outcomes.every((entry) => entry.endsWith('GEMINI_MODEL_NOT_FOUND'));
  if (allMissing) {
    throw new ApiError(
      'GEMINI_MODEL_NOT_FOUND',
      `لا يوجد طراز صالح في السلسلة. تحقّق من أسماء الطُرُز المتاحة لمفتاحك.`,
      503,
      false,
      undefined,
      detail,
    );
  }

  throw new ApiError(
    'AI_BUSY',
    'خدمة الذكاء الاصطناعي مزدحمة حالياً. حاول بعد قليل، أو أدخل البيانات يدوياً.',
    503,
    false,
    undefined,
    detail,
  );
}
