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
  'id' | 'created_at' | 'user_id'
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
  contact_id: string | null;
  created_at: string;
}

/** مصروف جماعي دفعه شخص واحد ويُقسم على المشاركين. */
export interface SharedExpense {
  id: string;
  user_id: string | null;
  event_id: string;
  /** من دفع؛ null = المستخدم نفسه. */
  payer_contact_id: string | null;
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
  /** null = المستخدم نفسه. */
  contact_id: string | null;
  share_amount: number;
}

/** مصروف مع حصصه، كما يُعرض في دفتر المناسبة. */
export interface SharedExpenseWithShares extends SharedExpense {
  shares: ExpenseShare[];
}

/** رصيد مشارك داخل مناسبة واحدة. */
export interface ParticipantBalance {
  /** null = المستخدم نفسه. */
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
  fromContactId: string | null;
  fromName: string;
  toContactId: string | null;
  toName: string;
  amount: number;
}

/** طريقة توزيع المصروف على المشاركين. */
export type SplitMode = 'equal' | 'custom';

/** بيانات إنشاء مصروف جماعي. */
export interface NewSharedExpenseInput {
  event_id: string;
  payer_contact_id: string | null;
  description: string;
  amount: number;
  currency?: string;
  occurred_at?: string;
  /** الحصص النهائية؛ مجموعها يجب أن يساوي amount. */
  shares: { contact_id: string | null; share_amount: number }[];
}

/** حمولات الإدراج (user_id مستبعد كما في بقية الجداول). */
export type SharedExpenseInsert = Omit<
  SharedExpense,
  'id' | 'created_at' | 'user_id'
>;
