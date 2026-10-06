# دليل التصميم — «الكراسة الصفرا»

هذا الملف هو المرجع لأي شاشة أو مكوّن جديد. الفكرة: **دفتر حسابات ورقي حديث**.
أرضية ورقية دافئة، حبر داكن للنصوص، كهرماني للإجراء الرئيسي فقط، وبطاقة داكنة
واحدة للرصيد. RTL عربي أولاً، ووضع فاتح فقط.

> لوحة المرجع المرئية: `nuqoot-redesign.html` (tokens + components + الشاشات).

## القواعد (الأهم أولاً)

1. **لا ألوان مكتوبة يدوياً.** كل لون يأتي من رمز في `global.css` ويُسمّى في
   `tailwind.config.js` (`bg-surface`, `text-ink-muted`, `bg-hero`…). ما لا يقبل
   `className` (أيقونات، مؤشّر التحميل) يقرأ من `src/lib/palette.ts`.
   الملفان يجب أن يتطابقا، وتحرسه `tests/theme.test.ts`.
2. **الكهرماني للإجراء الرئيسي فقط.** `bg-primary` تعبئة ونصّها `text-primary-fg`
   الداكن. أمّا النص والأيقونات فوق سطح فاتح فتأخذ `text-primary-strong`.
   `text-primary` ممنوع (تباينه 2.1:1).
3. **إجراء رئيسي واحد في كل شاشة.** الباقي `outline` أو `ghost`. الإجراءات
   الخطرة (أرشفة، حذف) داخل قائمة «⋯» أو `Sheet` مع تأكيد، لا بجوار الرئيسي.
4. **الرصيد في بطاقة `hero` الداكنة** (`LedgerSummaryBar`)، لا شريطاً ثابتاً.
   `variant="compact"` للسطر الصغير داخل القوائم.
5. **الزرّ المعطّل يقول السبب:** `Button` يقبل `disabledReason`. أي نموذج بزرّ
   حفظ معطّل يمرّره.
6. **سطر واحد للنصوص التي تطول** (اسم، ملاحظة، مكان): `numberOfLines={1}` مع
   `min-w-0` على الحاوية. لا تترك اسماً يمدّ البطاقة.
7. **النماذج تستعمل `Field`** (لا `TextInput` خام)، والاختيار من قائمة قصيرة
   شرائح (`chips`) أو `SegmentedControl` أو `CheckRow`.
8. **المسافات بـ `gap`** لا بهوامش `mr-*` بين عنصرين متجاورين: الهوامش تتبدّل
   بحسب اتجاه الصفّ في RTL.
9. **على الويب الواسع** التطبيق عمود بعرض 560px كحدّ أقصى (`App.tsx`)، لا يتمدّد.
10. **نصوص عربية صغيرة:** حدّد `lineHeight` صراحة (مثل تسمية التبويب 11/16)، وإلا قُصّت الهمزات والنقاط.
11. **أهداف اللمس 44px فأكثر**، والتركيز ظاهر، والأرقام `tabular-nums` حيث تصطفّ.

## الرموز

| المجموعة | أمثلة |
|---|---|
| الأسطح | `base` (الأرضية) · `surface` (بطاقة) · `surface-raised` · `hero` (الرصيد) |
| الكهرماني | `primary` · `primary-strong` · `primary-fg` · `accent` |
| الدلالة | `success`/`credit` (دائن) · `danger`/`debit` (مدين) · `warning` |
| النص | `ink` · `ink-muted` · `ink-subtle` · `hero-fg` · `hero-accent` |
| الحدود | `line` · `line-strong` |
| الزوايا | `rounded-card` 26 · `rounded-tile` 16 · `rounded-3xl` 28 · حبّة كاملة للأزرار |
| الظلال | `shadow-card` · `shadow-raised` · `shadow-float` |

## المكوّنات المشتركة (`src/components/ui`)

`Button` · `Field` · `Card` / `SectionTitle` · `Sheet` / `Dialog` · `Screen` ·
`CheckRow` / `RadioRow` / `SegmentedControl` · `Avatar` · `IconButton` · `DateField`.
وخارجها: `LedgerSummaryBar` (بطاقة الرصيد) · `TransactionCard` · `ContactRow` ·
`EventCard` · `PressableScale` (حركة الضغط).

## التنقّل

شريط تبويب عائم: الرئيسية، جهات الاتصال، **«+» مركزي** (حركة جديدة)، المناسبات،
المساعد. المساعد تبويب يفتح نافذة (`openAssistant`) لا شاشة.

## الحركة

`transform` و`opacity` فقط: ضغط الأزرار `scale .955`، دخول الصفوف
`FadeSlideIn`، فتح الـ `Sheet` بنابض. لا حركة تعتمد على قياس التخطيط.

## ما لم يُطبَّق بعد

- خط **Readex Pro**: يحتاج `expo-font` و`@expo-google-fonts/readex-pro` وربط
  أوزان الخط بأصناف Tailwind. الخط الحالي هو خط النظام.
- الوضع الداكن: خارج النطاق (لايت فقط).
