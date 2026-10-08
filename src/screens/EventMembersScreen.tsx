import type { RouteProp } from '@react-navigation/native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { Copy, Link2, Share2, Trash2, UserMinus } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Avatar, Button, SegmentedControl } from '@/components/ui';
import { confirmAction, notify, reportError } from '@/lib/alerts';
import { inviteBaseUrl } from '@/lib/appLinks';
import { palette } from '@/lib/palette';
import {
  createInvite,
  fetchEventMembers,
  fetchMyEventRole,
  removeMember,
  revokeInvites,
  setMemberRole,
  sharingAvailable,
} from '@/lib/sharedEvents';
import { composeInviteMessage, deliverText } from '@/lib/shareEvent';
import { logStepFailure, userMessage } from '@/lib/supabaseError';
import type { RootStackParamList } from '@/navigation/types';
import { useAuth } from '@/store/AuthProvider';
import { useLedger } from '@/store/LedgerProvider';
import type { EventMember, EventRole } from '@/types';
import {
  ROLE_HINTS,
  ROLE_LABELS,
  buildInviteLink,
  canManageEvent,
  formatInviteCode,
} from '@/utils/eventInvite';

type MembersRoute = RouteProp<RootStackParamList, 'EventMembers'>;

const INVITE_ROLES = [
  { value: 'editor', label: 'محرّر' },
  { value: 'viewer', label: 'مشاهد' },
] as const;

/** أعضاء المناسبة المشتركة: الدعوة وتغيير الأدوار والإزالة. */
export function EventMembersScreen() {
  const { params } = useRoute<MembersRoute>();
  const { getEventById } = useLedger();
  const { userId } = useAuth();
  const event = getEventById(params.eventId);

  const [role, setRole] = useState<EventRole | null>(null);
  const [members, setMembers] = useState<EventMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  /** الكود الخام لا يُسترجع من الخادم: نعرضه هنا حتى تُغلق الشاشة. */
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const available = sharingAvailable();
  const isOwner = canManageEvent(role);

  const load = useCallback(async () => {
    if (!available) {
      setLoading(false);
      return;
    }
    try {
      const [myRole, rows] = await Promise.all([
        fetchMyEventRole(params.eventId),
        fetchEventMembers(params.eventId),
      ]);
      setRole(myRole);
      setMembers(rows);
      setLoadError(null);
    } catch (error) {
      logStepFailure('تحميل أعضاء المناسبة', error);
      setLoadError(userMessage(error));
    } finally {
      setLoading(false);
    }
  }, [available, params.eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const link = inviteCode ? buildInviteLink(inviteCode, inviteBaseUrl()) : null;

  async function handleCreateInvite() {
    if (inviting) return;
    setInviting(true);
    try {
      setInviteCode(await createInvite(params.eventId, inviteRole));
    } catch (error) {
      reportError('تعذّر إنشاء الدعوة', error);
    } finally {
      setInviting(false);
    }
  }

  async function handleShare() {
    if (!inviteCode || !event) return;
    const { message } = composeInviteMessage(event, inviteCode);
    const delivery = await deliverText(message);
    if (delivery === 'copied') notify('تم النسخ', 'الصق الدعوة في واتساب أو أي محادثة.');
    else if (delivery === 'shown') notify('الدعوة', message);
  }
  async function handleCopyCode() {
    if (!inviteCode) return;
    const delivery = await deliverText(formatInviteCode(inviteCode));
    if (delivery === 'copied') notify('تم النسخ', 'نُسخ الكود.');
    else if (delivery === 'shown') notify('الكود', formatInviteCode(inviteCode));
  }

  async function handleRevoke() {
    const approved = await confirmAction({
      title: 'إلغاء الدعوات',
      message: 'ستتوقف كل روابط الدعوة الجارية عن العمل. الأعضاء الحاليون يبقون.',
      confirmLabel: 'إلغاء الدعوات',
      destructive: true,
    });
    if (!approved) return;
    try {
      await revokeInvites(params.eventId);
      setInviteCode(null);
      notify('تم', 'أُلغيت كل الدعوات.');
    } catch (error) {
      reportError('تعذّر إلغاء الدعوات', error);
    }
  }

  async function handleRole(member: EventMember, next: 'editor' | 'viewer') {
    if (busyUser || member.role === next) return;
    setBusyUser(member.user_id);
    try {
      await setMemberRole(params.eventId, member.user_id, next);
      await load();
    } catch (error) {
      reportError('تعذّر تغيير الدور', error);
    } finally {
      setBusyUser(null);
    }
  }

  async function handleRemove(member: EventMember, leaving: boolean) {
    const approved = await confirmAction({
      title: leaving ? 'مغادرة المناسبة' : 'إزالة عضو',
      message: leaving
        ? 'لن ترى هذه المناسبة بعد الآن. ما أضفته من مصروفات يبقى فيها.'
        : `سيفقد ${member.full_name ?? 'هذا العضو'} الوصول إلى المناسبة.`,
      confirmLabel: leaving ? 'مغادرة' : 'إزالة',
      destructive: true,
    });
    if (!approved) return;
    setBusyUser(member.user_id);
    try {
      await removeMember(params.eventId, member.user_id);
      if (leaving) {
        notify('تمت المغادرة', 'لم تعد عضواً في هذه المناسبة.');
      }
      await load();
    } catch (error) {
      reportError(leaving ? 'تعذّرت المغادرة' : 'تعذّرت الإزالة', error);
    } finally {
      setBusyUser(null);
    }
  }

  if (!available) {
    return (
      <View className="flex-1 items-center justify-center bg-base px-8">
        <Text className="text-center text-body text-ink-muted">
          مشاركة المناسبة تحتاج حساباً متصلاً. سجّل الدخول بحسابك أولاً.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-base">
        <ActivityIndicator color={palette.primaryStrong} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-base"
      contentContainerClassName="p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void load()}
          tintColor={palette.primaryStrong}
        />
      }>
      {loadError ? (
        <View className="mb-3 rounded-2xl border border-danger/25 bg-danger-soft p-3">
          <Text className="text-right text-xs text-danger">{loadError}</Text>
        </View>
      ) : null}

      <Text className="mb-2 text-right text-sm font-bold text-ink">
        الأعضاء ({members.length})
      </Text>
      <View className="rounded-2xl border border-line bg-surface p-2">
        {members.map((member) => {
          const mine = member.user_id === userId;
          const name = member.full_name?.trim() || 'عضو';
          return (
            <View key={member.user_id} className="px-2 py-2">
              <View className="flex-row-reverse items-center">
                <Avatar profileName={name} size={40} />
                <View className="mr-3 flex-1">
                  <Text className="text-right text-sm font-bold text-ink">
                    {mine ? `${name} (أنت)` : name}
                  </Text>
                  <Text className="text-right text-caption text-ink-muted">
                    {ROLE_LABELS[member.role]} · {ROLE_HINTS[member.role]}
                  </Text>
                </View>

                {busyUser === member.user_id ? (
                  <ActivityIndicator color={palette.primaryStrong} />
                ) : isOwner && member.role !== 'owner' ? (
                  <Pressable
                    onPress={() => void handleRemove(member, false)}
                    accessibilityRole="button"
                    accessibilityLabel={`إزالة ${name}`}
                    hitSlop={8}>
                    <UserMinus size={18} color={palette.danger} />
                  </Pressable>
                ) : null}
              </View>

              {isOwner && member.role !== 'owner' ? (
                <SegmentedControl
                  className="mt-2"
                  options={INVITE_ROLES}
                  value={member.role === 'viewer' ? 'viewer' : 'editor'}
                  onChange={(next) => void handleRole(member, next)}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {!isOwner && role ? (
        <Button
          className="mt-4"
          title="مغادرة المناسبة"
          variant="outline"
          icon={<Trash2 size={16} color={palette.danger} />}
          onPress={() => {
            const me = members.find((row) => row.user_id === userId);
            if (me) void handleRemove(me, true);
          }}
        />
      ) : null}

      {isOwner ? (
        <>
          <Text className="mb-2 mt-6 text-right text-sm font-bold text-ink">
            دعوة أعضاء
          </Text>
          <Text className="mb-3 text-right text-caption text-ink-muted">
            أنشئ رابطاً وأرسله على واتساب. صالح 72 ساعة ولخمسة أشخاص كحدّ أقصى. من
            ينضمّ يظهر في قسمة المناسبة باسمه تلقائياً.
          </Text>

          <SegmentedControl
            options={INVITE_ROLES}
            value={inviteRole}
            onChange={setInviteRole}
          />
          <Text className="mb-3 mt-2 text-right text-caption text-ink-muted">
            {ROLE_HINTS[inviteRole]}
          </Text>

          <Button
            title={inviteCode ? 'دعوة جديدة' : 'إنشاء رابط دعوة'}
            icon={<Link2 size={16} color={palette.onPrimary} />}
            onPress={() => void handleCreateInvite()}
            loading={inviting}
          />

          {inviteCode && link ? (
            <View className="mt-4 rounded-2xl border border-primary-strong/40 bg-primary-soft p-4">
              <Text className="text-center text-caption text-ink-muted">
                كود الدعوة
              </Text>
              <Text
                selectable
                className="mt-1 text-center text-title tracking-widest text-ink">
                {formatInviteCode(inviteCode)}
              </Text>
              <Text selectable className="mt-2 text-center text-caption text-ink-muted">
                {link}
              </Text>

              <View className="mt-3 flex-row-reverse gap-2">
                <View className="flex-1">
                  <Button
                    title="مشاركة"
                    size="sm"
                    icon={<Share2 size={14} color={palette.onPrimary} />}
                    onPress={() => void handleShare()}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    title="نسخ الكود"
                    size="sm"
                    variant="outline"
                    icon={<Copy size={14} color={palette.text} />}
                    onPress={() => void handleCopyCode()}
                  />
                </View>
              </View>
              <Text className="mt-3 text-center text-[11px] text-ink-subtle">
                لا يُعرض الكود مرة أخرى بعد إغلاق هذه الشاشة.
              </Text>
            </View>
          ) : null}

          <Button
            className="mt-4"
            title="إلغاء كل الدعوات"
            variant="outline"
            onPress={() => void handleRevoke()}
          />
        </>
      ) : null}
    </ScrollView>
  );
}
