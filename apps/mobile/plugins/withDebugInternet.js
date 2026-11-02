// Config plugin: release builds have no internet permission (app.config.ts blocks it: the app never uses the
// network). Debug builds still need it to load JavaScript from Metro, so it goes into the debug manifest,
// which outranks the main manifest's tools:node="remove" when Gradle merges them.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const LINE = '<uses-permission android:name="android.permission.INTERNET"/>';

module.exports = function withDebugInternet(config) {
  return withDangerousMod(config, [
    'android',
    (c) => {
      const file = path.join(c.modRequest.platformProjectRoot, 'app/src/debug/AndroidManifest.xml');
      if (!fs.existsSync(file)) return c;
      const xml = fs.readFileSync(file, 'utf8');
      if (!xml.includes('android.permission.INTERNET')) {
        fs.writeFileSync(file, xml.replace(/(<manifest[^>]*>\n?)/, `$1\n    ${LINE}\n`));
      }
      return c;
    },
  ]);
};
