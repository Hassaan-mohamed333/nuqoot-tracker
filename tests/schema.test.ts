import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

/**
 * تأكيدات ثابتة على المخطط وعلى الملفات المتتبَّعة.
 *
 * لا تتصل بقاعدة بيانات: بيئة التكامل المستمر لا تملك مشروع Supabase،
 * وفحص RLS الحقيقي يحتاج جلستَي مستخدمين (النصّ الجاهز في SECURITY.md).
 * ما تضمنه هذه الاختبارات هو ألّا يُضاف جدولٌ بلا RLS ولا سياسةٌ بلا شرط
 * ملكية — وهو الخطأ الذي يقع فعلاً عند إضافة ميزة جديدة على عجل.
 */

const ROOT = path.join(import.meta.dirname, '..');
const SCHEMA = readFileSync(
  path.join(ROOT, 'supabase', 'schema.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

/** كل جدول في مخطط public. */
function declaredTables(): string[] {
  const matches = SCHEMA.matchAll(
    /create table if not exists public\.([a-z_]+)/g,
  );
  return [...new Set([...matches].map((match) => match[1]))];
}

interface Policy {
  name: string;
  table: string;
  body: string;
}

/**
 * السياسات الفعّالة بعد تشغيل الملف كاملاً بالترتيب.
 *
 * الملف يعيد تعريف بعض السياسات للتشديد، ويحذف أخرى حين تحلّ محلّها سياسات
 * العضوية؛ فنتتبّع الإنشاء والحذف معاً بدل قراءة كل create policy وكأنها حيّة.
 */
function livePolicies(): Policy[] {
  const live = new Map<string, Policy>();
  const pattern =
    /create policy "([a-z_]+)" on public\.([a-z_]+)([\s\S]*?);\n|drop policy if exists "([a-z_]+)" on public\.[a-z_]+;/g;
  for (const match of SCHEMA.matchAll(pattern)) {
    if (match[1]) {
      live.set(match[1], { name: match[1], table: match[2], body: match[3] });
    } else {
      live.delete(match[4]);
    }
  }
  return [...live.values()];
}

/** آخر تعريف لكل سياسة فعّالة. */
function policyBodies(): Map<string, string> {
  return new Map(livePolicies().map((policy) => [policy.name, policy.body]));
}

/** سياسات العضوية: تقيس الانتماء لمناسبة لا ملكية الصف. */
function isMembershipPolicy(name: string): boolean {
  return (
    name.includes('_member_') ||
    name === 'event_members_owner_update' ||
    name === 'event_members_remove'
  );
}

/** جداول بلا أي وصول من العميل: RLS مفعّل وبلا سياسات، والدخول بالدوال فقط. */
const NO_CLIENT_ACCESS = ['event_invites'];

describe('أمن الصفوف في المخطط', () => {
  test('كل جدول يفعّل RLS', () => {
    for (const table of declaredTables()) {
      assert.ok(
        SCHEMA.includes(`alter table public.${table} enable row level security`),
        `الجدول ${table} بلا RLS`,
      );
    }
  });

  test('كل جدول له سياسة ملكية أو عضوية', () => {
    const live = livePolicies();
    for (const table of declaredTables()) {
      const own = live.filter((policy) => policy.table === table);
      if (NO_CLIENT_ACCESS.includes(table)) {
        assert.equal(
          own.length,
          0,
          `الجدول ${table} للدوال فقط ولا يجوز أن تكون له سياسات عميل`,
        );
        continue;
      }
      assert.ok(
        own.some(
          (policy) =>
            policy.name === `${table}_owner` || isMembershipPolicy(policy.name),
        ),
        `الجدول ${table} بلا سياسة ملكية ولا عضوية`,
      );
    }
  });

  /**
   * عمود المالك في كل جدول.
   *
   * `profiles` صفّ واحد لكل مستخدم ومفتاحه هو معرّفه في auth.users، فلا
   * عمود user_id فيه — الملكية تُقارن بالمفتاح الأساسي نفسه، وهو قيد
   * أقوى لا أضعف: يستحيل وجود صفّين لشخص واحد أصلاً.
   */
  const OWNER_COLUMN: Record<string, string> = { profiles_owner: 'id' };

  test('كل سياسة تقيّد القراءة والكتابة بالمالك أو بالعضوية', () => {
    for (const [name, body] of policyBodies()) {
      const flat = body.replace(/\s+/g, ' ');
      const command = /for (select|insert|update|delete|all)/.exec(body)?.[1];
      const writes = command === 'insert' || command === 'update' || command === 'all';

      if (isMembershipPolicy(name)) {
        assert.ok(
          flat.includes('is_event_member('),
          `سياسة العضوية ${name} لا تستدعي is_event_member`,
        );
        if (writes) {
          assert.ok(
            flat.includes('with check'),
            `السياسة ${name} بلا with check — يمكن الكتابة لمناسبة غيرك`,
          );
        }
        continue;
      }

      const column = OWNER_COLUMN[name] ?? 'user_id';
      assert.ok(
        body.includes(`using (auth.uid() = ${column})`),
        `السياسة ${name} لا تقيّد القراءة بالمالك`,
      );
      assert.ok(
        body.includes('with check'),
        `السياسة ${name} بلا with check — يمكن الكتابة لحساب غيرك`,
      );
      assert.ok(
        flat.includes(`with check ( auth.uid() = ${column}`) ||
          flat.includes(`with check (auth.uid() = ${column}`),
        `السياسة ${name} لا تتحقّق من المالك عند الكتابة`,
      );
    }
  });

  test('الجداول المرتبطة تتحقّق من ملكية ما تشير إليه', () => {
    // فحص المفتاح الأجنبي لا يمرّ عبر RLS، فبدون هذا يمكن ربط صفّك
    // بمناسبة أو مصروف يملكه غيرك.
    const bodies = policyBodies();
    for (const name of ['transactions_owner', 'events_owner']) {
      const body = bodies.get(name) ?? '';
      assert.notEqual(body, '', `السياسة ${name} غير موجودة`);
      assert.ok(
        body.includes('exists (') && body.includes('user_id = auth.uid()'),
        `السياسة ${name} لا تتحقّق من ملكية المراجع`,
      );
    }
    // في المناسبات المشتركة المرجع يُفحص بالانتماء إلى المناسبة نفسها.
    for (const name of [
      'event_participants_member_insert',
      'shared_expenses_member_insert',
      'expense_shares_member_insert',
    ]) {
      const body = (bodies.get(name) ?? '').replace(/\s+/g, ' ');
      assert.notEqual(body, '', `السياسة ${name} غير موجودة`);
      assert.ok(
        body.includes('is_event_member(') && body.includes('auth.uid() = user_id'),
        `السياسة ${name} لا تختم المنشئ ولا تتحقّق من العضوية`,
      );
    }
  });
});

describe('تخزين الإيصالات', () => {
  test('الدلو خاص لا عام', () => {
    assert.ok(
      /insert into storage\.buckets[\s\S]*?values \('receipts', 'receipts', false\)/.test(
        SCHEMA,
      ),
      'دلو الإيصالات ليس خاصاً',
    );
  });

  test('سياسات التخزين تحصر كل مستخدم في مجلده', () => {
    for (const action of ['read', 'insert', 'delete']) {
      const policy = new RegExp(
        `create policy "receipts_${action}_own"[\\s\\S]*?storage\\.foldername\\(name\\)\\)\\[1\\] = auth\\.uid\\(\\)::text`,
      );
      assert.ok(policy.test(SCHEMA), `سياسة receipts_${action}_own غير محكمة`);
    }
  });

  test('أعضاء المناسبة يقرؤون فاتورة مصروف يرونه، لا أي ملف', () => {
    const body = SCHEMA.match(
      /create policy "receipts_read_event_member" on storage\.objects([\s\S]*?);\n/,
    )?.[1].replace(/\s+/g, ' ');
    assert.ok(body, 'سياسة قراءة الأعضاء للفواتير غير موجودة');
    assert.ok(body.includes('for select'), 'يجب أن تكون للقراءة فقط');
    assert.ok(body.includes("bucket_id = 'receipts'"), 'غير محصورة في دلو الفواتير');
    // الربط بمصروف حقيقي والعضوية معاً: أيّ شرط وحده يفتح ملفات غير مقصودة.
    assert.ok(body.includes('e.receipt_url = storage.objects.name'), 'غير مربوطة بمصروف');
    assert.ok(body.includes('is_event_member(e.event_id)'), 'لا تتحقق من العضوية');
  });

  test('الدلو محدود الحجم والأنواع', () => {
    assert.ok(SCHEMA.includes('file_size_limit'), 'لا سقف لحجم الرفع');
    assert.ok(SCHEMA.includes('allowed_mime_types'), 'لا قائمة أنواع مسموحة');
    assert.ok(
      !/allowed_mime_types[\s\S]{0,120}text\/html/.test(SCHEMA),
      'HTML مسموح في دلو الإيصالات',
    );
  });
});

describe('الأسرار في المستودع', () => {
  test('لا سرّ في الملفات المتتبَّعة', () => {
    // الفحص نفسه المستعمل في npm test؛ فشلُه هنا يعني تسريباً وشيكاً.
    execFileSync('node', [path.join(ROOT, 'scripts', 'check-secrets.js')], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  });

  test('كل صور .env متجاهَلة عدا النموذج', () => {
    const ignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    assert.ok(ignore.includes('.env*'), '.gitignore لا يغطي كل صور .env');
    assert.ok(ignore.includes('!.env.example'), 'النموذج مستثنى بالخطأ');
  });

  test('النموذج يوثّق كل متغيّرات العميل', () => {
    const example = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    for (const name of [
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY',
      'GEMINI_API_KEY',
      'ALLOWED_ORIGINS',
    ]) {
      assert.ok(example.includes(name), `${name} غير موثّق في .env.example`);
    }
  });
});

describe('المناسبات المشتركة', () => {
  const FUNCTIONS = [
    'event_role',
    'is_event_member',
    'add_event_owner',
    'set_participant_shown_name',
    'transfer_events_before_user_delete',
    'create_event_invite',
    'join_event_by_code',
    'revoke_event_invites',
    'event_member_names',
  ];

  /** متن دالة: من create or replace function إلى $$; الختامية. */
  function functionBody(name: string): string {
    const start = SCHEMA.indexOf(`create or replace function public.${name}(`);
    assert.notEqual(start, -1, `الدالة ${name} غير معرَّفة`);
    const end = SCHEMA.indexOf('$$;', SCHEMA.indexOf('as $$', start));
    return SCHEMA.slice(start, end);
  }

  test('كل دالة security definer بمسار بحث مثبَّت', () => {
    for (const name of FUNCTIONS) {
      const body = functionBody(name);
      assert.ok(body.includes('security definer'), `${name} ليست security definer`);
      assert.ok(
        /set search_path = /.test(body),
        `${name} بلا search_path مثبَّت: تُختطف بكائن بالاسم نفسه`,
      );
    }
  });

  test('الدوال القابلة للاستدعاء مسحوبة من anon', () => {
    const callable = FUNCTIONS.filter(
      (name) =>
        !['add_event_owner', 'set_participant_shown_name'].includes(name),
    );
    for (const name of callable) {
      const pattern = new RegExp(
        `revoke all on function public\\.${name}\\([^)]*\\)\\s+from public, anon`,
      );
      assert.ok(pattern.test(SCHEMA), `${name} قابلة للاستدعاء من anon`);
    }
  });

  test('الجداول الجديدة تفعّل RLS', () => {
    for (const table of ['event_members', 'event_invites']) {
      assert.ok(
        SCHEMA.includes(`alter table public.${table} enable row level security`),
        `الجدول ${table} بلا RLS`,
      );
    }
  });

  test('لا إدراج مباشر في event_members: الانضمام بالكود وحده', () => {
    const inserts = livePolicies().filter(
      (policy) =>
        policy.table === 'event_members' && /for insert/.test(policy.body),
    );
    assert.deepEqual(inserts, [], 'سياسة insert تفتح الانضمام بلا دعوة');
  });

  test('مالك واحد لكل مناسبة بقيد فريد', () => {
    assert.ok(
      /create unique index if not exists event_members_one_owner_uniq[\s\S]*?where role = 'owner'/.test(
        SCHEMA,
      ),
      'لا قيد يمنع تعدد المالكين',
    );
  });

  test('الدعوة تُخزَّن مُبصَّمة لا خاماً', () => {
    assert.ok(SCHEMA.includes('code_hash text not null unique'), 'لا بصمة للكود');
    const body = functionBody('create_event_invite');
    assert.ok(
      body.includes("encode(digest(v_code, 'sha256'), 'hex')"),
      'الكود لا يُبصَّم قبل التخزين',
    );
  });

  test('جهات الاتصال والحركات الشخصية لا تُفتح للأعضاء', () => {
    for (const policy of livePolicies()) {
      if (policy.table === 'contacts' || policy.table === 'transactions') {
        assert.ok(
          !policy.body.includes('is_event_member('),
          `${policy.name} تكشف بيانات شخصية لأعضاء المناسبة`,
        );
      }
    }
  });

  test('الكتابة في الدفتر الجماعي تتطلب دور editor على الأقل', () => {
    for (const policy of livePolicies()) {
      if (!policy.name.includes('_member_')) continue;
      if (/for (insert|update|delete)/.test(policy.body)) {
        assert.ok(
          policy.body.includes("'editor'") || policy.body.includes("'owner'"),
          `${policy.name} تسمح لـ viewer بالكتابة`,
        );
      }
    }
  });

  test('حذف حساب المالك ينقل المناسبة إلى محرّر لا يحذفها', () => {
    assert.ok(
      /create trigger users_transfer_events\s+before delete on auth\.users/.test(
        SCHEMA,
      ),
      'لا trigger ينقل المناسبات قبل حذف الحساب',
    );
    const body = functionBody('transfer_events_before_user_delete');
    assert.ok(
      body.includes("(m.role = 'editor') desc"),
      'المحرّر لا يُفضَّل على غيره عند النقل',
    );
    assert.ok(
      body.includes('update public.events set user_id = v_target'),
      'ملكية المناسبة لا تنتقل',
    );
    // الحذف قبل الترقية، وإلا اصطدم القيد الفريد (مالكان معاً).
    assert.ok(
      body.indexOf('delete from public.event_members') <
        body.indexOf("set role = 'owner'"),
      'ترقية المالك الجديد قبل إزالة القديم تخرق قيد المالك الواحد',
    );
  });

  test('اسم المشارك يضبطه الخادم لا العميل', () => {
    assert.ok(
      /create trigger event_participants_shown_name\s+before insert or update/.test(
        SCHEMA,
      ),
      'اسم المشارك المعروض لا يضبطه trigger',
    );
  });
});
