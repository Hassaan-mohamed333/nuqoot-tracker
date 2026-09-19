import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { describeFunctionError } from '../src/lib/assistantErrors.ts';

/**
 * تشخيص فشل نداء دالّة الحافة.
 *
 * العطب المُبلَّغ عنه: كل مسارات الفشل كانت تنتهي إلى «تعذّر إتمام
 * العملية. حاول مرّة أخرى.» — الدالّة غير منشورة، المفتاح غير مضبوط،
 * الجلسة منتهية، CORS يمنع الطلب: أربعة أعطال وأربعة إصلاحات، ورسالة
 * واحدة لا تدلّ على أيّها.
 *
 * السبب: `userMessage` يقرأ `code`/`status` من الخطأ نفسه، وأخطاء
 * `functions-js` تضعهما في `context`.
 */

const GENERIC = 'تعذّر إتمام العملية. حاول مرّة أخرى.';

/** يبني خطأً بشكل `functions-js` نفسه. */
function functionsError(name: string, message: string, context: unknown) {
  const error = new Error(message);
  error.name = name;
  (error as Error & { context: unknown }).context = context;
  return error;
}

function httpError(status: number, body?: unknown) {
  const init: ResponseInit =
    body === undefined
      ? { status }
      : { status, headers: { 'content-type': 'application/json' } };
  const payload = body === undefined ? 'Internal Server Error' : JSON.stringify(body);
  return functionsError(
    'FunctionsHttpError',
    'Edge Function returned a non-2xx status code',
    new Response(payload, init),
  );
}

describe('تشخيص فشل المساعد', () => {
  test('لا حالة فشل تعود بالرسالة العامّة', async () => {
    const shapes = [
      httpError(404, { code: 'NOT_FOUND' }),
      httpError(500, {}),
      httpError(500),
      httpError(401, {}),
      httpError(403, {}),
      httpError(429, {}),
      httpError(502),
      functionsError(
        'FunctionsFetchError',
        'Failed to send a request to the Edge Function',
        new TypeError('Failed to fetch'),
      ),
      functionsError(
        'FunctionsRelayError',
        'Relay Error invoking the Edge Function',
        new Response('', { status: 500 }),
      ),
    ];

    for (const shape of shapes) {
      const message = await describeFunctionError(shape);
      assert.notEqual(
        message,
        GENERIC,
        `ما زال ${shape.name} يسقط إلى الرسالة العامّة`,
      );
      assert.ok(message.length > 10, 'رسالة أقصر من أن تفيد');
    }
  });

  test('الدالّة غير المنشورة تُسمّى وتُذكر طريقة نشرها', async () => {
    const message = await describeFunctionError(httpError(404, { code: 'NOT_FOUND' }));
    assert.match(message, /غير منشورة/);
    assert.match(message, /functions deploy assistant/);
  });

  test('خطأ الخادم يشير إلى المفتاح الناقص', async () => {
    const message = await describeFunctionError(httpError(500));
    assert.match(message, /GEMINI_API_KEY/);
  });

  test('رسالة الدالّة نفسها أولى من أي تخمين', async () => {
    const message = await describeFunctionError(
      httpError(500, { error: 'GEMINI_API_KEY غير مضبوط في أسرار المشروع.' }),
    );
    assert.equal(message, 'GEMINI_API_KEY غير مضبوط في أسرار المشروع.');
  });

  test('عطب الإرسال يذكر الشبكة و CORS', async () => {
    const message = await describeFunctionError(
      functionsError(
        'FunctionsFetchError',
        'Failed to send a request to the Edge Function',
        new TypeError('Failed to fetch'),
      ),
    );
    assert.match(message, /CORS/);
    assert.match(message, /الشبكة/);
  });

  test('401 و429 تُترجمان إلى ما يفعله المستخدم', async () => {
    assert.match(await describeFunctionError(httpError(401, {})), /سجّل الدخول/);
    assert.match(await describeFunctionError(httpError(429, {})), /انتظر/);
  });
});
