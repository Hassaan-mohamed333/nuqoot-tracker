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
import { logger } from '@/lib/logger';
import { sanitizeLine } from '@/lib/validation';
import { navigationRef } from '@/navigation/navigationRef';
import { useLedger } from '@/store/LedgerProvider';

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

/** يطابق اسماً كتبه الطراز باسمٍ في الدفتر، بتسامح معقول. */
function matchByName<T>(
  items: readonly T[],
  label: (item: T) => string,
  query: string,
): T | undefined {
  const target = sanitizeLine(query).toLowerCase();
  if (!target) return undefined;

  const normalized = items.map((item) => ({
    item,
    name: sanitizeLine(label(item)).toLowerCase(),
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
  'اطلب ما تريد: «افتح جهات الاتصال»، «سجّل ٥٠٠ دفعتها لسامي»، أو اسأل عن رصيدك.';

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
  const { contacts, events, addTransaction } = useLedger();

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
          const contact = matchByName(
            contacts,
            (item) => item.full_name,
            action.contactName,
          );
          if (!contact) {
            return `لا توجد جهة اتصال باسم «${action.contactName}». أضفها أولاً.`;
          }

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

        case 'toggleModal': {
          if (!action.open) onRequestClose?.();
          return null;
        }
      }
    },
    [addTransaction, contacts, events, onRequestClose],
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
        const description = describeAction(action);

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
          logger.error('assistant', 'فشل تنفيذ الأداة', error);
          setStatus(id, 'failed', 'تعذّر تنفيذ الإجراء.');
        }
      }

      return feedback;
    },
    [execute, push, setStatus],
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
        await runTurn([{ role: 'user', text: clean }]);
      } finally {
        setLoading(false);
      }
    },
    [loading, push, runTurn],
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
      setStatus(id, 'failed', 'تعذّر تنفيذ الإجراء.');
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
