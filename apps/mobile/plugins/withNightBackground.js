// Config plugin: the Android window behind the app is the day paper colour in light mode (app.config
// `backgroundColor`) and the night colour in dark mode. Without a night value, expo-system-ui's single colour
// showed behind light screens during transitions and at the edges (or the reverse).
const { AndroidConfig, withAndroidColorsNight } = require('expo/config-plugins');

module.exports = function withNightBackground(config, { color }) {
  return withAndroidColorsNight(config, (c) => {
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, {
      name: 'activityBackground',
      value: color,
    });
    return c;
  });
};
