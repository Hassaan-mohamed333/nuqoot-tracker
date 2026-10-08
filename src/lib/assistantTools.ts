/**
 * عقد أدوات المساعد: الأسماء، الوجهات، والتحقّق من الوسائط.
 *
 * وحدة نقيّة عمداً (لا react-native ولا supabase) لسببين: تُختبر وحدها
 * تحت node، وتُستورد من الخطّاف ومن طبقة النقل معاً بلا دورة استيراد.
 *
 * **لماذا التحقّق هنا أصلاً**: ما يصل من الطراز ليس بياناتٍ موثوقة. هو
 * نصٌّ ولّده نموذج لغوي من كلام المستخدم — وكلامُ المستخدم قد يحمل نصّاً
 * مدسوساً يوجّه النموذج (prompt injection)، وقد يهلوس النموذج وسيطاً غير
 * موجود أصلاً. فكل وسيط يمرّ من هنا قبل أن يلمس تنقّلاً أو قاعدة بيانات،
 * ويمرّ بعدها على بوّابة تأكيد بشرية لكل فعل يكتب.
 */

import { checkAmount, sanitizeLine, textLength, LIMITS } from '@/lib/validation';
import type { EventType } from '@/types';

/** أسماء الأدوات كما يراها الطراز. مصدر واحد للاسم. */
export const TOOL_NAMES = [
  'navigateTo',
  'createTransaction',
  'archiveItem',
  'toggleModal',
  'createContact',
  'createEvent',
  'addSharedExpense',
  'addEventGuest',
  'createEventInvite',
  'restoreItem',
  'getBalance',
  'getEventSummary',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * الوجهات المتاحة للتنقّل.
 *
 * قائمة مغلقة لا اسم شاشة حرّ: اسمٌ حرّ من الطراز يعني إمّا تعطّلاً صامتاً
 * عند عدم وجوده، أو تنقّلاً إلى شاشة لم يقصدها المستخدم. والمفاتيح
 * بالإنجليزية لأن الطراز يراها، والوصف العربي يشرحها له.
 */
export const SCREEN_TARGETS = {
  home: 'الرئيسية: الملخّص وآخر الحركات',
  contacts: 'قائمة جهات الاتصال',
  events: 'قائمة المناسبات',
  contactProfile: 'دفتر جهة اتصال بعينها (يلزم contactName)',
  eventLedger: 'الدفتر الجماعي لمناسبة بعينها (يلزم eventTitle)',
  addTransaction: 'نموذج إضافة حركة',
  addContact: 'نموذج إضافة جهة اتصال',
  addEvent: 'نموذج إضافة مناسبة',
  archive: 'الأرشيف: المحذوفات القابلة للاستعادة',
  smartInput: 'الإدخال الذكي (نصّ أو صوت)',
  scanReceipt: 'قارئ الإيصالات',
  profile: 'الملف الشخصي',
  joinEvent: 'الانضمام إلى مناسبة بكود دعوة',
  eventMembers: 'أعضاء مناسبة مشتركة ودعوتهم (يلزم eventTitle)',
} as const;

export type ScreenTarget = keyof typeof SCREEN_TARGETS;

export function isScreenTarget(value: unknown): value is ScreenTarget {
  return typeof value === 'string' && value in SCREEN_TARGETS;
}

/**
 * النوافذ القابلة للفتح والإغلاق.
 *
 * واحدة اليوم: التطبيق يقدّم نماذجه شاشاتٍ في المكدّس لا نوافذ، و`Sheet`
 * موجود بلا مستعمل. أُبقيت الأداة لأن «أغلق المساعد» طلبٌ حقيقي، والسجل
 * هنا هو موضع إضافة أي نافذة لاحقة بسطر واحد.
 */
export const MODAL_TARGETS = {
  assistant: 'نافذة المساعد نفسها',
} as const;

export type ModalTarget = keyof typeof MODAL_TARGETS;

/** فعل جاهز للتنفيذ، بعد التحقّق. */
export type AssistantAction =
  | {
      tool: 'navigateTo';
      screen: ScreenTarget;
      contactName: string | null;
      eventTitle: string | null;
    }
  | {
      tool: 'createTransaction';
      /** موجب دائماً؛ الاتجاه وحده يحمل الإشارة. */
      amount: number;
      /** IN = استلمت، OUT = دفعت. */
      direction: 'IN' | 'OUT';
      contactName: string;
      note: string | null;
    }
  | {
      /**
       * الأرشفة، وهي ما يُنفَّذ عند طلب الحذف.
       *
       * الحذف في دفتر مالي فعلٌ لا رجعة فيه، وأكثر ما يُحذف يُحذف
       * بالخطأ. فالأمر يُترجم إلى نقلٍ إلى الأرشيف، والحذف النهائي يبقى
       * فعلاً يدوياً من شاشة الأرشيف — لا شيء يُتلف بجملة.
       */
      tool: 'archiveItem';
      target: ArchiveTarget;
      contactName: string;
    }
  | { tool: 'toggleModal'; modal: ModalTarget; open: boolean }
  | {
      tool: 'createContact';
      name: string;
      phone: string | null;
      relation: string | null;
    }
  | {
      tool: 'createEvent';
      title: string;
      eventType: EventType;
      /** ISO؛ null = اليوم. */
      date: string | null;
      location: string | null;
    }
  | {
      /** مصروف جماعي يُقسَم بالتساوي على كل مشاركي المناسبة. */
      tool: 'addSharedExpense';
      eventTitle: string;
      description: string;
      amount: number;
      /** من دفع؛ null = المستخدم نفسه. */
      payerName: string | null;
    }
  | { tool: 'addEventGuest'; eventTitle: string; name: string }
  | {
      tool: 'createEventInvite';
      eventTitle: string;
      role: 'editor' | 'viewer';
    }
  | { tool: 'restoreItem'; target: ArchiveTarget; contactName: string }
  | { tool: 'getBalance'; contactName: string | null }
  | { tool: 'getEventSummary'; eventTitle: string };

/** أسئلة تُجاب من الدفتر، بلا كتابة. */
export type QueryAction = Extract<
  AssistantAction,
  { tool: 'getBalance' | 'getEventSummary' }
>;

/** ما الذي يُؤرشف: آخر حركة لهذا الشخص، أم الشخص نفسه؟ */
export type ArchiveTarget = 'transaction' | 'contact';

export interface ToolCallError {
  /** رسالة عربية تُعرض للمستخدم وتُعاد إلى الطراز ليصحّح. */
  message: string;
}

export type ToolParseResult =
  | { ok: true; action: AssistantAction }
  | { ok: false; error: ToolCallError };

function fail(message: string): ToolParseResult {
  return { ok: false, error: { message } };
}

function optionalName(raw: unknown, max: number = LIMITS.name): string | null {
  const value = sanitizeLine(raw);
  if (!value) return null;
  return textLength(value) > max ? value.slice(0, max) : value;
}

/** كلمات الطراز والمستخدم لأنواع المناسبات. */
const EVENT_TYPE_WORDS: Record<EventType, readonly string[]> = {
  wedding: ['wedding', 'زفاف', 'فرح', 'عرس', 'جواز', 'زواج'],
  engagement: ['engagement', 'خطوبة', 'خطوبه', 'خطبة', 'كتب كتاب', 'كتب الكتاب'],
  newborn: ['newborn', 'سبوع', 'مولود', 'عقيقة', 'عقيقه', 'ولادة', 'ولاده'],
  graduation: ['graduation', 'تخرج', 'تخرّج'],
  funeral: ['funeral', 'عزاء', 'وفاة', 'وفاه'],
  other: ['other'],
};

/** نوع غير معروف يصير other: الاسم الصحيح أهمّ من تصنيف دقيق. */
export function normalizeEventType(raw: unknown): EventType {
  const text = sanitizeLine(raw).toLowerCase();
  if (!text) return 'other';
  for (const [type, words] of Object.entries(EVENT_TYPE_WORDS) as [
    EventType,
    readonly string[],
  ][]) {
    if (words.some((word) => text === word || text.includes(word))) return type;
  }
  return 'other';
}

/**
 * يحوّل نداء أداة خاماً إلى فعل متحقَّق منه.
 *
 * يُعيد خطأً ولا يرمي: الخطأ هنا متوقَّع لا استثنائي — الطراز يُخطئ في
 * الوسائط أحياناً، والرسالة تُعاد إليه في الدورة التالية ليصحّح نفسه.
 */
export function parseToolCall(
  name: string,
  args: Record<string, unknown>,
): ToolParseResult {
  switch (name) {
    case 'navigateTo': {
      const screen = args.screen;
      if (!isScreenTarget(screen)) {
        return fail(
          `وجهة غير معروفة. الوجهات المتاحة: ${Object.keys(SCREEN_TARGETS).join('، ')}.`,
        );
      }

      const contactName = optionalName(args.contactName);
      const eventTitle = optionalName(args.eventTitle, LIMITS.title);

      if (screen === 'contactProfile' && !contactName) {
        return fail('حدّد اسم جهة الاتصال للانتقال إلى دفترها.');
      }
      if (screen === 'eventLedger' && !eventTitle) {
        return fail('حدّد اسم المناسبة للانتقال إلى دفترها.');
      }

      return { ok: true, action: { tool: 'navigateTo', screen, contactName, eventTitle } };
    }

    case 'createTransaction': {
      // نقبل الصيغتين: `direction` بلغة الدفتر و`type` بلغة الدخل/المصروف.
      // النموذج يميل إلى الثانية، والأولى أدقّ دلالةً هنا.
      const rawDirection =
        typeof args.direction === 'string'
          ? args.direction
          : typeof args.type === 'string'
            ? args.type
            : '';

      const normalized = rawDirection.trim().toLowerCase();
      const direction =
        normalized === 'in' || normalized === 'income' || normalized === 'received'
          ? 'IN'
          : normalized === 'out' ||
              normalized === 'expense' ||
              normalized === 'paid'
            ? 'OUT'
            : null;

      if (!direction) {
        return fail('حدّد نوع الحركة: income إن استلمت، أو expense إن دفعت.');
      }

      const amount = checkAmount(args.amount);
      if (!amount.ok) return fail(amount.issues[0].message);

      const contactName = optionalName(args.contactName);
      if (!contactName) {
        return fail('لكل حركة جهة اتصال. اذكر اسم الشخص.');
      }

      const note = optionalName(args.note, LIMITS.note);

      return {
        ok: true,
        action: {
          tool: 'createTransaction',
          amount: amount.value,
          direction,
          contactName,
          note,
        },
      };
    }

    case 'archiveItem': {
      const rawTarget =
        typeof args.target === 'string'
          ? args.target
          : typeof args.type === 'string'
            ? args.type
            : '';
      const normalized = rawTarget.trim().toLowerCase();
      const target: ArchiveTarget | null =
        normalized === 'transaction'
          ? 'transaction'
          : normalized === 'contact'
            ? 'contact'
            : null;

      if (!target) {
        return fail('حدّد ما يُؤرشف: transaction للحركة أو contact للحساب.');
      }

      const contactName = optionalName(args.contactName);
      if (!contactName) {
        return fail('اذكر اسم صاحب الحركة أو الحساب المطلوب أرشفته.');
      }

      return { ok: true, action: { tool: 'archiveItem', target, contactName } };
    }

    case 'toggleModal': {
      const modal = args.modalName ?? args.modal;
      if (typeof modal !== 'string' || !(modal in MODAL_TARGETS)) {
        return fail(
          `نافذة غير معروفة. المتاح: ${Object.keys(MODAL_TARGETS).join('، ')}.`,
        );
      }
      const state = args.state ?? args.open;
      if (typeof state !== 'boolean') {
        return fail('حدّد state بقيمة true للفتح أو false للإغلاق.');
      }
      return {
        ok: true,
        action: { tool: 'toggleModal', modal: modal as ModalTarget, open: state },
      };
    }

    case 'createContact': {
      const contactName = optionalName(args.name ?? args.contactName);
      if (!contactName) return fail('اذكر اسم جهة الاتصال.');
      return {
        ok: true,
        action: {
          tool: 'createContact',
          name: contactName,
          phone: optionalName(args.phone, LIMITS.phone),
          relation: optionalName(args.relation, LIMITS.relation),
        },
      };
    }

    case 'createEvent': {
      const title = optionalName(args.title, LIMITS.title);
      if (!title || textLength(title) < 2) return fail('اذكر اسم المناسبة.');

      let date: string | null = null;
      const rawDate = sanitizeLine(args.date);
      if (rawDate) {
        const time = Date.parse(rawDate);
        if (!Number.isFinite(time)) {
          return fail('التاريخ غير مفهوم. استعمل صيغة 2026-12-31.');
        }
        date = new Date(time).toISOString();
      }

      return {
        ok: true,
        action: {
          tool: 'createEvent',
          title,
          eventType: normalizeEventType(args.eventType ?? args.type),
          date,
          location: optionalName(args.location, LIMITS.location),
        },
      };
    }

    case 'addSharedExpense': {
      const eventTitle = optionalName(args.eventTitle, LIMITS.title);
      if (!eventTitle) return fail('اذكر اسم المناسبة التي يُسجَّل فيها المصروف.');

      const description = optionalName(args.description, LIMITS.description);
      if (!description || textLength(description) < 2) {
        return fail('اذكر وصف المصروف (مثلاً: قاعة، عشاء).');
      }

      const amount = checkAmount(args.amount);
      if (!amount.ok) return fail(amount.issues[0].message);

      return {
        ok: true,
        action: {
          tool: 'addSharedExpense',
          eventTitle,
          description,
          amount: amount.value,
          payerName: optionalName(args.payerName),
        },
      };
    }

    case 'addEventGuest': {
      const eventTitle = optionalName(args.eventTitle, LIMITS.title);
      if (!eventTitle) return fail('اذكر اسم المناسبة.');
      const guest = optionalName(args.name ?? args.guestName);
      if (!guest || textLength(guest) < 2) return fail('اذكر اسم العضو.');
      return {
        ok: true,
        action: { tool: 'addEventGuest', eventTitle, name: guest },
      };
    }

    case 'createEventInvite': {
      const eventTitle = optionalName(args.eventTitle, LIMITS.title);
      if (!eventTitle) return fail('اذكر اسم المناسبة المراد دعوة أعضاء إليها.');
      const role = String(args.role ?? 'editor').trim().toLowerCase();
      if (role !== 'editor' && role !== 'viewer') {
        return fail('الدور editor للمحرّر أو viewer للمشاهد.');
      }
      return {
        ok: true,
        action: { tool: 'createEventInvite', eventTitle, role },
      };
    }

    case 'restoreItem': {
      const rawTarget = String(args.target ?? '').trim().toLowerCase();
      const target: ArchiveTarget | null =
        rawTarget === 'transaction'
          ? 'transaction'
          : rawTarget === 'contact'
            ? 'contact'
            : null;
      if (!target) return fail('حدّد ما يُستعاد: transaction أو contact.');
      const contactName = optionalName(args.contactName);
      if (!contactName) return fail('اذكر اسم صاحب الحركة أو الحساب.');
      return { ok: true, action: { tool: 'restoreItem', target, contactName } };
    }

    case 'getBalance':
      return {
        ok: true,
        action: { tool: 'getBalance', contactName: optionalName(args.contactName) },
      };

    case 'getEventSummary': {
      const eventTitle = optionalName(args.eventTitle, LIMITS.title);
      if (!eventTitle) return fail('اذكر اسم المناسبة.');
      return { ok: true, action: { tool: 'getEventSummary', eventTitle } };
    }

    default:
      return fail(`أداة غير معروفة: ${sanitizeLine(name) || '(بلا اسم)'}.`);
  }
}

/**
 * هل يحتاج هذا الفعل موافقة صريحة قبل التنفيذ؟
 *
 * القاعدة: كل ما يكتب أو يحذف يحتاجها؛ التنقّل وفتح النوافذ لا. المعيار
 * ليس «خطورة» الفعل بل قابليّته للتراجع — التنقّل يُلغى بزرّ الرجوع،
 * والحركة المكتوبة تبقى في الدفتر.
 */
export function requiresConfirmation(action: AssistantAction): boolean {
  switch (action.tool) {
    case 'createTransaction':
    case 'archiveItem':
    case 'createContact':
    case 'createEvent':
    case 'addSharedExpense':
    case 'addEventGuest':
    case 'createEventInvite':
    case 'restoreItem':
      return true;
    default:
      return false;
  }
}

/**
 * أسئلة تُجاب من الدفتر بلا كتابة ولا تنقّل.
 *
 * تُنفَّذ على الجهاز وتُعرض نتيجتها مباشرةً: لا حاجة لجولة ثانية إلى الطراز،
 * وبياناتُ الدفتر لا تغادر الجهاز لتُصاغ جملةً.
 */
export function isQueryAction(action: AssistantAction): action is QueryAction {
  return action.tool === 'getBalance' || action.tool === 'getEventSummary';
}

/** وصف الفعل بالعربية، لبطاقة التأكيد وسجل المحادثة. */
export function describeAction(action: AssistantAction): string {
  switch (action.tool) {
    case 'navigateTo': {
      const target = action.contactName ?? action.eventTitle;
      const label = SCREEN_TARGETS[action.screen].split(':')[0];
      return target ? `فتح ${label}: ${target}` : `الانتقال إلى ${label}`;
    }
    case 'createTransaction': {
      const verb = action.direction === 'IN' ? 'استلمت' : 'دفعت';
      return `تسجيل حركة: ${verb} ${action.amount} لـ${action.contactName}`;
    }
    case 'archiveItem':
      // النصّ يقول «إلى الأرشيف» لا «حذف»: المستخدم طلب حذفاً، وعليه أن
      // يعرف قبل الموافقة أن ما سيحدث قابل للتراجع وأين يجده.
      return action.target === 'contact'
        ? `نقل حساب ${action.contactName} وحركاته إلى الأرشيف`
        : `نقل آخر حركة لـ${action.contactName} إلى الأرشيف`;

    case 'toggleModal':
      return action.open ? 'فتح المساعد' : 'إغلاق المساعد';

    case 'createContact':
      return `إضافة جهة اتصال: ${action.name}${action.phone ? ` (${action.phone})` : ''}`;
    case 'createEvent':
      return `إنشاء مناسبة: ${action.title}`;
    case 'addSharedExpense':
      return `مصروف جماعي في ${action.eventTitle}: ${action.description} ${action.amount}، يُقسَم بالتساوي${action.payerName ? ` ودفعه ${action.payerName}` : ''}`;
    case 'addEventGuest':
      return `إضافة ${action.name} إلى مشاركي ${action.eventTitle}`;
    case 'createEventInvite':
      return `إنشاء دعوة ${action.role === 'viewer' ? 'مشاهد' : 'محرّر'} لمناسبة ${action.eventTitle}`;
    case 'restoreItem':
      return action.target === 'contact'
        ? `استعادة حساب ${action.contactName} من الأرشيف`
        : `استعادة آخر حركة مؤرشفة لـ${action.contactName}`;
    case 'getBalance':
      return action.contactName
        ? `رصيد ${action.contactName}`
        : 'الرصيد الإجمالي';
    case 'getEventSummary':
      return `ملخّص مناسبة ${action.eventTitle}`;
  }
}
