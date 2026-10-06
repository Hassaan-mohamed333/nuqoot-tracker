/**
 * قناة صغيرة لفتح المساعد من خارج مكوّنه.
 *
 * نافذة المساعد وسجلّ محادثته يعيشان في `AssistantLauncher` (مركَّب بجوار
 * المتنقّل)، أمّا زرّه فصار تبويباً داخل الشريط السفلي. القناة تصل
 * بينهما دون رفع الحالة إلى الجذر، فلا يُعاد رسم التطبيق مع كل حرف.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function openAssistant(): void {
  listeners.forEach((listener) => listener());
}

export function onOpenAssistant(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
