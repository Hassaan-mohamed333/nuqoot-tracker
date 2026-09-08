/**
 * غلاف مشترك حول Gemini لدوال الحافة (Edge Functions).
 *
 * المفتاح يبقى هنا على الخادم كسرّ (secret) ولا يصل إلى التطبيق أبداً:
 * أي مفتاح يوضع في متغير EXPO_PUBLIC_* يُحزم داخل حزمة JavaScript ويمكن
 * استخراجه من ملف التطبيق، فيُستهلك رصيد الحساب من أي شخص.
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

/** يُضبط من أسرار المشروع؛ غيّره دون تعديل الكود عند تغيّر أسماء الطُرُز. */
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** مهلة الطلب: بلا مهلة قد يبقى الاستدعاء معلّقاً ويستهلك زمن التنفيذ. */
const TIMEOUT_MS = 20000;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function isConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

/**
 * ينادي Gemini ويطلب مخرجاً بصيغة JSON مطابقاً للمخطط المعطى.
 * يرمي خطأً واضحاً عند الفشل ليحوّله المُستدعي إلى رسالة للمستخدم.
 */
export async function generateJson<T>(
  parts: GeminiPart[],
  responseSchema: Record<string, unknown>,
  systemInstruction: string,
): Promise<T> {
  if (!isConfigured()) {
    throw new Error('GEMINI_API_KEY غير مضبوط في أسرار المشروع.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `${ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      throw new Error('استجابة Gemini بلا محتوى نصي.');
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}
