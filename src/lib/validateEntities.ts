/**
 * تحقّق حمولات الكتابة، عند حدّ المستودع.
 *
 * موضعه هنا لا في الشاشات: الشاشة واحدة من عدّة أبواب إلى نفس الجدول
 * (إدخال يدوي، إدخال ذكي، مسح إيصال، استيراد)، والتحقّق الموزّع على
 * الأبواب يُنسى في أحدها. المستودع هو المعبر الوحيد إلى قاعدة البيانات،
 * فالتحقّق فيه يغطّي الأبواب كلها ولا يمكن الالتفاف عليه.
 *
 * التحقّق هنا **لا يُغني عن RLS**: هو يحمي سلامة البيانات وتجربة
 * المستخدم، أمّا الملكيّة فتفرضها سياسات قاعدة البيانات وحدها، لأن
 * العميل كلّه تحت يد من يملك الجهاز.
 */

import {
  LIMITS,
  checkAmount,
  checkBirthDate,
  checkCurrency,
  checkImageUrl,
  checkIsoDate,
  checkRowId,
  checkText,
  collect,
  unwrap,
  type ValidationIssue,
  ValidationError,
} from '@/lib/validation';
import type {
  EventType,
  UserProfileInput,
  NewContactInput,
  NewEventInput,
  NewEventMember,
  NewSharedExpenseInput,
  NewTransactionInput,
  TransactionDirection,
} from '@/types';

const EVENT_TYPES: ReadonlySet<string> = new Set([
  'wedding',
  'engagement',
  'newborn',
  'graduation',
  'funeral',
  'other',
]);

const DIRECTIONS: ReadonlySet<string> = new Set(['IN', 'OUT']);

/** يرمي مباشرة: القيم المحصورة تأتي من الواجهة لا من المستخدم. */
function requireEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  field: string,
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError([
      { field, code: 'invalid', message: `${label} غير صالح.` },
    ]);
  }
  return value as T;
}

/** رقم هاتف: أرقام وفواصل شائعة فقط، بعد تعقيم السطر. */
function checkPhone(raw: unknown) {
  const base = checkText('phone', raw, { label: 'رقم الهاتف', max: LIMITS.phone });
  if (!base.ok || base.value === null) return base;
  if (!/^[+\d][\d\s()+-]*$/.test(base.value)) {
    return {
      ok: false as const,
      issues: [
        {
          field: 'phone',
          code: 'invalid',
          message: 'رقم الهاتف يقبل الأرقام وعلامات + ( ) - فقط.',
        },
      ],
    };
  }
  return base;
}

export function validateContactInput(input: NewContactInput): NewContactInput {
  const result = collect({
    full_name: checkText('full_name', input.full_name, {
      label: 'الاسم',
      max: LIMITS.name,
      min: 2,
      required: true,
    }),
    phone: checkPhone(input.phone),
    relation: checkText('relation', input.relation, {
      label: 'صلة القرابة',
      max: LIMITS.relation,
    }),
    notes: checkText('notes', input.notes, {
      label: 'الملاحظات',
      max: LIMITS.note,
      multiline: true,
    }),
  });

  const value = unwrap(result);
  return {
    full_name: value.full_name as string,
    phone: value.phone,
    relation: value.relation,
    notes: value.notes,
  };
}

export function validateEventInput(input: NewEventInput): NewEventInput {
  const eventType = requireEnum<EventType>(
    input.event_type,
    EVENT_TYPES,
    'event_type',
    'نوع المناسبة',
  );

  const issues: ValidationIssue[] = [];
  let hostContactId: string | null = null;
  if (input.host_contact_id) {
    const host = checkRowId('host_contact_id', input.host_contact_id, 'مضيف المناسبة');
    if (host.ok) hostContactId = host.value;
    else issues.push(...host.issues);
  }

  const result = collect({
    title: checkText('title', input.title, {
      label: 'عنوان المناسبة',
      max: LIMITS.title,
      min: 2,
      required: true,
    }),
    event_date: checkIsoDate('event_date', input.event_date, 'تاريخ المناسبة'),
    location: checkText('location', input.location, {
      label: 'المكان',
      max: LIMITS.location,
    }),
    notes: checkText('notes', input.notes, {
      label: 'الملاحظات',
      max: LIMITS.note,
      multiline: true,
    }),
  });

  if (!result.ok) issues.push(...result.issues);
  if (issues.length) throw new ValidationError(issues);

  const value = unwrap(result);
  return {
    title: value.title as string,
    event_type: eventType,
    host_contact_id: hostContactId,
    event_date: value.event_date,
    location: value.location,
    notes: value.notes,
  };
}

export function validateTransactionInput(
  input: NewTransactionInput,
): NewTransactionInput {
  const direction = requireEnum<TransactionDirection>(
    input.direction,
    DIRECTIONS,
    'direction',
    'اتجاه الحركة',
  );

  const issues: ValidationIssue[] = [];
  let eventId: string | null = null;
  if (input.event_id) {
    const event = checkRowId('event_id', input.event_id, 'المناسبة');
    if (event.ok) eventId = event.value;
    else issues.push(...event.issues);
  }

  const result = collect({
    contact_id: checkRowId('contact_id', input.contact_id, 'جهة الاتصال'),
    amount: checkAmount(input.amount),
    currency: checkCurrency(input.currency ?? 'EGP'),
    occurred_at: checkIsoDate(
      'occurred_at',
      input.occurred_at ?? new Date().toISOString(),
      'تاريخ الحركة',
    ),
    note: checkText('note', input.note, {
      label: 'الملاحظة',
      max: LIMITS.note,
      multiline: true,
    }),
  });

  if (!result.ok) issues.push(...result.issues);
  if (issues.length) throw new ValidationError(issues);

  const value = unwrap(result);
  return {
    contact_id: value.contact_id,
    event_id: eventId,
    direction,
    amount: value.amount,
    currency: value.currency,
    occurred_at: value.occurred_at,
    note: value.note,
    // مسار داخل الدلو لا عنوان: يُولَّد في uploadReceipt من معرّف المستخدم.
    receipt_url: input.receipt_url ?? null,
  };
}

export function validateSharedExpenseInput(
  input: NewSharedExpenseInput,
): NewSharedExpenseInput {
  const result = collect({
    event_id: checkRowId('event_id', input.event_id, 'المناسبة'),
    payer_participant_id: checkRowId(
      'payer_participant_id',
      input.payer_participant_id,
      'الدافع',
    ),
    description: checkText('description', input.description, {
      label: 'وصف المصروف',
      max: LIMITS.description,
      min: 2,
      required: true,
    }),
    amount: checkAmount(input.amount),
    currency: checkCurrency(input.currency ?? 'EGP'),
    occurred_at: checkIsoDate(
      'occurred_at',
      input.occurred_at ?? new Date().toISOString(),
      'تاريخ المصروف',
    ),
  });

  const value = unwrap(result);

  const issues: ValidationIssue[] = [];
  const shares = (Array.isArray(input.shares) ? input.shares : []).map(
    (share, index) => {
      const id = checkRowId(`shares[${index}]`, share?.participant_id, 'المشارك');
      if (!id.ok) issues.push(...id.issues);

      // الحصّة قد تكون صفراً (مشارك مُستثنى من هذا المصروف تحديداً)،
      // فلا تمرّ على checkAmount التي تشترط أكبر من صفر.
      const raw = Number(share?.share_amount);
      if (!Number.isFinite(raw) || raw < 0 || raw > LIMITS.amountMax) {
        issues.push({
          field: `shares[${index}]`,
          code: 'invalid',
          message: 'إحدى الحصص ليست مبلغاً صالحاً.',
        });
      }

      return {
        participant_id: id.ok ? id.value : '',
        share_amount: Math.round((Number.isFinite(raw) ? raw : 0) * 100) / 100,
      };
    },
  );

  if (shares.length === 0) {
    issues.push({
      field: 'shares',
      code: 'required',
      message: 'حدّد مشاركاً واحداً على الأقل.',
    });
  }

  // فرقٌ بقرش واحد مقبول: القسمة بالتساوي على ثلاثة لا تنتهي بالضبط.
  const total = shares.reduce((sum, share) => sum + share.share_amount, 0);
  if (shares.length > 0 && Math.abs(total - value.amount) > 0.01 * shares.length) {
    issues.push({
      field: 'shares',
      code: 'mismatch',
      message: 'مجموع الحصص لا يساوي المبلغ الإجمالي.',
    });
  }

  if (issues.length) throw new ValidationError(issues);

  return {
    event_id: value.event_id,
    payer_participant_id: value.payer_participant_id,
    description: value.description as string,
    amount: value.amount,
    currency: value.currency,
    occurred_at: value.occurred_at,
    receipt_url: input.receipt_url ?? null,
    shares,
  };
}

export function validateEventMembers(
  members: readonly NewEventMember[],
): NewEventMember[] {
  const issues: ValidationIssue[] = [];

  const clean = members.map((member, index): NewEventMember => {
    if (member.kind === 'self') return { kind: 'self' };

    if (member.kind === 'contact') {
      const id = checkRowId(`members[${index}]`, member.contactId, 'جهة الاتصال');
      if (!id.ok) issues.push(...id.issues);
      return { kind: 'contact', contactId: id.ok ? id.value : '' };
    }

    const name = checkText(`members[${index}]`, member.displayName, {
      label: 'اسم الضيف',
      max: LIMITS.name,
      min: 2,
      required: true,
    });
    if (!name.ok) issues.push(...name.issues);
    return {
      kind: 'guest',
      displayName: name.ok ? (name.value as string) : '',
    };
  });

  if (issues.length) throw new ValidationError(issues);
  return clean;
}

/**
 * تعديل جزئي لحركة.
 *
 * الحقول كلها اختيارية، ويُتحقَّق من الموجود منها فقط — لا من الغائب.
 * الفرق عن `validateTransactionInput` جوهري: هناك الحقل الناقص خطأ،
 * وهنا الحقل الناقص يعني «لا تمسّه».
 */
export type TransactionPatch = Partial<
  Pick<
    NewTransactionInput,
    'amount' | 'direction' | 'note' | 'occurred_at' | 'event_id'
  >
>;

export function validateTransactionPatch(patch: TransactionPatch): TransactionPatch {
  const issues: ValidationIssue[] = [];
  const clean: TransactionPatch = {};

  if (patch.direction !== undefined) {
    clean.direction = requireEnum<TransactionDirection>(
      patch.direction,
      DIRECTIONS,
      'direction',
      'اتجاه الحركة',
    );
  }

  if (patch.amount !== undefined) {
    const amount = checkAmount(patch.amount);
    if (amount.ok) clean.amount = amount.value;
    else issues.push(...amount.issues);
  }

  if (patch.occurred_at !== undefined) {
    const date = checkIsoDate('occurred_at', patch.occurred_at, 'تاريخ الحركة');
    if (date.ok) clean.occurred_at = date.value;
    else issues.push(...date.issues);
  }

  if (patch.note !== undefined) {
    const note = checkText('note', patch.note, {
      label: 'الملاحظة',
      max: LIMITS.note,
      multiline: true,
    });
    if (note.ok) clean.note = note.value;
    else issues.push(...note.issues);
  }

  if (patch.event_id !== undefined) {
    if (patch.event_id === null) {
      clean.event_id = null;
    } else {
      const event = checkRowId('event_id', patch.event_id, 'المناسبة');
      if (event.ok) clean.event_id = event.value;
      else issues.push(...event.issues);
    }
  }

  if (issues.length) throw new ValidationError(issues);
  if (Object.keys(clean).length === 0) {
    throw new ValidationError([
      { field: 'patch', code: 'empty', message: 'لا يوجد ما يُعدَّل.' },
    ]);
  }
  return clean;
}

/** تعديل جزئي لجهة اتصال، بالقاعدة نفسها. */
export type ContactPatch = Partial<NewContactInput>;

export function validateContactPatch(patch: ContactPatch): ContactPatch {
  const issues: ValidationIssue[] = [];
  const clean: ContactPatch = {};

  if (patch.full_name !== undefined) {
    const name = checkText('full_name', patch.full_name, {
      label: 'الاسم',
      max: LIMITS.name,
      min: 2,
      required: true,
    });
    if (name.ok) clean.full_name = name.value as string;
    else issues.push(...name.issues);
  }

  if (patch.phone !== undefined) {
    const phone = checkPhone(patch.phone);
    if (phone.ok) clean.phone = phone.value;
    else issues.push(...phone.issues);
  }

  if (patch.relation !== undefined) {
    const relation = checkText('relation', patch.relation, {
      label: 'صلة القرابة',
      max: LIMITS.relation,
    });
    if (relation.ok) clean.relation = relation.value;
    else issues.push(...relation.issues);
  }

  if (patch.notes !== undefined) {
    const notes = checkText('notes', patch.notes, {
      label: 'الملاحظات',
      max: LIMITS.note,
      multiline: true,
    });
    if (notes.ok) clean.notes = notes.value;
    else issues.push(...notes.issues);
  }

  if (issues.length) throw new ValidationError(issues);
  if (Object.keys(clean).length === 0) {
    throw new ValidationError([
      { field: 'patch', code: 'empty', message: 'لا يوجد ما يُعدَّل.' },
    ]);
  }
  return clean;
}

/**
 * تعديل الملف الشخصي.
 *
 * بالقاعدة نفسها: الحقل الغائب لا يُمَسّ، و`null` مسحٌ مقصود. الفرق
 * الوحيد أنه لا حقل مطلوباً هنا — ملفٌّ بلا اسم ولا صورة حالة صالحة،
 * وهي حالة كل مستخدم قبل أن يفتح الشاشة أوّل مرّة.
 */
export function validateProfilePatch(patch: UserProfileInput): UserProfileInput {
  const issues: ValidationIssue[] = [];
  const clean: UserProfileInput = {};

  if (patch.full_name !== undefined) {
    const name = checkText('full_name', patch.full_name, {
      label: 'الاسم الكامل',
      max: LIMITS.name,
      min: 2,
    });
    if (name.ok) clean.full_name = name.value;
    else issues.push(...name.issues);
  }

  if (patch.date_of_birth !== undefined) {
    const birth = checkBirthDate(
      'date_of_birth',
      patch.date_of_birth,
      'تاريخ الميلاد',
    );
    if (birth.ok) clean.date_of_birth = birth.value;
    else issues.push(...birth.issues);
  }

  if (patch.avatar_url !== undefined) {
    const avatar = checkImageUrl('avatar_url', patch.avatar_url, 'رابط الصورة');
    if (avatar.ok) clean.avatar_url = avatar.value;
    else issues.push(...avatar.issues);
  }

  if (issues.length) throw new ValidationError(issues);
  if (Object.keys(clean).length === 0) {
    throw new ValidationError([
      { field: 'patch', code: 'empty', message: 'لا يوجد ما يُعدَّل.' },
    ]);
  }
  return clean;
}
