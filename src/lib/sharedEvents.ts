import { logStepFailure } from '@/lib/supabaseError';
import { requireSupabase, usesServerData } from '@/lib/supabase';
import { isServerRowId } from '@/lib/validation';
import type { EventMember, EventRole } from '@/types';
import { parseInviteCode } from '@/utils/eventInvite';

/**
 * المناسبات المشتركة: الأعضاء والدعوات والانضمام.
 *
 * كل ما هنا يمرّ على Supabase بجلسة المستخدم، فصلاحياته تقرّرها RLS
 * والدوال في schema.sql، لا هذا الملف. ما نفعله هنا مجرّد تحقّق مبكر
 * ليصل المستخدم إلى رسالة مفهومة بدل خطأ خادم.
 *
 * الدفتر المحلي (بلا حساب) لا يعرف المشاركة: كل الدوال ترفض بوضوح.
 */

/** هل المشاركة متاحة؟ تحتاج خادماً وجلسة، فالدفتر المحلي بلا أعضاء. */
export function sharingAvailable(): boolean {
  return usesServerData();
}

/** أخطاء الدعوة كما تصل من دوال Postgres، بلا تفاصيل داخلية. */
export class InviteError extends Error {
  constructor(
    readonly reason: 'invalid_code' | 'invalid_invite' | 'not_allowed' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'InviteError';
  }
}

const INVITE_MESSAGES = {
  invalid_code: 'الكود غير صحيح. تأكد منه أو الصق الرابط كاملاً.',
  invalid_invite: 'الدعوة غير صالحة أو انتهت. اطلب من صاحب المناسبة دعوة جديدة.',
  not_allowed: 'ليست لديك صلاحية لهذا الإجراء.',
  unavailable: 'المشاركة تحتاج حساباً متصلاً. سجّل الدخول أولاً.',
} as const;

function inviteError(reason: keyof typeof INVITE_MESSAGES): InviteError {
  return new InviteError(reason, INVITE_MESSAGES[reason]);
}

/** يربط خطأ Postgres برمز الدعوة، أو يعيد الخطأ كما هو. */
function mapInviteError(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  if (code === 'P0002' || message.includes('invalid_invite')) {
    return inviteError('invalid_invite');
  }
  if (code === '42501' || message.includes('not_allowed')) {
    return inviteError('not_allowed');
  }
  return error;
}

function requireServerEvent(eventId: string): void {
  if (!usesServerData() || !isServerRowId(eventId)) {
    throw inviteError('unavailable');
  }
}

/** دوري في المناسبة، أو null إن لم أكن عضواً أو كان الدفتر محلياً. */
export async function fetchMyEventRole(eventId: string): Promise<EventRole | null> {
  if (!usesServerData() || !isServerRowId(eventId)) return null;
  try {
    const { data, error } = await requireSupabase().rpc('event_role', {
      p_event: eventId,
    });
    if (error) throw error;
    return data === 'owner' || data === 'editor' || data === 'viewer' ? data : null;
  } catch (error) {
    logStepFailure('قراءة دوري في المناسبة', error);
    return null;
  }
}

/** أعضاء المناسبة الحقيقيون بأسمائهم وأدوارهم. */
export async function fetchEventMembers(eventId: string): Promise<EventMember[]> {
  requireServerEvent(eventId);
  const { data, error } = await requireSupabase().rpc('event_member_names', {
    p_event: eventId,
  });
  if (error) {
    logStepFailure('قراءة أعضاء المناسبة', error);
    throw error;
  }
  const order: Record<EventRole, number> = { owner: 0, editor: 1, viewer: 2 };
  return ((data ?? []) as EventMember[]).sort(
    (a, b) => order[a.role] - order[b.role],
  );
}

/**
 * ينشئ دعوة ويعيد كودها الخام.
 *
 * الخادم لا يخزّن الكود إلا مُبصَّماً، فهذه آخر مرة يُرى فيها: من يغلق الشاشة
 * قبل نسخه ينشئ دعوة جديدة.
 */
export async function createInvite(
  eventId: string,
  role: 'editor' | 'viewer',
): Promise<string> {
  requireServerEvent(eventId);
  try {
    const { data, error } = await requireSupabase().rpc('create_event_invite', {
      p_event: eventId,
      p_role: role,
    });
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('empty invite code');
    return data;
  } catch (error) {
    logStepFailure('إنشاء دعوة', error);
    throw mapInviteError(error);
  }
}

/** يلغي كل دعوات المناسبة الجارية. */
export async function revokeInvites(eventId: string): Promise<void> {
  requireServerEvent(eventId);
  try {
    const { error } = await requireSupabase().rpc('revoke_event_invites', {
      p_event: eventId,
    });
    if (error) throw error;
  } catch (error) {
    logStepFailure('إلغاء الدعوات', error);
    throw mapInviteError(error);
  }
}

/**
 * ينضمّ إلى مناسبة بنصٍّ لصقه المستخدم (كود أو رابط) ويعيد معرّفها.
 *
 * النص يُفحص محلياً أولاً: الشكل الصالح وحده يصل إلى الخادم.
 */
export async function joinEvent(input: string): Promise<string> {
  const code = parseInviteCode(input);
  if (!code) throw inviteError('invalid_code');
  if (!usesServerData()) throw inviteError('unavailable');
  try {
    const { data, error } = await requireSupabase().rpc('join_event_by_code', {
      p_code: code,
    });
    if (error) throw error;
    if (typeof data !== 'string' || !isServerRowId(data)) {
      throw new Error('unexpected join result');
    }
    return data;
  } catch (error) {
    logStepFailure('الانضمام إلى مناسبة', error);
    throw mapInviteError(error);
  }
}

/** يغيّر دور عضو (محرّر ⇄ مشاهد). المالك وحده، والخادم يفرض ذلك. */
export async function setMemberRole(
  eventId: string,
  userId: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  requireServerEvent(eventId);
  const { data, error } = await requireSupabase()
    .from('event_members')
    .update({ role })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) {
    logStepFailure('تغيير دور عضو', error);
    throw mapInviteError(error);
  }
  // RLS تُسقط الصفوف المرفوضة بصمت: لا صفّ معدَّل = لا صلاحية.
  if (!data || data.length === 0) throw inviteError('not_allowed');
}

/** يزيل عضواً (المالك)، أو يغادر المستخدم بنفسه إن مرّر معرّفه. */
export async function removeMember(eventId: string, userId: string): Promise<void> {
  requireServerEvent(eventId);
  const { data, error } = await requireSupabase()
    .from('event_members')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) {
    logStepFailure('إزالة عضو', error);
    throw mapInviteError(error);
  }
  if (!data || data.length === 0) throw inviteError('not_allowed');
}
