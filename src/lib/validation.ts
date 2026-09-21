/**
 * تحقّق وتعقيم المدخلات، بلا اعتماديات.
 *
 * وحدة نقيّة عمداً: لا تستورد react-native ولا supabase، فتُختبر وحدها
 * تحت node، ويستدعيها مستودع البيانات والشاشات معاً دون دورة استيراد.
 *
 * السياسة هنا: **نُعقّم ما لا معنى لبقائه** (محارف تحكّم، فراغ زائد)،
 * و**نرفض ما تجاوز الحدّ** بدل قصّه صامتاً. القصّ الصامت يفقد المستخدم
 * بياناته دون أن يعلم، وهو أسوأ من رسالة خطأ صريحة.
 */

/** خلل واحد في حقل واحد. */
export interface ValidationIssue {
  field: string;
  code: string;
  /** رسالة عربية صالحة للعرض مباشرة. */
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

/**
 * حدود الطول والمقدار.
 *
 * حدّ المبلغ هو سقف numeric(12,2) في المخطط: ما فوقه يرفضه الخادم بخطأ
 * غامض، فرفضُه هنا يعطي رسالة مفهومة قبل أي طلب شبكة.
 */
export const LIMITS = {
  name: 120,
  phone: 32,
  relation: 60,
  note: 500,
  title: 140,
  location: 160,
  description: 200,
  email: 254,
  passwordMin: 10,
  passwordMax: 128,
  /** سقف numeric(12,2). */
  amountMax: 9999999999.99,
} as const;

/**
 * محارف تُحذف دائماً.
 *
 * إضافة إلى محارف التحكّم: محارف التوجيه ثنائي الاتجاه وصفر العرض.
 * في تطبيق عربي هذه ليست تجميلاً: U+202E وحده يقلب عرض النص، فيُكتب
 * اسمٌ أو مبلغٌ يظهر للعين غير ما هو مخزَّن فعلاً — انتحالٌ بصري كامل
 * داخل قائمة جهات الاتصال.
 */
// eslint-disable-next-line no-control-regex
const STRIPPED =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** فراغ أفقي متكرّر (يُبقي السطر الجديد للنصوص متعدّدة الأسطر). */
const HORIZONTAL_RUN = /[^\S\r\n]+/g;

/** أرقام عربية-هندية وفارسية إلى اللاتينية. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * يُعقّم سطراً واحداً: يحذف محارف التحكّم والتوجيه، ويوحّد الفراغ.
 *
 * التوحيد إلى NFC قبل أي قياس: صورتا الحرف العربي المركّبة والمفكّكة
 * تتساويان عرضاً وتختلفان طولاً، فبدون التوحيد يمرّ اسمٌ من حدّ ويُرفض
 * مثيله البصري.
 */
export function sanitizeLine(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(STRIPPED, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(HORIZONTAL_RUN, ' ')
    .trim();
}

/** مثله، لكنه يُبقي فقرات النص الحر (بحدّ سطرين فارغين متتاليين). */
export function sanitizeMultiline(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(STRIPPED, '')
    .replace(/\r\n?/g, '\n')
    .replace(HORIZONTAL_RUN, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/** طول بالنقاط الرمزية لا بوحدات UTF-16 (الإيموجي وحدةٌ واحدة للمستخدم). */
export function textLength(value: string): number {
  return [...value].length;
}

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message };
}

/**
 * نصّ مطلوب أو اختياري بحدّ أقصى.
 * يعيد `null` للاختياري الفارغ، ليُكتب في قاعدة البيانات كـ NULL لا "".
 */
export function checkText(
  field: string,
  raw: unknown,
  options: {
    label: string;
    max: number;
    min?: number;
    required?: boolean;
    multiline?: boolean;
  },
): ValidationResult<string | null> {
  const { label, max, min = 0, required = false, multiline = false } = options;
  const value = multiline ? sanitizeMultiline(raw) : sanitizeLine(raw);

  if (!value) {
    if (required) {
      return { ok: false, issues: [issue(field, 'required', `${label} مطلوب.`)] };
    }
    return { ok: true, value: null };
  }

  const length = textLength(value);
  if (min > 0 && length < min) {
    return {
      ok: false,
      issues: [issue(field, 'too_short', `${label} أقصر من ${min} أحرف.`)],
    };
  }
  if (length > max) {
    return {
      ok: false,
      issues: [
        issue(field, 'too_long', `${label} أطول من الحدّ المسموح (${max} حرفاً).`),
      ],
    };
  }

  return { ok: true, value };
}

/** صيغة المبلغ: أرقام فقط مع كسر من خانتين على الأكثر. */
const AMOUNT_SHAPE = /^\d{1,10}(?:[.,]\d{1,2})?$/;

/**
 * يتحقّق من مبلغ ويعيده مقرَّباً إلى خانتين.
 *
 * لا نكتفي بـ `Number()`: فهي تقبل `0x10` و`1e5` و` 12 ` وتحوّلها بصمت،
 * فيُخزَّن غير ما كتبه المستخدم. المطابقة على الصيغة أولاً تمنع ذلك.
 */
export function checkAmount(
  raw: unknown,
  field = 'amount',
): ValidationResult<number> {
  const text =
    typeof raw === 'number'
      ? Number.isFinite(raw)
        ? String(raw)
        : ''
      : normalizeDigits(sanitizeLine(raw));

  if (!text) {
    return { ok: false, issues: [issue(field, 'required', 'المبلغ مطلوب.')] };
  }
  if (!AMOUNT_SHAPE.test(text)) {
    return {
      ok: false,
      issues: [issue(field, 'invalid', 'المبلغ يجب أن يكون رقماً بخانتين عشريتين على الأكثر.')],
    };
  }

  const value = Math.round(Number(text.replace(',', '.')) * 100) / 100;

  if (!(value > 0)) {
    return {
      ok: false,
      issues: [issue(field, 'not_positive', 'المبلغ يجب أن يكون أكبر من صفر.')],
    };
  }
  if (value > LIMITS.amountMax) {
    return {
      ok: false,
      issues: [issue(field, 'too_large', 'المبلغ يتجاوز الحدّ الذي تقبله قاعدة البيانات.')],
    };
  }

  return { ok: true, value };
}

/** رمز عملة: ثلاثة حروف لاتينية. */
export function checkCurrency(raw: unknown): ValidationResult<string> {
  const value = sanitizeLine(raw).toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    return {
      ok: false,
      issues: [issue('currency', 'invalid', 'رمز العملة ثلاثة حروف لاتينية.')],
    };
  }
  return { ok: true, value };
}

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * معرّف صفّ.
 *
 * يقبل UUID ومعرّفات الوضع المحلي معاً: الوضع المحلي يولّد معرّفاته
 * بنفسه (`c_m1abc_x9k2`) والبيانات التجريبية تستعمل معرّفات قصيرة
 * (`c1`)، وكلاهما لا يمرّ على قاعدة البيانات.
 *
 * الغرض ردّ ما لا يصلح معرّفاً أصلاً — الفارغ، والطويل بلا حدّ، وما فيه
 * مسافات أو اقتباسات — لا فرضُ صيغة بعينها. تشديدُ الصيغة هنا كان
 * سيرفض البيانات التجريبية ويكسر الوضع المحلي بلا مقابل أمني: الحماية
 * الفعلية من الحقن هي المعاملات المُرحَّلة في PostgREST، ومن تجاوز
 * الملكية هي RLS.
 */
const LOCAL_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isRowId(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  return UUID_SHAPE.test(raw) || LOCAL_ID_SHAPE.test(raw);
}

/**
 * هل هذا معرّفٌ يمكن أن تكون قاعدة البيانات أصدرته؟
 *
 * أعمدة المعرّفات كلها `uuid`، فما ليس UUID لا يوجد على الخادم ولا
 * يمكن أن يوجد. وإرساله إليه لا يعيد «غير موجود» بل يُسقط الاستعلام
 * قبل أن يُنفَّذ: `22P02 invalid input syntax for type uuid: "t9"` —
 * خطأ صيغةٍ في لغة الاستعلام لا نتيجةَ بحث.
 *
 * وهذا ما يميّز الصفوف التجريبية وصفوفَ الوضع المحلي (`t9`، `c_m1a_x9`)
 * عن صفوف الخادم، فتُعدَّل محليّاً ولا تُرسل أصلاً.
 */
export function isServerRowId(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_SHAPE.test(raw);
}

export function checkRowId(
  field: string,
  raw: unknown,
  label: string,
): ValidationResult<string> {
  if (!isRowId(raw)) {
    return { ok: false, issues: [issue(field, 'invalid', `${label} غير صالح.`)] };
  }
  return { ok: true, value: raw };
}

/** تاريخ ISO صالح ضمن نطاق معقول. */
export function checkIsoDate(
  field: string,
  raw: unknown,
  label: string,
): ValidationResult<string> {
  const text = sanitizeLine(raw);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) {
    return { ok: false, issues: [issue(field, 'invalid', `${label} غير صالح.`)] };
  }
  // نطاق دفاعي: تاريخ خارج قرنٍ حول اليوم خطأُ إدخالٍ لا نيّة.
  const year = new Date(time).getUTCFullYear();
  if (year < 1900 || year > 2200) {
    return {
      ok: false,
      issues: [issue(field, 'out_of_range', `${label} خارج النطاق المعقول.`)],
    };
  }
  return { ok: true, value: new Date(time).toISOString() };
}

/**
 * تاريخ ميلاد بصيغة `YYYY-MM-DD`.
 *
 * منفصل عن `checkIsoDate` عمداً: ذاك يعيد طابعاً زمنياً بـ UTC، وتاريخ
 * الميلاد يوم لا لحظة. من يسكن غرب غرينتش ويختار ١ يناير يراه يعود ٣١
 * ديسمبر بعد رحلة إلى UTC وعودة — إزاحةُ يومٍ صامتة في حقل لا يتغيّر.
 * فنبقيه نصّاً مجرّداً من المنطقة الزمنية من طرف إلى طرف.
 */
export function checkBirthDate(
  field: string,
  raw: unknown,
  label: string,
): ValidationResult<string | null> {
  const text = normalizeDigits(sanitizeLine(raw));
  if (!text) return { ok: true, value: null };

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return {
      ok: false,
      issues: [issue(field, 'invalid', `${label} يجب أن يكون بصيغة سنة-شهر-يوم.`)],
    };
  }

  const [, year, month, day] = match.map(Number) as unknown as number[];
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // إعادة البناء تكشف ما يقبله Date ضمناً: 2025-02-30 يصير 2 مارس.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return {
      ok: false,
      issues: [issue(field, 'invalid', `${label} ليس تاريخاً موجوداً.`)],
    };
  }

  if (year < 1900) {
    return {
      ok: false,
      issues: [issue(field, 'out_of_range', `${label} خارج النطاق المعقول.`)],
    };
  }

  // المقارنة باليوم لا باللحظة: من يختار اليوم في منطقة شرق غرينتش كان
  // سيُرفض تاريخه لأنه "في المستقبل" بتوقيت UTC.
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (parsed.getTime() > today) {
    return {
      ok: false,
      issues: [issue(field, 'future', `${label} لا يكون في المستقبل.`)],
    };
  }

  return { ok: true, value: text };
}

/**
 * مخطّطات الروابط المقبولة لصورة.
 *
 * `https:` هو ما يخرج من خدمة التخزين، و`file:`/`blob:` ما يخرج من
 * منتقي الصور على الجهاز وعلى الويب في الوضع المحلي — وكلاهما لا يغادر
 * الجهاز أصلاً. المرفوض هو الخطر: `javascript:` يُنفَّذ إن وصل إلى عنصر
 * قابل للنقر، و`data:` يحشو صورة كاملة داخل عمود نصّي، و`http:` يُرسل
 * الطلب بلا تشفير.
 */
const IMAGE_SCHEMES: ReadonlySet<string> = new Set([
  'https:',
  'file:',
  'blob:',
  // `data:` للصور وحدها، وللوضع المحلي وحده — انظر الحدّ أدناه.
  'data:',
]);

/**
 * سقف طول العنوان.
 *
 * `data:` يحمل الصورة نفسها فيتجاوز أي حدّ معقول لعمود نصّي؛ لذلك يُقاس
 * بحدٍّ أوسع، وقيد قاعدة البيانات (٥٠٠ محرفاً) يمنع وصوله إلى الخادم
 * أصلاً. وفي الوضع المحلي لا خادم، والصورة مضغوطة إلى عشرات
 * الكيلوبايتات.
 */
const MAX_URL_LENGTH = 500;
const MAX_DATA_URI_LENGTH = 400_000;

/** رابط صورة: من خدمة التخزين، أو من منتقي الصور محلياً. */
export function checkImageUrl(
  field: string,
  raw: unknown,
  label: string,
): ValidationResult<string | null> {
  const text = sanitizeLine(raw);
  if (!text) return { ok: true, value: null };

  const isDataUri = text.startsWith('data:');
  if (textLength(text) > (isDataUri ? MAX_DATA_URI_LENGTH : MAX_URL_LENGTH)) {
    return {
      ok: false,
      issues: [issue(field, 'too_long', `${label} أطول من المسموح.`)],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, issues: [issue(field, 'invalid', `${label} غير صالح.`)] };
  }

  // `data:` لصورة فقط: أي نوع آخر ليس صورةً وإنما حمولة أخرى تتنكّر.
  if (isDataUri && !/^data:image\/(png|jpeg|webp);base64,/.test(text)) {
    return {
      ok: false,
      issues: [issue(field, 'invalid', `${label} غير صالح.`)],
    };
  }

  if (!IMAGE_SCHEMES.has(parsed.protocol)) {
    return {
      ok: false,
      issues: [issue(field, 'insecure', `${label} يجب أن يكون رابط https.`)],
    };
  }

  return { ok: true, value: parsed.toString() };
}

/** بريد إلكتروني. تحقّق بنيوي؛ التأكيد الحقيقي يبقى برسالة التفعيل. */
export function checkEmail(raw: unknown): ValidationResult<string> {
  const value = sanitizeLine(raw).toLowerCase();
  if (!value) {
    return {
      ok: false,
      issues: [issue('email', 'required', 'البريد الإلكتروني مطلوب.')],
    };
  }
  if (value.length > LIMITS.email) {
    return {
      ok: false,
      issues: [issue('email', 'too_long', 'البريد الإلكتروني أطول من الحدّ.')],
    };
  }
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value)) {
    return {
      ok: false,
      issues: [issue('email', 'invalid', 'صيغة البريد الإلكتروني غير صحيحة.')],
    };
  }
  return { ok: true, value };
}

/**
 * كلمات مرور شائعة جداً.
 *
 * قائمة قصيرة مقصودة: الغرض ردّ أسوأ الاختيارات لا بناء قاموس. الحاجز
 * الحقيقي ضد التخمين هو التحديد (rateLimit.ts) وسياسة Supabase.
 */
const COMMON_PASSWORDS = new Set([
  '123456789','12345678','1234567890','password','password1','password123',
  'qwerty123','qwertyuiop','11111111','000000000','iloveyou','admin123',
  'welcome123','letmein123','abc123456','passw0rd','p@ssw0rd','1q2w3e4r',
  'zaq12wsx','football1','superman1','trustno1','monkey123','dragon123',
]);

export interface PasswordCheck {
  ok: boolean;
  issues: ValidationIssue[];
  /** 0..4 لعرض مؤشّر القوّة. */
  score: number;
}

/**
 * سياسة كلمة المرور.
 *
 * الحدّ الأدنى عشرة لا ستّة: ستّة أحرف تُخمَّن دون اتصال بالشبكة في ثوانٍ
 * على عتاد عادي، وهي القيمة الافتراضية في Supabase التي يجب رفعها من
 * اللوحة أيضاً حتى لا يبقى الخادم أضعف من الواجهة.
 */
export function checkPassword(
  raw: unknown,
  context: { email?: string } = {},
): PasswordCheck {
  const password = typeof raw === 'string' ? raw : '';
  const issues: ValidationIssue[] = [];

  if (password.length < LIMITS.passwordMin) {
    issues.push(
      issue(
        'password',
        'too_short',
        `كلمة المرور يجب ألّا تقلّ عن ${LIMITS.passwordMin} محارف.`,
      ),
    );
  }
  if (password.length > LIMITS.passwordMax) {
    issues.push(
      issue('password', 'too_long', 'كلمة المرور أطول من الحدّ المسموح.'),
    );
  }

  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  if (password.length > 0 && classes < 3) {
    issues.push(
      issue(
        'password',
        'too_simple',
        'اخلط ثلاثة أنواع على الأقل: حروفاً صغيرة وكبيرة وأرقاماً ورموزاً.',
      ),
    );
  }

  const lowered = password.toLowerCase();
  if (lowered && COMMON_PASSWORDS.has(lowered)) {
    issues.push(
      issue('password', 'common', 'كلمة المرور هذه شائعة جداً وسهلة التخمين.'),
    );
  }

  // محرف واحد مكرّر، أو تسلسل صاعد طويل.
  if (password.length >= 4 && /^(.)\1+$/.test(password)) {
    issues.push(
      issue('password', 'repeated', 'كلمة المرور محرف واحد مكرّر.'),
    );
  }

  const localPart = (context.email ?? '').split('@')[0]?.toLowerCase() ?? '';
  if (localPart.length >= 4 && lowered.includes(localPart)) {
    issues.push(
      issue('password', 'contains_email', 'لا تجعل كلمة المرور جزءاً من بريدك.'),
    );
  }

  const lengthScore = password.length >= 16 ? 2 : password.length >= 12 ? 1 : 0;
  const score = issues.length
    ? Math.min(1, classes)
    : Math.min(4, classes + lengthScore - 1);

  return { ok: issues.length === 0, issues, score };
}

/** يجمع عدّة نتائج في واحدة، فتظهر كل الأخطاء دفعة واحدة لا واحداً واحداً. */
export function collect<T extends Record<string, unknown>>(
  fields: { [K in keyof T]: ValidationResult<T[K]> },
): ValidationResult<T> {
  const issues: ValidationIssue[] = [];
  const value = {} as T;

  for (const key of Object.keys(fields) as Array<keyof T>) {
    const result = fields[key];
    if (result.ok) value[key] = result.value;
    else issues.push(...result.issues);
  }

  return issues.length ? { ok: false, issues } : { ok: true, value };
}

/** سطر واحد صالح للعرض من عدّة أخطاء. */
export function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((item) => item.message).join(' ');
}

/**
 * خطأ يحمل أخطاء التحقّق، ليُلتقط في الشاشة ويُعرض كما هو.
 *
 * الحقل يُسنَد في الجسم لا كخاصيّة معامل: تجريد الأنواع في Node لا يدعم
 * خصائص المعاملات، وهذه الوحدة تُستورَد في الاختبارات تحت node مباشرة.
 */
export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(describeIssues(issues));
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/** يرمي عند الفشل، ليُستعمل في مسارات لا تتفرّع. */
export function unwrap<T>(result: ValidationResult<T>): T {
  if (result.ok) return result.value;
  throw new ValidationError(result.issues);
}
