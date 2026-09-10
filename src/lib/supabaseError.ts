/**
 * وصف أخطاء Supabase بكل حقولها.
 *
 * PostgrestError يحمل message و details و hint و code، و StorageError يحمل
 * status و statusCode. الاكتفاء بـ message يخفي أهمّها: توثيق PostgREST
 * نفسه ينصّ على أن hint غالباً ما يحمل الإصلاح الفعلي — مثل جملة GRANT
 * الجاهزة عند رفض صلاحية (42501).
 */

interface SupabaseErrorShape {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  error?: unknown;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

/** سطر واحد صالح للعرض، يجمع الحقول المفيدة. */
export function describeSupabaseError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && error.trim()
      ? error
      : 'حدث خطأ غير متوقع.';
  }

  const shape = error as SupabaseErrorShape;
  const parts: string[] = [];

  const message =
    asText(shape.message) ??
    asText(shape.error) ??
    (error instanceof Error ? error.message : null);
  parts.push(message ?? 'حدث خطأ غير متوقع.');

  const code = asText(shape.code) ?? asText(shape.statusCode);
  if (code) parts.push(`[${code}]`);

  const status = asText(shape.status);
  if (status && status !== code) parts.push(`(HTTP ${status})`);

  const details = asText(shape.details);
  if (details) parts.push(`— ${details}`);

  // hint آخراً لأنه الأطول، وهو غالباً الأهم عملياً.
  const hint = asText(shape.hint);
  if (hint) parts.push(`— ${hint}`);

  return parts.join(' ');
}

/**
 * يطبع الخطأ كاملاً في السجل مع اسم الخطوة التي فشلت.
 * الكائن يُطبع كما هو حتى تظهر الحقول التي لا تدخل في سطر العرض.
 */
export function logStepFailure(step: string, error: unknown): void {
  console.error(`[nuqoot] فشلت الخطوة: ${step}`);
  console.error(`[nuqoot] ${step} — ${describeSupabaseError(error)}`);
  console.error(`[nuqoot] ${step} — الكائن الكامل:`, error);
}
