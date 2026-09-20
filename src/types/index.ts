/**
 * أنواع البيانات الأساسية لتطبيق النقوط والواجبات.
 *
 * المصطلحات:
 * - IN  : نقوط استلمتها من جهة الاتصال (تصبح واجباً عليّ)  -> مدين
 * - OUT : نقوط دفعتها لجهة الاتصال (تصبح واجباً لها عندي) -> دائن
 */

/** اتجاه الحركة المالية. */
export type TransactionDirection = 'IN' | 'OUT';

/** حالة الرصيد الصافي لجهة اتصال أو للحساب كاملاً. */
export type LedgerStatus = 'credit' | 'debit' | 'settled';

/** نوع المناسبة. */
export type EventType =
  | 'wedding'
  | 'engagement'
  | 'newborn'
  | 'graduation'
  | 'funeral'
  | 'other';

/** جهة اتصال (شخص لدينا معه نقوط وواجبات). */
export interface Contact {
  id: string;
  /** مالك السجل في Supabase (auth.users.id). */
  user_id: string | null;
  full_name: string;
  phone: string | null;
  /** صلة القرابة أو العلاقة: قريب، صديق، جار… */
  relation: string | null;
  notes: string | null;
  /** مؤرشف: يختفي من القائمة النشطة بعد تسوية الحساب. */
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
}

/** مناسبة (فرح، خطوبة، عزاء…). */
export interface Event {
  id: string;
  user_id: string | null;
  title: string;
  event_type: EventType;
  /** صاحب المناسبة إن كان من جهات الاتصال. */
  host_contact_id: string | null;
  /** تاريخ المناسبة بصيغة ISO. */
  event_date: string;
  location: string | null;
  notes: string | null;
  created_at: string;
}

/** حركة مالية واحدة (نقطة داخلة أو خارجة). */
export interface Transaction {
  id: string;
  user_id: string | null;
  contact_id: string;
  event_id: string | null;
  direction: TransactionDirection;
  /** المبلغ دائماً رقم موجب؛ الاتجاه هو ما يحدد الإشارة. */
  amount: number;
  currency: string;
  /** تاريخ الحركة بصيغة ISO. */
  occurred_at: string;
  note: string | null;
  /** رابط صورة الإيصال في Supabase Storage، إن رُفعت. */
  receipt_url: string | null;
  /** مؤرشفة: مخفيّة من القوائم والإجماليات، وقابلة للاستعادة. */
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
}

/** ملخص محاسبي محسوب من مجموعة حركات. */
export interface LedgerSummary {
  /** مجموع ما استلمته (IN). */
  totalIn: number;
  /** مجموع ما دفعته (OUT). */
  totalOut: number;
  /** الصافي = totalOut - totalIn. */
  net: number;
  status: LedgerStatus;
  transactionCount: number;
  currency: string;
}

/** جهة اتصال مرفقة بملخصها المالي، كما تُعرض في القوائم. */
export interface ContactWithSummary extends Contact {
  summary: LedgerSummary;
}

/** قسم في قائمة جهات الاتصال المرتبة أبجدياً. */
export interface ContactSection {
  /** الحرف الأبجدي (A-Z أو ا-ي أو #). */
  letter: string;
  data: ContactWithSummary[];
}

/** بيانات إنشاء جهة اتصال جديدة. */
export interface NewContactInput {
  full_name: string;
  phone?: string | null;
  relation?: string | null;
  notes?: string | null;
}

/** بيانات إنشاء مناسبة جديدة. */
export interface NewEventInput {
  title: string;
  event_type: EventType;
  host_contact_id?: string | null;
  /** تاريخ المناسبة بصيغة ISO. */
  event_date: string;
  location?: string | null;
  notes?: string | null;
}

/** بيانات إنشاء حركة جديدة قبل حفظها. */
export interface NewTransactionInput {
  contact_id: string;
  event_id: string | null;
  direction: TransactionDirection;
  amount: number;
  currency?: string;
  occurred_at?: string;
  note?: string | null;
  receipt_url?: string | null;
}

/**
 * حمولة إدراج حركة في Supabase.
 *
 * user_id مستبعد عمداً: القيمة الافتراضية في قاعدة البيانات هي auth.uid()،
 * وهي أساس سياسات RLS. النوع يمنع إرساله من التطبيق أصلاً.
 */
export type TransactionInsert = Omit<
  Transaction,
  'id' | 'created_at' | 'user_id' | 'is_archived' | 'archived_at'
>;

/** حمولة إدراج جهة اتصال (user_id مستبعد كما في الحركات). */
export type ContactInsert = Omit<
  Contact,
  'id' | 'created_at' | 'user_id' | 'is_archived' | 'archived_at'
>;

/** حمولة إدراج مناسبة (user_id مستبعد كما في الحركات). */
export type EventInsert = Omit<Event, 'id' | 'created_at' | 'user_id'>;

/**
 * مشارك في مناسبة جماعية.
 *
 * contact_id = null يعني المستخدم نفسه: هو طرف في القسمة وليس جهة اتصال.
 */
export interface EventParticipant {
  id: string;
  event_id: string;
  /** جهة اتصال مسجّلة، أو null للمستخدم نفسه أو لاسم حر. */
  contact_id: string | null;
  /** اسم حر لعضو ليس في جهات الاتصال؛ null للمستخدم أو لجهة اتصال. */
  display_name: string | null;
  created_at: string;
}

/** كيف يُضاف العضو: أنا، جهة اتصال، أو اسم حر. */
export type NewEventMember =
  | { kind: 'self' }
  | { kind: 'contact'; contactId: string }
  | { kind: 'guest'; displayName: string };

/** مصروف جماعي دفعه شخص واحد ويُقسم على المشاركين. */
export interface SharedExpense {
  id: string;
  user_id: string | null;
  event_id: string;
  /** من دفع، بمعرّف عضو المناسبة. */
  payer_participant_id: string | null;
  /** يبقى للتوافق مع صفوف قديمة؛ الكتابة تتم عبر payer_participant_id. */
  payer_contact_id: string | null;
  receipt_url: string | null;
  description: string;
  amount: number;
  currency: string;
  occurred_at: string;
  created_at: string;
}

/** حصة مشارك واحد من مصروف جماعي. */
export interface ExpenseShare {
  id: string;
  expense_id: string;
  /** هوية العضو داخل المناسبة (event_participants.id). */
  participant_id: string | null;
  /** يبقى للتوافق مع صفوف قديمة. */
  contact_id: string | null;
  share_amount: number;
}

/** مصروف مع حصصه، كما يُعرض في دفتر المناسبة. */
export interface SharedExpenseWithShares extends SharedExpense {
  shares: ExpenseShare[];
}

/** رصيد مشارك داخل مناسبة واحدة. */
export interface ParticipantBalance {
  /** معرّف عضو المناسبة. */
  participantId: string;
  contactId: string | null;
  name: string;
  /** مجموع ما دفعه هذا المشارك. */
  paid: number;
  /** مجموع ما يخصّه من الحصص. */
  owed: number;
  /** paid - owed: موجب يعني له، سالب يعني عليه. */
  net: number;
}

/** تحويل مقترح لتسوية المناسبة: من يدفع لمن وكم. */
export interface Settlement {
  fromParticipantId: string;
  fromName: string;
  toParticipantId: string;
  toName: string;
  amount: number;
}

/** طريقة توزيع المصروف على المشاركين. */
export type SplitMode = 'equal' | 'custom';

/** بيانات إنشاء مصروف جماعي. */
export interface NewSharedExpenseInput {
  event_id: string;
  /** الدافع بمعرّف عضو المناسبة. */
  payer_participant_id: string;
  description: string;
  amount: number;
  currency?: string;
  occurred_at?: string;
  receipt_url?: string | null;
  /** الحصص النهائية؛ مجموعها يجب أن يساوي amount. */
  shares: { participant_id: string; share_amount: number }[];
}

/** حمولات الإدراج (user_id مستبعد كما في بقية الجداول). */
export type SharedExpenseInsert = Omit<
  SharedExpense,
  'id' | 'created_at' | 'user_id'
>;

/**
 * الملف الشخصي لصاحب الحساب.
 *
 * صفّ واحد لكل مستخدم، ومفتاحه هو معرّفه في auth.users — لا عمود
 * user_id منفصل، فلا يمكن أن يوجد ملفّان لشخص واحد.
 */
export interface UserProfile {
  id: string;
  full_name: string | null;
  /** `YYYY-MM-DD` لا طابع زمني: لتاريخ الميلاد يوم لا لحظة. */
  birth_date: string | null;
  /** رابط عام ثابت داخل دلو avatars. */
  avatar_url: string | null;
  /** نسخة معروضة من الرقم الموثَّق في auth.users. */
  phone: string | null;
  /** عملة افتراضية للحركات الجديدة. */
  currency: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * ما يمكن تغييره في الملف.
 *
 * المفاتيح هنا هي أسماء الأعمدة حرفياً — وهي ما يُبنى منه جسم `upsert`
 * عبر قائمة صريحة في المستودع. أيّ مفتاح زائد يردّ عليه PostgREST
 * بـ PGRST204، وهو العطب الذي ظلّ يُقرأ «قاعدة بياناتك أقدم».
 */
export interface UserProfileInput {
  full_name?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  currency?: string | null;
}
