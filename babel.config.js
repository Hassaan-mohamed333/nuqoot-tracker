module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // لا نضيف react-native-worklets/plugin هنا: babel-preset-expo يضيفه
    // تلقائيًا، وتكراره يطبّق الـ plugin مرتين فيتعطّل useAnimatedStyle.
  };
};
