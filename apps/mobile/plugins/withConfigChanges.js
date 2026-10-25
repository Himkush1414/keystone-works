// Config plugin: the main activity handles display-size and font-size changes itself (like the orientation,
// dark-mode and locale changes Expo already lists). Otherwise Android recreated the activity, React mounted
// a second root, and expo-router's imperative router threw "unavailable before the first render has
// finished" on the next navigation (seen on the emulator after changing the display size).
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const EXTRA = ['density', 'fontScale'];

module.exports = function withConfigChanges(config) {
  return withAndroidManifest(config, (c) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    const now = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    activity.$['android:configChanges'] = [...new Set([...now, ...EXTRA])].join('|');
    return c;
  });
};
