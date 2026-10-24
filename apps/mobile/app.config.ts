import type { ExpoConfig } from 'expo/config';

// Theme colours from packages/tokens (palettes.light / palettes.dark), needed here before any JS runs.
const PAPER = '#F4EEE3';
const NIGHT = '#100E0B';
const ACCENT = '#9C5313';

const fonts = [
  'Fraunces-SemiBold.ttf',
  'Fraunces-Display.ttf',
  'Fraunces-Italic.ttf',
  'AtkinsonHyperlegibleNext-Regular.ttf',
  'AtkinsonHyperlegibleNext-Medium.ttf',
  'AtkinsonHyperlegibleNext-Bold.ttf',
  'AtkinsonHyperlegibleNext-Italic.ttf',
  'Literata-Regular.ttf',
  'Literata-Italic.ttf',
  'Literata-Bold.ttf',
  'OpenDyslexic-Regular.otf',
  'OpenDyslexic-Bold.otf',
].map((f) => `./assets/fonts/${f}`);

const config: ExpoConfig = {
  name: 'Lamplight',
  slug: 'lamplight',
  owner: 'midas-hq',
  scheme: 'lamplight',
  version: '1.0.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  icon: './assets/brand/icon.png',
  // The window behind the app in light mode; ./plugins/withNightBackground.js sets the dark-mode one.
  backgroundColor: PAPER,
  primaryColor: ACCENT,
  ios: {
    bundleIdentifier: 'app.lamplight.reader',
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: { UIBackgroundModes: ['audio'] },
  },
  android: {
    package: 'app.lamplight.reader',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-foreground.png',
      backgroundImage: './assets/brand/adaptive-background.png',
      monochromeImage: './assets/brand/adaptive-monochrome.png',
      backgroundColor: NIGHT,
    },
    predictiveBackGestureEnabled: true,
    permissions: [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
    ],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
  },
  web: {
    favicon: './assets/brand/favicon-32.png',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    ['expo-sqlite', { enableFTS: true }],
    'expo-localization',
    'expo-sharing',
    './modules/lamplight-engine/plugin/withLamplightEngine.js',
    ['./plugins/withNightBackground.js', { color: NIGHT }],
    ['expo-font', { fonts }],
    [
      'expo-splash-screen',
      {
        image: './assets/brand/splash-icon.png',
        imageWidth: 168,
        backgroundColor: PAPER,
        dark: { image: './assets/brand/splash-icon.png', backgroundColor: NIGHT },
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 29,
          targetSdkVersion: 36,
          compileSdkVersion: 37,
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
