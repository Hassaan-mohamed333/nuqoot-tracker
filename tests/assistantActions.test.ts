import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  describeAction,
  isQueryAction,
  normalizeEventType,
  parseToolCall,
  requiresConfirmation,
} from '../src/lib/assistantTools.ts';
import { parseLocalCommand } from '../src/lib/localIntent.ts';

/** ما يفهمه المفسّر المحلي، ثم يمرّ على التحقّق كما في التطبيق. */
function local(text: string) {
  const intent = parseLocalCommand(text);
  assert.ok(intent, `لم يُفهم: ${text}`);
  const parsed = parseToolCall(intent.name, intent.args);
  assert.equal(parsed.ok, true, `رُفض بعد الفهم: ${text}`);
  return parsed.ok ? parsed.action : (undefined as never);
}

describe('أدوات الكتابة الجديدة: التحقّق', () => {
  test('createContact يلزمه اسم ويعقّم الباقي', () => {
    assert.equal(parseToolCall('createContact', {}).ok, false);
    const ok = parseToolCall('createContact', {
      name: '  سامي   عبدالله ',
      phone: '0100 000 0000',
    });
    assert.equal(ok.ok, true);
    if (ok.ok && ok.action.tool === 'createContact') {
      assert.equal(ok.action.name, 'سامي عبدالله');
    }
  });

  test('createEvent: عنوان لازم، ونوع مجهول يصير other', () => {
    assert.equal(parseToolCall('createEvent', { title: '' }).ok, false);
    const ok = parseToolCall('createEvent', { title: 'فرح أحمد', eventType: 'فرح' });
    assert.equal(ok.ok, true);
    if (ok.ok && ok.action.tool === 'createEvent') {
      assert.equal(ok.action.eventType, 'wedding');
      assert.equal(ok.action.date, null);
    }
    assert.equal(normalizeEventType('شيء غريب'), 'other');
    assert.equal(normalizeEventType('سبوع'), 'newborn');
  });

  test('createEvent يرفض تاريخاً غير مفهوم ويقبل الصحيح', () => {
    assert.equal(
      parseToolCall('createEvent', { title: 'تخرج', date: 'بكرة بعد المغرب' }).ok,
      false,
    );
    const ok = parseToolCall('createEvent', { title: 'تخرج', date: '2026-12-31' });
    assert.equal(ok.ok, true);
    if (ok.ok && ok.action.tool === 'createEvent') {
      assert.ok(ok.action.date?.startsWith('2026-12-3'));
    }
  });

  test('addSharedExpense يرفض المبلغ الباطل والوصف الفارغ', () => {
    const base = { eventTitle: 'الفرح', description: 'قاعة', amount: 5000 };
    assert.equal(parseToolCall('addSharedExpense', base).ok, true);
    for (const bad of [
      { ...base, amount: -5 },
      { ...base, amount: 'خمسة' },
      { ...base, amount: 0 },
      { ...base, description: '' },
      { ...base, eventTitle: '' },
    ]) {
      assert.equal(parseToolCall('addSharedExpense', bad).ok, false);
    }
  });

  test('createEventInvite: الدور editor أو viewer فقط، والافتراضي editor', () => {
    const ok = parseToolCall('createEventInvite', { eventTitle: 'الفرح' });
    assert.equal(ok.ok, true);
    if (ok.ok && ok.action.tool === 'createEventInvite') {
      assert.equal(ok.action.role, 'editor');
    }
    // owner لا يُمنح بدعوة مهما قال النموذج.
    assert.equal(
      parseToolCall('createEventInvite', { eventTitle: 'الفرح', role: 'owner' }).ok,
      false,
    );
  });

  test('restoreItem وaddEventGuest يلزمهما الاسم', () => {
    assert.equal(parseToolCall('restoreItem', { target: 'contact' }).ok, false);
    assert.equal(
      parseToolCall('restoreItem', { target: 'contact', contactName: 'سامي' }).ok,
      true,
    );
    assert.equal(parseToolCall('addEventGuest', { eventTitle: 'الفرح' }).ok, false);
    assert.equal(
      parseToolCall('addEventGuest', { eventTitle: 'الفرح', name: 'منى' }).ok,
      true,
    );
  });
});

describe('بوّابة التأكيد للأدوات الجديدة', () => {
  test('كل ما يكتب يحتاج موافقة، وكل سؤال لا يحتاجها', () => {
    const writes = [
      parseToolCall('createContact', { name: 'سامي' }),
      parseToolCall('createEvent', { title: 'فرح أحمد' }),
      parseToolCall('addSharedExpense', { eventTitle: 'ف', description: 'قاعة', amount: 1 }),
      parseToolCall('addEventGuest', { eventTitle: 'ف', name: 'منى' }),
      parseToolCall('createEventInvite', { eventTitle: 'فرح' }),
      parseToolCall('restoreItem', { target: 'contact', contactName: 'سامي' }),
    ];
    for (const call of writes) {
      assert.equal(call.ok, true);
      if (call.ok) assert.equal(requiresConfirmation(call.action), true, call.action.tool);
    }

    for (const call of [
      parseToolCall('getBalance', {}),
      parseToolCall('getBalance', { contactName: 'سامي' }),
      parseToolCall('getEventSummary', { eventTitle: 'الفرح' }),
    ]) {
      assert.equal(call.ok, true);
      if (call.ok) {
        assert.equal(requiresConfirmation(call.action), false);
        assert.equal(isQueryAction(call.action), true);
      }
    }
  });

  test('لكل أداة جديدة وصف عربي سليم', () => {
    const calls = [
      parseToolCall('createContact', { name: 'سامي', phone: '0100' }),
      parseToolCall('createEvent', { title: 'فرح أحمد' }),
      parseToolCall('addSharedExpense', {
        eventTitle: 'الفرح',
        description: 'قاعة',
        amount: 5000,
        payerName: 'أحمد',
      }),
      parseToolCall('addEventGuest', { eventTitle: 'الفرح', name: 'منى' }),
      parseToolCall('createEventInvite', { eventTitle: 'الفرح', role: 'viewer' }),
      parseToolCall('restoreItem', { target: 'transaction', contactName: 'سامي' }),
      parseToolCall('getBalance', {}),
      parseToolCall('getEventSummary', { eventTitle: 'الفرح' }),
    ];
    for (const call of calls) {
      assert.equal(call.ok, true);
      if (call.ok) {
        const text = describeAction(call.action);
        assert.ok(text.length > 0 && !text.includes('undefined') && !text.includes('null'), text);
      }
    }
  });
});

describe('الفهم المحلي: يعمل بلا خادم', () => {
  test('«افتح مناسبة جديدة» يفتح نموذج المناسبة', () => {
    const action = local('افتح مناسبة جديدة');
    assert.equal(action.tool, 'navigateTo');
    if (action.tool === 'navigateTo') assert.equal(action.screen, 'addEvent');
  });

  test('«افتح المناسبات» ما زال يفتح القائمة لا النموذج', () => {
    const action = local('افتح المناسبات');
    assert.equal(action.tool, 'navigateTo');
    if (action.tool === 'navigateTo') assert.equal(action.screen, 'events');
  });

  test('مناسبة باسمها تُنشأ مباشرة', () => {
    const action = local('اعمل مناسبة فرح أحمد');
    assert.equal(action.tool, 'createEvent');
    if (action.tool === 'createEvent') {
      assert.equal(action.title, 'فرح أحمد');
      assert.equal(action.eventType, 'wedding');
    }
    const named = local('أنشئ مناسبة جديدة باسم سبوع ياسين');
    if (named.tool === 'createEvent') assert.equal(named.title, 'سبوع ياسين');
    else assert.fail('لم تُنشأ المناسبة');
  });

  test('جهة اتصال: بالاسم تُنشأ، وبدونه يُفتح النموذج', () => {
    const named = local('أضف جهة اتصال سامي عبدالله');
    assert.equal(named.tool, 'createContact');
    if (named.tool === 'createContact') assert.equal(named.name, 'سامي عبدالله');

    const bare = local('افتح جهة اتصال جديدة');
    assert.equal(bare.tool, 'navigateTo');
    if (bare.tool === 'navigateTo') assert.equal(bare.screen, 'addContact');
  });

  test('إضافة شخص إلى مناسبة', () => {
    const action = local('أضف منى لمناسبة فرح أحمد');
    assert.equal(action.tool, 'addEventGuest');
    if (action.tool === 'addEventGuest') {
      assert.equal(action.name, 'منى');
      assert.equal(action.eventTitle, 'فرح أحمد');
    }
  });

  test('دعوة لمناسبة', () => {
    const action = local('اعمل دعوة لمناسبة فرح أحمد');
    assert.equal(action.tool, 'createEventInvite');
    if (action.tool === 'createEventInvite') assert.equal(action.eventTitle, 'فرح أحمد');
  });

  test('أسئلة الرصيد', () => {
    const person = local('كام على سامي؟');
    assert.equal(person.tool, 'getBalance');
    if (person.tool === 'getBalance') assert.equal(person.contactName, 'سامي');

    const total = local('حسابي كام');
    assert.equal(total.tool, 'getBalance');
    if (total.tool === 'getBalance') assert.equal(total.contactName, null);
  });

  test('أوامر التسجيل والأرشفة القديمة لم تتأثر', () => {
    const record = local('سجل 500 لسامي');
    assert.equal(record.tool, 'createTransaction');
    const archive = local('احذف فاتورة أحمد');
    assert.equal(archive.tool, 'archiveItem');
  });

  test('ما ليس واضحاً يعود null ليذهب إلى الطراز', () => {
    for (const text of ['مرحبا', 'ايه الاخبار', 'اعمل حاجة حلوة', '']) {
      assert.equal(parseLocalCommand(text), null, text);
    }
  });
});
