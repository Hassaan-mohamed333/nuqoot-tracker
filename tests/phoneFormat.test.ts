import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizePhone } from '../src/utils/phoneFormat.ts';

describe('تنسيق رقم من دفتر الهاتف', () => {
  test('يزيل المسافات والشرطات والأقواس', () => {
    assert.equal(normalizePhone('010 1234-5678'), '01012345678');
    assert.equal(normalizePhone('(010) 12 34 56 78'), '01012345678');
  });

  test('المفتاح المصري +20 و0020 يصير 0', () => {
    assert.equal(normalizePhone('+20 101 234 5678'), '01012345678');
    assert.equal(normalizePhone('0020 101 234 5678'), '01012345678');
  });

  test('مفتاح دولة آخر يبقى بعلامة +', () => {
    assert.equal(normalizePhone('+966 50 123 4567'), '+966501234567');
  });

  test('نصّ فارغ أو بلا أرقام يعيد نصّاً فارغاً', () => {
    assert.equal(normalizePhone(''), '');
    assert.equal(normalizePhone('---'), '');
  });
});
