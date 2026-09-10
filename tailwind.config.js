/** @type {import('tailwindcss').Config} */

/** يبني لوناً من متغيّر CSS مع إبقاء أدوات الشفافية (`bg-primary/10`) عاملة. */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // الوضع الليلي في NativeWind v4 يُضبط هنا، لا باستدعاء وقت التشغيل.
  // StyleSheet.setFlag('darkMode', 'class') غير موجود في React Native 0.86
  // ويُسقط التطبيق عند الإقلاع؛ للتبديل برمجياً استخدم:
  //   import { colorScheme } from 'nativewind';
  //   colorScheme.set('dark' | 'light' | 'system');
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // القيم الفعلية في global.css، وتتبدّل مع الوضع الليلي تلقائياً.
        primary: {
          DEFAULT: token('primary'),
          soft: token('primary-soft'),
          strong: token('primary-strong'),
          fg: token('on-primary'),
        },
        secondary: {
          DEFAULT: token('secondary'),
          soft: token('secondary-soft'),
          fg: token('on-secondary'),
        },
        success: {
          DEFAULT: token('success'),
          soft: token('success-soft'),
        },
        danger: {
          DEFAULT: token('danger'),
          soft: token('danger-soft'),
        },
        warning: {
          DEFAULT: token('warning'),
          soft: token('warning-soft'),
        },

        base: token('base'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
        },
        line: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        ink: {
          DEFAULT: token('text'),
          muted: token('text-muted'),
          subtle: token('text-subtle'),
        },
        glass: {
          DEFAULT: token('glass'),
          line: token('glass-border'),
        },
        overlay: token('overlay'),

        // دلالات الدفتر، مربوطة بنفس الرموز حتى لا تتفرّع الهوية.
        credit: token('success'),
        debit: token('danger'),
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
        '3xl': '28px',
        card: '22px',
      },
      fontSize: {
        // مقياس مضبوط للعربية: أطوال السطور أقصر والحروف أعرض.
        'display-lg': ['32px', { lineHeight: '40px', fontWeight: '800' }],
        display: ['26px', { lineHeight: '34px', fontWeight: '800' }],
        title: ['19px', { lineHeight: '28px', fontWeight: '700' }],
        body: ['15px', { lineHeight: '24px' }],
        caption: ['12px', { lineHeight: '18px' }],
      },
      boxShadow: {
        card: '0 8px 24px -12px rgb(15 23 42 / 0.18)',
        raised: '0 18px 40px -18px rgb(15 23 42 / 0.28)',
      },
    },
  },
  plugins: [],
};
