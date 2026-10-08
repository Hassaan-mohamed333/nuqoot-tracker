/**
 * تحويلات قيمة حقل التاريخ، منفصلة عن المكوّن (لا react-native هنا) كي
 * تُختبر وحدها تحت node.
 */

/** `YYYY-MM-DD` بالتوقيت المحلي. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * يبني تاريخاً من `YYYY-MM-DD` بالتوقيت المحلي.
 *
 * `new Date('1990-05-01')` يفسّره المحرّك على أنه UTC، فيصير ٣٠ أبريل
 * لكل من يسكن غرب غرينتش. تمرير المكوّنات منفصلةً يبني اليوم المقصود.
 */
export function fromDateInputValue(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
}
