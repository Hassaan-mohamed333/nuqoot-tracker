/**
 * بديل محلّي لـ `tailwind-variants`، بلا أي اعتماد خارجي.
 *
 * لماذا لا clsx/tailwind-merge: كلاهما حزمة npm أيضاً، فاستعمالهما يعيد
 * خطوة `npm install` نفسها التي نتخلّص منها — وهي التي كسرت خادم التطوير
 * عند الانتقال بين جهازين.
 *
 * ما لا يفعله هذا الملف: حلّ تعارض الأصناف (وظيفة tailwind-merge). لو
 * اجتمع `p-4` و`p-2` على عنصر، لا يفوز الأخير في السلسلة بل يقرّر ترتيبُ
 * القواعد في ملف CSS المولَّد، وهو ترتيب Tailwind لا ترتيبنا. لذلك تُبنى
 * الأنماط هنا بحيث لا يصدر أي تعارض أصلاً: كل خاصية يحدّدها متغيّر واحد،
 * ولا يضع النمط الأساسي قيمة يُتوقَّع من المستدعي تجاوزها.
 */

export type ClassValue = string | false | null | undefined;

/** يصل الأصناف متجاهلاً الفارغ منها. */
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}

/** خريطة كل متغيّر: القيمة المختارة → الأصناف المقابلة. */
type VariantShape = Record<string, Record<string, string>>;

/** القيم المقبولة لمتغيّر: مفاتيحه، مع السماح بالمنطقي لمتغيّرات true/false. */
type VariantValue<M> = keyof M | boolean;

type VariantProps<V extends VariantShape> = {
  [K in keyof V]?: VariantValue<V[K]>;
};

interface VariantConfig<V extends VariantShape> {
  /** أصناف تنطبق دائماً. */
  base?: string;
  variants: V;
  defaultVariants?: VariantProps<V>;
}

/**
 * يبني دالة تُركّب أصناف مكوّن من متغيّراته.
 *
 * الاستعمال مطابق لما كان مع `tv`:
 *   const card = sv({ base, variants, defaultVariants });
 *   card({ variant: 'surface', className })
 */
export function sv<V extends VariantShape>(config: VariantConfig<V>) {
  const keys = Object.keys(config.variants) as Array<keyof V>;

  return (props: VariantProps<V> & { className?: ClassValue } = {}): string => {
    const resolved = keys.map((key) => {
      const chosen = props[key] ?? config.defaultVariants?.[key];
      if (chosen === undefined || chosen === null) return undefined;
      // المفاتيح نصوص دائماً، فـ `true` المنطقية تُقرأ من المفتاح 'true'.
      return config.variants[key][String(chosen)];
    });

    return cx(config.base, ...resolved, props.className);
  };
}
