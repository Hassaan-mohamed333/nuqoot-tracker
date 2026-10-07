/**
 * يُكمّل app.json بما يتغيّر حسب البيئة.
 *
 * `EXPO_BASE_URL` يضبط مسار النشر الفرعي (GitHub Pages يخدم التطبيق تحت
 * /nuqoot-tracker). لا يوضع في app.json لأن سيرفر التطوير يحترمه أيضاً،
 * فيتحوّل localhost:8081 إلى مسار فرعي ويفسد عودة OAuth.
 */
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
