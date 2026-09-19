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

/**
 * أسماء الأسماء المستعارة ("-latest") أثبتت أنها تُحلّ فعلاً مع هذا المفتاح،
 * بينما ردّت أسماء الإصدارات المرقّمة بـ 404. الأسماء المستعارة تتبع أحدث
 * إصدار متاح تلقائياً، فلا تتعطّل عند تقاعد إصدار.
 */
const GEMINI_MODEL = readModel('GEMINI_MODEL', 'gemini-flash-latest');

/**
 * طراز احتياطي يُجرَّب عندما يعجز الأساسي (ضغط، حصة، أو طراز غير متاح).
 * قابل للضبط: supabase secrets set GEMINI_FALLBACK_MODEL=...
 */
const GEMINI_FALLBACK_MODEL = readModel(
  'GEMINI_FALLBACK_MODEL',
  'gemini-flash-lite-latest',
);

/**
 * طبقة خفيفة تُجرَّب أخيراً: عادةً حصتها أوسع وزمن ردها أقصر، فهي أفضل
 * فرصة للنجاح حين تكون الطبقات الأثقل مزدحمة.
 */
const GEMINI_LITE_MODEL = readModel('GEMINI_LITE_MODEL', '');

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
 * جولة واحدة = محاولة واحدة لكل طراز في السلسلة، بانتقال فوري بلا انتظار.
 * الجولة الثانية تُعيد المحاولة على الطُرُز المزدحمة وحدها؛ أما التي ردّت
 * 404 فتُسقط نهائياً لأن اسمها لن يصبح صحيحاً بالتكرار.
 *
 * هذا يستثمر ما تبقّى من الميزانية: طرازٌ غير موجود يفشل في أجزاء من
 * الثانية، فيبقى وقت كافٍ لإعادة محاولة الطراز الحقيقي المزدحم — وهو غالباً
 * ما ينجح لأن 503 حالة عابرة. لجولة واحدة فقط:
 *   supabase secrets set GEMINI_MAX_ROUNDS=1
 */
const MAX_ROUNDS = Math.max(
  1,
  Number(Deno.env.get('GEMINI_MAX_ROUNDS') ?? '2') || 2,
);
const BACKOFF_BASE_MS = 500;

/** حالات يُرجى أن تزول بإعادة المحاولة. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** أقصى حجم صورة بعد فك الترميز. أكبر من ذلك يُرفض برسالة واضحة. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * الأصول المسموح لها بالنداء من متصفّح.
 *
 *   supabase secrets set ALLOWED_ORIGINS="https://app.example.com,http://localhost:8081"
 *
 * غير مضبوط = نعكس أصل الطلب كما كان السلوك السابق (`*`)، حتى لا ينكسر
 * أي نشر قائم بمجرّد الترقية. اضبطه قبل الإطلاق: CORS لا يمنع نداءً من
 * خادم إلى خادم، لكنه يمنع صفحةً خبيثة في متصفّح المستخدم من قراءة ردّنا.
 */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // تطبيق أصلي: لا أصل ولا حاجة إلى CORS.
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * ترويسات الأمان على كل استجابة.
 *
 * الدالّة تعيد JSON فقط، لكن `nosniff` يمنع المتصفّح من تخمين نوعٍ آخر،
 * وسياسة محتوى صارمة تجعل أي جسم يُفسَّر كصفحة غيرَ قادر على تشغيل شيء.
 * HSTS لأن الدوال تُقدَّم على HTTPS حصراً.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
};

/**
 * ترويسات الاستجابة لأصل بعينه.
 *
 * معاينة الويب ترسل preflight من أصل مختلف، ولا بد أن تُرد الترويسات على
 * كل استجابة — بما فيها استجابات الخطأ — وإلا رأى المتصفح خطأ CORS
 * غامضاً بدل رسالتنا.
 */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (!origin && ALLOWED_ORIGINS.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

/**
 * أصل الطلب يُمرَّر صراحةً إلى كل بانٍ للاستجابة.
 *
 * لا حالة على مستوى الوحدة: Deno.serve يخدم الطلبات على التوازي داخل
 * العزلة الواحدة، فمتغيّرٌ مشترك يحمل «أصل الطلب الجاري» كان سيعكس أصل
 * طلبٍ آخر في ردّ هذا الطلب — تسريبٌ عابر للطلبات يصعب رصده.
 */
export function originOf(request: Request): string | null {
  return request.headers.get('origin');
}

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

export function jsonResponse(
  body: unknown,
  status = 200,
  origin: string | null = null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
  });
}

/** استجابة خطأ موحّدة: { error, code }. */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  detail?: string,
  origin: string | null = null,
): Response {
  return jsonResponse(
    detail ? { error: message, code, detail } : { error: message, code },
    status,
    origin,
  );
}

/**
 * يحوّل أي استثناء إلى استجابة JSON، فلا يخرج جسم فارغ أبداً.
 *
 * الاستثناء غير المتوقّع لا تخرج رسالته: قد تحمل عنوان خدمة داخلية أو
 * مسار ملف أو نصّ خطأ من المزوّد. `ApiError` وحده يخرج كما هو لأننا
 * كتبنا رسائله قاصدين عرضها. التفصيل يبقى في سجل الدالّة.
 */
export function toErrorResponse(
  error: unknown,
  origin: string | null = null,
): Response {
  if (error instanceof ApiError) {
    return errorResponse(
      error.code,
      error.message,
      error.status,
      error.detail,
      origin,
    );
  }
  console.error('[edge] استثناء غير متوقّع:', error);
  return errorResponse('INTERNAL_ERROR', 'خطأ غير متوقع في الخادم.', 500, undefined, origin);
}

/** رد الـ preflight. 204 بلا جسم هو الرد الصحيح لـ OPTIONS. */
export function handleOptions(origin: string | null = null): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
}

/**
 * يتحقّق أن المُنادي مستخدم حقيقي لا حاملُ المفتاح العام وحده.
 *
 * هذا هو الحاجز الأهم في هذا الملف. المفتاح العام مُحزَّم داخل التطبيق
 * ويُستخرج منه بسهولة، وبوّابة Supabase تقبله كأي JWT صالح — فبدون هذا
 * الفحص يستطيع أي شخص استخراج المفتاح ثم استنزاف رصيد Gemini كاملاً.
 *
 * التحقّق بسؤال خادم المصادقة لا بقراءة الادّعاءات محلياً: القراءة
 * المحلية تصحّ فقط ما دامت البوّابة تتحقّق من التوقيع، وتسقط صامتةً لو
 * نُشرت الدالّة يوماً بـ --no-verify-jwt.
 */
export async function requireUser(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    throw new ApiError('UNAUTHENTICATED', 'يلزم تسجيل الدخول.', 401);
  }

  const projectUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!projectUrl || !anonKey) {
    throw new ApiError(
      'SERVER_MISCONFIGURED',
      'الخادم غير مضبوط بالكامل.',
      500,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${projectUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
  } catch {
    throw new ApiError('AUTH_UNREACHABLE', 'تعذّر التحقق من الجلسة.', 503);
  }

  if (!response.ok) {
    throw new ApiError('UNAUTHENTICATED', 'جلسة غير صالحة أو منتهية.', 401);
  }

  const user = (await response.json()) as { id?: unknown; aud?: unknown };
  if (typeof user.id !== 'string' || !user.id) {
    throw new ApiError('UNAUTHENTICATED', 'جلسة غير صالحة.', 401);
  }
  return user.id;
}

/**
 * تحديد معدّل لكل مستخدم، في ذاكرة العزلة (isolate).
 *
 * حدوده معروفة ومقصودة: العزلات متعدّدة وقصيرة العمر، فما يوقفه هو
 * الفيضان المتّصل من مصدر واحد لا التوزيع البطيء. حاجزٌ رخيص فوق
 * `requireUser`، لا بديل عن حصص Gemini ولا عن حدود المشروع.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const hits = new Map<string, number[]>();

export function enforceUserRateLimit(userId: string): void {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter(
    (time) => now - time < RATE_WINDOW_MS,
  );

  if (recent.length >= RATE_MAX) {
    throw new ApiError(
      'RATE_LIMITED',
      'طلبات كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.',
      429,
    );
  }

  recent.push(now);
  hits.set(userId, recent);

  // تنظيف كسول: بلا حدّ تنمو الخريطة مع كل مستخدم رآه هذا العزل.
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= RATE_WINDOW_MS)) hits.delete(key);
    }
  }
}

export function isConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

/**
 * يتيح لدالة list-models استخدام المفتاح دون تصديره كمتغيّر عام.
 * المفتاح لا يغادر الخادم في كل الأحوال.
 */
export function GEMINI_API_KEY_FOR_DISCOVERY(): string {
  return GEMINI_API_KEY;
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
/** سقف جسم الطلب: أوسع من أكبر صورة مسموح بها بعد ترميز base64. */
export const MAX_BODY_BYTES = 9 * 1024 * 1024;

export async function readJsonBody<T>(request: Request): Promise<T> {
  // الرفض من الترويسة قبل القراءة: جسمٌ ضخم يُستهلك في الذاكرة قبل أن
  // نراه، وهو أرخص هجوم على دالّة حافة.
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'حجم الطلب يتجاوز الحد.', 413);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new ApiError('INVALID_BODY', 'تعذّرت قراءة جسم الطلب.', 400);
  }

  if (raw.length > MAX_BODY_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'حجم الطلب يتجاوز الحد.', 413);
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

/**
 * جسم الطلب وقارئ الرد، محقونان.
 *
 * سلسلة الطُرُز والتراجع والميزانية الزمنية أدناه لا علاقة لها بشكل
 * الطلب، فبدل نسخها لوضع الأدوات (function calling) يُمرَّر البناء
 * والقراءة من الخارج ويبقى منطق الصمود واحداً لا نسختين تتباعدان.
 */
interface RequestSpec<T> {
  buildBody: () => Record<string, unknown>;
  parse: (candidate: GeminiCandidate) => T;
}

interface GeminiCandidate {
  content?: { parts?: GeminiResponsePart[] };
  finishReason?: string;
}

interface GeminiResponsePart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
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
  spec: RequestSpec<T>,
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
      body: JSON.stringify(spec.buildBody()),
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
    candidates?: GeminiCandidate[];
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

  // STOP هو الإنهاء الطبيعي، وفي وضع الأدوات يصل أحياناً باسم
  // TOOL_CALLS أو MALFORMED_FUNCTION_CALL — الأول ناجح والثاني يستحق
  // إعادة المحاولة على طراز آخر.
  if (finishReason === 'MALFORMED_FUNCTION_CALL') {
    throw new ApiError(
      'GEMINI_BAD_TOOL_CALL',
      'أعاد الطراز نداء أداة غير صالح.',
      502,
      true,
    );
  }
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'TOOL_CALLS') {
    const hint =
      finishReason === 'MAX_TOKENS'
        ? 'تجاوز الرد الحد الأقصى للطول.'
        : `سبب الإنهاء: ${finishReason}.`;
    throw new ApiError('GEMINI_INCOMPLETE', `لم يكتمل رد Gemini. ${hint}`, 502);
  }

  if (!candidate) {
    throw new ApiError('GEMINI_EMPTY', 'رد Gemini بلا مرشّحات.', 502);
  }

  return spec.parse(candidate);
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
  return runWithFallback<T>({
    buildBody: () => ({
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0,
      },
    }),
    parse: (candidate) => {
      const text = candidate.content?.parts?.[0]?.text;
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
    },
  });
}

/** إعلان أداة كما تتوقّعه واجهة Gemini. */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** دور المتحدّث في سجل المحادثة. */
export type TurnRole = 'user' | 'model';

/**
 * دورة واحدة في المحادثة.
 *
 * `functionResponse` هو ما يعيده الجهاز بعد تنفيذ الأداة: التنفيذ يحدث
 * على الجهاز (تنقّل، حالة، قاعدة بيانات) لا على الخادم، فالخادم يقترح
 * النداء ثم يتلقّى نتيجته في الدورة التالية.
 */
export interface Turn {
  role: TurnRole;
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

/** ما أعاده الطراز: نصّ، أو نداءات أدوات، أو الاثنان. */
export interface ToolTurn {
  text: string | null;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
}

function toGeminiContent(turn: Turn): Record<string, unknown> {
  const parts: Record<string, unknown>[] = [];
  if (turn.functionCall) {
    parts.push({ functionCall: turn.functionCall });
  }
  if (turn.functionResponse) {
    parts.push({ functionResponse: turn.functionResponse });
  }
  if (typeof turn.text === 'string' && turn.text.length > 0) {
    parts.push({ text: turn.text });
  }
  if (parts.length === 0) parts.push({ text: '' });

  // نتيجة الأداة تُرسل بدور "user" كما تتوقّع الواجهة، لا بدور "function".
  const role = turn.functionResponse ? 'user' : turn.role;
  return { role, parts };
}

/**
 * ينادي Gemini في وضع الأدوات ويعيد ما قرّره: كلاماً أو نداء أداة.
 *
 * `temperature: 0` هنا كما في وضع JSON: المطلوب قرارٌ ثابت لا تنويع، وأي
 * تذبذب يعني أن الأمر نفسه يُنفَّذ مرّة ويُهمل مرّة.
 *
 * `mode: 'AUTO'` لا `'ANY'`: بعض الرسائل سؤالٌ لا أمر ("كم عليّ لسامي؟")،
 * وإجبار الطراز على نداء أداة في كل دورة يحوّل السؤال إلى فعل.
 */
export async function generateToolCall(
  history: Turn[],
  tools: FunctionDeclaration[],
  systemInstruction: string,
): Promise<ToolTurn> {
  return runWithFallback<ToolTurn>({
    buildBody: () => ({
      contents: history.map(toGeminiContent),
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools: [{ functionDeclarations: tools }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: { temperature: 0 },
    }),
    parse: (candidate) => {
      const parts = candidate.content?.parts ?? [];
      const calls = parts
        .map((part) => part.functionCall)
        .filter(
          (call): call is { name: string; args: Record<string, unknown> } =>
            Boolean(call && typeof call.name === 'string' && call.name),
        )
        .map((call) => ({ name: call.name, args: call.args ?? {} }));

      const text = parts
        .map((part) => part.text)
        .filter((value): value is string => typeof value === 'string')
        .join('')
        .trim();

      if (calls.length === 0 && !text) {
        throw new ApiError('GEMINI_EMPTY', 'رد Gemini بلا محتوى.', 502);
      }
      return { text: text || null, calls };
    },
  });
}

/** سلسلة الطُرُز والتراجع، مشتركة بين وضع JSON ووضع الأدوات. */
async function runWithFallback<T>(spec: RequestSpec<T>): Promise<T> {
  assertConfigured();

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: ApiError | null = null;
  // حصيلة كل طبقة، لتمييز "مزدحم فعلاً" عن "اسم طراز غير موجود".
  const outcomes: string[] = [];

  // الجولة الأولى تجرّب كل الطُرُز؛ الجولات التالية تجرّب المزدحمة فقط.
  let candidates = [...MODEL_CHAIN];

  for (let round = 0; round < MAX_ROUNDS && candidates.length > 0; round++) {
    const stillBusy: string[] = [];

    for (const model of candidates) {
      const remaining = deadline - Date.now();
      // لا نبدأ محاولة لا يتسع لها الوقت المتبقي.
      if (remaining < 2000) {
        outcomes.push(`${model}=BUDGET_EXHAUSTED`);
        return failBusy(lastError, outcomes);
      }

      try {
        return await requestOnce<T>(
          model,
          spec,
          Math.min(ATTEMPT_TIMEOUT_MS, remaining),
        );
      } catch (caught) {
        if (!(caught instanceof ApiError)) throw caught;
        lastError = caught;
        outcomes.push(`${model}=${caught.code}${round > 0 ? `#${round + 1}` : ''}`);
        console.warn(`[gemini] round ${round + 1} ${model}: ${caught.code}`);

        // فشل نهائي (مفتاح خاطئ، طلب غير صالح، محتوى محجوب): أوقف كل شيء.
        if (!caught.retryable && caught.code !== 'GEMINI_MODEL_NOT_FOUND') {
          throw caught;
        }

        // 404 يُسقط الطراز من الجولات القادمة؛ الازدحام يبقيه مرشّحاً.
        if (caught.retryable) stillBusy.push(model);
      }
    }

    candidates = stillBusy;

    // مهلة قصيرة قبل إعادة محاولة الطُرُز المزدحمة، ضمن الوقت المتبقي.
    if (candidates.length > 0 && round + 1 < MAX_ROUNDS) {
      const backoff =
        lastError?.retryAfterMs ??
        BACKOFF_BASE_MS * 2 ** round + Math.floor(Math.random() * 250);
      await sleep(Math.max(0, Math.min(backoff, deadline - Date.now() - 1500)));
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
