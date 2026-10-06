/**
 * تقسيم الفاتورة على أفراد.
 *
 * ---------------------------------------------------------------------
 * **كيف يصل التقسيم إلى الدفتر**: حركةٌ لكل مشارك، لا كيانٌ جديد.
 *
 * دفتر هذا التطبيق مبنيّ على «حركة لها جهة اتصال واتجاه»، والأرصدة
 * تُحسب بجمع حركات كل شخص. فالفاتورة المقسومة تصير حركةً بحصّة كل
 * مشارك في اتجاه الفاتورة نفسه — فتظهر في دفتره وفي رصيده فوراً بلا
 * طبقةِ «ديون» موازية تحتاج مزامنةً مع الأرصدة وتتباعد عنها.
 *
 * **وحصّتك أنت لا تُسجَّل**: أنت طرفٌ في القسمة ليصحّ الحساب — فاتورة
 * ٣٠٠ بين ثلاثة حصّتها ١٠٠ لا ١٥٠ — لكنك لا تَدين لنفسك. فتُحسب حصّتك
 * ولا تُنشأ لها حركة.
 * ---------------------------------------------------------------------
 */

import { splitEqually } from '@/utils/split';

/** طرق التقسيم الثلاث. */
export type BillSplitMode = 'equal' | 'percent' | 'custom';

export const SPLIT_MODES: ReadonlyArray<{ value: BillSplitMode; label: string }> =
  [
    { value: 'equal', label: 'بالتساوي' },
    { value: 'percent', label: 'نسبة مئوية' },
    { value: 'custom', label: 'مبلغ محدد' },
  ];

/** مشارك في القسمة: جهة اتصال قائمة، أو اسم جديد، أو المستخدم نفسه. */
export interface SplitParticipant {
  /** مفتاح داخلي فريد داخل القسمة. */
  key: string;
  /** معرّف جهة الاتصال، أو `null` لاسم جديد أو للمستخدم نفسه. */
  contactId: string | null;
  name: string;
  /** المستخدم نفسه: يدخل الحساب ولا تُنشأ له حركة. */
  isSelf: boolean;
}

/** ما يُدخله المستخدم لكل مشارك، حسب الطريقة. */
export type SplitInputs = Record<string, string>;

export interface SplitShare {
  participant: SplitParticipant;
  /** الحصّة بالعملة، مقرَّبة إلى قرشين. */
  amount: number;
  /** النسبة المئوية المقابلة، للعرض. */
  percent: number;
}

export interface SplitResult {
  shares: SplitShare[];
  /** مجموع الحصص؛ يجب أن يساوي الفاتورة. */
  total: number;
  /** الفارق عن مبلغ الفاتورة (موجب = زائد). */
  difference: number;
  valid: boolean;
  /** سبب عدم الصلاحية، بالعربية. */
  error: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** يقرأ رقماً من حقل نصّي، بلا تساهل `Number` مع الصيغ الغريبة. */
function readNumber(raw: string | undefined): number {
  const text = (raw ?? '').replace(',', '.').trim();
  if (!/^\d*\.?\d*$/.test(text) || text === '' || text === '.') return NaN;
  return Number(text);
}

/** يحمّل فارق التقريب على أكبر حصّة، فيساوي المجموع الفاتورة تماماً. */
function absorbRemainder(shares: SplitShare[], amount: number): void {
  const total = round2(shares.reduce((sum, share) => sum + share.amount, 0));
  const gap = round2(amount - total);
  if (gap === 0 || shares.length === 0) return;

  let largest = 0;
  for (let index = 1; index < shares.length; index += 1) {
    if (shares[index].amount > shares[largest].amount) largest = index;
  }
  shares[largest] = {
    ...shares[largest],
    amount: round2(shares[largest].amount + gap),
  };
}

/**
 * يحسب حصص المشاركين.
 *
 * ثلاث طرق ونتيجة واحدة: قائمة حصص بالعملة. النسب والمبالغ المخصّصة
 * تُترجَم إلى عملة هنا، فلا تعرف بقيّة الشيفرة إلا لغةً واحدة.
 */
export function computeSplit(
  amount: number,
  participants: readonly SplitParticipant[],
  mode: BillSplitMode,
  inputs: SplitInputs,
): SplitResult {
  const empty: SplitResult = {
    shares: [],
    total: 0,
    difference: -amount,
    valid: false,
    error: null,
  };

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ...empty, error: 'أدخل مبلغ الفاتورة أولاً.' };
  }
  if (participants.length === 0) {
    return { ...empty, error: 'اختر من تقسم معهم الفاتورة.' };
  }

  if (mode === 'equal') {
    // بالقروش ثم توزيع الباقي: لا يضيع قرش ولا يزيد.
    const amounts = splitEqually(amount, participants.length);
    const shares = participants.map((participant, index) => ({
      participant,
      amount: amounts[index],
      percent: round2((amounts[index] / amount) * 100),
    }));
    return {
      shares,
      total: round2(shares.reduce((sum, share) => sum + share.amount, 0)),
      difference: 0,
      valid: true,
      error: null,
    };
  }

  if (mode === 'percent') {
    const percents = participants.map((participant) =>
      readNumber(inputs[participant.key]),
    );
    if (percents.some((value) => !Number.isFinite(value) || value < 0)) {
      return { ...empty, error: 'أدخل نسبة صحيحة لكل مشارك.' };
    }

    const totalPercent = round2(percents.reduce((sum, value) => sum + value, 0));
    const shares = participants.map((participant, index) => ({
      participant,
      amount: round2((amount * percents[index]) / 100),
      percent: percents[index],
    }));

    const valid = Math.abs(totalPercent - 100) < 0.01;
    // نسبٌ مجموعها ١٠٠٪ قد تترك قرشاً بعد التقريب. النسبة وسيلةُ إدخال
    // والفاتورة هي الحقيقة، فيُحمَّل الفارق على أكبر حصّة — أقلّ الحصص
    // تأثّراً به — بدل أن تُرفض قسمةٌ صحيحة أو تُحفظ ناقصة.
    if (valid) absorbRemainder(shares, amount);

    const total = round2(shares.reduce((sum, share) => sum + share.amount, 0));
    return {
      shares,
      total,
      difference: round2(total - amount),
      valid,
      error: valid
        ? null
        : `مجموع النسب ${totalPercent}% — يجب أن يكون 100%.`,
    };
  }

  const amounts = participants.map((participant) =>
    readNumber(inputs[participant.key]),
  );
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)) {
    return { ...empty, error: 'أدخل مبلغاً صحيحاً لكل مشارك.' };
  }

  const shares = participants.map((participant, index) => ({
    participant,
    amount: round2(amounts[index]),
    percent: round2((amounts[index] / amount) * 100),
  }));
  const total = round2(shares.reduce((sum, share) => sum + share.amount, 0));
  const difference = round2(total - amount);
  const valid = Math.abs(difference) < 0.01;

  return {
    shares,
    total,
    difference,
    valid,
    error: valid
      ? null
      : difference > 0
        ? `المجموع يزيد ${round2(difference)} عن الفاتورة.`
        : `ينقص ${round2(-difference)} لإكمال الفاتورة.`,
  };
}

/** الحصص التي تُنشأ لها حركات: الجميع إلا المستخدم نفسه، وإلا الأصفار. */
export function billableShares(result: SplitResult): SplitShare[] {
  return result.shares.filter(
    (share) => !share.participant.isSelf && share.amount > 0,
  );
}

/** حصّة المستخدم نفسه، إن كان طرفاً. */
export function ownShare(result: SplitResult): number {
  return result.shares
    .filter((share) => share.participant.isSelf)
    .reduce((sum, share) => sum + share.amount, 0);
}

/** توزيع متساوٍ مبدئي يملأ حقول النسب أو المبالغ عند تبديل الطريقة. */
export function seedInputs(
  amount: number,
  participants: readonly SplitParticipant[],
  mode: BillSplitMode,
): SplitInputs {
  const inputs: SplitInputs = {};
  if (participants.length === 0) return inputs;

  if (mode === 'percent') {
    // ١٠٠ ÷ ٣ = 33.33 ثلاث مرات تعطي 99.99٪، فتُستقبَل القسمة بخطأ قبل
    // أن يلمس المستخدم شيئاً. نوزّع المئة بالقروش كما نوزّع المبلغ.
    const percents = splitEqually(100, participants.length);
    participants.forEach((participant, index) => {
      inputs[participant.key] = String(percents[index]);
    });
    return inputs;
  }

  if (mode === 'custom' && Number.isFinite(amount) && amount > 0) {
    const amounts = splitEqually(amount, participants.length);
    participants.forEach((participant, index) => {
      inputs[participant.key] = String(amounts[index]);
    });
  }
  return inputs;
}
