# نقوط — Nuqoot Tracker

تطبيق React Native (Expo + TypeScript) لتتبّع **النقوط والواجبات**: مَن دفعت له، ومَن دفع لك،
وفي أي مناسبة، مع رصيد صافٍ واضح لكل جهة اتصال وللحساب كاملاً.

## المفهوم المحاسبي

| الاتجاه | المعنى | الأثر على الصافي |
| --- | --- | --- |
| `OUT` | نقوط **دفعتها** لجهة الاتصال | يزيد الصافي (لك واجب عندهم) |
| `IN` | نقوط **استلمتها** من جهة الاتصال | ينقص الصافي (عليك واجب لهم) |

الصافي = `مجموع OUT - مجموع IN`، ولونه:

- **أخضر** عندما يكون الصافي > 0 → **دائن**
- **أحمر** عندما يكون الصافي < 0 → **مدين**
- **رمادي** عندما يكون الصافي = 0 → **متعادل**

المنطق كله في `src/utils/ledger.ts`.

## المزايا

- قائمة جهات اتصال مرتّبة أبجدياً مع فهرس جانبي (ا-ي و A-Z) للقفز السريع.
- ملف لكل جهة اتصال: الرصيد، سجل الحركات مع تصفية (دفعت / استلمت)، والمناسبات المرتبطة.
- شاشة المناسبات مقسّمة إلى قادمة وسابقة مع إجمالي النقوط لكل مناسبة.
- شريط ملخص ثابت أسفل الشاشة يعرض الحالة المالية (دائن / مدين).
- إضافة جهات الاتصال والمناسبات والحركات من داخل التطبيق، مع إمكانية إنشاء
  جهة اتصال أو مناسبة أثناء تسجيل حركة والعودة إليها مباشرة.
- شاشات بداية فارغة تقود المستخدم الجديد إلى أول خطوة.
- تسجيل دخول بالبريد أو كضيف (Anonymous)، مع عزل بيانات كل حساب عبر RLS.
- يعمل بدون إعداد Supabase باستخدام تخزين محلي (AsyncStorage) وبيانات تجريبية.

## التقنيات

| الغرض | الحزمة |
| --- | --- |
| الإطار | Expo SDK 57 + React Native 0.86 + TypeScript |
| الخلفية | `@supabase/supabase-js` |
| التنسيق | `nativewind` + `tailwindcss` |
| التنقل | `@react-navigation/native` + `bottom-tabs` + `native-stack` |
| الأيقونات | `lucide-react-native` |
| التخزين المحلي | `@react-native-async-storage/async-storage` |
| اختيار التاريخ | `@react-native-community/datetimepicker` |

## هيكل المشروع

```
src/
├── components/
│   ├── AlphabetIndex.tsx      # الفهرس الأبجدي الجانبي
│   ├── ContactRow.tsx         # صف جهة اتصال
│   ├── EventCard.tsx          # بطاقة مناسبة
│   ├── LedgerSummaryBar.tsx   # الشريط الثابت أسفل الشاشة
│   ├── NetBalanceBadge.tsx    # شارة الرصيد الصافي
│   └── TransactionCard.tsx    # بطاقة حركة
├── data/seed.ts               # بيانات تجريبية
├── lib/
│   ├── repository.ts          # جلب/حفظ البيانات (Supabase + محلي)
│   ├── storage.ts             # مساعدات AsyncStorage
│   └── supabase.ts            # إعداد عميل Supabase
├── navigation/                # التبويبات والمكدس
├── screens/
│   ├── AddContactScreen.tsx
│   ├── AddEventScreen.tsx
│   ├── AddTransactionScreen.tsx
│   ├── AuthScreen.tsx
│   ├── ContactProfileScreen.tsx
│   ├── ContactsListScreen.tsx
│   ├── EventsScreen.tsx
│   └── HomeScreen.tsx
├── store/
│   ├── AuthProvider.tsx       # جلسة Supabase ودوال الدخول والخروج
│   └── LedgerProvider.tsx     # حالة التطبيق المشتركة
├── types/index.ts             # Contact, Event, Transaction, LedgerSummary
└── utils/ledger.ts            # حسابات الرصيد والترتيب الأبجدي
supabase/schema.sql            # جداول قاعدة البيانات وسياسات RLS
```

## التشغيل

```bash
npm install
npm start        # ثم اختر a للأندرويد أو i لـ iOS
```

للتحقق من الأنواع:

```bash
npm run typecheck
```

## ربط Supabase (اختياري)

1. أنشئ مشروعاً على [supabase.com](https://supabase.com).
2. شغّل `supabase/schema.sql` من SQL Editor (ينشئ الجداول ويفعّل RLS).
3. لتفعيل زر «متابعة كضيف»: Authentication → Sign In / Providers → **Anonymous sign-ins**.
4. انسخ `.env.example` إلى `.env` واملأ **عنوان المشروع الأساسي** (بدون `/rest/v1`):

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

بدون هذه المتغيرات يعمل التطبيق في **الوضع المحلي** على بيانات الجهاز فقط
وبدون شاشة دخول.

## الحسابات وأمن البيانات

- عند ضبط مفاتيح Supabase تظهر شاشة الدخول أولاً، لأن سياسات RLS تربط كل صف
  بـ `auth.uid()` فلا تُقرأ أو تُكتب أي بيانات بلا جلسة.
- الجلسة محفوظة في AsyncStorage، فيبقى المستخدم مسجّلاً بعد إغلاق التطبيق.
- التطبيق **لا يرسل `user_id`** عند الإدراج؛ تملؤه قاعدة البيانات من
  `default auth.uid()`. إرسال `null` صراحةً كان سيتجاوز القيمة الافتراضية
  ويكسر قيد `NOT NULL`.
- عند تسجيل الخروج تُمسح النسخة المحلية حتى لا يراها الحساب التالي على الجهاز.
  وإذا تعذّر إبطال الجلسة على الخادم يتم الخروج محلياً على الأقل.
- كل طلبات العميل محكومة بمهلة (`REQUEST_TIMEOUT_MS`)، واستعادة الجلسة عند
  الإقلاع محكومة بمهلة أقصر، فلا تعلق شاشة البداية عند بطء الشبكة.
- الإنشاء كله يمرّ على `persist()` في `src/lib/repository.ts`، وهي الجهة
  الوحيدة التي تبني حمولات الإدراج، فلا يتسرب `user_id` من أي شاشة.
