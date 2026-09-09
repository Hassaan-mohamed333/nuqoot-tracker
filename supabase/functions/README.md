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

# انشر
supabase functions deploy parse-transaction
supabase functions deploy scan-receipt
```

الدالتان تتطلبان جلسة مستخدم صالحة (`verify_jwt` مفعّل افتراضياً)، فلا
يستطيع استدعاءها إلا مستخدم مسجَّل الدخول في التطبيق.

## السلوك عند غياب الإعداد

بلا `GEMINI_API_KEY` تُعيد الدالة `503` ورمز `AI_NOT_CONFIGURED`، ويتحوّل
التطبيق تلقائياً إلى التحليل المحلي في `src/utils/parseTransactionText.ts`.
