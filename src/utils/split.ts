import type {
  Contact,
  EventParticipant,
  ParticipantBalance,
  Settlement,
  SharedExpenseWithShares,
} from '@/types';

/** الاسم المعروض للمستخدم نفسه داخل القسمة. */
export const ME_LABEL = 'أنا';

/** مفتاح نصي ثابت للمشارك، لأن null لا يصلح مفتاحاً في Map. */
function participantKey(contactId: string | null): string {
  return contactId ?? '__me__';
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
  const names = new Map(contacts.map((contact) => [contact.id, contact.full_name]));

  const balances = new Map<string, ParticipantBalance>();

  function ensure(contactId: string | null): ParticipantBalance {
    const key = participantKey(contactId);
    let balance = balances.get(key);
    if (!balance) {
      balance = {
        contactId,
        name: contactId === null ? ME_LABEL : (names.get(contactId) ?? 'غير معروف'),
        paid: 0,
        owed: 0,
        net: 0,
      };
      balances.set(key, balance);
    }
    return balance;
  }

  for (const participant of participants) {
    ensure(participant.contact_id);
  }

  for (const expense of expenses) {
    ensure(expense.payer_contact_id).paid += Math.abs(expense.amount);
    for (const share of expense.shares) {
      ensure(share.contact_id).owed += Math.abs(share.share_amount);
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
        fromContactId: debtor.contactId,
        fromName: debtor.name,
        toContactId: creditor.contactId,
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
