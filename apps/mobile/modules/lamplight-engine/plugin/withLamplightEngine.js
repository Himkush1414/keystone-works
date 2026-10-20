// Config plugin for the Lamplight engine module.
// - Stores the voice model uncompressed in the APK so ONNX Runtime can memory-map it instead of copying
//   ~140 MB into the Java heap.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// lamplight-engine: keep model assets uncompressed';

function addNoCompress(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const block = `\n    ${MARKER}\n    androidResources {\n        noCompress += ['onnx', 'bin']\n    }\n`;
  const anchor = /\nandroid\s*\{\n/;
  if (!anchor.test(gradle)) throw new Error('withLamplightEngine: could not find the android { } block');
  return gradle.replace(anchor, (m) => `${m}${block}`);
}

module.exports = function withLamplightEngine(config) {
  return withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy')
      throw new Error('withLamplightEngine: expected a Groovy build.gradle');
    c.modResults.contents = addNoCompress(c.modResults.contents);
    return c;
  });
};

module.exports.addNoCompress = addNoCompress;
