import type { EventRole } from '@/types';

/**
 * دعوات المناسبات المشتركة: منطق نقيّ بلا اعتماد على الشبكة أو الواجهة،
 * فيُختبر مباشرةً.
 *
 * الكود 12 خانة سداسية عشرية (يولّدها الخادم). نقبله بأي شكل يلصقه المستخدم:
 * كوداً عارياً، أو بشرطات، أو داخل رابط كامل — لأن الدعوة تصل عادةً
 * منسوخةً من واتساب بما حولها.
 */

export const INVITE_CODE_LENGTH = 12;

const CODE_PATTERN = new RegExp(`^[0-9A-F]{${INVITE_CODE_LENGTH}}$`);

/** اسم معامل الرابط الذي يحمل الكود: ?join=XXXX. */
export const INVITE_PARAM = 'join';

/** يحوّل الأرقام الهندية (٠-٩) إلى لاتينية: لوحة مفاتيح عربية تُنتج هذه. */
function toLatinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) - '٠'.charCodeAt(0)),
  );
}

/**
 * يستخرج كود الدعوة من نص حرّ، أو null إن لم يكن كوداً صالحاً.
 *
 * الشكل الصالح فقط يمرّ إلى الخادم: لا يُرسل نصٌّ عشوائي إلى دالة الانضمام.
 */
export function parseInviteCode(input: string): string | null {
  const text = toLatinDigits(input).trim();
  if (!text) return null;

  // رابط كامل: الكود في معامل join، وإلا فآخر مقطع في المسار (nuqoot://join/CODE).
  let candidate = text;
  const fromQuery = /[?&]join=([^&#\s]+)/i.exec(text);
  if (fromQuery) {
    candidate = fromQuery[1];
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.includes('/')) {
    const segments = text.split(/[?#]/)[0].split('/').filter(Boolean);
    candidate = segments[segments.length - 1] ?? '';
  }

  const normalized = candidate.replace(/[\s\-_]/g, '').toUpperCase();
  return CODE_PATTERN.test(normalized) ? normalized : null;
}

/** AB12-CD34-EF56: أسهل قراءةً وإملاءً من اثنتي عشرة خانة متصلة. */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** رابط الدعوة. المعامل في الاستعلام لا المسار: GitHub Pages لا يعرف مسارات التطبيق. */
export function buildInviteLink(code: string, baseUrl: string): string {
  const base = baseUrl.split(/[?#]/)[0];
  return `${base}?${INVITE_PARAM}=${encodeURIComponent(code)}`;
}

/** رتبة الدور للمقارنة. */
const ROLE_RANK: Record<EventRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function roleAtLeast(role: EventRole | null, min: EventRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}

/** إضافة مصروف ومشاركين: editor فأعلى. */
export function canEditEvent(role: EventRole | null): boolean {
  return roleAtLeast(role, 'editor');
}

/** الأعضاء والدعوات والحذف: المالك وحده. */
export function canManageEvent(role: EventRole | null): boolean {
  return role === 'owner';
}

export const ROLE_LABELS: Record<EventRole, string> = {
  owner: 'المالك',
  editor: 'محرّر',
  viewer: 'مشاهد',
};

export const ROLE_HINTS: Record<EventRole, string> = {
  owner: 'يدير الأعضاء والدعوات ويحذف المناسبة',
  editor: 'يضيف ويعدّل المصروفات والمشاركين',
  viewer: 'يطّلع ويصدّر التقارير فقط',
};

/** رسالة الدعوة التي تُشارَك على واتساب وغيره. */
export function buildInviteMessage(options: {
  eventTitle: string;
  code: string;
  link: string;
  appName: string;
}): string {
  return [
    `ادعوك للانضمام إلى مناسبة «${options.eventTitle}» على ${options.appName}.`,
    '',
    `الرابط: ${options.link}`,
    `أو أدخل الكود: ${formatInviteCode(options.code)}`,
  ].join('\n');
}
