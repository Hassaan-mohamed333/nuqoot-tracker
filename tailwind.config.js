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
        // أنصاف الأقطار مقيسة من المرجع: البطاقات كبيرة الاستدارة،
        // المربّعات الصغيرة أقلّ، والأزرار حبّة كاملة.
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
        card: '26px',
        tile: '16px',
        sheet: '30px',
      },
      fontSize: {
        // المرجع يعتمد عناوين كبيرة جداً وفراغاً سخياً حولها.
        'display-lg': ['34px', { lineHeight: '42px', fontWeight: '700' }],
        display: ['27px', { lineHeight: '36px', fontWeight: '700' }],
        title: ['20px', { lineHeight: '28px', fontWeight: '700' }],
        body: ['15px', { lineHeight: '24px' }],
        caption: ['12px', { lineHeight: '18px' }],
      },
      boxShadow: {
        // ظلال واسعة وخفيفة، لا حدود حادّة: هكذا تُفصل البطاقات في المرجع.
        card: '0 10px 30px -14px rgb(16 16 20 / 0.16)',
        raised: '0 20px 44px -20px rgb(16 16 20 / 0.26)',
        float: '0 12px 32px -10px rgb(16 16 20 / 0.22)',
      },
    },
  },
  plugins: [],
};
