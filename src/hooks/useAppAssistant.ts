import { useCallback, useMemo, useRef, useState } from 'react';

import {
  describeAction,
  parseToolCall,
  processUserCommand,
  requiresConfirmation,
  type AssistantAction,
  type AssistantTurn,
  type RawToolCall,
} from '@/lib/gemini';
import { foldArabic, parseLocalCommand } from '@/lib/localIntent';
import { logger } from '@/lib/logger';
import { userMessage } from '@/lib/supabaseError';
import { sanitizeLine } from '@/lib/validation';
import { navigationRef } from '@/navigation/navigationRef';
import { useLedger } from '@/store/LedgerProvider';
import { formatDate } from '@/utils/ledger';

export type MessageRole = 'user' | 'assistant' | 'action';

export type ActionStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface AssistantMessage {
  id: string;
  role: MessageRole;
  text: string;
  /** للرسائل من نوع `action` فقط. */
  status?: ActionStatus;
}

/** فعل ينتظر موافقة المستخدم قبل تنفيذه. */
export interface PendingConfirmation {
  id: string;
  action: AssistantAction;
  description: string;
}

/** الشاشات التي تفتحها الوجهات مباشرة بلا معرّف. */
const DIRECT_ROUTES = {
  archive: 'Archive',
  addTransaction: 'AddTransaction',
  addContact: 'AddContact',
  addEvent: 'AddEvent',
  smartInput: 'SmartInput',
  scanReceipt: 'ScanReceipt',
} as const;

const TAB_ROUTES = {
  home: 'Home',
  contacts: 'Contacts',
  events: 'Events',
} as const;

/**
 * يطابق اسماً كتبه الطراز أو المستخدم باسمٍ في الدفتر.
 *
 * المقارنة بعد طيّ صور الحروف: «احمد» و«أحمد» شخص واحد، و«ساره»
 * و«سارة» كذلك. بلا الطيّ يفشل المطابقة فيُنشأ حسابٌ ثانٍ للشخص نفسه،
 * أو لا يجد المساعد من يؤرشفه فلا يفعل شيئاً.
 */
function matchByName<T>(
  items: readonly T[],
  label: (item: T) => string,
  query: string,
): T | undefined {
  const target = foldArabic(sanitizeLine(query)).toLowerCase();
  if (!target) return undefined;

  const normalized = items.map((item) => ({
    item,
    name: foldArabic(sanitizeLine(label(item))).toLowerCase(),
  }));

  return (
    normalized.find((row) => row.name === target)?.item ??
    // تطابق جزئي: المستخدم يقول «سامي» ويخزَّن «سامي عبد الله».
    normalized.find(
      (row) => row.name.startsWith(target) || row.name.includes(target),
    )?.item
  );
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

const GREETING =
  'اطلب ما تريد: «سجّل ٥٠٠ لسامي»، «استلمت ٣٠٠ من سارة»، أو «افتح جهات الاتصال».';

export interface AppAssistant {
  messages: AssistantMessage[];
  loading: boolean;
  /** فعل ينتظر موافقة، أو null. */
  pending: PendingConfirmation | null;
  send: (text: string) => Promise<void>;
  confirmPending: () => Promise<void>;
  cancelPending: () => void;
  reset: () => void;
}

/**
 * حالة المساعد وموجّه أفعاله.
 *
 * الخطّاف هو الحدّ بين اقتراح الطراز وتنفيذه: كل نداء أداة يمرّ على
 * `parseToolCall` (تحقّق من الوسائط)، ثم — إن كان يكتب — على بوّابة
 * موافقة. لا مسار ثالث يصل إلى `addTransaction` من هنا.
 */
export function useAppAssistant(onRequestClose?: () => void): AppAssistant {
  const {
    contacts,
    events,
    transactions,
    addTransaction,
    addContact,
    setArchived,
    setTransactionArchivedState,
  } = useLedger();

  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: 'greeting', role: 'assistant', text: GREETING },
  ]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  /** سجلّ الدورات المرسَل إلى الطراز، منفصل عن رسائل العرض. */
  const history = useRef<AssistantTurn[]>([]);

  const push = useCallback((message: AssistantMessage) => {
    setMessages((current) => [...current, message]);
  }, []);

  const setStatus = useCallback(
    (id: string, status: ActionStatus, text?: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === id
            ? { ...message, status, text: text ?? message.text }
            : message,
        ),
      );
    },
    [],
  );

  /**
   * ينفّذ فعلاً متحقَّقاً منه.
   *
   * يعيد رسالة الخطأ عند الفشل و`null` عند النجاح، ليقرّر المستدعي هل
   * يُعيد النتيجة إلى الطراز أم يكتفي ببطاقة الإجراء.
   */
  const execute = useCallback(
    async (action: AssistantAction): Promise<string | null> => {
      switch (action.tool) {
        case 'navigateTo': {
          const { screen } = action;

          if (!navigationRef.isReady()) {
            return 'التطبيق لم يكتمل تحميله بعد. أعد المحاولة بعد لحظة.';
          }

          if (screen in TAB_ROUTES) {
            navigationRef.navigate('Tabs', {
              screen: TAB_ROUTES[screen as keyof typeof TAB_ROUTES],
            });
            onRequestClose?.();
            return null;
          }

          if (screen in DIRECT_ROUTES) {
            navigationRef.navigate(
              DIRECT_ROUTES[screen as keyof typeof DIRECT_ROUTES] as 'AddContact',
            );
            onRequestClose?.();
            return null;
          }

          if (screen === 'contactProfile') {
            const contact = matchByName(
              contacts,
              (item) => item.full_name,
              action.contactName ?? '',
            );
            if (!contact) {
              return `لا توجد جهة اتصال باسم «${action.contactName}».`;
            }
            navigationRef.navigate('ContactProfile', { contactId: contact.id });
            onRequestClose?.();
            return null;
          }

          const event = matchByName(
            events,
            (item) => item.title,
            action.eventTitle ?? '',
          );
          if (!event) return `لا توجد مناسبة باسم «${action.eventTitle}».`;
          navigationRef.navigate('EventLedger', { eventId: event.id });
          onRequestClose?.();
          return null;
        }

        case 'createTransaction': {
          /*
           * الاسم المجهول يُنشأ لا يُرفض.
           *
           * كان الردّ «لا توجد جهة اتصال باسم … أضفها أولاً»، فيُلغى
           * الأمر كلّه ويُطالَب المستخدم بفتح شاشة أخرى ثم إعادة كتابة
           * ما كتبه للتوّ. والإنشاء هنا ليس صامتاً: بطاقة التأكيد التي
           * وافق عليها قبل قليل تقول صراحةً إن جهة الاتصال جديدة.
           */
          const existing = matchByName(
            contacts,
            (item) => item.full_name,
            action.contactName,
          );

          const contact =
            existing ?? (await addContact({ full_name: action.contactName }));

          // التحقّق النهائي في المستودع: هذا المسار يمرّ على
          // validateTransactionInput مثل أي نموذج في التطبيق.
          await addTransaction({
            contact_id: contact.id,
            event_id: null,
            direction: action.direction,
            amount: action.amount,
            note: action.note,
          });
          return null;
        }

        case 'archiveItem': {
          const contact = matchByName(
            contacts,
            (item) => item.full_name,
            action.contactName,
          );
          if (!contact) {
            return `لا توجد جهة اتصال باسم «${action.contactName}».`;
          }

          if (action.target === 'contact') {
            await setArchived(contact.id, true);
            return null;
          }

          // «احذف فاتورة أحمد» تعني آخر ما سُجّل له: هو ما يقصده من
          // يصحّح خطأً وقع للتوّ. والبطاقة تذكر مبلغه وتاريخه قبل
          // الموافقة، فلا يُؤرشف صفٌّ لم يره المستخدم.
          const latest = transactions
            .filter((row) => row.contact_id === contact.id)
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];

          if (!latest) {
            return `لا توجد حركات نشطة لـ${contact.full_name}.`;
          }

          await setTransactionArchivedState(latest.id, true);
          return null;
        }

        case 'toggleModal': {
          if (!action.open) onRequestClose?.();
          return null;
        }
      }
    },
    [
      addContact,
      addTransaction,
      contacts,
      events,
      onRequestClose,
      setArchived,
      setTransactionArchivedState,
      transactions,
    ],
  );

  /** يعالج نداءات الأدوات: تحقّق، ثم بوّابة موافقة، ثم تنفيذ. */
  const handleCalls = useCallback(
    async (calls: RawToolCall[]): Promise<AssistantTurn[]> => {
      const feedback: AssistantTurn[] = [];

      for (const call of calls) {
        const parsed = parseToolCall(call.name, call.args);

        if (!parsed.ok) {
          push({
            id: nextId('act'),
            role: 'action',
            text: parsed.error.message,
            status: 'failed',
          });
          // الخطأ يعود إلى الطراز ليصحّح نفسه في الدورة التالية.
          feedback.push({
            role: 'model',
            functionCall: { name: call.name, args: call.args },
          });
          feedback.push({
            role: 'user',
            functionResponse: {
              name: call.name,
              response: { error: parsed.error.message },
            },
          });
          continue;
        }

        const { action } = parsed;
        let description = describeAction(action);

        // الإنشاء التلقائي لجهة الاتصال يُذكر في البطاقة، فالموافقة
        // تشمله: مستخدمٌ يوافق على حركة لا يوافق ضمناً على صفّ جديد.
        if (
          action.tool === 'createTransaction' &&
          !matchByName(contacts, (item) => item.full_name, action.contactName)
        ) {
          description += ' (جهة اتصال جديدة)';
        }

        // الأرشفة تسمّي الصفّ المقصود بمبلغه وتاريخه: «آخر حركة» وحدها
        // لا تكفي ليعرف المستخدم على ماذا يوافق.
        if (action.tool === 'archiveItem' && action.target === 'transaction') {
          const contact = matchByName(
            contacts,
            (item) => item.full_name,
            action.contactName,
          );
          const latest = contact
            ? transactions
                .filter((row) => row.contact_id === contact.id)
                .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
            : undefined;
          if (latest) {
            description = `نقل حركة ${latest.amount} بتاريخ ${formatDate(
              latest.occurred_at,
            )} لـ${contact?.full_name} إلى الأرشيف`;
          }
        }

        if (requiresConfirmation(action)) {
          setPending({ id: nextId('pend'), action, description });
          continue;
        }

        const id = nextId('act');
        push({ id, role: 'action', text: description, status: 'running' });

        try {
          const failure = await execute(action);
          if (failure) {
            setStatus(id, 'failed', failure);
            feedback.push({
              role: 'model',
              functionCall: { name: call.name, args: call.args },
            });
            feedback.push({
              role: 'user',
              functionResponse: {
                name: call.name,
                response: { error: failure },
              },
            });
          } else {
            setStatus(id, 'done');
          }
        } catch (error) {
          // السبب المباشر لا رسالة عامّة: أخطاء التحقّق مكتوبة للمستخدم
          // أصلاً، و`userMessage` يمرّرها كما هي ويترجم ما عداها.
          logger.error('assistant', 'فشل تنفيذ الأداة', error);
          setStatus(id, 'failed', userMessage(error));
        }
      }

      return feedback;
    },
    [contacts, execute, push, setStatus, transactions],
  );

  const runTurn = useCallback(
    async (turns: AssistantTurn[], depth = 0): Promise<void> => {
      history.current = [...history.current, ...turns].slice(-16);

      const result = await processUserCommand(history.current, {
        contactNames: contacts.map((contact) => contact.full_name),
        eventTitles: events.map((event) => event.title),
      });

      if (result.kind === 'error') {
        push({ id: nextId('msg'), role: 'assistant', text: result.message });
        return;
      }

      if (result.kind === 'text') {
        history.current.push({ role: 'model', text: result.text });
        push({ id: nextId('msg'), role: 'assistant', text: result.text });
        return;
      }

      if (result.text) {
        push({ id: nextId('msg'), role: 'assistant', text: result.text });
      }

      const feedback = await handleCalls(result.calls);

      // دورة تصحيح واحدة لا حلقة: نداءٌ خاطئ يستحقّ فرصة ثانية، أمّا
      // التكرار بلا حدّ فيحرق الحصة ويُبقي المستخدم ينتظر.
      if (feedback.length > 0 && depth < 1) {
        await runTurn(feedback, depth + 1);
      }
    },
    [contacts, events, handleCalls, push],
  );

  const send = useCallback(
    async (text: string) => {
      const clean = sanitizeLine(text);
      if (!clean || loading) return;

      push({ id: nextId('msg'), role: 'user', text: clean });
      setLoading(true);
      try {
        /*
         * المحلّي أوّلاً.
         *
         * «سجل ٥٠ لأحمد» لا يحتاج نموذجاً لغوياً: بنيته فعلٌ ورقمٌ واسم.
         * وكان يحتاج — فكان يفشل كلّما لم تكن دالّة الحافة منشورة أو
         * انقطعت الشبكة أو كان التطبيق في الوضع المحلي. الآن يُفهم على
         * الجهاز فوراً، ولا يذهب إلى الخادم إلا ما يحتاج فهماً حقيقياً.
         *
         * والمسار بعدها هو نفسه: تحقّق من الوسائط ثم بوّابة تأكيد. لا
         * طريق أقصر إلى الدفتر لأن الأمر فُهم محلياً.
         */
        const local = parseLocalCommand(clean);
        if (local) {
          // السجلّ يعرف بما جرى، فلا يقترحه الطراز ثانيةً لو تلا الأمرَ
          // سؤالٌ عنه في الدورة التالية.
          history.current.push({ role: 'user', text: clean });
          await handleCalls([{ name: local.name, args: local.args }]);
          return;
        }

        await runTurn([{ role: 'user', text: clean }]);
      } finally {
        setLoading(false);
      }
    },
    [handleCalls, loading, push, runTurn],
  );

  const confirmPending = useCallback(async () => {
    if (!pending) return;
    setPending(null);

    const id = nextId('act');
    push({ id, role: 'action', text: pending.description, status: 'running' });
    setLoading(true);

    try {
      const failure = await execute(pending.action);
      if (failure) setStatus(id, 'failed', failure);
      else setStatus(id, 'done', `تمّ: ${pending.description}`);
    } catch (error) {
      logger.error('assistant', 'فشل تنفيذ إجراء مؤكَّد', error);
      setStatus(id, 'failed', userMessage(error));
    } finally {
      setLoading(false);
    }
  }, [execute, pending, push, setStatus]);

  const cancelPending = useCallback(() => {
    if (!pending) return;
    push({
      id: nextId('act'),
      role: 'action',
      text: `أُلغي: ${pending.description}`,
      status: 'cancelled',
    });
    // الإلغاء يصل الطراز كنتيجة أداة، فلا يعيد اقتراحه في الدورة التالية.
    history.current.push({
      role: 'user',
      functionResponse: {
        name: pending.action.tool,
        response: { cancelled: true },
      },
    });
    setPending(null);
  }, [pending, push]);

  const reset = useCallback(() => {
    history.current = [];
    setPending(null);
    setMessages([{ id: 'greeting', role: 'assistant', text: GREETING }]);
  }, []);

  return useMemo(
    () => ({ messages, loading, pending, send, confirmPending, cancelPending, reset }),
    [messages, loading, pending, send, confirmPending, cancelPending, reset],
  );
}
