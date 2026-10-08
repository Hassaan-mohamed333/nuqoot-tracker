import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { EventParticipant } from '@/types';
import {
  buildInviteLink,
  buildInviteMessage,
  canEditEvent,
  canManageEvent,
  formatInviteCode,
  parseInviteCode,
  roleAtLeast,
} from '@/utils/eventInvite';
import { ME_LABEL, participantName } from '@/utils/split';

const CODE = 'A1B2C3D4E5F6';

describe('قراءة كود الدعوة', () => {
  test('كود عارٍ بأي حالة أحرف', () => {
    assert.equal(parseInviteCode(CODE), CODE);
    assert.equal(parseInviteCode(CODE.toLowerCase()), CODE);
  });

  test('بشرطات ومسافات كما يُنسخ من واتساب', () => {
    assert.equal(parseInviteCode('A1B2-C3D4-E5F6'), CODE);
    assert.equal(parseInviteCode('  a1b2 c3d4 e5f6  '), CODE);
  });

  test('الأرقام الهندية من لوحة المفاتيح العربية', () => {
    assert.equal(parseInviteCode('٠١٢٣٤٥٦٧٨٩AB'), '0123456789AB');
  });

  test('داخل رابط ويب كامل', () => {
    assert.equal(
      parseInviteCode(`https://hassaan-mohamed333.github.io/nuqoot-tracker/?join=${CODE}`),
      CODE,
    );
    assert.equal(
      parseInviteCode(`https://x.io/app/?a=1&join=${CODE}&b=2#frag`),
      CODE,
    );
  });

  test('داخل رابط التطبيق المباشر', () => {
    assert.equal(parseInviteCode(`nuqoot://join/${CODE}`), CODE);
  });

  test('نصٌّ ليس كوداً يُرفض', () => {
    for (const bad of [
      '',
      '   ',
      'hello',
      'A1B2C3D4E5F',
      'A1B2C3D4E5F67',
      'ZZZZZZZZZZZZ',
      "A1B2C3D4E5F6'; drop table events;--",
    ]) {
      assert.equal(parseInviteCode(bad), null, `قُبل: ${bad}`);
    }
  });

  test('كود المصادقة في رابط OAuth لا يُعدّ دعوة', () => {
    assert.equal(
      parseInviteCode('https://x.io/nuqoot-tracker/?code=123e4567-e89b-12d3-a456-426614174000'),
      null,
    );
  });
});

describe('الرابط والرسالة', () => {
  test('الكود في الاستعلام ويُستبدل ما كان فيه', () => {
    assert.equal(
      buildInviteLink(CODE, 'https://x.io/app/?old=1#top'),
      `https://x.io/app/?join=${CODE}`,
    );
  });

  test('الرابط المبنيّ يُقرأ راجعاً إلى الكود نفسه', () => {
    assert.equal(parseInviteCode(buildInviteLink(CODE, 'https://x.io/app/')), CODE);
  });

  test('العرض بمجموعات من أربع خانات', () => {
    assert.equal(formatInviteCode(CODE), 'A1B2-C3D4-E5F6');
  });

  test('رسالة المشاركة تحوي الرابط والكود', () => {
    const message = buildInviteMessage({
      eventTitle: 'زفاف أحمد',
      code: CODE,
      link: 'https://x.io/?join=' + CODE,
      appName: 'الكراسة الصفرا',
    });
    assert.ok(message.includes('زفاف أحمد'));
    assert.ok(message.includes('https://x.io/?join=' + CODE));
    assert.ok(message.includes('A1B2-C3D4-E5F6'));
  });
});

describe('الأدوار', () => {
  test('الترتيب: مشاهد < محرّر < مالك', () => {
    assert.equal(roleAtLeast('viewer', 'editor'), false);
    assert.equal(roleAtLeast('editor', 'editor'), true);
    assert.equal(roleAtLeast('owner', 'editor'), true);
    assert.equal(roleAtLeast(null, 'viewer'), false);
  });

  test('المشاهد لا يكتب، والمالك وحده يدير', () => {
    assert.equal(canEditEvent('viewer'), false);
    assert.equal(canEditEvent('editor'), true);
    assert.equal(canEditEvent(null), false);
    assert.equal(canManageEvent('editor'), false);
    assert.equal(canManageEvent('owner'), true);
  });
});

describe('اسم المشارك في المناسبة المشتركة', () => {
  const base: EventParticipant = {
    id: 'p1',
    event_id: 'e1',
    contact_id: null,
    display_name: null,
    created_at: '2026-01-01T00:00:00Z',
  };
  const names = new Map([['c1', 'خالد']]);

  test('صفّي أنا يظهر «أنا» لي واسمي لغيري', () => {
    const row = { ...base, member_user_id: 'u1', shown_name: 'سارة' };
    assert.equal(participantName(row, names, 'u1'), ME_LABEL);
    assert.equal(participantName(row, names, 'u2'), 'سارة');
  });

  test('عضو منضمّ بدعوة: اسمه لغيره و«أنا» له', () => {
    const row = { ...base, display_name: 'منى', member_user_id: 'u2', shown_name: 'منى' };
    assert.equal(participantName(row, names, 'u2'), ME_LABEL);
    assert.equal(participantName(row, names, 'u1'), 'منى');
  });

  test('جهة اتصال غير موجودة عند هذا العضو تؤخذ من النسخة التي حفظها الخادم', () => {
    const row = { ...base, contact_id: 'not-mine', shown_name: 'عمر' };
    assert.equal(participantName(row, names, 'u9'), 'عمر');
  });

  test('جهة اتصالي أنا تُقرأ من دفتري', () => {
    const row = { ...base, contact_id: 'c1', shown_name: 'خالد (قديم)' };
    assert.equal(participantName(row, names, 'u9'), 'خالد');
  });

  test('الدفتر المحلي القديم يبقى كما كان', () => {
    assert.equal(participantName(base, names), ME_LABEL);
    assert.equal(participantName({ ...base, display_name: 'ضيف' }, names), 'ضيف');
    assert.equal(participantName({ ...base, contact_id: 'c1' }, names), 'خالد');
  });
});
