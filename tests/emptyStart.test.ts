import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

/** كل ملفات المصدر، لمسحٍ شامل لا يعتمد على قائمة أسماء تَقدُم. */
function sourceFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const next = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(next));
    else if (/\.tsx?$/.test(entry.name)) out.push(next);
  }
  return out;
}

/**
 * الدفتر يبدأ فارغاً.
 *
 * كانت تُزرع بيانات تجريبية عند أوّل فتح بلا حساب: ثمانُ جهات اتصال
 * وعشرُ حركات بأسماء ومبالغ. ومن يفتح دفتراً مالياً يريد دفتره هو —
 * أرصدةٌ ليست له في أوّل شاشة تُربك ولا تُعرّف، ويصعب تمييز ما يُحذف
 * منها عمّا يُبقى.
 *
 * وكانت تتسرّب إلى الحسابات الحقيقية كذلك: يُجرَّب التطبيق بلا حساب
 * فتُزرع، ثم يُسجَّل الدخول ويفشل طلبٌ واحد فتُعرض النسخة المحلية بما
 * فيها — وهو ما فجّر عطب 22P02 (انظر tests/localRows.test.ts).
 */
describe('البداية من دفتر فارغ', () => {
  test('ملف البيانات التجريبية غير موجود', () => {
    assert.equal(
      existsSync(path.join(ROOT, 'src/data/seed.ts')),
      false,
      'ملف البذور عاد',
    );
  });

  test('لا ملف مصدر يشير إلى بذور', () => {
    const offenders = sourceFiles().filter((file) =>
      /SEED_|@\/data\/seed|data\/seed/.test(read(file)),
    );
    assert.deepEqual(offenders, [], 'ملفات ما زالت تستورد البذور');
  });

  test('التحميل المحلي يبدأ من قوائم فارغة', () => {
    const repo = read('src/lib/repository.ts');
    const start = repo.indexOf('async function loadLocal(');
    assert.ok(start > 0, 'loadLocal غير موجودة');
    const body = repo.slice(start, repo.indexOf('\n}', start));

    // الافتراض `[]` لا `null`: القائمة الفارغة هي الحالة الأولى الصحيحة.
    assert.match(body, /readJson<Contact\[\]>\(STORAGE_KEYS\.contacts, \[\]\)/);
    assert.match(body, /readJson<Event\[\]>\(STORAGE_KEYS\.events, \[\]\)/);
    assert.match(
      body,
      /readJson<Transaction\[\]>\(STORAGE_KEYS\.transactions, \[\]\)/,
    );
    assert.ok(
      !body.includes('writeJson'),
      'loadLocal تكتب في التخزين — القراءة لا تزرع',
    );
  });

  test('لا شرط «ازرع إن كان فارغاً» باقياً', () => {
    const repo = read('src/lib/repository.ts');
    assert.ok(!/seedWhenEmpty/.test(repo), 'وسيط الزرع ما زال موجوداً');
    assert.match(repo, /return loadLocal\(\);/);
  });

  test('الوضع المحلي ما زال يكتب ما ينشئه المستخدم', () => {
    /*
     * الفرق بين «لا بذور» و«لا تخزين»: الأوّل مطلوب، والثاني يُفقد عمل
     * الضيف عند كل إعادة تحميل. فمسارات الإنشاء تكتب كما كانت.
     */
    const repo = read('src/lib/repository.ts');
    const persist = repo.slice(
      repo.indexOf('async function persist<'),
      repo.indexOf('async function persist<') + 1200,
    );
    assert.match(persist, /writeJson\(storageKey, \[saved, \.\.\.cached\]\)/);
  });
});

/**
 * ما يراه من يفتح التطبيق لأوّل مرّة: بطاقةٌ تشرح وتدعو، لا فراغٌ صامت.
 */
describe('حالات الفراغ', () => {
  test('الشاشة الرئيسية تدعو إلى أوّل جهة اتصال وأوّل مناسبة', () => {
    const home = read('src/screens/HomeScreen.tsx');
    assert.match(home, /!loading && contacts\.length === 0/);
    assert.match(home, /لنبدأ من الصفر/);
    assert.match(home, /إضافة جهة اتصال/);
    assert.match(home, /إضافة مناسبة/);
    // الشرط يشمل `loading` فلا تومض البطاقة قبل وصول البيانات.
    assert.ok(
      home.indexOf('!loading &&') < home.indexOf('لنبدأ من الصفر'),
      'البطاقة تظهر أثناء التحميل',
    );
  });

  test('الشاشة الرئيسية تقول صراحةً إنه لا حركات', () => {
    assert.match(read('src/screens/HomeScreen.tsx'), /لم تُسجَّل أي حركة بعد\./);
  });

  test('قائمة جهات الاتصال تدعو وتحمل زرّاً', () => {
    const contacts = read('src/screens/ContactsListScreen.tsx');
    assert.match(contacts, /ابدأ بإضافة أول جهة اتصال/);
    assert.match(contacts, /title="إضافة جهة اتصال"/);
    assert.match(contacts, /navigation\.navigate\('AddContact'\)/);
  });

  test('نموذج الحركة يوجّه إلى إنشاء جهة اتصال أولاً', () => {
    // دفترٌ فارغ يعني أن أوّل زيارة للنموذج تجد القائمة خالية.
    const add = read('src/screens/AddTransactionScreen.tsx');
    assert.match(add, /لا توجد جهات اتصال بعد\./);
    assert.match(add, /title="إضافة جهة اتصال"/);
  });

  test('المناسبات وقائمة المؤرشف لها نصوصها كذلك', () => {
    assert.match(read('src/screens/EventsScreen.tsx'), /لا توجد مناسبات/);
    assert.match(read('src/screens/ContactsListScreen.tsx'), /لا توجد جهات مؤرشفة/);
  });
});
