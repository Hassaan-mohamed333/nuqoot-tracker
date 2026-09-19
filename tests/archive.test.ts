import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

import { parseToolCall, requiresConfirmation, describeAction } from '../src/lib/assistantTools.ts';
import { parseLocalCommand } from '../src/lib/localIntent.ts';

const ROOT = path.join(import.meta.dirname, '..');

function resolve(text: string) {
  const intent = parseLocalCommand(text);
  if (!intent) return null;
  const parsed = parseToolCall(intent.name, intent.args);
  assert.equal(parsed.ok, true, `رُفض ما فُهم محلياً: ${text}`);
  return parsed.ok ? parsed.action : null;
}

/**
 * الحذف الليّن.
 *
 * الحذف في دفتر مالي فعلٌ لا رجعة فيه، وأكثر ما يُحذف يُحذف بالخطأ.
 * فكل «احذف» يصير أرشفة، ولا يقع إتلافٌ إلا من شاشة الأرشيف بتأكيد.
 */

describe('أوامر الحذف والأرشفة بالعامية', () => {
  test('تُفهم محلياً بلا نداء شبكة', () => {
    const cases: Array<[string, 'transaction' | 'contact', string]> = [
      ['حذف فاتورة احمد', 'transaction', 'احمد'],
      ['احذف عملية احمد', 'transaction', 'احمد'],
      ['امسح فاتورة سامي', 'transaction', 'سامي'],
      ['الغي عملية محمود', 'transaction', 'محمود'],
      ['احذف معاملة بتاعة حسن', 'transaction', 'حسن'],
      ['ارشف حساب احمد', 'contact', 'احمد'],
      ['شيل حساب نورهان', 'contact', 'نورهان'],
      ['احذف حساب أحمد', 'contact', 'أحمد'],
    ];
    for (const [text, target, name] of cases) {
      const action = resolve(text);
      assert.ok(action, `لم يُفهم: ${text}`);
      if (action?.tool === 'archiveItem') {
        assert.equal(action.target, target, text);
        assert.equal(action.contactName, name, text);
      } else {
        assert.fail(`${text} لم يُترجم إلى archiveItem`);
      }
    }
  });

  test('لا يوجد أمر حذف نهائي في عقد الأدوات', () => {
    // الإتلاف فعل يدوي في شاشة واحدة. أداةٌ تفعله بجملة تعني أن سوء فهمٍ
    // واحداً من الطراز يُتلف دفتراً.
    const tools = readFileSync(path.join(ROOT, 'src', 'lib', 'assistantTools.ts'), 'utf8');
    assert.ok(!/['"]deleteTransaction['"]/.test(tools));
    assert.ok(!/['"]deleteContact['"]/.test(tools));
  });

  test('الأرشفة تحتاج تأكيداً، ونصّه يقول «الأرشيف» لا «حذف»', () => {
    const action = resolve('احذف فاتورة احمد');
    assert.ok(action);
    if (action) {
      assert.equal(requiresConfirmation(action), true);
      const text = describeAction(action);
      assert.match(text, /الأرشيف/);
      assert.ok(!text.includes('نهائ'), `البطاقة توحي بالإتلاف: ${text}`);
    }
  });

  test('الاسم بلا نوع يذهب إلى الطراز ليسأل', () => {
    // «احذف أحمد» قد تعني حركته أو حسابه كلّه، والفرق كبير.
    assert.equal(parseLocalCommand('احذف احمد'), null);
    assert.equal(parseLocalCommand('مسح حركة'), null);
    assert.equal(parseLocalCommand('احذف'), null);
  });

  test('«افتح الأرشيف» وجهة معروفة', () => {
    const action = resolve('افتح الارشيف');
    assert.ok(action && action.tool === 'navigateTo');
    if (action?.tool === 'navigateTo') assert.equal(action.screen, 'archive');
  });

  test('أمر الحذف لا يُخلط بأمر التسجيل ولو حمل رقماً', () => {
    const action = resolve('احذف فاتورة 500 لسامي');
    assert.ok(action, 'لم يُفهم');
    assert.equal(action?.tool, 'archiveItem', 'فُهم تسجيلَ حركة جديدة');
  });
});

describe('الأرشفة في المخطّط والمستودع والمزوّد', () => {
  const SCHEMA = readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const REPO = readFileSync(path.join(ROOT, 'src', 'lib', 'repository.ts'), 'utf8');
  const PROVIDER = readFileSync(
    path.join(ROOT, 'src', 'store', 'LedgerProvider.tsx'),
    'utf8',
  );

  test('الحركات تحمل علم الأرشفة كجهات الاتصال', () => {
    assert.match(
      SCHEMA,
      /alter table public\.transactions\s+add column if not exists is_archived boolean not null default false/,
    );
    assert.match(
      SCHEMA,
      /alter table public\.transactions\s+add column if not exists archived_at timestamptz/,
    );
  });

  test('المستودع يؤرشف الحركة على الخادم وفي النسخة المحلية', () => {
    const fn = REPO.slice(REPO.indexOf('export async function setTransactionArchived'));
    assert.ok(fn.includes('TABLES.transactions'), 'بلا كتابة على الخادم');
    assert.ok(fn.includes('STORAGE_KEYS.transactions'), 'بلا مزامنة محلية');
    assert.ok(fn.includes('archived_at'), 'بلا وقت أرشفة');
  });

  test('المؤرشفة مستبعدة من المصدر لا من كل مستدعٍ', () => {
    // لو رشّحت كل شاشة بنفسها، نسيَت واحدةٌ يوماً فتسرّبت حركة مؤرشفة
    // إلى رصيد. الاستبعاد مرّة واحدة في المزوّد يمنع ذلك بنيوياً.
    assert.match(
      PROVIDER,
      /const transactions = useMemo\(\s*\(\) => allTransactions\.filter\(\(row\) => !row\.is_archived\)/,
    );
    assert.match(
      PROVIDER,
      /const archivedTransactions = useMemo\(\s*\(\) => allTransactions\.filter\(\(row\) => row\.is_archived\)/,
    );
  });

  test('الإجماليات تُحسب من النشط وحده', () => {
    const totals = PROVIDER.slice(
      PROVIDER.indexOf('const totals = useMemo'),
      PROVIDER.indexOf('const value = useMemo'),
    );
    assert.ok(totals.includes('transactions.filter'), 'الإجماليات لا ترشّح');
    assert.ok(
      !totals.includes('allTransactions'),
      'الإجماليات تقرأ المصفوفة الكاملة، فتعدّ المؤرشف',
    );
  });
});

describe('شاشة الأرشيف', () => {
  const SCREEN = readFileSync(
    path.join(ROOT, 'src', 'screens', 'ArchiveScreen.tsx'),
    'utf8',
  );

  test('لكل عنصر استعادة وحذف نهائي', () => {
    assert.match(SCREEN, /استعادة/);
    assert.match(SCREEN, /حذف نهائي/);
    assert.ok(SCREEN.includes('setTransactionArchivedState('));
    assert.ok(SCREEN.includes('removeTransaction('));
    assert.ok(SCREEN.includes('setArchived('));
    assert.ok(SCREEN.includes('removeContact('));
  });

  test('الحذف النهائي وحده يحمل تحذير اللارجعة', () => {
    assert.ok(SCREEN.includes('لا يمكن التراجع بعدها'));
  });

  test('حذف الحساب يذكر عدد حركاته، والمؤرشفة منها محسوبة', () => {
    const fn = SCREEN.slice(SCREEN.indexOf('async function purgeContact'));
    assert.ok(fn.includes('archivedTransactions.filter'), 'العدّ يغفل المؤرشفة');
    assert.match(fn, /\$\{count\} حركة/);
  });

  test('الإتلاف لا يقع إلا هنا', () => {
    // الشاشات الأخرى تؤرشف؛ `removeTransaction`/`removeContact` لا
    // يُستدعيان خارج الأرشيف.
    for (const file of [
      'src/screens/HomeScreen.tsx',
      'src/screens/ContactProfileScreen.tsx',
    ]) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        !/await removeTransaction\(|await removeContact\(/.test(source),
        `${file} يحذف نهائياً خارج شاشة الأرشيف`,
      );
    }
  });
});

describe('ترويسات CORS', () => {
  const SHARED = readFileSync(
    path.join(ROOT, 'supabase', 'functions', '_shared', 'gemini.ts'),
    'utf8',
  );
  const EDGE = readFileSync(
    path.join(ROOT, 'supabase', 'functions', 'assistant', 'index.ts'),
    'utf8',
  );

  test('الترويسات الثلاث حاضرة على كل استجابة', () => {
    const fn = SHARED.slice(
      SHARED.indexOf('export function corsHeadersFor'),
      SHARED.indexOf('export function originOf'),
    );
    assert.match(fn, /'Access-Control-Allow-Origin': '\*'/);
    assert.match(fn, /'Access-Control-Allow-Headers':/);
    assert.match(fn, /authorization, x-client-info, apikey, content-type/);
    assert.match(fn, /'Access-Control-Allow-Methods': 'POST, OPTIONS'/);
  });

  test('preflight يردّ بالترويسات نفسها', () => {
    assert.match(SHARED, /export function handleOptions[\s\S]*?corsHeadersFor\(origin\)/);
    assert.ok(EDGE.includes("request.method === 'OPTIONS'"));
    assert.ok(EDGE.includes('return handleOptions(origin)'));
  });

  test('استجابات الخطأ تحمل الترويسات أيضاً', () => {
    // بلا ذلك يرى المتصفّح «CORS error» غامضاً بدل رسالتنا — وهو العطب
    // المُبلَّغ عنه.
    assert.match(
      SHARED,
      /headers: \{ \.\.\.corsHeadersFor\(origin\), 'Content-Type': 'application\/json' \}/,
    );
  });

  test('الأصل المرفوض يُردّ عليه بجسم مقروء لا بصمت', () => {
    assert.ok(EDGE.includes('ORIGIN_NOT_ALLOWED'));
    assert.ok(EDGE.includes('isOriginAllowed(origin)'));
  });
});

describe('اقتطاع الاسم لا يقطع الأسماء', () => {
  test('«ال» و«ل» لا تُحذفان من داخل الاسم', () => {
    // العطب الذي وقع: «أحمد عبد الرحمن» صارت «احمد عبد رحمن» فلم تطابق
    // أحداً في الدفتر، فلم يُؤرشف شيء ولم يُقل للمستخدم لماذا.
    const intent = parseLocalCommand('شيل حساب احمد عبد الرحمن');
    assert.ok(intent);
    assert.equal(intent?.args.contactName, 'احمد عبد الرحمن');
  });

  test('اسم يبدأ بلام يبقى كما هو', () => {
    const intent = parseLocalCommand('ارشف حساب ليلى');
    assert.equal(intent?.args.contactName, 'ليلى');
  });

  test('أدوات الجرّ المنفصلة تُحذف', () => {
    assert.equal(
      parseLocalCommand('احذف فاتورة بتاعة حسن')?.args.contactName,
      'حسن',
    );
  });
});

describe('مطابقة الأسماء تطوي صور الحروف', () => {
  const HOOK = readFileSync(
    path.join(ROOT, 'src', 'hooks', 'useAppAssistant.ts'),
    'utf8',
  );

  test('المطابِق يطوي قبل المقارنة', () => {
    // بلا الطيّ يُنشأ حسابٌ ثانٍ لـ«احمد» بجانب «أحمد»، أو لا يجد
    // المساعد من يؤرشفه فلا يفعل شيئاً.
    const fn = HOOK.slice(
      HOOK.indexOf('function matchByName'),
      HOOK.indexOf('let counter'),
    );
    assert.match(fn, /foldArabic\(sanitizeLine\(query\)\)/);
    assert.match(fn, /foldArabic\(sanitizeLine\(label\(item\)\)\)/);
  });
});

describe('دفتر الشخص يستبعد المؤرشف أيضاً', () => {
  const REPO = readFileSync(path.join(ROOT, 'src', 'lib', 'repository.ts'), 'utf8');

  test('استعلام الخادم يرشّح is_archived', () => {
    // هذه الشاشة تقرأ من استعلامها الخاص لا من مصفوفة المزوّد، فترشيحُها
    // هناك وحده كان يترك حركةً مؤرشفة تظهر في دفتر الشخص وتُحسب رصيده.
    const fn = REPO.slice(
      REPO.indexOf('export async function fetchContactLedger'),
      REPO.indexOf('async function persist'),
    );
    assert.match(fn, /\.eq\('is_archived', false\)/);
  });

  test('النسخة المحلية ترشّح كذلك', () => {
    const fn = REPO.slice(
      REPO.indexOf('async function loadLocalContactLedger'),
      REPO.indexOf('export async function fetchContactLedger'),
    );
    assert.match(fn, /!transaction\.is_archived/);
  });
});
