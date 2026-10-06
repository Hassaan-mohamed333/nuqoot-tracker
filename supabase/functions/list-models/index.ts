import {
  ApiError,
  assertConfigured,
  errorResponse,
  GEMINI_API_KEY_FOR_DISCOVERY,
  enforceUserRateLimit,
  handleOptions,
  jsonResponse,
  originOf,
  requireUser,
  toErrorResponse,
} from '../_shared/gemini.ts';

/**
 * يسرد الطُرُز التي يقبلها المفتاح فعلاً.
 *
 * وُجدت لأن اسم طراز خاطئ و طرازاً مزدحماً يبدوان متشابهين من التطبيق،
 * والمفتاح سرّ على الخادم فلا يمكن سؤال Google عنه من جهاز المطوّر مباشرةً.
 * استدعِ هذه الدالة، ثم اضبط الأسرار بأسماء من القائمة العائدة.
 */

interface GeminiModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = originOf(request);
  if (request.method === 'OPTIONS') return handleOptions(origin);

  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      `الطريقة ${request.method} غير مدعومة.`,
      405,
      undefined,
      origin,
    );
  }

  try {
    // قائمة الطُرُز تكشف إعداد المشروع، فلا تُعطى لحاملِ المفتاح العام.
    const userId = await requireUser(request);
    enforceUserRateLimit(userId);

    assertConfigured();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY_FOR_DISCOVERY()}&pageSize=200`,
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ApiError(
        'LIST_MODELS_FAILED',
        `تعذّر سرد الطُرُز (${response.status}): ${detail.slice(0, 300)}`,
        502,
      );
    }

    const payload = (await response.json()) as { models?: GeminiModel[] };

    // نُبقي ما يدعم توليد المحتوى فقط: البقية لا تصلح لهذه الدوال.
    const usable = (payload.models ?? [])
      .filter((model) =>
        model.supportedGenerationMethods?.includes('generateContent'),
      )
      .map((model) => (model.name ?? '').replace(/^models\//, ''))
      .filter((name) => name.length > 0)
      .sort();

    return jsonResponse(
      {
        count: usable.length,
        models: usable,
        hint: 'اضبط GEMINI_MODEL و GEMINI_FALLBACK_MODEL و GEMINI_LITE_MODEL بأسماء من هذه القائمة.',
      },
      200,
      origin,
    );
  } catch (error) {
    return toErrorResponse(error, origin);
  }
});
