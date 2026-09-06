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

/** بيانات إنشاء حركة جديدة قبل حفظها. */
export interface NewTransactionInput {
  contact_id: string;
  event_id: string | null;
  direction: TransactionDirection;
  amount: number;
  currency?: string;
  occurred_at?: string;
  note?: string | null;
}
