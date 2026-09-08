/** @type {import('tailwindcss').Config} */
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
        // حالة الرصيد: دائن (أخضر) / مدين (أحمر) / متعادل (رمادي)
        credit: '#16a34a',
        debit: '#dc2626',
        neutral: '#6b7280',
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#16a34a',
          600: '#15803d',
          700: '#166534',
        },
      },
    },
  },
  plugins: [],
};
