# دوال الحافة (Supabase Edge Functions)

هاتان الدالتان تحملان مفتاح Gemini على الخادم.

## لماذا لا نضع المفتاح في التطبيق؟

أي متغير باسم `EXPO_PUBLIC_*` يُحزَم داخل حزمة JavaScript الخاصة بالتطبيق،
ويمكن استخراجه من ملف APK/IPA بأدوات بسيطة. مفتاح Gemini في التطبيق يعني
أن أي شخص يملك نسخة من التطبيق يستطيع استهلاك رصيد حسابك. لذلك يبقى
المفتاح سرّاً على الخادم، ويستدعي التطبيق الدالة بجلسة المستخدم.

## النشر

```bash
# مرة واحدة
supabase link --project-ref <project-ref>

# اضبط الأسرار
supabase secrets set GEMINI_API_KEY=<your-key>
# اختياري: لتغيير الطراز بلا تعديل الكود
supabase secrets set GEMINI_MODEL=gemini-2.0-flash
# الطراز الاحتياطي عند ازدحام الأساسي أو عدم توفّره
supabase secrets set GEMINI_FALLBACK_MODEL=gemini-flash-lite-latest
# طبقة ثالثة اختيارية (فارغة افتراضياً)
supabase secrets set GEMINI_LITE_MODEL=
# جولتان افتراضياً؛ اجعلها 1 لجولة واحدة بلا إعادة محاولة
supabase secrets set GEMINI_MAX_ROUNDS=2

# انشر
supabase functions deploy parse-transaction
supabase functions deploy scan-receipt
```

الدالتان تتطلبان جلسة مستخدم صالحة (`verify_jwt` مفعّل افتراضياً)، فلا
يستطيع استدعاءها إلا مستخدم مسجَّل الدخول في التطبيق.

## السلوك عند غياب الإعداد

بلا `GEMINI_API_KEY` تُعيد الدالة `503` ورمز `AI_NOT_CONFIGURED`، ويتحوّل
التطبيق تلقائياً إلى التحليل المحلي في `src/utils/parseTransactionText.ts`.

## أي الطُرُز متاحة لمفتاحك؟

اسم طراز خاطئ يفشل بـ 404 ويبدو من التطبيق شبيهاً بالازدحام. الأسماء
المرقّمة (`gemini-2.5-flash`) قد لا تكون متاحة لكل مفتاح، بينما الأسماء
المستعارة (`gemini-flash-latest`) تتبع أحدث إصدار متاح.

المفتاح سرّ على الخادم، لذا تسرد دالة `list-models` ما يقبله فعلاً:

```bash
supabase functions deploy list-models
curl -H "Authorization: Bearer <anon-key>" \
  https://<project-ref>.supabase.co/functions/v1/list-models
```

اضبط الأسرار بأسماء من القائمة العائدة فقط.

## عند الازدحام

الجولة الأولى تجرّب كل طبقات السلسلة مرة واحدة بانتقال فوري بلا انتظار.
ثم تُعاد المحاولة على الطُرُز المزدحمة وحدها في جولة ثانية؛ أما ما ردّ 404
فيُسقط نهائياً لأن اسمه لن يصبح صحيحاً بالتكرار.

الفائدة عملية: الطراز غير الموجود يفشل في أجزاء من الثانية، فيبقى وقت كافٍ
لإعادة محاولة الطراز الحقيقي المزدحم — و503 حالة عابرة غالباً ما تزول.

إن فشل الجميع تعود برمز `AI_BUSY` ورسالة تطلب المحاولة لاحقاً أو الإدخال
اليدوي، دون أن ينكسر مسار قراءة الإيصال.

يحمل حقل `detail` في استجابة الخطأ حصيلة كل طبقة، مثل:

```json
{ "error": "...", "code": "AI_BUSY",
  "detail": "gemini-3.6-flash=GEMINI_MODEL_NOT_FOUND, gemini-2.5-flash=GEMINI_OVERLOADED" }
```

هذا يميّز الازدحام الحقيقي عن اسم طراز غير موجود — وهما مشكلتان مختلفتان
تماماً في العلاج. إن ظهر `GEMINI_MODEL_NOT_FOUND` فالاسم خاطئ لا مزدحم.

تأكّد أن الطراز الاحتياطي متاح لمفتاحك فعلاً؛ طراز غير موجود يعني أن
الاحتياطي سيفشل بـ 404 في اللحظة التي تحتاجه فيها. للتحقق:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | grep -o '"name": "models/[^"]*"'
```

# دخول Google (OAuth)

## 1. Google Cloud Console

أنشئ OAuth Client ID من نوع **Web application**، وأضف إلى
Authorized redirect URIs:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

هذا العنوان هو الوحيد الذي يراه Google؛ إعادة التوجيه إلى التطبيق تتم من
Supabase بعده.

## 2. Supabase Dashboard

- Authentication → Providers → **Google**: فعّله وألصق Client ID و Secret.
- Authentication → URL Configuration → **Redirect URLs**: أضف

```
nuqoot://auth/callback        # بناء تطويري أو إنتاجي
exp://127.0.0.1:8081/--/auth/callback   # Expo Go محلياً (عدّل المنفذ/العنوان)
http://localhost:8081         # معاينة الويب
https://<production-domain>   # الويب في الإنتاج
```

عنوان غير مُدرَج هنا يُرفض بصمت ويعود المستخدم بلا جلسة.

## 3. الاختبار

```bash
npx expo start -c        # ثم w للويب
npx expo run:android     # بناء تطويري (المخطط nuqoot:// يعمل هنا)
```

الويب: يعود المتصفّح إلى الصفحة ومعه `?code=` ويلتقطه `detectSessionInUrl`.
الأصلي: يُفتح متصفّح المصادقة، وعند العودة يُبدَّل الرمز بجلسة يدوياً عبر
`exchangeCodeForSession`.
