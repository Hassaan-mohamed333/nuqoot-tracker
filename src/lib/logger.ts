/**
 * سجلّ آمن للإنتاج.
 *
 * المشكلة التي يحلّها: `console.error(error)` على كائن خطأ من Supabase
 * يطبع الكائن كاملاً — وقد يحمل ترويسة `Authorization` أو رمز جلسة أو
 * حمولة الطلب. على الويب يقرأ ذلك أي امتداد متصفّح، وعلى الهاتف يبقى في
 * سجلّ النظام الذي تقرأه تطبيقات أخرى على أجهزة معطوبة الحماية.
 *
 * القاعدة هنا: في التطوير نطبع كل شيء بعد تنقيته، وفي الإنتاج نطبع
 * المستوى والنطاق ورمز الخطأ فقط — لا كائنات ولا آثار نداء.
 *
 * وحدة نقيّة: لا تستورد react-native، فتُختبر تحت node مباشرة.
 */

/** `__DEV__` يعرّفه Metro؛ خارجَه (اختبارات node) نفترض الإنتاج. */
declare const __DEV__: boolean | undefined;

function devMode(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/**
 * أسماء حقول لا تُطبع قيمتها أبداً.
 *
 * المطابقة على الاسم بعد تجريده من الفواصل، فيغطي الاسمُ الواحد صوره
 * كلها: `access_token` و`accessToken` و`ACCESS-TOKEN`.
 */
const SECRET_KEYS = new Set([
  'accesstoken', 'refreshtoken', 'providertoken', 'providerrefreshtoken',
  'idtoken', 'token', 'apikey', 'anonkey', 'publishablekey', 'secretkey',
  'servicerolekey', 'authorization', 'auth', 'password', 'newpassword',
  'currentpassword', 'secret', 'session', 'codeverifier', 'code',
  'captchatoken', 'cookie', 'setcookie', 'signature', 'email', 'phone',
]);

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.replace(/[-_\s]/g, '').toLowerCase());
}

/** أنماط تُخفى داخل أي نصّ، مهما كان اسم الحقل الذي حملها. */
const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // JWT بصورته الكاملة (رمز جلسة أو مفتاح قديم).
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[redacted:jwt]'],
  // مفاتيح Supabase الحديثة.
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, '[redacted:key]'],
  // بريد إلكتروني.
  [/\b[^\s@]+@[^\s@.]+\.[^\s@]+\b/g, '[redacted:email]'],
  // رقم هاتف: سبع خانات فأكثر متتالية، مع فواصل شائعة.
  [/(?<!\d)\+?\d[\d\s()-]{6,}\d(?!\d)/g, '[redacted:phone]'],
  // معاملات حسّاسة داخل عنوان.
  [/([?&](?:code|access_token|refresh_token|apikey|token)=)[^&\s]+/gi, '$1[redacted]'],
];

/** يُخفي الأنماط الحسّاسة داخل نصّ حرّ. */
export function redactText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const MAX_DEPTH = 4;
const MAX_ARRAY = 20;
const MAX_STRING = 500;

/**
 * نسخة آمنة من أي قيمة: الحقول الحسّاسة تُستبدل، والنصوص تُنقّى وتُقصّ،
 * والعمق محدود حتى لا يطبع كائنُ استجابةٍ ضخمٌ صفحاتٍ في السجل.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const clean = redactText(value);
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return '[function]';
  if (typeof value === 'symbol') return '[symbol]';

  if (depth >= MAX_DEPTH) return '[depth-limit]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      // الأثر لا يخرج إلا في التطوير: مساراتُه تكشف بنية الجهاز.
      ...(devMode() && value.stack ? { stack: redactText(value.stack) } : {}),
    };
  }

  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));
    return value.length > MAX_ARRAY
      ? [...head, `[+${value.length - MAX_ARRAY} أخرى]`]
      : head;
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? '[redacted]' : redact(item, depth + 1);
    }
    return out;
  }

  return '[unknown]';
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, message: string, data?: unknown): void {
  const label = `[${scope}] ${redactText(message)}`;

  if (!devMode()) {
    // الإنتاج: سطر واحد بلا حمولة. التشخيص التفصيلي شغل المطوّر لا شغل
    // جهاز المستخدم، وكل كائن يُطبع هنا يبقى في سجلّ النظام.
    if (level === 'error' || level === 'warn') console[level](label);
    return;
  }

  if (data === undefined) console[level](label);
  else console[level](label, redact(data));
}

/**
 * الواجهة المستعملة في التطبيق.
 *
 * `debug` و`info` يختفيان تماماً في الإنتاج؛ `warn` و`error` يبقيان بلا
 * حمولة، ليظلّ في تقارير الأعطال أثرٌ لما حدث دون ما حدث به.
 */
export const logger = {
  debug: (scope: string, message: string, data?: unknown) =>
    emit('debug', scope, message, data),
  info: (scope: string, message: string, data?: unknown) =>
    emit('info', scope, message, data),
  warn: (scope: string, message: string, data?: unknown) =>
    emit('warn', scope, message, data),
  error: (scope: string, message: string, data?: unknown) =>
    emit('error', scope, message, data),
  /** للاختبارات ولقرارات العرض. */
  isDev: devMode,
};
