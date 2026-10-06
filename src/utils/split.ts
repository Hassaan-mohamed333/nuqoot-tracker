import type {
  Contact,
  EventParticipant,
  ParticipantBalance,
  Settlement,
  SharedExpenseWithShares,
} from '@/types';

/** الاسم المعروض للمستخدم نفسه داخل القسمة. */
export const ME_LABEL = 'أنا';

/**
 * الاسم المعروض لعضو المناسبة.
 *
 * ثلاث حالات: المستخدم نفسه، جهة اتصال مسجّلة، أو اسم حر لعضو خارج دفتر
 * جهات الاتصال.
 */
export function participantName(
  participant: EventParticipant,
  contactNames: Map<string, string>,
): string {
  if (participant.contact_id) {
    return contactNames.get(participant.contact_id) ?? 'غير معروف';
  }
  return participant.display_name?.trim() || ME_LABEL;
}

/**
 * يقسم مبلغاً على عدد من المشاركين بالتساوي بقروش صحيحة.
 *
 * القسمة تتم بالقروش (أصغر وحدة) ثم تُوزَّع البواقي على الأوائل، فيساوي
 * مجموع الحصص المبلغ الأصلي تماماً ولا يضيع قرش في التقريب.
 */
export function splitEqually(amount: number, participantCount: number): number[] {
  if (participantCount <= 0) return [];

  const totalCents = Math.round(Math.abs(amount) * 100);
  const base = Math.floor(totalCents / participantCount);
  const remainder = totalCents - base * participantCount;

  return Array.from({ length: participantCount }, (_, index) => {
    const cents = base + (index < remainder ? 1 : 0);
    return cents / 100;
  });
}

/** هل مجموع الحصص يطابق المبلغ (بهامش قرش واحد)؟ */
export function sharesMatchAmount(
  shares: { share_amount: number }[],
  amount: number,
): boolean {
  const total = shares.reduce((sum, share) => sum + share.share_amount, 0);
  return Math.abs(total - amount) < 0.01;
}

/**
 * يحسب رصيد كل مشارك داخل المناسبة: ما دفعه مقابل ما يخصّه.
 * net موجب يعني أن له عند المجموعة، وسالب يعني أن عليه.
 */
export function computeEventBalances(
  participants: EventParticipant[],
  expenses: SharedExpenseWithShares[],
  contacts: Contact[],
): ParticipantBalance[] {
  const contactNames = new Map(
    contacts.map((contact) => [contact.id, contact.full_name]),
  );

  /**
   * المفتاح هو معرّف صف العضو، لا جهة الاتصال: عضوان بلا جهة اتصال
   * (المستخدم نفسه واسم حر، أو اسمان حران) كانا سيتصادمان لو اعتمدنا
   * contact_id وحده فتُدمج أرصدتهما.
   */
  const balances = new Map<string, ParticipantBalance>();

  for (const participant of participants) {
    balances.set(participant.id, {
      participantId: participant.id,
      contactId: participant.contact_id,
      name: participantName(participant, contactNames),
      paid: 0,
      owed: 0,
      net: 0,
    });
  }

  for (const expense of expenses) {
    if (expense.payer_participant_id) {
      const payer = balances.get(expense.payer_participant_id);
      // عضو حُذف من المناسبة بعد تسجيل المصروف: نتجاهله بدل اختراع رصيد.
      if (payer) payer.paid += Math.abs(expense.amount);
    }

    for (const share of expense.shares) {
      if (!share.participant_id) continue;
      const member = balances.get(share.participant_id);
      if (member) member.owed += Math.abs(share.share_amount);
    }
  }

  return [...balances.values()].map((balance) => ({
    ...balance,
    net: Math.round((balance.paid - balance.owed) * 100) / 100,
  }));
}

/**
 * يحوّل الأرصدة إلى أقل عدد معقول من التحويلات.
 *
 * خوارزمية جشعة: نقابل دائماً أكبر مدين بأكبر دائن. هذا لا يضمن الحد
 * الأدنى النظري المطلق (مسألة NP)، لكنه يعطي عدداً قليلاً وقابلاً للفهم،
 * وهو ما يهم عملياً في مجموعة من بضعة أشخاص.
 */
export function settleBalances(balances: ParticipantBalance[]): Settlement[] {
  const creditors = balances
    .filter((balance) => balance.net > 0.009)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => b.net - a.net);

  const debtors = balances
    .filter((balance) => balance.net < -0.009)
    .map((balance) => ({ ...balance, net: -balance.net }))
    .sort((a, b) => b.net - a.net);

  const settlements: Settlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.round(Math.min(creditor.net, debtor.net) * 100) / 100;

    if (amount > 0) {
      settlements.push({
        fromParticipantId: debtor.participantId,
        fromName: debtor.name,
        toParticipantId: creditor.participantId,
        toName: creditor.name,
        amount,
      });
    }

    creditor.net = Math.round((creditor.net - amount) * 100) / 100;
    debtor.net = Math.round((debtor.net - amount) * 100) / 100;

    if (creditor.net <= 0.009) creditorIndex += 1;
    if (debtor.net <= 0.009) debtorIndex += 1;
  }

  return settlements;
}

/** إجمالي ما أُنفق في المناسبة. */
export function totalEventSpend(expenses: SharedExpenseWithShares[]): number {
  return expenses.reduce((sum, expense) => sum + Math.abs(expense.amount), 0);
}
