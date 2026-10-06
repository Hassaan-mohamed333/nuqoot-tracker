/**
 * سياسة الاستخدام: نصّها، ومفتاح قبولها، ومنطق «هل وصل المستخدم للنهاية».
 *
 * نقيّة عمداً (بلا react-native) كي تُختبر بمشغّل node. التخزين يُمرَّر
 * من الخارج: AsyncStorage في التطبيق، وهو على الويب `localStorage` نفسه،
 * فالمفتاح والقيمة هناك كما في المواصفة حرفياً.
 */

/** رفع الرقم يعيد عرض الشاشة لمن قبل نسخةً أقدم. */
export const POLICY_STORAGE_KEY = 'nuqoot:policy_accepted_v1';

export interface PolicyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface PolicySection {
  title: string;
  body: string;
}

/** البند الصريح عن جهات الاتصال: يُعرض كما هو ولا يُعاد صياغته. */
export const CONTACTS_CLAUSE =
  'قد يطلب منك التطبيق إذن الوصول لجهات اتصال هاتفك عند استخدام ميزة الاستيراد، ولن تتم مشاركة أي بيانات مع أطراف خارجية.';

export const POLICY_TITLE = 'سياسة الاستخدام';

export const POLICY_INTRO =
  'قبل أن تبدأ، هذا ما يستخدمه «نقوط» من بياناتك وكيف يتعامل معها.';

export const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    title: 'البيانات التي نستخدمها',
    body: 'جهات الاتصال التي تضيفها (الاسم ورقم الهاتف والصلة)، والحركات المالية (نقوط وديون وأرصدة)، والمناسبات، وصور الإيصالات التي تلتقطها أو تختارها لتسجيل الحركة.',
  },
  {
    title: 'أين تُخزَّن',
    body: 'تُحفظ بياناتك محلياً على جهازك. وإن سجّلت الدخول بحساب فقد تُزامَن مع حسابك وحده ليظهر لك على أجهزتك، ولا يطّلع عليها غيرك.',
  },
  {
    title: 'جهات الاتصال',
    body: CONTACTS_CLAUSE,
  },
  {
    title: 'استيراد جهة اتصال',
    body: 'الميزة اختيارية. يعرض نظام هاتفك قائمة جهاتك وتختار أنت جهةً واحدة، فيأخذ التطبيق اسمها ورقمها وحدهما لتعبئة النموذج، ويمكنك تعديلهما قبل الحفظ. موافقتك هنا توضيحٌ مسبق ولا تغني عن إذن المتصفح أو النظام الذي يظهر عند الاستيراد.',
  },
  {
    title: 'الإيصالات',
    body: 'تُقرأ صورة الإيصال لاستخراج المبلغ والتفاصيل، ولا تُستعمل لغير ذلك.',
  },
  {
    title: 'التحكّم بك',
    body: 'تستطيع تعديل بياناتك أو أرشفتها أو حذفها في أي وقت، ومراجعة هذه السياسة من الإعدادات.',
  },
];

export const POLICY_ACCEPT_LABEL = 'قرأت ووافقت على السياسة';
export const POLICY_CTA = 'موافق وبدء الاستخدام';

/** يقرأ الموافقة. أي خلل في التخزين أو شكلٍ غير متوقَّع = لم يوافق. */
export async function hasAcceptedPolicy(store: PolicyStore): Promise<boolean> {
  try {
    const raw = await store.get(POLICY_STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { accepted?: unknown }).accepted === true
    );
  } catch {
    return false;
  }
}

/** يسجّل الموافقة بالشكل المطلوب: `{accepted:true, at:<ISO>}`. */
export async function acceptPolicy(
  store: PolicyStore,
  now: Date = new Date(),
): Promise<void> {
  await store.set(
    POLICY_STORAGE_KEY,
    JSON.stringify({ accepted: true, at: now.toISOString() }),
  );
}

export interface ScrollMetrics {
  contentOffsetY: number;
  viewportHeight: number;
  contentHeight: number;
}

/**
 * هل بلغ التمرير نهاية النص؟ فيه هامشٌ صغير لأن الأجهزة تُرجع كسوراً.
 * ونصٌّ أقصر من الإطار لا يُمرَّر أصلاً، فيُعدّ مقروءاً.
 */
export function isScrolledToEnd(m: ScrollMetrics, threshold = 24): boolean {
  if (m.viewportHeight <= 0) return false;
  return m.contentOffsetY + m.viewportHeight >= m.contentHeight - threshold;
}

/** الزرّ يُفعَّل بالتمرير للنهاية **أو** بالمربّع، لا بالدخول وحده. */
export function canAcceptPolicy(
  scrolledToEnd: boolean,
  checked: boolean,
): boolean {
  return scrolledToEnd || checked;
}
