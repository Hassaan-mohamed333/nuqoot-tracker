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
const SCHEMA = readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');

/** كل جدول في مخطط public. */
function declaredTables(): string[] {
  const matches = SCHEMA.matchAll(
    /create table if not exists public\.([a-z_]+)/g,
  );
  return [...new Set([...matches].map((match) => match[1]))];
}

/** آخر تعريف لكل سياسة (الملف يعيد تعريف بعضها للتشديد). */
function policyBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  const pattern = /create policy "([a-z_]+)" on public\.([a-z_]+)([\s\S]*?);\n/g;
  for (const match of SCHEMA.matchAll(pattern)) {
    bodies.set(match[1], match[3]);
  }
  return bodies;
}

describe('أمن الصفوف في المخطط', () => {
  test('كل جدول يفعّل RLS', () => {
    for (const table of declaredTables()) {
      assert.ok(
        SCHEMA.includes(`alter table public.${table} enable row level security`),
        `الجدول ${table} بلا RLS`,
      );
    }
  });

  test('كل جدول له سياسة ملكية', () => {
    const policies = [...policyBodies().keys()].join(' ');
    for (const table of declaredTables()) {
      assert.ok(
        policies.includes(`${table}_owner`),
        `الجدول ${table} بلا سياسة ملكية`,
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

  test('كل سياسة تقيّد القراءة والكتابة بالمالك', () => {
    for (const [name, body] of policyBodies()) {
      const column = OWNER_COLUMN[name] ?? 'user_id';
      assert.ok(
        body.includes(`using (auth.uid() = ${column})`),
        `السياسة ${name} لا تقيّد القراءة بالمالك`,
      );
      assert.ok(
        body.includes('with check'),
        `السياسة ${name} بلا with check — يمكن الكتابة لحساب غيرك`,
      );
      // المسافات تختلف بين سياسة بسيطة وأخرى متعدّدة الشروط، فنوحّدها
      // قبل المطابقة بدل تثبيت شكل التنسيق في الاختبار.
      const flat = body.replace(/\s+/g, ' ');
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
    const linked = [
      'transactions_owner',
      'events_owner',
      'event_participants_owner',
      'shared_expenses_owner',
      'expense_shares_owner',
    ];
    for (const name of linked) {
      const body = bodies.get(name) ?? '';
      assert.notEqual(body, '', `السياسة ${name} غير موجودة`);
      assert.ok(
        body.includes('exists (') && body.includes('user_id = auth.uid()'),
        `السياسة ${name} لا تتحقّق من ملكية المراجع`,
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
