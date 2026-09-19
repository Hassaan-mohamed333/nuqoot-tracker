/**
 * مفسّر أوامر عربي يعمل على الجهاز، بلا خادم ولا مفتاح.
 *
 * ---------------------------------------------------------------------
 * **لماذا يوجد**: المساعد كان يعتمد على دالّة الحافة وحدها، فإن لم تكن
 * منشورة أو انقطعت الشبكة أو كان التطبيق في الوضع المحلي، فشل أبسط أمر:
 * «سجل 50 لأحمد». والحال أن هذا الأمر لا يحتاج نموذجاً لغوياً أصلاً —
 * بنيته ثابتة: فعل، ورقم، واسم.
 *
 * فالترتيب صار: نحاول محلياً أوّلاً للأنماط الواضحة، ولا نذهب إلى
 * الخادم إلا لما يحتاج فهماً حقيقياً. النتيجة أسرع وأرخص وتعمل بلا شبكة.
 *
 * **ولا يُلغي بوّابة التأكيد**: ما يخرج من هنا اقتراحٌ يمرّ على
 * `parseToolCall` ثم على موافقة المستخدم، تماماً كاقتراح الطراز.
 * ---------------------------------------------------------------------
 */

import { normalizeDigits, sanitizeLine } from '@/lib/validation';

/** ما يفهمه المفسّر المحلي: نداء أداة جاهز، أو لا شيء. */
export interface LocalIntent {
  name: 'createTransaction' | 'navigateTo' | 'archiveItem';
  args: Record<string, unknown>;
  /** وصف عربي لما فُهم، للعرض في سجلّ المحادثة. */
  summary: string;
}

/**
 * يوحّد الحروف التي تختلف كتابتها ولا تختلف دلالتها.
 *
 * «أحمد» و«احمد» شخص واحد، و«سارة» و«ساره» كذلك. بلا التوحيد يفشل
 * المطابقة مع الدفتر ويُنشأ حسابٌ ثانٍ للشخص نفسه.
 */
export function foldArabic(text: string): string {
  return text
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/[ً-ْـ]/g, ''); // تشكيل وتطويل
}

/** أفعال تدلّ على أن المستخدم دفع. */
const OUT_VERBS = [
  'دفعت', 'ادفع', 'أعطيت', 'اعطيت', 'ادّيت', 'اديت', 'ادي', 'نقّطت',
  'نقطت', 'صرفت', 'سلّمت', 'سلمت', 'حوّلت', 'حولت', 'ودّيت', 'وديت',
];

/** أفعال تدلّ على أن المستخدم استلم. */
const IN_VERBS = [
  'استلمت', 'قبضت', 'أخذت', 'اخذت', 'وصلني', 'جالي', 'جاني', 'حصّلت',
  'حصلت', 'قبضنا', 'نقّطني', 'نقطني', 'ادّاني', 'اداني', 'أعطاني', 'اعطاني',
];

/** أفعال التسجيل المحايدة: لا تحمل اتجاهاً بذاتها. */
const RECORD_VERBS = ['سجل', 'سجّل', 'اكتب', 'أضف', 'اضف', 'ضيف', 'قيّد', 'قيد'];

/** وحدات العملة الملتصقة بالرقم أو التالية له. */
const CURRENCY_WORDS = [
  'جنيه', 'جنيهات', 'ج', 'جم', 'ريال', 'درهم', 'دولار', 'egp', 'sar', 'aed', 'usd',
];

/**
 * الأدوات التي يأتي بعدها اسم الشخص.
 *
 * الترتيب مقصود: «باسم» و«لحساب» قبل «لـ» المفردة، وإلا التقطت اللام
 * الأولى وقطعت الاسم.
 *
 * ولام الجرّ مسبوقة بـ `(?:^|\s)` لا بـ `\b`: حدود الكلمات في
 * JavaScript مبنيّة على `[A-Za-z0-9_]`، فكل حرف عربي عندها «غير كلمة»
 * ولا تنشأ بينها حدود أصلاً. بدون هذا القيد التقطت اللامُ لامَ «سجّل»
 * نفسها، فصار اسم الشخص في «سجل 500 لسامي» هو «500 لسامي».
 */
const NAME_MARKERS: { pattern: RegExp; direction: 'IN' | 'OUT' | null }[] = [
  {
    pattern: /(?:^|\s)(?:باسم|بإسم|لحساب|على حساب|لصالح)\s+(.+)$/u,
    direction: null,
  },
  { pattern: /(?:^|\s)(?:من عند|من)\s+(.+)$/u, direction: 'IN' },
  { pattern: /(?:^|\s)(?:إلى|الى)\s+(.+)$/u, direction: 'OUT' },
  // اللام الملتصقة: «لسامي». تلزمها بداية كلمة وحرفٌ بعدها.
  { pattern: /(?:^|\s)ل\s*(\p{L}.*)$/u, direction: 'OUT' },
];

/**
 * كلمات تُنهي الاسم: بقايا الجملة لا جزء منه.
 *
 * تُغلَق بـ `(?=\s|$)` لا بـ `\b` للسبب نفسه أعلاه.
 */
const NAME_TAIL = new RegExp(
  `\\s+(?:${['نقوط', 'نقطه', 'نقطة', 'واجب', 'هديه', 'هدية', 'عن', 'عشان', 'علشان', 'بسبب', 'مقابل']
    .join('|')})(?=\\s|$).*$`,
  'u',
);

/**
 * يحذف وحدات العملة، ملتصقةً بالرقم أو منفصلة.
 *
 * `(?![\p{L}])` بدل `\b`: «ج» في «50ج» لا تنشأ حولها حدود كلمات في
 * JavaScript، فكانت لا تُحذف. واللاحقة تمنع ابتلاع «جنيه» لأوّل «ج» في
 * اسمٍ يبدأ بها.
 */
function stripCurrency(text: string): string {
  const words = CURRENCY_WORDS.join('|');
  return text
    .replace(new RegExp(`(\\d)\\s*(?:${words})(?![\\p{L}])`, 'giu'), '$1 ')
    .replace(
      new RegExp(`(?:^|\\s)(?:${words})(?![\\p{L}])`, 'giu'),
      ' ',
    );
}

/** أوّل مبلغ موجب في الجملة. */
function extractAmount(text: string): number | null {
  const match = text.match(/\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function hasAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => text.includes(word));
}

/** الاتجاه من الأفعال وحدها؛ `null` إن لم يُذكر أو تعارض. */
function directionFromVerbs(text: string): 'IN' | 'OUT' | null {
  const out = hasAny(text, OUT_VERBS);
  const inbound = hasAny(text, IN_VERBS);
  // عند اجتماع الإشارتين لا نخمّن: الجملة أعقد من هذا المفسّر.
  if (out && !inbound) return 'OUT';
  if (inbound && !out) return 'IN';
  return null;
}

/** يقتطع اسم الشخص وما دلّت عليه أداته من اتجاه. */
function extractName(text: string): { name: string; direction: 'IN' | 'OUT' | null } | null {
  for (const marker of NAME_MARKERS) {
    const match = marker.pattern.exec(text);
    if (!match) continue;

    let name = match[1].replace(NAME_TAIL, '').trim();
    // «لأحمد» تُكتب ملتصقة، فتبقى اللام في أوّل الاسم بعد القطع.
    name = name.replace(/^(?:\s|[،,.])+/u, '').trim();
    if (name.length < 2) continue;

    return { name, direction: marker.direction };
  }
  return null;
}

/**
 * يفهم أمراً عربياً شائعاً بلا نموذج لغوي.
 *
 * يعيد `null` لكل ما ليس واضحاً بما يكفي — وهو الحدّ الفاصل: الغموض
 * يذهب إلى الطراز، لا إلى تخمينٍ محلّي يكتب في الدفتر.
 */
export function parseLocalCommand(raw: string): LocalIntent | null {
  const clean = sanitizeLine(raw);
  if (!clean) return null;

  const folded = foldArabic(normalizeDigits(clean)).toLowerCase();

  // ---- تنقّل: أوامر قصيرة لا تستحقّ نداء شبكة ----
  const navigation = parseNavigation(folded);
  if (navigation) return navigation;

  // ---- حذف/أرشفة ----
  // قبل مسار التسجيل: «احذف فاتورة 500 لأحمد» تحمل رقماً أيضاً، وأولوية
  // الفعل هنا تمنع تفسيرها تسجيلَ حركة جديدة.
  const archive = parseArchive(normalizeDigits(clean));
  if (archive) return archive;

  // ---- تسجيل حركة ----
  const amount = extractAmount(stripCurrency(folded));
  if (amount === null) return null;

  const verbDirection = directionFromVerbs(folded);
  const isRecord = hasAny(folded, RECORD_VERBS);
  // لا فعل ولا اتجاه: ليست جملة أمرٍ بالتسجيل، بل ربّما سؤال عن رقم.
  if (!verbDirection && !isRecord) return null;

  // الاسم يُقتطع من النصّ الأصلي لا المطويّ: المطويّ يشوّه حروفه.
  const found = extractName(normalizeDigits(clean));
  if (!found) return null;

  /*
   * أولوية الاتجاه: الفعل ثم الأداة.
   *
   * «استلمت 500 من سامي» فعلٌ صريح. «سجل 500 لسامي» لا فعل فيه، واللام
   * تدلّ على أن المال ذهب إليه. و«سجل 50 باسم أحمد» لا فعل ولا أداة
   * اتجاه — والافتراض في دفتر نقوط أن التسجيل لما دفعتَه، وهو ما تعرضه
   * بطاقة التأكيد قبل الكتابة فيصحّحه المستخدم بنقرة.
   */
  const direction = verbDirection ?? found.direction ?? 'OUT';

  return {
    name: 'createTransaction',
    args: {
      amount,
      direction,
      contactName: found.name,
    },
    summary: `${direction === 'OUT' ? 'دفعت' : 'استلمت'} ${amount} — ${found.name}`,
  };
}

/**
 * أفعال الحذف والأرشفة.
 *
 * كلّها تُترجم إلى أرشفة: الحذف في دفتر مالي لا رجعة فيه، وأكثر ما
 * يُحذف يُحذف بالخطأ. والمستخدم يقول «احذف» ويقصد «اخرجها من حسابي»،
 * لا «أتلفها إلى الأبد» — والفرق يظهر له في بطاقة التأكيد.
 */
const ARCHIVE_VERBS = [
  'احذف', 'أحذف', 'حذف', 'امسح', 'أمسح', 'مسح', 'الغي', 'ألغِ', 'الغاء',
  'إلغاء', 'شيل', 'ارشف', 'أرشف', 'ارشيف', 'اخفي', 'أخفِ', 'كنسل',
];

/** ما يدلّ على أن المقصود حركة بعينها. */
const TRANSACTION_NOUNS = [
  'فاتوره', 'فاتورة', 'عمليه', 'عملية', 'حركه', 'حركة', 'معامله', 'معاملة',
  'نقطه', 'نقطة', 'مبلغ', 'قيد',
];

/** ما يدلّ على أن المقصود الحساب كلّه. */
const CONTACT_NOUNS = [
  'حساب', 'الحساب', 'جهه', 'جهة', 'شخص', 'الشخص', 'كارت', 'ملف',
];

/**
 * يقتطع اسم الشخص من أمر أرشفة.
 *
 * بنية الأمر: فعل + اسم النوع + الاسم. فنحذف الفعل والنوع وأدوات الجرّ
 * الشائعة وما يبقى هو الاسم. ولا نستعمل `NAME_MARKERS` هنا: «احذف
 * فاتورة احمد» لا أداة جرّ فيها أصلاً.
 */
function extractArchiveName(text: string): string | null {
  let rest = text;
  const drop = [...ARCHIVE_VERBS, ...TRANSACTION_NOUNS, ...CONTACT_NOUNS];

  for (const word of drop) {
    rest = rest.replace(
      new RegExp(`(?:^|\\s)${word}(?=\\s|$)`, 'gu'),
      ' ',
    );
  }

  /*
   * أدوات الجرّ المنفصلة وحدها تُحذف.
   *
   * ولا تُمَسّ «ال» ولا اللام الملتصقة: كان حذفهما يقطع أسماءً حقيقية —
   * «أحمد عبد الرحمن» صارت «احمد عبد رحمن» فلم تطابق أحداً في الدفتر،
   * فلم يحدث شيء. و«ليلى» كانت ستصير «يلى». وما يبقى ملتصقاً يعالجه
   * المطابِق بالطيّ، وهو أسلم من القصّ.
   */
  rest = rest
    .replace(
      /(?:^|\s)(?:بتاع|بتاعة|بتاعت|بتاعه|حق|الخاص ب|الخاصه ب|مع|من|عند)(?=\s)/gu,
      ' ',
    )
    .replace(/\s+/gu, ' ')
    .trim();

  return rest.length >= 2 ? rest : null;
}

/** يفهم أمر حذف أو أرشفة، إن كان واضح النوع والاسم. */
function parseArchive(text: string): LocalIntent | null {
  const folded = foldArabic(text).toLowerCase();
  if (!hasAny(folded, ARCHIVE_VERBS.map(foldArabic))) return null;

  const wantsContact = hasAny(folded, CONTACT_NOUNS.map(foldArabic));
  const wantsTransaction = hasAny(folded, TRANSACTION_NOUNS.map(foldArabic));
  // بلا اسم نوع لا نخمّن: «احذف أحمد» قد تعني حركته أو حسابه كلّه،
  // والفرق بينهما كبير. تذهب إلى الطراز ليسأل.
  if (wantsContact === wantsTransaction) return null;

  const name = extractArchiveName(text);
  if (!name) return null;

  const target = wantsContact ? 'contact' : 'transaction';
  return {
    name: 'archiveItem',
    args: { target, contactName: name },
    summary:
      target === 'contact'
        ? `أرشفة حساب ${name}`
        : `أرشفة آخر حركة لـ${name}`,
  };
}

/** وجهات يذكرها المستخدم بأسمائها الشائعة. */
const NAV_WORDS: { words: string[]; screen: string }[] = [
  { words: ['الارشيف', 'المحذوفات', 'ارشيف'], screen: 'archive' },
  { words: ['جهات الاتصال', 'الاشخاص', 'جهات'], screen: 'contacts' },
  { words: ['المناسبات', 'مناسبات'], screen: 'events' },
  { words: ['الرئيسيه', 'الرئيسية', 'الصفحه الرئيسيه', 'البدايه'], screen: 'home' },
];

const OPEN_VERBS = ['افتح', 'اعرض', 'وريني', 'روح', 'انتقل', 'ودّيني', 'وديني'];

function parseNavigation(folded: string): LocalIntent | null {
  if (!hasAny(folded, OPEN_VERBS)) return null;
  for (const target of NAV_WORDS) {
    if (hasAny(folded, target.words.map(foldArabic))) {
      return {
        name: 'navigateTo',
        args: { screen: target.screen },
        summary: `فتح ${target.words[0]}`,
      };
    }
  }
  return null;
}
