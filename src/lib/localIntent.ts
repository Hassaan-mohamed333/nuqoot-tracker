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
  name:
    | 'createTransaction'
    | 'navigateTo'
    | 'archiveItem'
    | 'createContact'
    | 'createEvent'
    | 'addEventGuest'
    | 'createEventInvite'
    | 'getBalance';
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

  // ---- إنشاء وأسئلة: مناسبة جديدة، جهة اتصال، رصيد، دعوة ----
  const created = parseCreation(normalizeDigits(clean));
  if (created) return created;

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
  { words: ['الملف الشخصي', 'ملفي الشخصي', 'بياناتي', 'حسابي الشخصي'], screen: 'profile' },
  { words: ['انضمام', 'الانضمام', 'كود دعوه', 'كود الدعوه'], screen: 'joinEvent' },
  { words: ['الادخال الذكي', 'ادخال ذكي', 'الإدخال الذكي'], screen: 'smartInput' },
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

// ---------------------------------------------------------------------
// أوامر الإنشاء والأسئلة
// ---------------------------------------------------------------------

/** يحذف التشكيل والتطويل. بعدها يصير الطيّ حرفاً بحرف فتتطابق المواضع. */
function stripMarks(text: string): string {
  return text.replace(/[ً-ْـ]/g, '');
}

/** طيّ يحفظ الطول (أ إ آ ← ا، ى ← ي، ة ← ه) كي تُقصّ الأسماء من النص الأصلي. */
function foldKeepingLength(text: string): string {
  return text
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

/** يقتطع من النص الأصلي موضع مجموعة التقطتها regex على النص المطويّ. */
function sliceLike(original: string, key: string, group: string | undefined): string {
  if (!group) return '';
  const at = key.indexOf(group);
  return at < 0 ? group : original.slice(at, at + group.length).trim();
}

const CREATE_VERBS = ['افتح', 'اعمل', 'انشئ', 'أنشئ', 'انشاء', 'إنشاء', 'اضف', 'أضف', 'ضيف', 'سجل', 'سجّل', 'ابدا', 'أبدأ', 'ابدأ', 'عايز', 'عاوز', 'اريد', 'أريد', 'اضافه', 'إضافة'];

/** كلمات تُحذف قبل أخذ ما تبقّى اسماً. */
const FILLER = ['جديد', 'جديده', 'جديدة', 'لي', 'لو سمحت', 'من فضلك', 'بسرعه', 'بسرعة'];

/** ما يسبق اسم الشيء من أدوات التسمية. */
const NAMING = /^(?:باسم|بإسم|بأسم|اسمها|اسمه|اسم|عنوانها|عنوانه)\s+/u;

function removeWords(key: string, words: readonly string[]): string {
  let rest = key;
  for (const word of words.map((w) => foldKeepingLength(stripMarks(w)))) {
    rest = rest.replace(new RegExp('(?:^|\\s)' + word + '(?=\\s|$)', 'gu'), ' ');
  }
  return rest.replace(/\s+/g, ' ').trim();
}

/**
 * يفهم أوامر الإنشاء والأسئلة الشائعة بلا خادم.
 *
 * ما لا يُفهم هنا يعود null فيذهب إلى الطراز، كما في بقية الملف. وكل ما
 * يخرج يمرّ على parseToolCall ثم بوّابة التأكيد.
 */
function parseCreation(raw: string): LocalIntent | null {
  const plain = stripMarks(raw).trim();
  const key = foldKeepingLength(plain);
  if (!plain) return null;

  const verbs = CREATE_VERBS.map((w) => foldKeepingLength(stripMarks(w)));
  const hasVerb = verbs.some((verb) => new RegExp('(?:^|\\s)' + verb + '(?=\\s|$)', 'u').test(key));

  // ---- رصيد ----
  const totalBalance =
    /(?:^|\s)(?:حسابي|رصيدي|اجمالي|الاجمالي|الرصيد الاجمالي|كام معايا|كام عليا|كام ليا)(?=\s|$)/u.test(key) &&
    !/(?:^|\s)(?:ل|علي|عند)\s*\p{L}/u.test(key.replace(/(?:حسابي|رصيدي|الاجمالي|اجمالي)/gu, ''));
  if (totalBalance) {
    return { name: 'getBalance', args: {}, summary: 'الرصيد الإجمالي' };
  }
  const balanceName =
    /(?:^|\s)(?:كام\s+(?:علي|عند|ل)|رصيد|حساب)\s+(.+?)(?:\s+كام)?\s*[؟?]?$/u.exec(key);
  if (balanceName && !hasVerb && !/(?:احذف|امسح|ارشف|الغي|شيل)/u.test(key)) {
    const name = sliceLike(plain, key, balanceName[1]).replace(/[؟?]+$/u, '').trim();
    if (name.length >= 2 && !/\d/.test(name)) {
      return {
        name: 'getBalance',
        args: { contactName: name },
        summary: 'رصيد ' + name,
      };
    }
  }

  // ---- دعوة لمناسبة ----
  const invite = /(?:دعو[هة]|رابط|كود)\s+(?:ل|الي)?\s*(?:مناسب[هة])?\s*(.+)$/u.exec(key);
  if (invite && /(?:اعمل|انشئ|أنشئ|ابعت|عايز|عاوز|هات|اريد|ولد)/u.test(key)) {
    const title = sliceLike(plain, key, invite[1]);
    if (title.length >= 2) {
      return {
        name: 'createEventInvite',
        args: { eventTitle: title },
        summary: 'دعوة لمناسبة ' + title,
      };
    }
  }

  // ---- إضافة شخص إلى مناسبة: «أضف أحمد لمناسبة الفرح» ----
  const guest = /^(?:اضف|ضيف|ضم)\s+(.+?)\s+(?:ل|الي|في)\s*(?:مناسب[هة]\s+)(.+)$/u.exec(key);
  if (guest) {
    const name = sliceLike(plain, key, guest[1]);
    const title = sliceLike(plain, key, guest[2]);
    if (name.length >= 2 && title.length >= 2) {
      return {
        name: 'addEventGuest',
        args: { eventTitle: title, name },
        summary: 'إضافة ' + name + ' إلى ' + title,
      };
    }
  }

  if (!hasVerb) return null;

  // ---- مناسبة جديدة ----
  if (/(?:^|\s)مناسب[هة](?=\s|$)/u.test(key)) {
    const rest = removeWords(key, [...CREATE_VERBS, ...FILLER, 'مناسبه', 'مناسبة']);
    const naming = rest.replace(NAMING, '').trim();
    if (naming.length >= 2) {
      return {
        name: 'createEvent',
        // العنوان يُمرَّر تلميحاً للنوع أيضاً: «فرح أحمد» ⇦ wedding.
        args: { title: sliceLike(plain, key, naming), eventType: naming },
        summary: 'إنشاء مناسبة ' + naming,
      };
    }
    return { name: 'navigateTo', args: { screen: 'addEvent' }, summary: 'فتح مناسبة جديدة' };
  }

  // ---- جهة اتصال جديدة ----
  if (/(?:^|\s)جه[هة]\s+اتصال(?=\s|$)/u.test(key)) {
    const rest = removeWords(
      key.replace(/جه[هة]\s+اتصال/gu, ' '),
      [...CREATE_VERBS, ...FILLER],
    );
    const naming = rest.replace(NAMING, '').trim();
    if (naming.length >= 2 && !/\d{5,}/.test(naming)) {
      return {
        name: 'createContact',
        args: { name: sliceLike(plain, key, naming) },
        summary: 'إضافة جهة اتصال ' + naming,
      };
    }
    return { name: 'navigateTo', args: { screen: 'addContact' }, summary: 'فتح جهة اتصال جديدة' };
  }

  // ---- حركة جديدة (بلا مبلغ) ----
  if (/(?:^|\s)(?:حرك[هة]|نقوط)\s+جديد[هة]?(?=\s|$)/u.test(key) && !/\d/.test(key)) {
    return { name: 'navigateTo', args: { screen: 'addTransaction' }, summary: 'فتح حركة جديدة' };
  }

  return null;
}
