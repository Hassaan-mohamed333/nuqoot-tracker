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
supabase secrets set GEMINI_FALLBACK_MODEL=gemini-2.0-flash-lite
# طبقة خفيفة تُجرَّب أخيراً
supabase secrets set GEMINI_LITE_MODEL=gemini-3.1-flash-lite
# محاولة واحدة لكل طراز افتراضياً؛ ارفعها إن أردت إعادة المحاولة
supabase secrets set GEMINI_MAX_ATTEMPTS=1

# انشر
supabase functions deploy parse-transaction
supabase functions deploy scan-receipt
```

الدالتان تتطلبان جلسة مستخدم صالحة (`verify_jwt` مفعّل افتراضياً)، فلا
يستطيع استدعاءها إلا مستخدم مسجَّل الدخول في التطبيق.

## السلوك عند غياب الإعداد

بلا `GEMINI_API_KEY` تُعيد الدالة `503` ورمز `AI_NOT_CONFIGURED`، ويتحوّل
التطبيق تلقائياً إلى التحليل المحلي في `src/utils/parseTransactionText.ts`.

## عند الازدحام

تُجرَّب ثلاث طبقات بالترتيب — `GEMINI_MODEL` ثم `GEMINI_FALLBACK_MODEL` ثم
`GEMINI_LITE_MODEL` — بمحاولة واحدة لكل طبقة وانتقال فوري بلا انتظار عند
`503` أو `429`. إن فشل الجميع تعود برمز `AI_BUSY` ورسالة تطلب المحاولة
لاحقاً أو الإدخال اليدوي، دون أن ينكسر مسار قراءة الإيصال.

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
