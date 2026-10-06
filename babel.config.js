module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // يجب أن يبقى مكوّن react-native-worklets آخر إضافة في القائمة
    plugins: ['react-native-worklets/plugin'],
  };
};
