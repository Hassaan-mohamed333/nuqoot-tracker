import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as nativewindColorScheme, useColorScheme } from 'nativewind';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/** تفضيل المستخدم، لا الوضع الفعلي: `system` يتبع إعداد الجهاز. */
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nuqoot.theme-preference';

interface ThemeContextValue {
  /** ما اختاره المستخدم صراحةً. */
  preference: ThemePreference;
  /** الوضع المطبَّق فعلاً بعد حلّ `system`. */
  scheme: 'light' | 'dark';
  setPreference: (next: ThemePreference) => void;
  /** تبديل سريع بين فاتح وداكن (يخرج من وضع `system`). */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * يربط تفضيل الوضع الليلي بـ NativeWind ويحفظه على الجهاز.
 *
 * NativeWind لا يحفظ الاختيار بنفسه، فبدون هذا الحفظ يعود التطبيق إلى
 * إعداد النظام في كل إقلاع ويضيع اختيار المستخدم.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // الاستعادة قبل أول رسم غير ممكنة مع تخزين غير متزامن، فنقبل وميضاً
  // واحداً عند الإقلاع بدل حجب الشاشة كلها بانتظار القراءة.
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !isPreference(stored)) return;
        setPreferenceState(stored);
        setColorScheme(stored);
      })
      .catch(() => {
        // تعذّرت القراءة: نبقى على إعداد النظام، وهو سلوك مقبول.
      });
    return () => {
      active = false;
    };
  }, [setColorScheme]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      setColorScheme(next);
      void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
        // الفشل هنا يعني عدم بقاء الاختيار بعد الإغلاق فقط.
      });
    },
    [setColorScheme],
  );

  const scheme: 'light' | 'dark' = colorScheme === 'dark' ? 'dark' : 'light';

  const toggle = useCallback(() => {
    setPreference(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setPreference]);

  const value = useMemo(
    () => ({ preference, scheme, setPreference, toggle }),
    [preference, scheme, setPreference, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** يقرأ الوضع الحالي. يجب أن يكون داخل ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme يجب أن يُستدعى داخل ThemeProvider');
  return value;
}

/**
 * ألوان يحتاجها كود غير مُنسَّق بـ Tailwind: أيقونات lucide، مؤشّرات
 * التحميل، وخصائص التنقّل. تبقى متطابقة مع رموز global.css يدوياً لأن
 * قيم متغيّرات CSS غير مقروءة من جافاسكربت في React Native.
 */
export const PALETTE = {
  light: {
    primary: '#0F52BA',
    secondary: '#7C3AED',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    base: '#F8FAFC',
    surface: '#FFFFFF',
    border: '#E2E8F0',
    text: '#0F172A',
    muted: '#64748B',
    onPrimary: '#FFFFFF',
  },
  dark: {
    primary: '#6096FF',
    secondary: '#A77AFA',
    success: '#34D399',
    danger: '#F87171',
    warning: '#FBBF24',
    base: '#0B0F17',
    surface: '#1E293B',
    border: '#334155',
    text: '#F1F5F9',
    muted: '#94A3B8',
    onPrimary: '#081122',
  },
} as const;

/** ألوان الوضع الحالي، للأيقونات وما لا يقبل أصناف Tailwind. */
export function usePalette() {
  const { scheme } = useTheme();
  return PALETTE[scheme];
}

/** للتبديل خارج شجرة React (نادر، لكنه يمنع الحاجة لتمرير الدالة). */
export const setColorSchemeDirect = nativewindColorScheme.set;
